/* Wpollo VR — shell: Início (menu | conteúdo | central de controle), janelas, multitarefa, menu de pausa */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, M = R.models, ui = R.ui;
  var os = R.os = { running: [], current: null, windows: [], notes: R.store.get('notes', []), maxRunning: 3 };

  var home, homeEnv, mainPanel, statusPanel, sidePanel, pausePanel, pauseOpen = false, fpsPanel;
  var st = { tab: 'home', page: 0, cat: 'Todos', pauseTab: 'main' };

  // ------------------------------------------------------------ notificações / conquistas
  os.notify = function (msg) {
    os.notes.unshift({ t: Date.now(), msg: msg }); if (os.notes.length > 40) os.notes.length = 40;
    R.store.set('notes', os.notes); R.sfx.play('notify'); ui.toast(msg, 3);
  };
  os.achievement = function (key) {
    var a = R.store.get('ach', {}); if (a[key]) return; a[key] = Date.now(); R.store.set('ach', a);
    var n = Object.keys(a).length;
    if (n === 1 || n === 5 || n === 10 || n === 25 || n === 50) os.notify('⭐ Conquista: ' + n + ' jogo(s) explorado(s)!');
  };

  // ------------------------------------------------------------ ambiente do Início
  var ENVS = [
    ['apartamento', 'Apartamento', 'Sala moderna com vista para o mar', 'house'],
    ['sala', 'Sala de estar', 'Casa aconchegante, luz do dia', 'sun'],
    ['lounge', 'Lounge clássico', 'Salão iluminado e quente', 'sparkles'],
    ['lago', 'Lago ao pôr do sol', 'Ao ar livre, campo e lago', 'sun-medium'],
    ['noite', 'Noite estrelada', 'Campo aberto à noite', 'glasses'],
    ['praia', 'Praia', 'Areia e mar', 'globe'],
    ['espaco', 'Espaço', 'Flutuando entre planetas', 'sparkles']
  ];
  function buildHomeEnv() {
    if (homeEnv) home.remove(homeEnv);
    homeEnv = new THREE.Group(); var e = R.settings.homeEnv || 'apartamento';
    var room = /apartamento|sala|lounge/.test(e) && R.assets.sky[e] ? R.assets.roomMesh(e, 9, 9, 3.4, R.settings.height) : null;
    if (room) {
      room.material.uniforms.rot.value = { apartamento: 4.71, sala: 4.71, lounge: 3.14 }[e];
      homeEnv.add(room); M.lights(homeEnv, { hemi: 0.9, dir: 0.4 });
    } else if (e === 'espaco') {
      M.env(homeEnv, { sky: 'space', ground: false, stars: 1500 });
      var planet = M.sphere(12, '#c77b4a', 24); planet.position.set(-30, 10, -60); homeEnv.add(planet);
      var ring = new THREE.Mesh(M.geo.torus(18, 0.6, 4, 40), R.mat.lambert('#e8c49a')); ring.rotation.x = 1.2; planet.add(ring);
    } else if (e === 'noite') {
      M.env(homeEnv, { sky: 'night', ground: '#1b2a3a', tex: 'sparse_grass', trees: 30, mountains: '#1f2c44', stars: 1200 });
    } else if (e === 'praia') {
      M.env(homeEnv, { sky: 'day', photo: R.assets.sky.beach ? 'beach' : 'day', ground: '#f1d9a6', tex: 'coast_sand_01', clouds: 8 });
    } else {
      M.env(homeEnv, { sky: 'lago', ground: '#3d5a4a', tex: 'sparse_grass', trees: 40, rocks: 8, shrubs: 12, mountains: '#7a6f99', clouds: 6 });
      var lake = new THREE.Mesh(new THREE.CircleBufferGeometry(40, 32), R.mat.lambert('#55739a')); lake.rotation.x = -Math.PI / 2; lake.position.set(0, 0.02, -48); homeEnv.add(lake);
    }
    home.fog = null;
    home.add(homeEnv);
  }
  os.setHomeEnv = function (e) {
    R.settings.homeEnv = e; R.saveSettings();
    if (/apartamento|sala|lounge|praia/.test(e)) R.assets.loadSky(e === 'praia' ? 'beach' : e).then(buildHomeEnv); else buildHomeEnv();
  };

  // ------------------------------------------------------------ Início (3 painéis: menu | conteúdo | central de controle)
  var CATS = ['Todos', 'Destaques', 'Ação', 'Esporte', 'Física', 'Puzzle', 'Música', 'Relax', 'Corrida'];
  var NAV = [['home', 'house', 'Início'], ['library', 'layout-grid', 'Biblioteca'], ['hands', 'hand', 'Modelos de mãos'], ['env', 'sun', 'Ambiente'],
    ['video', 'video', 'Vídeo'], ['shots', 'image', 'Capturas'], ['settings', 'sliders-horizontal', 'Ajustes'], ['about', 'info', 'Sobre']];
  var APPICON = { videos: ['play', '#e5484d'], webbrowser: ['globe', '#2f7bf6'], androidapps: ['layout-grid', '#30a46c'], chat: ['message-square', '#30a46c'], store: ['store', '#8a3cf0'], browser: ['globe', '#2f7bf6'], cloudplay: ['cloud', '#3a3f4b'], tv: ['tv', '#e5484d'], gallery: ['image', '#f2994a'],
    camera: ['camera', '#ff5d8f'], clock: ['clock', '#30a46c'], calendar: ['calendar', '#e5484d'], calculator: ['calculator', '#5f6b7a'], files: ['folder', '#2f7bf6'],
    messenger: ['message-square', '#8a3cf0'], remote: ['monitor', '#0ea5a4'], settings: ['settings', '#5f6b7a'], help: ['circle-help', '#2f7bf6'],
    facebook: ['globe', '#1877f2'], instagram: ['aperture', '#d62976'], whatsapp: ['message-square', '#25d366'] };
  var logoImg = new Image(); logoImg.onload = function () { ui.markAllDirty(); }; logoImg.src = 'assets/brand/logo_512.png';
  function gamesFiltered() {
    if (st.cat === 'Todos') return R.gameList;
    if (st.cat === 'Destaques') return R.gameList.filter(function (g) { return g.featured; });
    return R.gameList.filter(function (g) { return g.cat === st.cat; });
  }
  function gameIcon(g) { return ui.genIcon('g:' + g.id, g.c1 || '#5b6cff', g.c2 || '#b14cff', g.glyph || '🎮'); }
  os.gameIcon = gameIcon;
  // bloco de app: quadrado arredondado com ícone de linha (estilo da referência)
  function appTile(x, a, X, Y, S, hov) {
    var ic = APPICON[a.id] || ['box', '#5f6b7a'];
    ui.roundRect(x, X, Y, S, S, S * 0.26);
    var g = x.createLinearGradient(X, Y, X + S, Y + S); g.addColorStop(0, ic[1]); g.addColorStop(1, 'rgba(20,22,30,0.9)');
    x.fillStyle = g; x.fill(); x.lineWidth = hov ? 4 : 2; x.strokeStyle = hov ? '#fff' : 'rgba(255,255,255,0.18)'; x.stroke();
    ui.icon(x, ic[0], X + S * 0.25, Y + S * 0.25, S * 0.5, '#fff', 1.8);
  }
  os.appTile = appTile;

  function renderSide(x, P) {
    ui.glass(x, 0, 0, P.cw, P.ch, 40);
    if (logoImg.complete && logoImg.naturalWidth) { var lw = P.cw - 120, lh = lw * logoImg.naturalHeight / logoImg.naturalWidth; x.drawImage(logoImg, 60, 18, lw, lh); }
    var y0 = 250;
    NAV.forEach(function (n, i) {
      P.button('nav' + n[0], 22, y0 + i * 66, P.cw - 44, 56, n[2], function () { st.tab = n[0]; st.page = 0; mainPanel.dirty = true; P.dirty = true; R.sfx.play('tick'); },
        { active: st.tab === n[0], align: 'left', lucide: n[1], r: 18, px: 22, iconSize: 26 });
    });
  }

  function header(x, title, sub) { ui.text(x, title, 40, 52, 36, { weight: 800 }); if (sub) ui.text(x, sub, 40, 92, 19, { color: 'rgba(255,255,255,0.6)' }); }

  function renderMain(x, P) {
    var W = P.cw, H = P.ch;
    ui.glass(x, 0, 0, W, H, 40);
    if (st.tab === 'home') {
      var hr = new Date().getHours();
      header(x, hr < 12 ? 'Bom dia!' : hr < 18 ? 'Boa tarde!' : 'Boa noite!', R.gameList.length + ' jogos • ' + (R.vrbox && R.vrbox.active ? 'modo VR Box' : R.isXR ? 'modo VR' : 'modo 2D'));
      // continuar jogando
      var recent = os.running.length ? os.running.map(function (c) { return c.def; }) : R.store.get('recent', []).map(function (id) { return R.gameById[id]; }).filter(Boolean);
      recent = recent.slice(0, 4);
      ui.text(x, os.running.length ? 'Em execução' : 'Jogados recentemente', 40, 140, 22, { weight: 700, color: 'rgba(255,255,255,0.8)' });
      var cw = (W - 80) / 4;
      for (var r = 0; r < 4; r++) (function (g, r) {
        var X = 40 + r * cw, Y = 160;
        if (!g) { ui.card(x, X + 4, Y, cw - 8, 110, 22); ui.text(x, '—', X + cw / 2, Y + 55, 22, { align: 'center', color: 'rgba(255,255,255,0.3)' }); return; }
        var hov = P.hover === 'rec' + r; ui.card(x, X + 4, Y, cw - 8, 110, 22, hov);
        ui.drawIcon(x, gameIcon(g), X + 18, Y + 17, 76);
        ui.text(x, g.name, X + 106, Y + 44, 19, { weight: 700, maxW: cw - 120 });
        ui.text(x, os.isRunning(g.id) ? '▶ Retomar' : g.cat, X + 106, Y + 76, 16, { color: os.isRunning(g.id) ? '#c9a2ff' : 'rgba(255,255,255,0.55)' });
        P.area('rec' + r, X + 4, Y, cw - 8, 110, function () { os.launch(g.id); });
      })(recent[r], r);
      ui.text(x, 'Apps', 40, 310, 22, { weight: 700, color: 'rgba(255,255,255,0.8)' });
      var cols = 10, gx = (W - 60) / cols, S = 76;
      R.apps.forEach(function (a, i) {
        var cx = 30 + (i % cols) * gx + gx / 2, cy = 326 + Math.floor(i / cols) * 128, hov = P.hover === 'app' + a.id;
        appTile(x, a, cx - S / 2, cy, S, hov);
        ui.text(x, a.name, cx, cy + S + 22, 16, { align: 'center', maxW: gx - 4, color: 'rgba(255,255,255,0.85)' });
        P.area('app' + a.id, cx - gx / 2, cy, gx, S + 40, function () { os.openApp(a.id); });
      });
    } else if (st.tab === 'library') {
      header(x, 'Biblioteca', R.gameList.length + ' jogos');
      var cx0 = 40;
      for (var k = 0; k < CATS.length; k++) (function (c) {
        x.font = ui.font(18, 600); var w = x.measureText(c).width + 30;
        P.button('cat' + c, cx0, 118, w, 40, c, function () { st.cat = c; st.page = 0; }, { active: st.cat === c, px: 18 });
        cx0 += w + 8;
      })(CATS[k]);
      var list = gamesFiltered(), per = 10, pages = Math.max(1, Math.ceil(list.length / per));
      st.page = Math.min(st.page, pages - 1);
      var gw = (W - 80) / 5, gh = 196;
      for (var j = 0; j < per; j++) {
        var g = list[st.page * per + j]; if (!g) break;
        (function (g, j) {
          var X = 40 + (j % 5) * gw, Y = 176 + Math.floor(j / 5) * (gh + 10), hov = P.hover === 'g' + g.id;
          ui.card(x, X + 5, Y, gw - 10, gh, 24, hov);
          ui.drawIcon(x, gameIcon(g), X + gw / 2 - 46, Y + 16, 92);
          ui.text(x, g.name, X + gw / 2, Y + 132, 19, { align: 'center', weight: 700, maxW: gw - 20 });
          var b = R.store.get('best.' + g.id, null);
          ui.text(x, g.cat + (b !== null ? ' • 🏆 ' + b : ''), X + gw / 2, Y + 162, 15, { align: 'center', color: 'rgba(255,255,255,0.55)', maxW: gw - 20 });
          if (os.isRunning(g.id)) { x.beginPath(); x.arc(X + gw - 28, Y + 22, 8, 0, 7); x.fillStyle = '#4cd964'; x.fill(); }
          P.area('g' + g.id, X + 5, Y, gw - 10, gh, function () { os.launch(g.id); });
        })(g, j);
      }
      P.button('prev', W / 2 - 150, H - 66, 64, 48, '', function () { st.page = Math.max(0, st.page - 1); }, { lucide: 'arrow-left' });
      ui.text(x, (st.page + 1) + ' / ' + pages, W / 2, H - 42, 20, { align: 'center', color: 'rgba(255,255,255,0.7)' });
      P.button('next', W / 2 + 86, H - 66, 64, 48, '', function () { st.page = Math.min(pages - 1, st.page + 1); }, { lucide: 'arrow-right' });
      P.state.pages = pages;
    } else if (st.tab === 'hands') {
      header(x, 'Modelos de mãos', 'Como suas mãos aparecem no VR');
      var styles = [['controle', 'Controle do Go', 'gamepad-2'], ['realista', 'Mão + controle', 'hand'], ['classico', 'Luva Clássica', 'hand-metal'], ['fofinho', 'Luva Fofinha', 'sparkles']];
      styles.forEach(function (sd, i) {
        var X = 40 + i * ((W - 80) / 4), on = (R.settings.handStyle || 'realista') === sd[0];
        P.button('hs' + sd[0], X + 5, 130, (W - 80) / 4 - 10, 150, sd[1], function () { R.settings.handStyle = sd[0]; R.saveSettings(); if (R.input.applyHandStyle) R.input.applyHandStyle(); }, { active: on, lucide: sd[2], r: 24, px: 22, iconSize: 44 });
      });
      ui.text(x, 'Cor da luva', 40, 330, 22, { weight: 700 });
      ['#1d1f26', '#7a4a2a', '#8a3cf0', '#e5484d', '#ffffff', '#ffb3d9', '#30a46c', '#f2c94c'].forEach(function (c, i) {
        P.button('gc' + i, 40 + i * 74, 352, 60, 60, '', function () { R.settings.gloveColor = c; R.saveSettings(); if (R.input.applyHandStyle) R.input.applyHandStyle(); }, { fill: c, r: 30 });
        if ((R.settings.gloveColor || '#1d1f26') === c) { ui.roundRect(x, 36 + i * 74, 348, 68, 68, 34); x.lineWidth = 4; x.strokeStyle = '#fff'; x.stroke(); }
      });
      ui.text(x, 'Hand tracking (câmera do celular)', 40, 460, 22, { weight: 700 });
      var ht = R.handtrack;
      ui.wrap(x, ht && ht.supported() ? ('Status: ' + ht.status() + '. Gesto de pinça = gatilho; palma virada para você por 1 s = menu. Detalhes do motor (GPU/CPU, filtros) na tela inicial do modo VR Box e em Ajustes.')
        : 'Disponível no modo VR Box (celular com câmera traseira). No Oculus Go use o controle.', 40, 482, W - 80, 19, 28);
      if (ht && ht.supported()) P.button('htt', 40, H - 86, 300, 58, ht.running() ? 'Desligar hand tracking' : 'Ligar hand tracking', function () { if (ht.running()) ht.stop(); else ht.start(); }, { active: ht.running(), lucide: 'hand', align: 'left', px: 19 });
    } else if (st.tab === 'env') {
      header(x, 'Ambiente', 'Fotos 360° reais (Poly Haven, CC0) projetadas em volta de você');
      ENVS.forEach(function (en, i) {
        var X = 40 + (i % 4) * ((W - 80) / 4), Y = 130 + Math.floor(i / 4) * 200, on = (R.settings.homeEnv || 'apartamento') === en[0];
        P.button('env' + en[0], X + 5, Y, (W - 80) / 4 - 10, 186, en[1], function () { os.setHomeEnv(en[0]); }, { active: on, lucide: en[3], r: 24, px: 22, iconSize: 50 });
      });
    } else if (st.tab === 'video') {
      header(x, 'Vídeo', 'Cinema gigante no seu ambiente');
      P.button('tv', 40, 130, W - 80, 90, 'Abrir TV / cinema', function () { os.openApp('tv'); }, { lucide: 'tv', align: 'left', r: 22, px: 24 });
      P.button('yt', 40, 236, W - 80, 90, 'Vídeos (YouTube aberto): cinema, sala cinza e 360°', function () { os.openApp('videos'); }, { lucide: 'play', align: 'left', r: 22, px: 22 });
      P.button('br', 40, 342, W - 80, 90, 'Navegador', function () { os.openApp(R.browserNative && R.browserNative() ? 'webbrowser' : 'browser'); }, { lucide: 'globe', align: 'left', r: 22, px: 24 });
      P.button('cp', 40, 448, W - 80, 90, 'Cloud Play', function () { os.openApp('cloudplay'); }, { lucide: 'cloud', align: 'left', r: 22, px: 24 });
    } else if (st.tab === 'shots') {
      header(x, 'Capturas', R.capture.list().length + ' imagem(ns)');
      P.button('take', W - 300, 40, 260, 56, 'Tirar captura', function () { R.capture.take(); }, { lucide: 'camera', align: 'left', px: 20, fill: ui.ACCENT });
      P.button('gal', W - 300, 104, 260, 50, 'Abrir galeria', function () { os.openApp('gallery'); }, { lucide: 'image', align: 'left', px: 18 });
      var shots = R.capture.list(), tw = (W - 80) / 4, th = tw * 400 / 640;
      shots.slice(0, 8).forEach(function (sh, i) {
        var im = shotImg(sh.src), X = 40 + (i % 4) * tw, Y = 180 + Math.floor(i / 4) * (th + 14);
        if (im.complete && im.naturalWidth) { x.save(); ui.roundRect(x, X + 5, Y, tw - 10, th, 16); x.clip(); x.drawImage(im, X + 5, Y, tw - 10, th); x.restore(); }
        P.area('sh' + i, X, Y, tw, th, function () { os.openApp('gallery'); });
      });
    } else if (st.tab === 'settings') {
      var sapp = null; R.apps.forEach(function (a) { if (a.id === 'settings') sapp = a; });
      if (!P.state.sw) { P.state.sw = { st: { tab: 'perf' }, app: sapp }; }
      sapp.render(x, P, P.state.sw, H);
    } else if (st.tab === 'about') {
      if (logoImg.complete && logoImg.naturalWidth) x.drawImage(logoImg, 40, 40, 300, 300 * logoImg.naturalHeight / logoImg.naturalWidth);
      ui.text(x, 'Wpollo VR', 380, 90, 44, { weight: 800 });
      ui.text(x, 'Versão 2.0 • ' + R.gameList.length + ' jogos', 380, 136, 22, { color: 'rgba(255,255,255,0.7)' });
      ui.wrap(x, 'Feito para reviver o Oculus Go e transformar qualquer celular num headset com VR Box. Motor: three.js r128 + cannon.js. Modelos, texturas e fotos 360°: Poly Haven (CC0). Mãos: WebXR Input Profiles (MIT). Ícones: Lucide (ISC). Hand tracking: MediaPipe (Apache-2.0). Sem afiliação com Meta, Roblox ou outras marcas.', 380, 170, W - 420, 20, 30);
    }
  }
  var shotCache = {};
  function shotImg(src) { if (!shotCache[src]) { var i = new Image(); i.onload = function () { mainPanel.dirty = true; }; i.src = src; shotCache[src] = i; } return shotCache[src]; }

  var DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], MES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
  var battery = null;
  try { if (navigator.getBattery) navigator.getBattery().then(function (b) { battery = b; }); } catch (e) {}
  function renderStatus(x, P) {
    ui.glass(x, 0, 0, P.cw, P.ch, 40);
    var d = new Date();
    ui.text(x, ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2), P.cw - 34, 70, 64, { align: 'right', weight: 300 });
    ui.text(x, DIAS[d.getDay()] + ', ' + d.getDate() + ' ' + MES[d.getMonth()] + ' ' + d.getFullYear(), P.cw - 34, 124, 20, { align: 'right', color: 'rgba(255,255,255,0.75)' });
    ui.text(x, (battery ? Math.round(battery.level * 100) + '%  ' : '') + R.fps + ' fps', P.cw - 34, 156, 17, { align: 'right', color: 'rgba(255,255,255,0.55)' });
    var vb = R.vrbox && R.vrbox.active;
    var tiles = [['shot', 'camera', 'Captura', false, function () { R.capture.take(); }],
      ['rec', 'rotate-cw', 'Centralizar', false, function () { R.recenter(); }],
      ['torch', 'flashlight', 'Lanterna', vb && R.vrbox.torchOn, function () { if (vb) R.vrbox.toggleTorch(); else ui.toast('Lanterna: só no modo VR Box (celular)'); }],
      ['mr', 'scan-eye', 'Realidade mista', vb && R.vrbox.passthrough, function () { if (vb) R.vrbox.togglePassthrough(); else ui.toast('Realidade mista: só no modo VR Box'); }],
      ['ht', 'hand', 'Mãos', R.handtrack && R.handtrack.running(), function () { if (R.handtrack && R.handtrack.supported()) { if (R.handtrack.running()) R.handtrack.stop(); else R.handtrack.start(); } else ui.toast('Hand tracking: modo VR Box'); }],
      ['fps', 'circle-dot', 'FPS', !!R.settings.showFps, function () { R.settings.showFps = !R.settings.showFps; R.saveSettings(); }],
      ['full', 'monitor', 'Tela cheia', vb ? !!document.fullscreenElement : !!os.maxed, function () { if (vb) R.vrbox.toggleFullscreen(); else { var w = os.windows[os.windows.length - 1]; if (w) os.toggleMax(w); else ui.toast('Abra uma janela para maximizar'); } }],
      ['floor', 'layers', 'Altura (chão)', false, function () { R.vrbox.calibrateFloor(R.vrbox.p0 ? 'head' : 'floor'); }],
      ['wolvic', 'globe', 'Navegador', false, function () { os.openApp(R.browserNative && R.browserNative() ? 'webbrowser' : 'browser'); }]];
    var tw = (P.cw - 50) / 3;
    tiles.forEach(function (t, i) {
      P.button('t' + t[0], 18 + (i % 3) * tw, 180 + Math.floor(i / 3) * 104, tw - 8, 96, t[2], t[4], { active: t[3], lucide: t[1], r: 24, px: 16, iconSize: 28 });
    });
    os.slider(P, x, 'vol', 'Volume', 30, 500, P.cw - 60, R.settings.volume, 0, 1, function (v) { R.settings.volume = v; R.sfx.setVolume(v); }, function (v) { return Math.round(v * 100) + '%'; });
    os.slider(P, x, 'bri', 'Brilho', 30, 590, P.cw - 60, R.settings.brightness === undefined ? 1 : R.settings.brightness, 0.3, 1, function (v) { R.settings.brightness = v; os.applyBrightness(); }, function (v) { return Math.round(v * 100) + '%'; });
    P.state.min = d.getMinutes(); P.state.fps = R.fps;
  }
  // brilho: esfera escura em volta da cabeça (custo ~0)
  var dim = null;
  os.applyBrightness = function () {
    var b = R.settings.brightness === undefined ? 1 : R.settings.brightness;
    if (!dim) { dim = new THREE.Mesh(new THREE.SphereBufferGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, side: THREE.BackSide, depthTest: false, depthWrite: false })); dim.renderOrder = 999; R.camera.add(dim); }
    dim.material.opacity = 1 - b; dim.visible = b < 0.99;
  };

  // ------------------------------------------------------------ init
  os.init = function () {
    home = new THREE.Group(); home.name = 'home'; R.scene.add(home); os.home = home;
    buildHomeEnv();
    R.apps.sort(function (a, b) { var o = R.APP_ORDER || []; return (o.indexOf(a.id) + 1 || 99) - (o.indexOf(b.id) + 1 || 99); });
    for (var i = 0; i < R.apps.length; i++) { var a = R.apps[i]; a.iconObj = ui.genIcon('app' + a.id, (APPICON[a.id] || [0, '#5f6b7a'])[1], '#1a1c24', ''); }

    // menu lateral, conteúdo e central de controle, inclinados em volta do usuário
    sidePanel = new ui.Panel({ w: 0.62, h: 1.12, res: 560, render: renderSide });
    sidePanel.mesh.position.set(-1.3, 1.45, -1.62); sidePanel.mesh.rotation.y = 0.62; home.add(sidePanel.mesh);
    mainPanel = new ui.Panel({ w: 1.6, h: 1.12, res: 560, render: renderMain, onSwipe: function (d) { if (st.tab === 'library') st.page = Math.max(0, Math.min((mainPanel.state.pages || 1) - 1, st.page + d)); } });
    mainPanel.mesh.position.set(0, 1.45, -2.05); home.add(mainPanel.mesh); os.mainPanel = mainPanel;
    statusPanel = new ui.Panel({ w: 0.62, h: 1.25, res: 560, render: renderStatus, onTick: function (dt, P) { var d = new Date(); if (P.state.min !== d.getMinutes() || P.state.fps !== R.fps) P.dirty = true; } });
    statusPanel.mesh.position.set(1.3, 1.45, -1.62); statusPanel.mesh.rotation.y = -0.62; home.add(statusPanel.mesh);
    os.applyBrightness();

    fpsPanel = new ui.Panel({ w: 0.22, h: 0.07, res: 400, onTop: true, render: function (x, P) { ui.glass(x, 0, 0, P.cw, P.ch, 14); ui.text(x, R.fps + ' fps', P.cw / 2, P.ch / 2, 18, { align: 'center', weight: 700, color: R.fps >= 70 ? '#7dff9c' : R.fps >= 55 ? '#ffe27a' : '#ff7a7a' }); },
      onTick: function (dt, P) { if (P.state.f !== R.fps) { P.state.f = R.fps; P.dirty = true; } } });
    R.scene.add(fpsPanel.mesh); fpsPanel.mesh.visible = false;

    buildPause();
    R.scene.fog = null;

    R.onExitXR = function () {
      if (os.current && !pauseOpen) openPause();
      var b = document.getElementById('enter'); if (b) b.classList.add('pulse');
    };
    // abre jogo/app por hash: #game=bowling
    var m = /game=([\w-]+)/.exec(location.hash); if (m && R.gameById[m[1]]) os.launch(m[1]);
    os.notify('Bem-vindo ao Wpollo VR — ' + R.gameList.length + ' jogos prontos');
    // modelos comuns (mãos, controle, árvores, céus) em segundo plano
    var he = R.settings.homeEnv || 'apartamento';
    if (/apartamento|sala|lounge/.test(he)) R.assets.loadSky(he).then(function () { if (!os.current) buildHomeEnv(); });
    R.assets.preloadCommon().then(function () {
      R.input.upgradeHands();
      if (!os.current) buildHomeEnv();
    });
  };

  // ------------------------------------------------------------ janelas de apps
  os.openApp = function (id) {
    var app = null; for (var i = 0; i < R.apps.length; i++) if (R.apps[i].id === id) app = R.apps[i];
    if (!app) return;
    for (var j = 0; j < os.windows.length; j++) if (os.windows[j].app === app) { os.focusWindow(os.windows[j]); return; }
    if (app.launch) { app.launch(); return; }
    return os.openWindow(app);
  };
  // abre uma janela para qualquer definição de app (também usada por apps Android e janelas dinâmicas)
  os.openWindow = function (app) {
    if (os.windows.length >= (app.maxWin || 4)) os.closeWindow(os.windows[0]);
    var win = { app: app, st: {}, yaw: 0, y: 1.45 };
    var size = app.size || [1.1, 0.8];
    var bar = 70;
    win.panel = new ui.Panel({
      w: size[0], h: size[1] + bar / 560, res: 560,
      render: function (x, P) {
        var H = P.ch - bar;
        ui.glass(x, 0, 0, P.cw, H, 44);
        app.render(x, P, win, H);
        // controles da janela (visionOS: barra embaixo + fechar)
        P.button('close', P.cw / 2 - 110, H + 18, 40, 40, '✕', function () { os.closeWindow(win); }, { px: 18 });
        P.button('max', P.cw / 2 + 120, H + 18, 40, 40, '', function () { os.toggleMax(win); }, { lucide: 'monitor', iconSize: 22 });
        P.button('bar', P.cw / 2 - 60, H + 26, 170, 24, '', null, { r: 12, fill: P.hover === 'bar' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)',
          onDrag: function (px, py, p) { dragWindow(win, p); } });
      },
      onSwipe: function (d) { if (app.onSwipe) app.onSwipe(win, d); },
      onTick: function (dt, P) { if (app.tick) app.tick(win, dt, P); }
    });
    win.panel.state = win.st;
    // posiciona em leque ao lado da janela principal
    // janelas abrem na frente do Início (mais perto), em leque se houver várias
    var slots = [0, -0.42, 0.42, -0.84, 0.84], used = os.windows.map(function (w) { return w.slot; }), slot = 0;
    for (var s = 0; s < slots.length; s++) if (used.indexOf(s) < 0) { slot = s; break; }
    win.slot = slot; win.yaw = slots[slot]; win.dist = slot === 0 ? 1.55 : 1.7; win.y = 1.4;
    placeWindow(win);
    home.add(win.panel.mesh);
    os.windows.push(win);
    if (app.open && !app._reopen) app.open(win);
    mainPanel.dirty = true;
    return win;
  };
  function placeWindow(win) {
    var m = win.panel.mesh;
    m.position.set(-Math.sin(win.yaw) * win.dist, win.y, -Math.cos(win.yaw) * win.dist);
    m.rotation.set(0, win.yaw, 0);
  }
  function dragWindow(win, p) {
    // gira a janela ao redor do usuário seguindo o raio
    var d = p.dir; win.yaw = Math.atan2(-d.x, -d.z);
    var hp = R.camera.getWorldPosition(new THREE.Vector3());
    win.y = Math.max(0.6, Math.min(2.6, hp.y + d.y * win.dist - win.panel.h / 2 + 0.05));
    placeWindow(win);
  }
  // "tela cheia" dentro do VR: a janela cresce e envolve a visão (cinema pessoal)
  os.toggleMax = function (win) {
    win.max = !win.max; os.maxed = win.max;
    if (win.max) { win._s = { yaw: win.yaw, y: win.y, dist: win.dist }; win.yaw = R.headYaw(); win.dist = 1.9; win.y = R.settings.height; win.panel.mesh.scale.setScalar(2.4); }
    else { if (win._s) { win.yaw = win._s.yaw; win.y = win._s.y; win.dist = win._s.dist; } win.panel.mesh.scale.setScalar(1); }
    placeWindow(win); if (win.kb) { os.closeKeyboard(win); }
    statusPanel.dirty = true;
  };
  os.focusWindow = function (win) { R.sfx.play('pop'); win.panel.mesh.scale.setScalar(1.06); setTimeout(function () { win.panel.mesh.scale.setScalar(1); }, 150); };
  // janela redimensionável: recria o painel com o novo tamanho mantendo estado e posição
  os.resizeWindow = function (win, w, h) {
    var keep = { st: win.st, yaw: win.yaw, y: win.y, dist: win.dist, slot: win.slot };
    win.resizing = true; os.closeWindow(win);
    var app = win.app, size0 = app.size; app.size = [w, h]; app._reopen = true;
    var nw = os.openWindow(app); app.size = size0; app._reopen = false;
    nw.st = keep.st; nw.panel.state = keep.st; nw.yaw = keep.yaw; nw.y = keep.y; nw.dist = keep.dist; nw.slot = keep.slot;
    nw.panel.mesh.position.set(-Math.sin(nw.yaw) * nw.dist, nw.y, -Math.cos(nw.yaw) * nw.dist); nw.panel.mesh.rotation.set(0, nw.yaw, 0);
    if (app.resized) app.resized(nw, w, h);
    return nw;
  };
  os.closeWindow = function (win) {
    var i = os.windows.indexOf(win); if (i < 0) return;
    if (win.app.close && !win.resizing) win.app.close(win);
    if (win.kb) { win.kb.dispose(); win.kb = null; }
    win.panel.dispose(); os.windows.splice(i, 1); mainPanel.dirty = true;
  };
  os.closeAllWindows = function () { while (os.windows.length) os.closeWindow(os.windows[0]); };

  // teclado anexado a uma janela
  os.keyboardFor = function (win, onKey) {
    if (win.kb) return win.kb;
    var kb = ui.keyboard({ onKey: onKey });
    var m = kb.mesh, wm = win.panel.mesh;
    m.position.copy(wm.position); m.rotation.copy(wm.rotation);
    m.position.y = wm.position.y - win.panel.h / 2 - 0.25;
    m.position.x *= 0.82; m.position.z *= 0.82; m.rotation.x = -0.35;
    home.add(m); win.kb = kb; return kb;
  };
  os.closeKeyboard = function (win) { if (win.kb) { win.kb.dispose(); win.kb = null; } };

  // ------------------------------------------------------------ jogos / multitarefa
  os.isRunning = function (id) { for (var i = 0; i < os.running.length; i++) if (os.running[i].def.id === id) return os.running[i]; return null; };
  os.launch = function (id) {
    var def = R.gameById[id]; if (!def) return;
    var run = os.isRunning(id); if (run) return os.resume(run);
    if (os.current) os.suspend();
    if (os.running.length >= os.maxRunning) os.kill(os.running[0]);
    if (os.loading) return;
    var ctx = new R.GameCtx(def);
    var rec = R.store.get('recent', []).filter(function (x) { return x !== id; }); rec.unshift(id); R.store.set('recent', rec.slice(0, 8));
    // carrega modelos/texturas/céu do jogo antes de entrar (cache => instantâneo na 2ª vez)
    os.loading = { name: def.name, p: 0 }; showLoading();
    var spec = R.gameAssets(def);
    var go = function () {
      os.loading = null; hideLoading();
      os.running.push(ctx);
      enterGame(ctx, true);
      R.sfx.play('whoosh');
      if (def.controls) ui.toast(def.controls, 4);
      ui.toast(def.name, 2.5);
    };
    var t = setTimeout(go, 12000); // nunca trava: entra mesmo se a rede falhar
    R.assets.loadAll(spec, function (f) { if (os.loading) { os.loading.p = f; loadPanel.dirty = true; } }).then(function () { clearTimeout(t); if (os.loading) go(); });
  };
  var loadPanel = null;
  function showLoading() {
    if (!loadPanel) loadPanel = new ui.Panel({ w: 0.9, h: 0.26, res: 480, onTop: true, render: function (x, P) {
      ui.glass(x, 0, 0, P.cw, P.ch, 36); var L = os.loading || { name: '', p: 1 };
      ui.text(x, 'Abrindo ' + L.name + '…', 30, 44, 26, { weight: 700, maxW: P.cw - 60 });
      ui.roundRect(x, 30, 80, P.cw - 60, 16, 8); x.fillStyle = 'rgba(255,255,255,0.15)'; x.fill();
      ui.roundRect(x, 30, 80, Math.max(16, (P.cw - 60) * L.p), 16, 8); x.fillStyle = '#4b8ff8'; x.fill();
    } });
    R.scene.add(loadPanel.mesh); loadPanel.mesh.visible = true; loadPanel.dirty = true; ui.placeInFront(loadPanel.mesh, 1.5, 0);
  }
  function hideLoading() { if (loadPanel) { loadPanel.mesh.visible = false; if (loadPanel.mesh.parent) loadPanel.mesh.parent.remove(loadPanel.mesh); } }
  function enterGame(ctx, fresh) {
    home.visible = false; if (home.parent) R.scene.remove(home);
    os.current = ctx;
    R.scene.add(ctx.root);
    if (fresh) {
      try { ctx.start(); } catch (e) { console.error(e); ui.toast('Erro ao abrir jogo: ' + e.message, 5); }
    } else {
      R.player.x = ctx.player.x; R.player.y = ctx.player.y; R.player.z = ctx.player.z; R.player.yaw = ctx.player.yaw;
    }
    for (var i = 0; i < ctx.attached.length; i++) ctx.attached[i].visible = true;
    ctx.setHolding(true);
    R.scene.fog = ctx.root.fog || null;
    R.applyMods(ctx);
    if (ctx.envKey && R.assets.realistic()) R.assets.setEnv(ctx.envKey);
    // pré-compila shaders => sem engasgo no primeiro frame
    if (fresh) try { R.renderer.compile(R.scene, R.camera); } catch (e) {}
    mainPanel.dirty = true;
  }
  os.suspend = function () {
    var ctx = os.current; if (!ctx) return;
    ctx.player = { x: R.player.x, y: R.player.y, z: R.player.z, yaw: R.player.yaw };
    for (var i = 0; i < ctx.attached.length; i++) ctx.attached[i].visible = false;
    ctx.setHolding(false);
    R.scene.remove(ctx.root); os.current = null;
    closePause();
  };
  os.goHome = function () {
    os.suspend();
    R.resetPlayer(); R.timeScale = 1;
    R.scene.add(home); home.visible = true; R.scene.fog = null;
    R.input.setDualArm(false); R.input.giant = 1;
    mainPanel.dirty = true; statusPanel.dirty = true;
  };
  os.resume = function (ctx) {
    if (os.current === ctx) return;
    if (os.current) os.suspend();
    enterGame(ctx, false);
  };
  os.kill = function (ctx) {
    var i = os.running.indexOf(ctx); if (i >= 0) os.running.splice(i, 1);
    if (os.current === ctx) { os.current = null; }
    ctx.dispose();
  };
  os.closeGame = function () { var c = os.current; if (!c) return; closePause(); os.kill(c); os.goHome(); };
  os.restartGame = function () {
    var c = os.current; if (!c) return; var id = c.def.id;
    closePause(); os.kill(c); os.launch(id);
  };

  // ------------------------------------------------------------ menu de pausa (dentro do jogo)
  var TOGGLES = [
    ['dualArm', '🙌', 'Braço duplo'], ['slowmo', '🐢', 'Câmera lenta'], ['lowGrav', '🪐', 'Baixa gravidade'], ['giant', '✋', 'Mãos gigantes'],
    ['night', '🌙', 'Modo noite'], ['rainbow', '🌈', 'Laser arco-íris'], ['noLaser', '🚫', 'Esconder laser'], ['showFps', '📈', 'Mostrar FPS'], ['mute', '🔇', 'Mudo']
  ];
  function buildPause() {
    pausePanel = new ui.Panel({
      w: 1.7, h: 1.16, res: 520, onTop: true,
      render: function (x, P) {
        var W = P.cw, H = P.ch, ctx = os.current;
        // fundo escuro arredondado + cabeçalho com abas (estilo menu de jogos de blocos)
        ui.roundRect(x, 0, 0, W, H, 34); x.fillStyle = 'rgba(18,20,26,0.9)'; x.fill();
        x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,0.12)'; x.stroke();
        var tabs = [['main', 'Jogo'], ['mods', 'Modificadores'], ['settings', 'Ajustes'], ['help', 'Ajuda']];
        var tw = (W - 40) / tabs.length;
        for (var i = 0; i < tabs.length; i++) (function (t, i) {
          var on = st.pauseTab === t[0];
          P.button('pt' + t[0], 20 + i * tw, 16, tw - 8, 56, t[1], function () { st.pauseTab = t[0]; P.dirty = true; }, { r: 14, active: on, px: 22 });
        })(tabs[i], i);
        x.fillStyle = 'rgba(255,255,255,0.1)'; x.fillRect(20, 84, W - 40, 2);
        var y0 = 104;
        if (st.pauseTab === 'main') {
          ui.drawIcon(x, ctx ? gameIcon(ctx.def) : null, 40, y0 + 6, 110);
          ui.text(x, ctx ? ctx.def.name : '', 170, y0 + 36, 34, { weight: 800 });
          ui.text(x, ctx ? ('Pontos: ' + ctx.score + '   •   Recorde: ' + ctx.best()) : '', 170, y0 + 80, 20, { color: 'rgba(255,255,255,0.65)' });
          var bw = (W - 60) / 2, by = y0 + 140;
          P.button('resume', 20, by, bw, 74, '▶  Continuar', function () { closePause(); }, { r: 16, fill: '#ffffff', fillHover: '#e6e6e6', color: '#111' });
          P.button('restart', 40 + bw, by, bw, 74, '↻  Reiniciar', function () { os.restartGame(); }, { r: 16 });
          P.button('dual', 20, by + 90, bw, 74, (R.mods.dualArm ? '✔ ' : '') + '🙌  Braço duplo', function () { R.mods.dualArm = !R.mods.dualArm; R.applyMods(os.current); P.dirty = true; }, { r: 16, active: R.mods.dualArm });
          P.button('home', 40 + bw, by + 90, bw, 74, '⧉  Início (manter aberto)', function () { closePause(); os.goHome(); }, { r: 16, px: 24 });
          P.button('recenter', 20, by + 180, bw, 74, '◎  Recentralizar', function () { R.recenter(); closePause(); }, { r: 16 });
          P.button('shot', 40 + bw, by + 180, bw, 74, '📷  Captura de tela', function () { closePause(); setTimeout(function () { R.capture.take(); }, 120); }, { r: 16 });
          P.button('leave', 20, H - 96, W - 40, 76, '⏻  Sair do jogo', function () { os.closeGame(); }, { r: 16, fill: '#e5484d', fillHover: '#f2555a' });
        } else if (st.pauseTab === 'mods') {
          var cw = (W - 60) / 3;
          for (var k = 0; k < TOGGLES.length; k++) (function (t, k) {
            var on = !!R.mods[t[0]], cx = 20 + (k % 3) * (cw + 10), cy = y0 + Math.floor(k / 3) * 96;
            P.button('m' + t[0], cx, cy, cw, 84, t[1] + '  ' + t[2], function () { R.mods[t[0]] = !R.mods[t[0]]; R.applyMods(os.current); P.dirty = true; }, { r: 18, active: on, px: 22 });
          })(TOGGLES[k], k);
          ui.text(x, 'Modificadores valem para todos os jogos. Braço duplo espelha seu controle para o outro lado — as duas mãos interagem!', 24, H - 70, 18, { color: 'rgba(255,255,255,0.6)', maxW: W - 48 });
          P.button('reset', W - 220, H - 50, 200, 40, 'Desligar tudo', function () { for (var k2 in R.mods) R.mods[k2] = false; R.applyMods(os.current); P.dirty = true; }, { r: 12, px: 18 });
        } else if (st.pauseTab === 'settings') {
          slider(P, x, 'vol', 'Volume', 24, y0 + 10, W - 48, R.settings.volume, 0, 1, function (v) { R.settings.volume = v; R.sfx.setVolume(v); }, function (v) { return Math.round(v * 100) + '%'; });
          slider(P, x, 'h', 'Altura (m)', 24, y0 + 110, W - 48, R.settings.height, 1.0, 2.0, function (v) { R.settings.height = v; }, function (v) { return v.toFixed(2); });
          slider(P, x, 'snap', 'Giro rápido (graus)', 24, y0 + 210, W - 48, R.settings.snapAngle, 15, 90, function (v) { R.settings.snapAngle = Math.round(v / 15) * 15; }, function (v) { return Math.round(v / 15) * 15 + '°'; });
          P.button('appsettings', 24, H - 96, W - 48, 70, 'Mais ajustes (qualidade, foveation, 72Hz) no app Configurações', function () { closePause(); os.goHome(); os.openApp('settings'); }, { r: 16, px: 20 });
        } else {
          var lines = ['Gatilho: ação principal (atirar, pegar, clicar).', 'Touchpad: clique em cima/baixo para andar, bordas para girar.',
            'Segure o centro do touchpad (ou botão Voltar) para este menu.', 'Deslize no touchpad para trocar páginas.',
            'Sem óculos? Mouse: botão esquerdo = gatilho, direito arrasta para olhar;', 'WASD = touchpad, Q/E = girar, Esc = menu.'];
          for (var l = 0; l < lines.length; l++) ui.text(x, lines[l], 30, y0 + 20 + l * 50, 22, { color: 'rgba(255,255,255,0.85)', maxW: W - 60 });
          if (ctx && ctx.def.controls) ui.text(x, 'Neste jogo: ' + ctx.def.controls, 30, y0 + 330, 22, { color: '#9fd3ff', maxW: W - 60 });
        }
      }
    });
    pausePanel.mesh.visible = false;
  }
  function slider(P, x, id, label, X, Y, W, v, a, b, set, fmt) {
    ui.text(x, label, X, Y + 18, 22, { weight: 600 });
    ui.text(x, fmt(v), X + W, Y + 18, 22, { align: 'right', color: 'rgba(255,255,255,0.7)' });
    var t = (v - a) / (b - a), ty = Y + 52;
    ui.roundRect(x, X, ty, W, 14, 7); x.fillStyle = 'rgba(255,255,255,0.15)'; x.fill();
    ui.roundRect(x, X, ty, Math.max(14, W * t), 14, 7); x.fillStyle = ui.ACCENT; x.fill();
    x.beginPath(); x.arc(X + W * t, ty + 7, 16, 0, 7); x.fillStyle = '#fff'; x.fill();
    P.area(id, X - 10, ty - 22, W + 20, 58, null, function (px) {
      if (px === null) return;
      var nt = Math.max(0, Math.min(1, (px - X) / W)); set(a + nt * (b - a)); R.saveSettings(); P.dirty = true;
    });
  }
  os.slider = slider;
  function openPause() {
    if (!os.current) return;
    pauseOpen = true; st.pauseTab = 'main';
    for (var t = 0; t < ui.toasts.length; t++) ui.toasts[t].life = Math.min(ui.toasts[t].life, 0.2);
    R.scene.add(pausePanel.mesh); pausePanel.mesh.visible = true; pausePanel.dirty = true;
    ui.placeInFront(pausePanel.mesh, 1.6, -0.1);
    R.sfx.play('pop');
  }
  function closePause() { pauseOpen = false; pausePanel.mesh.visible = false; if (pausePanel.mesh.parent) pausePanel.mesh.parent.remove(pausePanel.mesh); }
  os.openPause = openPause; os.closePause = closePause;
  os.isPaused = function () { return pauseOpen; };

  // ------------------------------------------------------------ update
  os.update = function (dt, rawDt) {
    var inp = R.input;
    if (inp.menuPressed) {
      if (os.current) { if (pauseOpen) closePause(); else openPause(); }
      else if (os.windows.length) os.closeWindow(os.windows[os.windows.length - 1]);
    }
    if (inp.turn && !(os.current && os.current.def.noTurn)) R.player.yaw -= inp.turn * R.settings.snapAngle * Math.PI / 180;
    if (os.current && !pauseOpen) os.current.tick(dt);
    // FPS flutuante
    var showF = R.mods.showFps || R.settings.showFps;
    fpsPanel.mesh.visible = showF;
    if (showF) ui.placeInFront(fpsPanel.mesh, 1.5, 0.55, 0.45);
    // laser padrão quando nada é atingido
    if (!os.current) {
      // no Início, raios no chão param no chão
    }
  };
})();
