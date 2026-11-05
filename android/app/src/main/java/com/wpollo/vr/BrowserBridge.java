package com.wpollo.vr;

import android.annotation.SuppressLint;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;

/**
 * Navegador de verdade dentro do VR (VR Box): um WebView fora da tela é desenhado num bitmap ~12×/s,
 * comprimido em JPEG e mostrado numa janela 3D. Toques, rolagem e texto vindos do VR são injetados nele.
 */
public class BrowserBridge {
    private final MainActivity a;
    private WebView w;
    private Bitmap bmp;
    private volatile byte[] frame = new byte[0];
    private int n = 0, W = 1280, H = 800;
    private boolean live = false, dirty = true;
    private final Handler h = new Handler(Looper.getMainLooper());

    BrowserBridge(MainActivity a) { this.a = a; }
    byte[] frame() { return frame; }

    @SuppressLint("SetJavaScriptEnabled")
    private void ensure() {
        if (w != null) return;
        w = new WebView(a);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString().replace("; wv", "") + " WpolloVR");
        w.setWebViewClient(new WebViewClient() { @Override public void onPageFinished(WebView v, String url) { dirty = true; notifyJs(); } });
        w.setWebChromeClient(new WebChromeClient() { @Override public void onProgressChanged(WebView v, int p) { dirty = true; } });
        // fica atrás do VR: precisa estar anexado para renderizar
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(W, H);
        a.root.addView(w, 0, lp);
        w.setAlpha(0.01f);
        bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
    }
    private final Runnable loop = new Runnable() {
        @Override public void run() {
            if (!live || w == null) return;
            Canvas c = new Canvas(bmp); w.draw(c);
            ByteArrayOutputStream bo = new ByteArrayOutputStream(); bmp.compress(Bitmap.CompressFormat.JPEG, 72, bo);
            frame = bo.toByteArray(); n++;
            notifyJs();
            h.postDelayed(this, 80);
        }
    };
    private void notifyJs() {
        if (w == null) return;
        try { JSONObject o = new JSONObject(); o.put("n", n); o.put("url", w.getUrl()); o.put("title", w.getTitle()); o.put("canBack", w.canGoBack());
            a.js("window.__wpBrowser&&__wpBrowser.frame(" + o + ")"); } catch (Exception ignored) { }
    }

    @JavascriptInterface public boolean available() { return true; }
    @JavascriptInterface public void open(final String url) { h.post(() -> { ensure(); w.loadUrl(url); if (!live) { live = true; h.post(loop); } }); }
    @JavascriptInterface public void stop() { h.post(() -> live = false); }
    @JavascriptInterface public void back() { h.post(() -> { if (w != null && w.canGoBack()) w.goBack(); }); }
    @JavascriptInterface public void forward() { h.post(() -> { if (w != null && w.canGoForward()) w.goForward(); }); }
    @JavascriptInterface public void reload() { h.post(() -> { if (w != null) w.reload(); }); }
    /** x,y normalizados 0..1 */
    @JavascriptInterface public void tap(final float x, final float y) {
        h.post(() -> { if (w == null) return; long t = SystemClock.uptimeMillis(); float px = x * W, py = y * H;
            MotionEvent d = MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, px, py, 0); MotionEvent u = MotionEvent.obtain(t, t + 40, MotionEvent.ACTION_UP, px, py, 0);
            w.dispatchTouchEvent(d); w.dispatchTouchEvent(u); d.recycle(); u.recycle(); });
    }
    @JavascriptInterface public void scroll(final float dy) { h.post(() -> { if (w != null) w.scrollBy(0, (int) (dy * H)); }); }
    @JavascriptInterface public void type(final String text) {
        h.post(() -> { if (w == null) return;
            if ("\n".equals(text)) { w.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER)); w.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER)); return; }
            if ("\b".equals(text)) { w.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DEL)); w.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DEL)); return; }
            w.evaluateJavascript("(function(t){var e=document.activeElement;if(!e)return;if(e.isContentEditable){document.execCommand('insertText',false,t);}else if('value' in e){var s=e.selectionStart==null?e.value.length:e.selectionStart;e.value=e.value.slice(0,s)+t+e.value.slice(e.selectionEnd==null?s:e.selectionEnd);e.selectionStart=e.selectionEnd=s+t.length;e.dispatchEvent(new Event('input',{bubbles:true}));}})(" + JSONObject.quote(text) + ")", null); });
    }
    /** abre no Wolvic (navegador XR de código aberto) se estiver instalado */
    @JavascriptInterface public boolean openWolvic(String url) {
        try {
            android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url));
            i.setPackage("com.igalia.wolvic"); a.startActivity(i); return true;
        } catch (Exception e) { return false; }
    }
}
