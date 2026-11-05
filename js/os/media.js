/* Wpollo VR — Vídeos (YouTube por código aberto), player imersivo (Cinema / Sala cinza / 360°),
 * Navegador real dentro do VR (APK) e Apps Android em janelas redimensionáveis (APK + Shizuku). */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, ui = R.ui, M = R.models;
  function app(def) { R.apps.push(def); }
  function nativeCall(obj, method, args) { // ponte nativa assíncrona (resposta via callback id)
    return new Promise(function (res, rej) {
      var id = (nativeCall.n = (nativeCall.n || 0) + 1);
      (nativeCall.p = nativeCall.p || {})[id] = function (d) { if (d && d.error) rej(new Error(d.error)); else res(d); };
      window[obj][method].apply(window[obj], [id].concat(args));
    });
  }
  window.__wpYT = { done: function (id, d) { var f = nativeCall.p && nativeCall.p[id]; if (f) { delete nativeCall.p[id]; f(d); } } };

  // ---------------------------------------------------------------- provedores de vídeo
  var V = R.video = {};
  V.native = function () { return !!(window.WpolloYT && WpolloYT.available && WpolloYT.available()); };
  V.instances = function () { return R.store.get('video.instances', ['https://inv.nadeko.net', 'https://yewtu.be', 'https://invidious.nerdvpn.de', 'https://pipedapi.kavin.rocks']); };
  function tryInst(fn) {
    var list = V.instances(), i = 0;
    var next = function (err) { if (i >= list.length) return Promise.reject(err || new Error('nenhuma instância respondeu')); var base = list[i++].replace(/\/$/, ''); return fn(base).catch(next); };
    return next();
  }
  function j(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  V.search = function (q) {
    if (V.native()) return nativeCall('WpolloYT', 'search', [q]);
    return tryInst(function (b) {
      if (/piped/.test(b)) return j(b + '/search?q=' + encodeURIComponent(q) + '&filter=videos').then(function (d) { return d.items.filter(function (x) { return x.type === 'stream'; }).map(function (x) { return { id: x.url.split('v=')[1], title: x.title, author: x.uploaderName, duration: x.duration, thumb: x.thumbnail, inst: b }; }); });
      return j(b + '/api/v1/search?type=video&q=' + encodeURIComponent(q)).then(function (d) { return d.filter(function (x) { return x.type === 'video'; }).map(function (x) { return { id: x.videoId, title: x.title, author: x.author, duration: x.lengthSeconds, thumb: b + '/vi/' + x.videoId + '/mqdefault.jpg', inst: b }; }); });
    }).then(function (l) { l.forEach(function (x) { x.is360 = /360|vr180|\bvr\b/i.test(x.title); }); return l; });
  };
  V.stream = function (item) {
    if (V.native()) return nativeCall('WpolloYT', 'stream', [item.id]);
    var b = item.inst || V.instances()[0];
    if (/piped/.test(b)) return j(b + '/streams/' + item.id).then(function (d) { var s = d.videoStreams.filter(function (x) { return !x.videoOnly && /mp4/i.test(x.mimeType || x.format); }).sort(function (p, q) { return (q.height || 0) - (p.height || 0); })[0]; if (!s) throw new Error('sem stream'); return { url: s.url, title: d.title }; });
    return j(b + '/api/v1/videos/' + item.id + '?local=true').then(function (d) {
      var s = (d.formatStreams || []).sort(function (p, q) { return parseInt(q.resolution || q.qualityLabel || 0, 10) - parseInt(p.resolution || p.qualityLabel || 0, 10); })[0];
      if (!s) throw new Error('sem stream'); return { url: s.url.indexOf('http') === 0 ? s.url : b + s.url, title: d.title };
    });
  };

  // ---------------------------------------------------------------- player imersivo (espaço próprio, como um jogo oculto)
  var video = null, vtex = null;
  function getVideo() {
    if (!video) {
      video = document.createElement('video'); video.crossOrigin = 'anonymous'; video.playsInline = true; video.setAttribute('playsinline', '');
      vtex = new THREE.VideoTexture(video); vtex.minFilter = THREE.LinearFilter; vtex.generateMipmaps = false;
    }
    return video;
  }
  R.play = function (req) { R.videoReq = req; PLAYER.assets.sky = req.mode === 'cinema' ? 'cinema' : req.mode === 'sala' ? 'salacinza' : null; var cur = R.os.current; if (cur && cur.def.id === 'player') R.os.closeGame(); R.os.launch('player'); };
  var PLAYER = {
    id: 'player', name: 'Vídeo', cat: 'Mídia', walk: false, hidden: true,
    assets: { sky: null },
    build: function (g) {
      var req = R.videoReq || {}, mode = req.mode || 'cinema', v = getVideo();
      var room = null;
      if (mode === 'cinema') room = R.assets.roomMesh('cinema', 24, 34, 12, R.settings.height);
      else if (mode === 'sala') room = R.assets.roomMesh('salacinza', 10, 10, 3.3, R.settings.height);
      if (room) { room.material.uniforms.rot.value = mode === 'cinema' ? 3.1 : 0.6; g.add(room); }
      else if (mode !== '360') g.env({ sky: 'night', ground: '#16161a' });
      M.lights(g.root, { hemi: 0.5, dir: 0.2 });
      var screen = null;
      if (mode === '360') {
        var sph = new THREE.Mesh(new THREE.SphereBufferGeometry(30, 48, 32), new THREE.MeshBasicMaterial({ map: vtex, side: THREE.BackSide }));
        sph.scale.x = -1; sph.rotation.y = -Math.PI / 2; sph.position.y = R.settings.height; g.add(sph);
      } else {
        var big = mode === 'cinema', W = big ? 11.2 : 3.6, Hh = W * 9 / 16;
        screen = new THREE.Mesh(new THREE.PlaneBufferGeometry(W, Hh), new THREE.MeshBasicMaterial({ map: vtex, toneMapped: false }));
        screen.position.set(0, big ? R.settings.height + 0.3 : 1.75, big ? -13 : -4.6); g.add(screen);
        var bezel = M.box(W + 0.12, Hh + 0.12, 0.05, '#0a0a0a'); bezel.position.copy(screen.position); bezel.position.z -= 0.04; g.add(bezel);
        // luz do telão na sala (barata: uma luz pontual que segue a cor média da tela)
        var glow = new THREE.PointLight('#8fa8ff', big ? 0.6 : 0.4, big ? 25 : 8); glow.position.copy(screen.position).add(new THREE.Vector3(0, 0, 1.5)); g.add(glow);
      }
      if (req.url && v.src !== req.url) { v.src = req.url; }
      v.play().catch(function () { R.ui.toast('Toque em ▶ para iniciar', 3); });
      var bar = new ui.Panel({ w: 1.5, h: 0.3, res: 520, render: function (x, P) {
        ui.glass(x, 0, 0, P.cw, P.ch, 40);
        ui.text(x, req.title || 'Vídeo', 30, 36, 22, { weight: 700, maxW: P.cw - 60 });
        var d = v.duration || 0, t = v.currentTime || 0, bw = P.cw - 60;
        ui.roundRect(x, 30, 64, bw, 10, 5); x.fillStyle = 'rgba(255,255,255,0.18)'; x.fill();
        ui.roundRect(x, 30, 64, Math.max(10, bw * (d ? t / d : 0)), 10, 5); x.fillStyle = ui.ACCENT; x.fill();
        P.area('seek', 30, 50, bw, 40, null, function (px) { if (px !== null && d) v.currentTime = Math.max(0, Math.min(1, (px - 30) / bw)) * d; });
        var by = 96, bh = 54;
        P.button('rw', 30, by, 80, bh, '', function () { v.currentTime = Math.max(0, v.currentTime - 10); }, { lucide: 'arrow-left' });
        P.button('pp', 120, by, 90, bh, '', function () { if (v.paused) v.play(); else v.pause(); }, { lucide: v.paused ? 'play' : 'pause', fill: ui.ACCENT, fillHover: ui.ACCENT_H });
        P.button('ff', 220, by, 80, bh, '', function () { v.currentTime = Math.min(d || 1e9, v.currentTime + 10); }, { lucide: 'arrow-right' });
        [['cinema', 'Cinema'], ['sala', 'Sala cinza'], ['360', '360°']].forEach(function (m, i) {
          P.button('m' + m[0], 330 + i * 130, by, 122, bh, m[1], function () { req.mode = m[0]; R.play(req); }, { active: mode === m[0], px: 18 });
        });
        P.button('vol', P.cw - 250, by, 100, bh, '', function () { v.muted = !v.muted; }, { lucide: 'volume-2', active: !v.muted });
        P.button('exit', P.cw - 140, by, 110, bh, 'Sair', function () { v.pause(); R.os.closeGame(); }, { px: 19 });
        P.state.t = Math.floor(t);
      }, onTick: function (dt, P) { if (Math.floor(v.currentTime || 0) !== P.state.t || P.state.p !== v.paused) { P.state.p = v.paused; P.dirty = true; } } });
      bar.mesh.position.set(0, R.settings.height - 0.75, -1.3); bar.mesh.rotation.x = -0.5; g.add(bar.mesh);
      g.on('press', function () { if (v.paused) v.play(); else v.pause(); });
      g.on('dispose', function () { v.pause(); });
    }
  };
  R.gameById.player = PLAYER;

  // ---------------------------------------------------------------- app Vídeos
  var imgs = {};
  function img(src) { if (!imgs[src]) { var i = new Image(); i.crossOrigin = 'anonymous'; i.onload = function () { ui.markAllDirty(); }; i.src = src; imgs[src] = i; } return imgs[src]; }
  app({
    id: 'videos', name: 'Vídeos', size: [1.6, 1.05],
    open: function (w) { w.st.q = w.st.q || ''; w.st.mode = R.store.get('video.mode', 'cinema'); if (!w.st.items) { w.st.loading = true; V.search('vr 360 4k').then(function (l) { w.st.items = l; w.st.loading = false; w.panel.dirty = true; }, function (e) { w.st.err = e.message; w.st.loading = false; w.panel.dirty = true; }); } },
    render: function (x, P, w, H) {
      var W = P.cw;
      ui.icon(x, 'video', 36, 30, 40, '#ff5d5d', 2.5);
      ui.text(x, 'Vídeos', 90, 52, 34, { weight: 800 });
      ui.text(x, V.native() ? 'YouTube via NewPipeExtractor (código aberto, no aparelho)' : 'YouTube via Invidious/Piped (código aberto)', 230, 54, 17, { color: 'rgba(255,255,255,0.55)' });
      var doSearch = function () {
        if (!w.st.q) return; R.os.closeKeyboard(w); w.st.loading = true; w.st.err = ''; w.st.items = [];
        V.search(w.st.q).then(function (l) { w.st.items = l; w.st.loading = false; P.dirty = true; }, function (e) { w.st.err = e.message; w.st.loading = false; P.dirty = true; });
      };
      ui.roundRect(x, 36, 96, W - 260, 58, 29); x.fillStyle = w.st.focus ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.3)'; x.fill();
      ui.text(x, w.st.q || 'Buscar vídeos…', 64, 126, 22, { color: w.st.q ? '#fff' : 'rgba(255,255,255,0.45)', maxW: W - 320 });
      P.area('q', 36, 96, W - 260, 58, function () { w.st.focus = true; R.os.keyboardFor(w, function (k) { if (k === '\n') return doSearch(); if (k === '\b') w.st.q = w.st.q.slice(0, -1); else w.st.q += k; P.dirty = true; }); });
      P.button('go', W - 210, 96, 174, 58, 'Buscar', doSearch, { lucide: 'search', align: 'left', fill: ui.ACCENT, fillHover: ui.ACCENT_H, px: 20 });
      [['cinema', 'Cinema'], ['sala', 'Sala cinza'], ['360', '360°']].forEach(function (m, i) {
        P.button('m' + m[0], 36 + i * 150, 168, 140, 44, m[1], function () { w.st.mode = m[0]; R.store.set('video.mode', m[0]); }, { active: w.st.mode === m[0], px: 18 });
      });
      if (!V.native()) P.button('inst', W - 330, 168, 294, 44, w.st.instEdit ? (w.st.inst || 'https://…') : 'Minha instância Invidious/Piped', function () {
        w.st.instEdit = true; w.st.inst = '';
        R.os.keyboardFor(w, function (k) { if (k === '\n') { if (w.st.inst) R.store.set('video.instances', [w.st.inst.trim()].concat(V.instances().filter(function (u) { return u !== w.st.inst.trim(); }))); w.st.instEdit = false; R.os.closeKeyboard(w); R.ui.toast('Instância salva'); P.dirty = true; return; } if (k === '\b') w.st.inst = w.st.inst.slice(0, -1); else w.st.inst += k; P.dirty = true; });
      }, { px: 15, active: w.st.instEdit });
      if (w.st.loading) ui.text(x, 'Carregando…', 36, 260, 22, { color: 'rgba(255,255,255,0.7)' });
      if (w.st.err) ui.wrap(x, '⚠ ' + w.st.err + (V.native() ? '' : ' — instâncias públicas podem estar bloqueadas; o APK busca direto pelo NewPipe.'), 36, 240, W - 72, 19, 28, { color: '#ffb0b0' });
      var items = (w.st.items || []).slice(0, 6), cw = (W - 72) / 3, ch = (H - 250) / 2;
      items.forEach(function (it, i) {
        var X = 36 + (i % 3) * cw, Y = 228 + Math.floor(i / 3) * ch, hov = P.hover === 'v' + i;
        ui.card(x, X + 5, Y, cw - 10, ch - 10, 18, hov);
        if (it.thumb) { var im = img(it.thumb); if (im.complete && im.naturalWidth) { x.save(); ui.roundRect(x, X + 15, Y + 10, cw - 30, (cw - 30) * 0.5, 12); x.clip(); x.drawImage(im, X + 15, Y + 10, cw - 30, (cw - 30) * 0.5625); x.restore(); } }
        ui.text(x, it.title, X + 18, Y + (cw - 30) * 0.5 + 34, 17, { weight: 700, maxW: cw - 36 });
        ui.text(x, (it.author || '') + (it.is360 ? ' • 360°' : ''), X + 18, Y + (cw - 30) * 0.5 + 58, 14, { color: 'rgba(255,255,255,0.55)', maxW: cw - 36 });
        P.area('v' + i, X + 5, Y, cw - 10, ch - 10, function () {
          R.ui.toast('Abrindo vídeo…', 2);
          V.stream(it).then(function (s) { R.play({ url: s.url, title: s.title || it.title, mode: it.is360 && w.st.mode !== '360' ? '360' : w.st.mode }); }, function (e) { R.ui.toast('Vídeo indisponível: ' + e.message, 4); });
        });
      });
    }
  });

  // ---------------------------------------------------------------- Navegador (APK: página real dentro do VR; site: atalhos)
  var BR = { n: 0, img: null, info: {} };
  window.__wpBrowser = { frame: function (o) { BR.info = o; var i = new Image(); i.onload = function () { BR.img = i; if (BR.win) BR.win.panel.dirty = true; }; i.src = '/browserframe.jpg?n=' + o.n; } };
  R.browserNative = function () { return !!(window.WpolloBrowser && WpolloBrowser.available && WpolloBrowser.available()); };
  var BROWSER = {
    id: 'webbrowser', name: 'Navegador', size: [1.7, 1.15], maxWin: 5,
    open: function (w) { BR.win = w; w.st.url = w.st.url || 'https://duckduckgo.com'; WpolloBrowser.open(w.st.url); },
    close: function () { BR.win = null; WpolloBrowser.stop(); },
    onSwipe: function (w, d) { WpolloBrowser.scroll(d * 0.6); },
    render: function (x, P, w, H) {
      var W = P.cw, top = 90;
      P.button('bk', 20, 18, 60, 54, '', function () { WpolloBrowser.back(); }, { lucide: 'arrow-left' });
      P.button('fw', 86, 18, 60, 54, '', function () { WpolloBrowser.forward(); }, { lucide: 'arrow-right' });
      P.button('rl', 152, 18, 60, 54, '', function () { WpolloBrowser.reload(); }, { lucide: 'rotate-cw' });
      var go = function () { var u = w.st.url.trim(); if (!/^https?:\/\//.test(u)) u = u.indexOf('.') > 0 && u.indexOf(' ') < 0 ? 'https://' + u : 'https://duckduckgo.com/?q=' + encodeURIComponent(u); w.st.typing = false; R.os.closeKeyboard(w); WpolloBrowser.open(u); };
      ui.roundRect(x, 224, 18, W - 470, 54, 27); x.fillStyle = 'rgba(0,0,0,0.3)'; x.fill();
      ui.text(x, w.st.typing ? w.st.url : (BR.info.url || w.st.url), 248, 46, 19, { maxW: W - 510, color: 'rgba(255,255,255,0.85)' });
      P.area('url', 224, 18, W - 470, 54, function () { w.st.typing = true; w.st.url = ''; w.st.mode = 'url'; R.os.keyboardFor(w, function (k) { if (k === '\n') return go(); if (k === '\b') w.st.url = w.st.url.slice(0, -1); else w.st.url += k; P.dirty = true; }); });
      P.button('kb', W - 236, 18, 60, 54, '', function () { w.st.mode = 'page'; R.os.keyboardFor(w, function (k) { WpolloBrowser.type(k); }); }, { lucide: 'keyboard' });
      P.button('wv', W - 170, 18, 150, 54, 'Wolvic', function () { if (!WpolloBrowser.openWolvic(BR.info.url || w.st.url)) R.ui.toast('Instale o Wolvic (navegador XR aberto) para abrir lá', 4); }, { lucide: 'glasses', align: 'left', px: 18 });
      var ph = H - top - 16;
      if (BR.img) x.drawImage(BR.img, 16, top, W - 32, ph); else ui.text(x, 'Carregando página…', W / 2, top + ph / 2, 22, { align: 'center', color: 'rgba(255,255,255,0.6)' });
      P.area('page', 16, top, W - 32, ph, function (px, py) { WpolloBrowser.tap(px / (W - 32), py / ph); });
      ui.text(x, BR.info.title || '', 20, H - 2, 1, {});
    }
  };
  if (window.WpolloBrowser) app(BROWSER);

  // ---------------------------------------------------------------- Apps Android em janelas (APK + Shizuku)
  var AW = {}, appList = null;
  window.__wpApps = {
    status: function (s) { R.ui.toast('Apps Android: ' + s, 4); },
    frame: function (id, n) { var a = AW[id]; if (!a) return; var i = new Image(); i.onload = function () { a.img = i; if (a.win) a.win.panel.dirty = true; }; i.src = '/appframe/' + id + '.jpg?n=' + n; },
    opened: function (id, displayId, comp) { var pend = AW.pending; delete AW.pending; openAppWindow(id, comp, pend); }
  };
  var SIZES = [['Retrato', 720, 1280, 0.62, 1.1], ['Paisagem', 1280, 720, 1.4, 0.79], ['Tablet', 1600, 1000, 1.6, 1.0]];
  function openAppWindow(id, comp, meta) {
    var label = (meta && meta.label) || comp.split('/')[0];
    var def = { id: 'android-' + id, name: label, size: [1.4, 0.87], maxWin: 6,
      close: function () { WpolloApps.close(id); delete AW[id]; },
      onSwipe: function (w, d) { WpolloApps.swipe(id, 0.5, 0.7, 0.5, 0.7 - d * 0.35); },
      render: function (x, P, w, H) {
        var a = AW[id] || {}, W = P.cw, top = 70;
        if (meta && meta.icon) { var ic = img(meta.icon); if (ic.complete) x.drawImage(ic, 20, 14, 44, 44); }
        ui.text(x, label, 76, 38, 22, { weight: 700, maxW: W - 640 });
        P.button('back', W - 560, 12, 60, 50, '', function () { WpolloApps.key(id, 4); }, { lucide: 'arrow-left' });
        P.button('home', W - 494, 12, 60, 50, '', function () { WpolloApps.key(id, 3); }, { lucide: 'house' });
        P.button('kb', W - 428, 12, 60, 50, '', function () { R.os.keyboardFor(w, function (k) { if (k === '\n') WpolloApps.key(id, 66); else if (k === '\b') WpolloApps.key(id, 67); else WpolloApps.text(id, k); }); }, { lucide: 'keyboard' });
        SIZES.forEach(function (sz, i) { P.button('sz' + i, W - 362 + i * 116, 12, 110, 50, sz[0], function () { WpolloApps.resize(id, sz[1], sz[2]); R.os.resizeWindow(w, sz[3], sz[4]); }, { px: 16 }); });
        var ph = H - top - 12, pw = W - 32;
        if (a.img) x.drawImage(a.img, 16, top, pw, ph); else ui.text(x, 'Abrindo app…', W / 2, top + ph / 2, 22, { align: 'center', color: 'rgba(255,255,255,0.6)' });
        P.area('screen', 16, top, pw, ph, function (px, py) { WpolloApps.tap(id, px / pw, py / ph); });
      } };
    AW[id] = { win: null };
    AW[id].win = R.os.openWindow(def);
  }
  if (window.WpolloApps) app({
    id: 'androidapps', name: 'Apps Android', size: [1.4, 1.0],
    open: function (w) { try { appList = JSON.parse(WpolloApps.list()); } catch (e) { appList = []; } w.st.page = 0; w.st.status = WpolloApps.status(); },
    onSwipe: function (w, d) { w.st.page = Math.max(0, w.st.page + d); },
    render: function (x, P, w, H) {
      var W = P.cw;
      ui.icon(x, 'layout-grid', 36, 30, 40, '#30d158', 2.5); ui.text(x, 'Apps Android', 90, 52, 32, { weight: 800 });
      var st = w.st.status, msg = st === 'ok' ? 'Shizuku ativo: apps abrem em janelas redimensionáveis' : st === 'sem-permissao' ? 'Permita o Wpollo VR no Shizuku' : st === 'parado' ? 'Abra o app Shizuku e inicie o serviço' : 'Instale o Shizuku (gratuito) para usar esta função';
      ui.text(x, msg, 90, 88, 17, { color: st === 'ok' ? '#9be7b0' : '#ffd08a' });
      if (st !== 'ok') P.button('acc', W - 300, 30, 264, 54, 'Conceder acesso', function () { WpolloApps.requestAccess(); setTimeout(function () { w.st.status = WpolloApps.status(); P.dirty = true; }, 1500); }, { fill: ui.ACCENT, fillHover: ui.ACCENT_H, px: 19 });
      var per = 18, list = (appList || []).slice(w.st.page * per, w.st.page * per + per), cols = 6, gx = (W - 60) / cols;
      list.forEach(function (a, i) {
        var cx = 30 + (i % cols) * gx + gx / 2, cy = 120 + Math.floor(i / cols) * 150, hov = P.hover === 'a' + i;
        if (hov) { ui.card(x, cx - gx / 2 + 6, cy - 6, gx - 12, 140, 20, true); }
        var ic = img(a.icon); if (ic.complete) x.drawImage(ic, cx - 40, cy, 80, 80);
        ui.text(x, a.label, cx, cy + 106, 16, { align: 'center', maxW: gx - 12 });
        P.area('a' + i, cx - gx / 2, cy - 6, gx, 140, function () { AW.pending = a; R.ui.toast('Abrindo ' + a.label + '…', 2); WpolloApps.launch(a.pkg + '/' + a.cls, 1280, 800); });
      });
      var pages = Math.max(1, Math.ceil((appList || []).length / per));
      P.button('pv', W / 2 - 150, H - 62, 64, 48, '', function () { w.st.page = Math.max(0, w.st.page - 1); }, { lucide: 'arrow-left' });
      ui.text(x, (w.st.page + 1) + ' / ' + pages, W / 2, H - 38, 19, { align: 'center', color: 'rgba(255,255,255,0.7)' });
      P.button('nx', W / 2 + 86, H - 62, 64, 48, '', function () { w.st.page = Math.min(pages - 1, w.st.page + 1); }, { lucide: 'arrow-right' });
    }
  });
})();
