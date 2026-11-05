package com.wpollo.vr;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.PixelFormat;
import android.graphics.drawable.Drawable;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import rikka.shizuku.Shizuku;

/**
 * Apps Android em janelas no VR (experimental):
 *  - Shizuku dá permissão de shell (am / input / settings) sem root;
 *  - liga o modo de janelas livres e força apps redimensionáveis;
 *  - cada app abre num display virtual público (MediaProjection) => multitarefa de verdade;
 *  - o conteúdo do display vira imagem numa janela 3D; toques/rolagem/texto voltam por `input -d <display>`;
 *  - redimensionar a janela no VR redimensiona o display (o app se adapta como em tablet).
 */
public class AppsBridge {
    static final int REQ_PROJ = 77, REQ_SHIZUKU = 78;
    private final MainActivity a;
    private IShell shell;
    private MediaProjection proj;
    private final HandlerThread ht = new HandlerThread("apps-frames");
    private Handler bg;
    private final Map<Integer, Win> wins = new HashMap<>();
    private int nextId = 1;
    private String pendingPkg; private int pendingW, pendingH;

    static class Win { int id; VirtualDisplay vd; ImageReader ir; int w, h, dpi; volatile byte[] jpg = new byte[0]; int n; String pkg; long last; }

    AppsBridge(MainActivity a) { this.a = a; ht.start(); bg = new Handler(ht.getLooper()); }
    byte[] frame(int id) { Win w = wins.get(id); return w == null ? new byte[0] : w.jpg; }

