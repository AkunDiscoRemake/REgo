package com.wpollo.vr;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.tensorflow.lite.Interpreter;
import org.tensorflow.lite.gpu.GpuDelegate;
import org.tensorflow.lite.nnapi.NnApiDelegate;


/**
 * Wpollo VR para VR Box: o mesmo app web, servido localmente de dentro do APK (sem rede = menor latência),
 * com câmera, lanterna, tela sempre ligada e inferência NATIVA das mãos via ONNX Runtime + NNAPI (NPU/DSP).
 */
public class MainActivity extends Activity implements android.hardware.SensorEventListener {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private WebView web;
    FrameLayout root;
    YtBridge yt; BrowserBridge browser; AppsBridge apps;
    private volatile float pressure = 0;
    private PermissionRequest pendingPermission;
    private final ExecutorService nn = Executors.newSingleThreadExecutor();
    private Interpreter pose;
    private org.tensorflow.lite.Delegate poseDelegate;
    private String nnEp = "cpu";
    private final java.nio.ByteBuffer poseIn = java.nio.ByteBuffer.allocateDirect(3 * 256 * 256 * 4).order(java.nio.ByteOrder.nativeOrder());
    private final float[][][] outX = new float[1][21][512], outY = new float[1][21][512];

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        yt = new YtBridge(this); browser = new BrowserBridge(this); apps = new AppsBridge(this);
        try { rikka.shizuku.Shizuku.addRequestPermissionResultListener((code, res) -> { if (res == PackageManager.PERMISSION_GRANTED) apps.requestAccess(); }); } catch (Throwable ignored) { }
        android.hardware.SensorManager sm = (android.hardware.SensorManager) getSystemService(Context.SENSOR_SERVICE);
        android.hardware.Sensor ps = sm.getDefaultSensor(android.hardware.Sensor.TYPE_PRESSURE);
        if (ps != null) sm.registerListener(this, ps, android.hardware.SensorManager.SENSOR_DELAY_GAME);
        immersive();
        WebView.setWebContentsDebuggingEnabled(true);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " WpolloVR/2.0");

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String url) { openBinaryChannel(); }
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                String path = req.getUrl().getPath();
                if (path != null && path.startsWith("/ytproxy")) return YtBridge.proxy(req);
                if (path != null && path.startsWith("/browserframe")) return image(browser.frame());
                if (path != null && path.startsWith("/appframe/")) { try { return image(apps.frame(Integer.parseInt(path.replaceAll("\\D+", "")))); } catch (Exception e) { return null; } }
                WebResourceResponse r = loader.shouldInterceptRequest(req.getUrl());
                if (r == null) return null;
                // isolamento de origem => SharedArrayBuffer => ONNX Runtime com várias threads
                Map<String, String> h = new HashMap<>();
                h.put("Cross-Origin-Opener-Policy", "same-origin");
                h.put("Cross-Origin-Embedder-Policy", "require-corp");
                h.put("Cross-Origin-Resource-Policy", "cross-origin");
                String p = req.getUrl().getPath();
                if (p != null && p.endsWith(".wasm")) r.setMimeType("application/wasm");
                else if (p != null && p.endsWith(".mjs")) r.setMimeType("text/javascript");
                r.setResponseHeaders(h);
                return r;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) request.grant(request.getResources());
                    else { pendingPermission = request; requestPermissions(new String[]{Manifest.permission.CAMERA}, 1); }
                });
            }
        });
        web.addJavascriptInterface(new Bridge(), "WpolloAndroid");
        web.addJavascriptInterface(yt, "WpolloYT");
        web.addJavascriptInterface(browser, "WpolloBrowser");
        web.addJavascriptInterface(apps, "WpolloApps");
        web.loadUrl(ORIGIN + "/assets/www/index.html?app=1");
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (pendingPermission != null) {
            if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) pendingPermission.grant(pendingPermission.getResources());
            else pendingPermission.deny();
            pendingPermission = null;
        }
    }

    private void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) { c.hide(WindowInsets.Type.systemBars()); c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) immersive(); }
    @Override public void onBackPressed() { web.evaluateJavascript("window.REGO&&REGO.input&&(REGO.input._menuKey=true)", null); }

    void js(String code) { runOnUiThread(() -> web.evaluateJavascript(code, null)); }
    private static WebResourceResponse image(byte[] b) {
        java.util.Map<String, String> h = new java.util.HashMap<>(); h.put("Cache-Control", "no-store"); h.put("Cross-Origin-Resource-Policy", "cross-origin");
        return new WebResourceResponse("image/jpeg", null, 200, "OK", h, new java.io.ByteArrayInputStream(b));
    }
    @Override protected void onActivityResult(int req, int code, android.content.Intent data) { super.onActivityResult(req, code, data); apps.onResult(req, code, data); }
    @Override public void onSensorChanged(android.hardware.SensorEvent e) { pressure = e.values[0]; }
    @Override public void onAccuracyChanged(android.hardware.Sensor s, int a) { }

    // ------------------------------------------------------------------ inferência nativa (NNAPI)
    private java.nio.MappedByteBuffer mapAsset(String file) throws Exception {
        android.content.res.AssetFileDescriptor fd = getAssets().openFd("www/assets/ml/" + file);
        try (java.io.FileInputStream in = new java.io.FileInputStream(fd.getFileDescriptor())) {
            return in.getChannel().map(java.nio.channels.FileChannel.MapMode.READ_ONLY, fd.getStartOffset(), fd.getDeclaredLength());
        }
    }
    /** TFLite: testa NNAPI (NPU), GPU e XNNPACK (CPU NEON); mede e mantém o mais rápido. */
    private void openPose() throws Exception {
        java.nio.MappedByteBuffer model = mapAsset("rtmhand_fp16.tflite");
        String[] kinds = {"nnapi", "gpu", "xnnpack"};
        double bestMs = 1e9;
        for (String k : kinds) {
            Interpreter it = null; org.tensorflow.lite.Delegate d = null;
            try {
                Interpreter.Options o = new Interpreter.Options();
                if (k.equals("nnapi")) { NnApiDelegate.Options no = new NnApiDelegate.Options(); no.setAllowFp16(true); no.setUseNnapiCpu(false);
                    no.setExecutionPreference(NnApiDelegate.Options.EXECUTION_PREFERENCE_SUSTAINED_SPEED); d = new NnApiDelegate(no); o.addDelegate(d); o.setUseXNNPACK(false); }
                else if (k.equals("gpu")) { GpuDelegate.Options go = new GpuDelegate.Options(); go.setPrecisionLossAllowed(true);
                    go.setInferencePreference(GpuDelegate.Options.INFERENCE_PREFERENCE_SUSTAINED_SPEED); d = new GpuDelegate(go); o.addDelegate(d); }
                else { o.setNumThreads(Math.max(2, Math.min(4, Runtime.getRuntime().availableProcessors() / 2))); o.setUseXNNPACK(true); }
                it = new Interpreter(model, o);
                for (int i = 0; i < 3; i++) runPose(it);
                long t0 = System.nanoTime(); for (int i = 0; i < 5; i++) runPose(it);
                double ms = (System.nanoTime() - t0) / 5e6;
                if (ms < bestMs) {
                    if (pose != null) pose.close(); if (poseDelegate instanceof java.io.Closeable) ((java.io.Closeable) poseDelegate).close();
                    pose = it; poseDelegate = d; bestMs = ms; nnEp = k + " " + String.format(java.util.Locale.US, "%.1f", ms) + "ms"; it = null; d = null;
                }
            } catch (Throwable e) { /* delegate indisponível neste aparelho */ }
            finally { if (it != null) it.close(); if (d instanceof java.io.Closeable) try { ((java.io.Closeable) d).close(); } catch (Exception ignored) { } }
        }
        if (pose == null) throw new Exception("TFLite indisponível");
    }
    private void runPose(Interpreter it) {
        poseIn.rewind();
        java.util.Map<Integer, Object> outs = new java.util.HashMap<>(); outs.put(0, outX); outs.put(1, outY);
        it.runForMultipleInputsOutputs(new Object[]{poseIn}, outs);
    }

    private static float[] toChw(byte[] rgba, int size, float[] mean, float[] std, boolean bgr) {
        int n = size * size; float[] f = new float[3 * n];
        for (int i = 0, j = 0; i < n; i++, j += 4) {
            float r = rgba[j] & 0xff, g = rgba[j + 1] & 0xff, b = rgba[j + 2] & 0xff;
            float c0 = bgr ? b : r, c2 = bgr ? r : b;
            f[i] = (c0 - mean[0]) / std[0]; f[n + i] = (g - mean[1]) / std[1]; f[2 * n + i] = (c2 - mean[2]) / std[2];
        }
        return f;
    }

    class Bridge {
        @JavascriptInterface public boolean isApk() { return true; }
        @JavascriptInterface public float pressure() { return pressure; }
        @JavascriptInterface public void keepScreenOn(boolean on) { }
        @JavascriptInterface public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null) v.vibrate(VibrationEffect.createOneShot(Math.max(1, ms), VibrationEffect.DEFAULT_AMPLITUDE));
        }
        @JavascriptInterface public boolean setTorch(boolean on) {
            try {
                CameraManager cm = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
                for (String id : cm.getCameraIdList()) {
                    CameraCharacteristics ch = cm.getCameraCharacteristics(id);
                    Boolean fl = ch.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                    Integer face = ch.get(CameraCharacteristics.LENS_FACING);
                    if (fl != null && fl && face != null && face == CameraCharacteristics.LENS_FACING_BACK) { cm.setTorchMode(id, on); return true; }
                }
            } catch (Exception e) { return false; }
            return false;
        }
        @JavascriptInterface public boolean nnAvailable() { return true; }
        @JavascriptInterface public void nnInit() {
            nn.execute(() -> {
                try { openPose(); js("window.__wpNative&&__wpNative.ready(" + org.json.JSONObject.quote("TFLite " + nnEp) + ",true)"); }
                catch (Exception e) { js("window.__wpNative&&__wpNative.fail(" + org.json.JSONObject.quote(String.valueOf(e.getMessage())) + ")"); }
            });
        }
        /** recorte 256x256 RGBA em base64 -> 21 pontos (x,y no recorte, score) */
        @JavascriptInterface public void nnPose(final int id, final String b64) { nn.execute(() -> js("__wpNative.done(" + id + "," + poseJson(Base64.decode(b64, Base64.DEFAULT)) + ")")); }
        @JavascriptInterface public void nnDet(final int id, final String b64) { nn.execute(() -> js("__wpNative.done(" + id + "," + detJson(Base64.decode(b64, Base64.DEFAULT)) + ")")); }
    }

    String poseJson(byte[] rgba) {
        try {
            int n = 256 * 256; poseIn.rewind(); java.nio.FloatBuffer f = poseIn.asFloatBuffer();
            float[] chw = new float[3 * n];
            for (int i = 0, j = 0; i < n; i++, j += 4) {
                chw[i] = ((rgba[j] & 0xff) - 123.675f) / 58.395f; chw[n + i] = ((rgba[j + 1] & 0xff) - 116.28f) / 57.12f; chw[2 * n + i] = ((rgba[j + 2] & 0xff) - 103.53f) / 57.375f;
            }
            f.put(chw);
            runPose(pose);
            StringBuilder sb = new StringBuilder("[");
            for (int k = 0; k < 21; k++) {
                int bx = 0, by = 0; float vx = -1e9f, vy = -1e9f;
                for (int a = 0; a < 512; a++) { if (outX[0][k][a] > vx) { vx = outX[0][k][a]; bx = a; } if (outY[0][k][a] > vy) { vy = outY[0][k][a]; by = a; } }
                if (k > 0) sb.append(',');
                sb.append(bx / 2f).append(',').append(by / 2f).append(',').append(Math.min(vx, vy));
            }
            return sb.append(']').toString();
        } catch (Exception e) { return "null"; }
    }
    String detJson(byte[] rgba) { return "[]"; } // sem detector: o JS faz a busca com o próprio modelo de pose

    // canal binário WebMessagePort: o JS manda [tipo][id][RGBA] como ArrayBuffer (sem base64, sem cópia em texto)
    private androidx.webkit.WebMessagePortCompat nnPort;
    void openBinaryChannel() {
        try {
            if (!androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER)
                    || !androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.CREATE_WEB_MESSAGE_CHANNEL)) return;
            androidx.webkit.WebMessagePortCompat[] ports = androidx.webkit.WebViewCompat.createWebMessageChannel(web);
            nnPort = ports[0];
            nnPort.setWebMessageCallback(new androidx.webkit.WebMessagePortCompat.WebMessageCallbackCompat() {
                @Override public void onMessage(androidx.webkit.WebMessagePortCompat p, androidx.webkit.WebMessageCompat m) {
                    if (m == null || m.getType() != androidx.webkit.WebMessageCompat.TYPE_ARRAY_BUFFER) return;
                    final byte[] b = m.getArrayBuffer();
                    nn.execute(() -> {
                        int id = java.nio.ByteBuffer.wrap(b, 1, 4).getInt();
                        byte[] px = java.util.Arrays.copyOfRange(b, 5, b.length);
                        String d = b[0] == 1 ? poseJson(px) : detJson(px);
                        final String msg = "{\"id\":" + id + ",\"d\":" + d + "}";
                        runOnUiThread(() -> nnPort.postMessage(new androidx.webkit.WebMessageCompat(msg)));
                    });
                }
            });
            androidx.webkit.WebViewCompat.postWebMessage(web, new androidx.webkit.WebMessageCompat("wpnn-port", new androidx.webkit.WebMessagePortCompat[]{ports[1]}), android.net.Uri.parse("*"));
        } catch (Throwable ignored) { }
    }
}
