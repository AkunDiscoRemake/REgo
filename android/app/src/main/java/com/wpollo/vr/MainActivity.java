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

import java.nio.FloatBuffer;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import ai.onnxruntime.providers.NNAPIFlags;

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
    private OrtEnvironment env;
    private OrtSession det, pose;
    private String nnEp = "cpu";

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
    private OrtSession open(String file, boolean fp16) throws Exception {
        byte[] model;
        try (java.io.InputStream in = getAssets().open("www/assets/ml/" + file)) {
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream(); byte[] buf = new byte[1 << 16]; int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n); model = bo.toByteArray();
        }
        OrtSession.SessionOptions o = new OrtSession.SessionOptions();
        o.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        o.setIntraOpNumThreads(2);
        try {
            java.util.EnumSet<NNAPIFlags> fl = java.util.EnumSet.noneOf(NNAPIFlags.class);
            if (fp16) fl.add(NNAPIFlags.USE_FP16);
            o.addNnapi(fl);
            nnEp = "nnapi";
        } catch (Exception e) { nnEp = "cpu"; }
        return env.createSession(model, o);
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
                try {
                    env = OrtEnvironment.getEnvironment();
                    pose = open("hand_pose_fp32.onnx", true);
                    String ep = nnEp;
                    det = open("hand_det_fp32.onnx", false);
                    js("window.__wpNative&&__wpNative.ready(" + (ep.equals("nnapi") ? "'nnapi-npu'" : "'cpu-nativo'") + ")");
                } catch (Exception e) { js("window.__wpNative&&__wpNative.fail(" + org.json.JSONObject.quote(String.valueOf(e.getMessage())) + ")"); }
            });
        }
        /** recorte 256x256 RGBA em base64 -> 21 pontos (x,y no recorte, score) */
        @JavascriptInterface public void nnPose(final int id, final String b64) {
            nn.execute(() -> {
                try {
                    float[] in = toChw(Base64.decode(b64, Base64.DEFAULT), 256, new float[]{123.675f, 116.28f, 103.53f}, new float[]{58.395f, 57.12f, 57.375f}, false);
                    try (OnnxTensor t = OnnxTensor.createTensor(env, FloatBuffer.wrap(in), new long[]{1, 3, 256, 256});
                         OrtSession.Result r = pose.run(java.util.Collections.singletonMap("input", t))) {
                        float[][][] sx = (float[][][]) r.get(0).getValue(), sy = (float[][][]) r.get(1).getValue();
                        StringBuilder sb = new StringBuilder("[");
                        for (int k = 0; k < 21; k++) {
                            int bx = 0, by = 0; float vx = -1e9f, vy = -1e9f;
                            for (int a = 0; a < sx[0][k].length; a++) if (sx[0][k][a] > vx) { vx = sx[0][k][a]; bx = a; }
                            for (int a = 0; a < sy[0][k].length; a++) if (sy[0][k][a] > vy) { vy = sy[0][k][a]; by = a; }
                            if (k > 0) sb.append(',');
                            sb.append(bx / 2f).append(',').append(by / 2f).append(',').append(Math.min(vx, vy));
                        }
                        js("__wpNative.done(" + id + ",[" + sb.append("]").toString().substring(1) + ")");
                    }
                } catch (Exception e) { js("__wpNative.done(" + id + ",null)"); }
            });
        }
        /** imagem 320x320 RGBA (letterbox) -> caixas [x1,y1,x2,y2,score]* */
        @JavascriptInterface public void nnDet(final int id, final String b64) {
            nn.execute(() -> {
                try {
                    float[] in = toChw(Base64.decode(b64, Base64.DEFAULT), 320, new float[]{103.53f, 116.28f, 123.675f}, new float[]{57.375f, 57.12f, 58.395f}, true);
                    try (OnnxTensor t = OnnxTensor.createTensor(env, FloatBuffer.wrap(in), new long[]{1, 3, 320, 320});
                         OrtSession.Result r = det.run(java.util.Collections.singletonMap("input", t))) {
                        float[][][] d = (float[][][]) r.get(0).getValue();
                        StringBuilder sb = new StringBuilder("[");
                        for (int k = 0; k < d[0].length; k++) { if (k > 0) sb.append(','); for (int c = 0; c < 5; c++) { if (c > 0) sb.append(','); sb.append(d[0][k][c]); } }
                        js("__wpNative.done(" + id + "," + sb.append("]") + ")");
                    }
                } catch (Exception e) { js("__wpNative.done(" + id + ",null)"); }
            });
        }
    }
}