    // ---------------------------------------------------------------- Shizuku
    private final ServiceConnection conn = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName n, IBinder b) {
            shell = IShell.Stub.asInterface(b);
            exec("settings put global enable_freeform_support 1; settings put global force_resizable_activities 1; settings put global enable_non_resizable_multi_window 1");
            a.js("window.__wpApps&&__wpApps.status('pronto')");
            if (pendingPkg != null) { String p = pendingPkg; pendingPkg = null; launchNow(p, pendingW, pendingH); }
        }
        @Override public void onServiceDisconnected(ComponentName n) { shell = null; }
    };
    private String exec(String c) { try { return shell == null ? "" : shell.exec(c); } catch (Exception e) { return ""; } }
    private boolean ensureShell() {
        try {
            if (!Shizuku.pingBinder()) { a.js("window.__wpApps&&__wpApps.status('Shizuku não está rodando: abra o app Shizuku e inicie o serviço')"); return false; }
            if (Shizuku.checkSelfPermission() != PackageManager.PERMISSION_GRANTED) { Shizuku.requestPermission(REQ_SHIZUKU); return false; }
            if (shell == null) {
                Shizuku.UserServiceArgs args = new Shizuku.UserServiceArgs(new ComponentName(a.getPackageName(), ShellService.class.getName()))
                        .processNameSuffix("shell").daemon(false).version(2);
                Shizuku.bindUserService(args, conn); return false;
            }
            return true;
        } catch (Throwable t) { a.js("window.__wpApps&&__wpApps.status('Shizuku indisponível: instale o app Shizuku')"); return false; }
    }

    // ---------------------------------------------------------------- lista de apps
    @JavascriptInterface public boolean available() { return true; }
    @JavascriptInterface public String status() { try { return Shizuku.pingBinder() ? (Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED ? "ok" : "sem-permissao") : "parado"; } catch (Throwable t) { return "ausente"; } }
    @JavascriptInterface public void requestAccess() { a.runOnUiThread(this::ensureShell); }
    @JavascriptInterface
    public String list() {
        try {
            PackageManager pm = a.getPackageManager();
            Intent i = new Intent(Intent.ACTION_MAIN); i.addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> l = pm.queryIntentActivities(i, 0);
            JSONArray out = new JSONArray();
            for (ResolveInfo r : l) {
                if (r.activityInfo.packageName.equals(a.getPackageName())) continue;
                JSONObject o = new JSONObject(); o.put("pkg", r.activityInfo.packageName); o.put("cls", r.activityInfo.name); o.put("label", r.loadLabel(pm).toString());
                Drawable d = r.loadIcon(pm); Bitmap b = Bitmap.createBitmap(72, 72, Bitmap.Config.ARGB_8888); Canvas c = new Canvas(b); d.setBounds(0, 0, 72, 72); d.draw(c);
                ByteArrayOutputStream bo = new ByteArrayOutputStream(); b.compress(Bitmap.CompressFormat.PNG, 100, bo); o.put("icon", "data:image/png;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP));
                out.put(o);
            }
            return out.toString();
        } catch (Exception e) { return "[]"; }
    }

    // ---------------------------------------------------------------- abrir app numa janela
    @JavascriptInterface
    public void launch(final String comp, final int w, final int h) {
        a.runOnUiThread(() -> {
            if (!ensureShell()) { pendingPkg = comp; pendingW = w; pendingH = h; return; }
            launchNow(comp, w, h);
        });
    }
    private void launchNow(String comp, int w, int h) {
        if (proj == null) {
            pendingPkg = comp; pendingW = w; pendingH = h;
            a.startForegroundService(new Intent(a, ProjectionService.class));
            MediaProjectionManager m = (MediaProjectionManager) a.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            a.startActivityForResult(m.createScreenCaptureIntent(), REQ_PROJ); return;
        }
        final Win win = new Win(); win.id = nextId++; win.w = w; win.h = h; win.dpi = 240; win.pkg = comp;
        win.ir = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2);
        win.ir.setOnImageAvailableListener(r -> grab(win, r), bg);
        int flags = DisplayManager.VIRTUAL_DISPLAY_FLAG_PUBLIC | DisplayManager.VIRTUAL_DISPLAY_FLAG_OWN_CONTENT_ONLY | DisplayManager.VIRTUAL_DISPLAY_FLAG_PRESENTATION;
        win.vd = proj.createVirtualDisplay("wpollo-" + win.id, w, h, win.dpi, flags, win.ir.getSurface(), null, bg);
        wins.put(win.id, win);
        int did = win.vd.getDisplay().getDisplayId();
        new Thread(() -> exec("am start --display " + did + " --activity-clear-task -n " + comp)).start();
        a.js("window.__wpApps&&__wpApps.opened(" + win.id + "," + did + "," + JSONObject.quote(comp) + ")");
    }
    void onResult(int req, int code, Intent data) {
        if (req == REQ_PROJ && code == Activity.RESULT_OK && data != null) {
            MediaProjectionManager m = (MediaProjectionManager) a.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            proj = m.getMediaProjection(code, data);
            proj.registerCallback(new MediaProjection.Callback() { @Override public void onStop() { proj = null; } }, bg);
            if (pendingPkg != null) { String p = pendingPkg; pendingPkg = null; launchNow(p, pendingW, pendingH); }
        } else if (req == REQ_PROJ) a.js("window.__wpApps&&__wpApps.status('Permissão de captura negada')");
    }

    private void grab(Win w, ImageReader r) {
        Image img = r.acquireLatestImage(); if (img == null) return;
        try {
            long now = System.currentTimeMillis(); if (now - w.last < 60) return; w.last = now; // ~15 fps
            Image.Plane p = img.getPlanes()[0]; ByteBuffer buf = p.getBuffer(); int ps = p.getPixelStride(), rs = p.getRowStride();
            Bitmap b = Bitmap.createBitmap(rs / ps, w.h, Bitmap.Config.ARGB_8888); b.copyPixelsFromBuffer(buf);
            Bitmap c = Bitmap.createBitmap(b, 0, 0, w.w, w.h);
            ByteArrayOutputStream bo = new ByteArrayOutputStream(); c.compress(Bitmap.CompressFormat.JPEG, 70, bo);
            w.jpg = bo.toByteArray(); w.n++;
            a.js("window.__wpApps&&__wpApps.frame(" + w.id + "," + w.n + ")");
        } finally { img.close(); }
    }

    // ---------------------------------------------------------------- entrada e redimensionamento
    private int did(int id) { Win w = wins.get(id); return w == null ? -1 : w.vd.getDisplay().getDisplayId(); }
    @JavascriptInterface public void tap(int id, float x, float y) { Win w = wins.get(id); if (w != null) bg.post(() -> exec("input -d " + did(id) + " tap " + (int) (x * w.w) + " " + (int) (y * w.h))); }
    @JavascriptInterface public void swipe(int id, float x1, float y1, float x2, float y2) { Win w = wins.get(id); if (w != null) bg.post(() -> exec("input -d " + did(id) + " swipe " + (int) (x1 * w.w) + " " + (int) (y1 * w.h) + " " + (int) (x2 * w.w) + " " + (int) (y2 * w.h) + " 180")); }
    @JavascriptInterface public void text(int id, String t) { bg.post(() -> exec("input -d " + did(id) + " text " + shellQuote(t.replace(" ", "%s")))); }
    @JavascriptInterface public void key(int id, int code) { bg.post(() -> exec("input -d " + did(id) + " keyevent " + code)); }
    @JavascriptInterface public void resize(int id, int w, int h) {
        Win win = wins.get(id); if (win == null) return;
        bg.post(() -> {
            win.w = w; win.h = h; ImageReader old = win.ir;
            win.ir = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2); win.ir.setOnImageAvailableListener(r -> grab(win, r), bg);
            win.vd.resize(w, h, win.dpi); win.vd.setSurface(win.ir.getSurface()); old.close();
        });
    }
    @JavascriptInterface public void close(int id) {
        Win w = wins.remove(id); if (w == null) return;
        bg.post(() -> { exec("am force-stop " + w.pkg.split("/")[0]); w.vd.release(); w.ir.close(); });
    }
    private static String shellQuote(String s) { return "'" + s.replace("'", "'\\''") + "'"; }
}
