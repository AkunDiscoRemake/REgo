package com.wpollo.vr;

import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONObject;
import org.schabi.newpipe.extractor.InfoItem;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import org.schabi.newpipe.extractor.search.SearchExtractor;
import org.schabi.newpipe.extractor.stream.StreamInfo;
import org.schabi.newpipe.extractor.stream.StreamInfoItem;
import org.schabi.newpipe.extractor.stream.VideoStream;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Vídeos do YouTube via NewPipeExtractor (código aberto, GPL-3.0): busca e extração de streams direto no aparelho,
 * sem conta Google e sem servidor intermediário. Um proxy local entrega o vídeo ao WebView como mesma origem,
 * para que ele possa virar textura no VR (cinema / sala / 360°).
 */
public class YtBridge {
    static final String UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0";
    private final MainActivity a;
    private final ExecutorService ex = Executors.newFixedThreadPool(2);
    private static boolean inited = false;

    YtBridge(MainActivity a) { this.a = a; }

    static class DL extends Downloader {
        @Override
        public Response execute(Request req) throws java.io.IOException {
            HttpURLConnection c = (HttpURLConnection) new URL(req.url()).openConnection();
            c.setRequestMethod(req.httpMethod()); c.setConnectTimeout(15000); c.setReadTimeout(20000);
            c.setRequestProperty("User-Agent", UA);
            for (Map.Entry<String, List<String>> h : req.headers().entrySet()) for (String v : h.getValue()) c.addRequestProperty(h.getKey(), v);
            byte[] body = req.dataToSend();
            if (body != null) { c.setDoOutput(true); try (OutputStream o = c.getOutputStream()) { o.write(body); } }
            int code = c.getResponseCode();
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            String txt = "";
            if (in != null) { ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] b = new byte[16384]; int n; while ((n = in.read(b)) > 0) bo.write(b, 0, n); txt = bo.toString("UTF-8"); }
            Map<String, List<String>> hs = new HashMap<>(); for (Map.Entry<String, List<String>> e : c.getHeaderFields().entrySet()) if (e.getKey() != null) hs.put(e.getKey(), e.getValue());
            return new Response(code, c.getResponseMessage(), hs, txt, c.getURL().toString());
        }
    }
    private static synchronized void init() { if (!inited) { NewPipe.init(new DL()); inited = true; } }

    private void reply(int id, String json) { a.js("window.__wpYT&&__wpYT.done(" + id + "," + json + ")"); }
    static String proxied(String url) { try { return "/ytproxy?u=" + URLEncoder.encode(url, "UTF-8"); } catch (Exception e) { return url; } }

    @JavascriptInterface public boolean available() { return true; }

    @JavascriptInterface
    public void search(final int id, final String q) {
        ex.execute(() -> {
            try {
                init();
                SearchExtractor se = ServiceList.YouTube.getSearchExtractor(q);
                se.fetchPage();
                JSONArray out = new JSONArray();
                for (InfoItem it : se.getInitialPage().getItems()) {
                    if (!(it instanceof StreamInfoItem)) continue;
                    StreamInfoItem s = (StreamInfoItem) it;
                    JSONObject o = new JSONObject();
                    o.put("id", s.getUrl().replaceAll(".*[?&]v=([\\w-]+).*", "$1"));
                    o.put("title", s.getName()); o.put("author", s.getUploaderName()); o.put("duration", s.getDuration());
                    if (!s.getThumbnails().isEmpty()) o.put("thumb", proxied(s.getThumbnails().get(0).getUrl()));
                    o.put("is360", s.getName().matches("(?i).*(360|vr180|\\bvr\\b).*"));
                    out.put(o);
                }
                reply(id, out.toString());
            } catch (Throwable e) { reply(id, "{\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}"); }
        });
    }

    @JavascriptInterface
    public void stream(final int id, final String videoId) {
        ex.execute(() -> {
            try {
                init();
                StreamInfo info = StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=" + videoId);
                VideoStream best = null; int bestH = 0;
                for (VideoStream v : info.getVideoStreams()) { // streams "muxados" (vídeo + áudio)
                    int h = 0; try { h = Integer.parseInt(v.getResolution().replaceAll("[^0-9].*", "")); } catch (Exception ignored) { }
                    if (v.isUrl() && h <= 1080 && h >= bestH) { best = v; bestH = h; }
                }
                if (best == null) throw new Exception("nenhum stream compatível");
                JSONObject o = new JSONObject();
                o.put("url", proxied(best.getContent())); o.put("title", info.getName()); o.put("height", bestH);
                reply(id, o.toString());
            } catch (Throwable e) { reply(id, "{\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}"); }
        });
    }

    /** proxy: repassa a requisição (com Range, para avançar o vídeo) e devolve como mesma origem */
    static WebResourceResponse proxy(WebResourceRequest req) {
        try {
            String u = URLDecoder.decode(req.getUrl().getQueryParameter("u"), "UTF-8");
            if (!u.startsWith("https://")) return null;
            HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
            c.setRequestProperty("User-Agent", UA);
            String range = req.getRequestHeaders().get("Range"); if (range == null) range = req.getRequestHeaders().get("range");
            if (range != null) c.setRequestProperty("Range", range);
            int code = c.getResponseCode();
            Map<String, String> h = new HashMap<>();
            for (String k : new String[]{"Content-Range", "Content-Length", "Accept-Ranges", "Content-Type"}) { String v = c.getHeaderField(k); if (v != null) h.put(k, v); }
            h.put("Access-Control-Allow-Origin", "*"); h.put("Cross-Origin-Resource-Policy", "cross-origin");
            String mime = c.getContentType() == null ? "video/mp4" : c.getContentType().split(";")[0];
            return new WebResourceResponse(mime, null, code, code == 206 ? "Partial Content" : "OK", h, code >= 400 ? c.getErrorStream() : c.getInputStream());
        } catch (Exception e) { return null; }
    }
}
