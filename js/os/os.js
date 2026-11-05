/* REgo OS — shell: Início estilo visionOS, janelas, multitarefa, menu de pausa, notificações */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, M = R.models, ui = R.ui;
  var os = R.os = { running: [], current: null, windows: [], notes: R.store.get('notes', []), maxRunning: 3 };

  var home, homeEnv, mainPanel, statusPanel, pausePanel, pauseOpen = false, fpsPanel;
  var st = { tab: 'apps', page: 0, cat: 'Todos', pauseTab: 'main' };

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
  function buildHomeEnv() {
    if (homeEnv) home.remove(homeEnv);
    homeEnv = new THREE.Group(); var e = R.settings.homeEnv;
    if (e === 'espaco') {
      M.env(homeEnv, { sky: 'space', ground: false, stars: 1500 });
      var planet = M.sphere(12, '#c77b4a', 24); planet.position.set(-30, 10, -60); homeEnv.add(planet);
      var ring = new THREE.Mesh(M.geo.torus(18, 0.6, 4, 40), R.mat.lambert('#e8c49a')); ring.rotation.x = 1.2; planet.add(ring);
      var moon = M.sphere(3, '#bfc4cc', 14); moon.position.set(25, 18, -45); homeEnv.add(moon);
    } else if (e === 'noite') {
      M.env(homeEnv, { sky: 'night', ground: '#1b2a3a', trees: 30, mountains: '#1f2c44', stars: 1200 });
      var moon2 = M.sphere(4, '#fff8dd', 16, R.mat.basic('#fff8dd')); moon2.position.set(20, 35, -70); homeEnv.add(moon2);
    } else if (e === 'praia') {
      M.env(homeEnv, { sky: 'day', ground: '#f1d9a6', clouds: 8 });
      var sea = new THREE.Mesh(M.geo.plane(300, 150), R.mat.lambert('#2a8fc4')); sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.02, -85); homeEnv.add(sea);
      for (var i = 0; i < 6; i++) { var pt = M.tree(1.5, '#2f9e5a'); pt.position.set(-12 + i * 5, 0, 6 + (i % 2) * 3); homeEnv.add(pt); }
    } else { // lago ao pôr do sol
      M.env(homeEnv, { sky: 'lago', ground: '#3d5a4a', trees: 40, mountains: '#7a6f99', clouds: 6 });
      var lake = new THREE.Mesh(new THREE.CircleBufferGeometry(40, 32), R.mat.lambert('#6f8fc9')); lake.rotation.x = -Math.PI / 2; lake.position.set(0, 0.02, -48); homeEnv.add(lake);
      var sun = M.sphere(6, '#ffd59a', 16, R.mat.basic('#ffd59a')); sun.position.set(0, 9, -120); homeEnv.add(sun);
    }
    home.fog = null;
    home.add(homeEnv);
  }
  os.setHomeEnv = function (e) { R.settings.homeEnv = e; R.saveSettings(); buildHomeEnv(); };

  // ------------------------------------------------------------ janela principal
  var CATS = ['Todos', 'Destaques', 'Ação', 'Esporte', 'Física', 'Puzzle', 'Música', 'Relax', 'Corrida'];
  function gamesFiltered() {
    if (st.cat === 'Todos') return R.gameList;
    if (st.cat === 'Destaques') return R.gameList.filter(function (g) { return g.featured; });
    return R.gameList.filter(function (g) { return g.cat === st.cat; });
  }
  function gameIcon(g) { return ui.genIcon('g:' + g.id, g.c1 || '#5b6cff', g.c2 || '#b14cff', g.glyph || '🎮'); }
  os.gameIcon = gameIcon;

  function drawTabs(x, P) {
    // barra de abas vertical (pílula de vidro à esquerda) — estilo visionOS
    var tabs = [['apps', '▦', 'Apps'], ['games', '🎮', 'Jogos'], ['running', '⧉', 'Multitarefa'], ['env', '⛰', 'Ambientes']];
    ui.glass(x, 8, P.ch / 2 - 150, 84, 300, 42);
    for (var i = 0; i < tabs.length; i++) (function (t, i) {
      P.button('tab' + t[0], 16, P.ch / 2 - 140 + i * 72, 68, 68, t[1], function () { st.tab = t[0]; st.page = 0; P.dirty = true; }, { active: st.tab === t[0], px: 30 });
    })(tabs[i], i);
  }

  function renderMain(x, P) {
    var W = P.cw, H = P.ch;
    drawTabs(x, P);
    var X0 = 110;
    if (st.tab === 'apps') {
      // ícones flutuando sem janela (como no visionOS)
      var apps = R.apps, cols = 6, s = 112, gx = (W - X0 - 30) / cols;
      for (var i = 0; i < apps.length; i++) (function (a, i) {
        var c = i % cols, r = Math.floor(i / cols), cx = X0 + c * gx + gx / 2, cy = 80 + r * 170;
        var hov = P.hover === 'app' + a.id, sz = hov ? s * 1.1 : s;
        if (hov) { x.beginPath(); x.arc(cx, cy, sz / 2 + 10, 0, 7); x.fillStyle = 'rgba(255,255,255,0.18)'; x.fill(); }
        ui.drawIcon(x, a.iconObj, cx - sz / 2, cy - sz / 2, sz);
        ui.text(x, a.name, cx, cy + s / 2 + 26, 22, { align: 'center', weight: 600, maxW: gx - 6 });
        P.area('app' + a.id, cx - gx / 2, cy - s / 2 - 6, gx, s + 50, function () { os.openApp(a.id); });
      })(apps[i], i);
    } else if (st.tab === 'games') {
      ui.glass(x, X0, 0, W - X0, H, 46);
      ui.text(x, 'Jogos', X0 + 32, 44, 34, { weight: 800 });
      ui.text(x, R.gameList.length + ' jogos • feitos para o controle do Go', X0 + 150, 46, 20, { color: 'rgba(255,255,255,0.6)' });
      var cx0 = X0 + 24;
      for (var k = 0; k < CATS.length; k++) (function (c) {
        x.font = ui.font(19, 600); var w = x.measureText(c).width + 30;
        P.button('cat' + c, cx0, 78, w, 38, c, function () { st.cat = c; st.page = 0; P.dirty = true; }, { active: st.cat === c, px: 19 });
        cx0 += w + 8;
      })(CATS[k]);
      var list = gamesFiltered(), per = 10, pages = Math.max(1, Math.ceil(list.length / per));
      st.page = Math.min(st.page, pages - 1);
      var cw = (W - X0 - 48) / 5, ch = 196;
      for (var j = 0; j < per; j++) {
        var g = list[st.page * per + j]; if (!g) break;
        (function (g, j) {
          var cxx = X0 + 24 + (j % 5) * cw, cyy = 132 + Math.floor(j / 5) * (ch + 8);
          var hov = P.hover === 'g' + g.id;
          ui.roundRect(x, cxx + 4, cyy, cw - 8, ch, 26); x.fillStyle = hov ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)'; x.fill();
          ui.drawIcon(x, gameIcon(g), cxx + cw / 2 - 48, cyy + 14, 96);
          ui.text(x, g.name, cxx + cw / 2, cyy + 132, 20, { align: 'center', weight: 700, maxW: cw - 16 });
          var b = R.store.get('best.' + g.id, null);
          ui.text(x, g.cat + (b !== null ? ' • 🏆' + b : ''), cxx + cw / 2, cyy + 162, 16, { align: 'center', color: 'rgba(255,255,255,0.55)', maxW: cw - 16 });
          if (os.isRunning(g.id)) { x.beginPath(); x.arc(cxx + cw - 26, cyy + 22, 8, 0, 7); x.fillStyle = '#4cd964'; x.fill(); }
          P.area('g' + g.id, cxx + 4, cyy, cw - 8, ch, function () { os.launch(g.id); });
        })(g, j);
      }
      P.button('prev', W / 2 + 10, H - 62, 60, 46, '‹', function () { st.page = Math.max(0, st.page - 1); P.dirty = true; }, { px: 30 });
      ui.text(x, (st.page + 1) + ' / ' + pages, W / 2 + 120, H - 38, 20, { align: 'center', color: 'rgba(255,255,255,0.7)' });
      P.button('next', W / 2 + 170, H - 62, 60, 46, '›', function () { st.page = Math.min(pages - 1, st.page + 1); P.dirty = true; }, { px: 30 });
      P.state.pages = pages;
    } else if (st.tab === 'running') {
      ui.glass(x, X0, 0, W - X0, H, 46);
      ui.text(x, 'Multitarefa', X0 + 32, 44, 34, { weight: 800 });
      ui.text(x, 'Jogos ficam pausados na memória (máx. ' + os.maxRunning + '). Janelas de apps abertas: ' + os.windows.length, X0 + 32, 84, 19, { color: 'rgba(255,255,255,0.6)' });
      if (!os.running.length) ui.text(x, 'Nenhum jogo em execução. Abra um em "Jogos"!', X0 + 32, 160, 24, { color: 'rgba(255,255,255,0.8)' });
      for (var r = 0; r < os.running.length; r++) (function (ctx, r) {
        var yy = 120 + r * 120, ww = W - X0 - 64;
        ui.roundRect(x, X0 + 32, yy, ww, 104, 28); x.fillStyle = 'rgba(255,255,255,0.08)'; x.fill();
        ui.drawIcon(x, gameIcon(ctx.def), X0 + 46, yy + 12, 80);
        ui.text(x, ctx.def.name, X0 + 146, yy + 36, 26, { weight: 700 });
        ui.text(x, 'Pontos: ' + ctx.score, X0 + 146, yy + 72, 19, { color: 'rgba(255,255,255,0.6)' });
        P.button('res' + r, X0 + ww - 260, yy + 26, 150, 54, '▶ Retomar', function () { os.resume(ctx); }, { fill: '#2f7bf6', fillHover: '#4b8ff8', px: 21 });
        P.button('kill' + r, X0 + ww - 96, yy + 26, 110, 54, '✕', function () { os.kill(ctx); P.dirty = true; }, { px: 24 });
      })(os.running[r], r);
      var wy = 120 + Math.max(1, os.running.length) * 120 + 10;
      if (os.windows.length) P.button('closeall', X0 + 32, Math.min(H - 80, wy), 300, 54, 'Fechar todas as janelas', function () { os.closeAllWindows(); P.dirty = true; }, { px: 20 });
    } else if (st.tab === 'env') {
      ui.glass(x, X0, 0, W - X0, H, 46);
      ui.text(x, 'Ambientes', X0 + 32, 44, 34, { weight: 800 });
      var envs = [['lago', 'Lago ao pôr do sol', '#f2a7a0', '#4a6fb5', '🌅'], ['noite', 'Floresta à noite', '#1d2a5c', '#02030b', '🌙'], ['espaco', 'Espaço', '#05061a', '#3a2a6b', '🪐'], ['praia', 'Praia', '#9be3ff', '#f1d9a6', '🏖']];
      for (var e = 0; e < envs.length; e++) (function (en, e) {
        var ex = X0 + 32 + (e % 2) * 420, ey = 90 + Math.floor(e / 2) * 210;
        P.button('env' + en[0], ex, ey, 400, 190, '', function () { os.setHomeEnv(en[0]); P.dirty = true; }, { r: 30, active: R.settings.homeEnv === en[0] });
        ui.drawIcon(x, ui.genIcon('env' + en[0], en[2], en[3], en[4]), ex + 20, ey + 35, 120);
        ui.text(x, en[1], ex + 160, ey + 95, 26, { weight: 700, color: R.settings.homeEnv === en[0] ? '#111' : '#fff' });
      })(envs[e], e);
    }
  }

  function renderStatus(x, P) {
    ui.glass(x, 0, 0, P.cw, P.ch, P.ch / 2);
    var d = new Date(), hh = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    ui.text(x, hh, 30, P.ch / 2, 28, { weight: 700 });
    ui.text(x, 'REgo OS', 120, P.ch / 2, 22, { color: 'rgba(255,255,255,0.75)' });
    ui.text(x, (R.isXR ? '🥽 VR' : '🖥 2D') + '  •  ' + R.fps + ' fps  •  ⧉ ' + os.running.length, P.cw - 30, P.ch / 2, 22, { align: 'right', color: 'rgba(255,255,255,0.75)' });
    P.state.min = d.getMinutes(); P.state.fps = R.fps;
  }

  // ------------------------------------------------------------ init
  os.init = function () {
    home = new THREE.Group(); home.name = 'home'; R.scene.add(home); os.home = home;
    buildHomeEnv();
    for (var i = 0; i < R.apps.length; i++) { var a = R.apps[i]; a.iconObj = a.icon ? ui.loadIcon(a.icon) : ui.genIcon('app' + a.id, a.c1, a.c2, a.glyph); }

    mainPanel = new ui.Panel({ w: 1.9, h: 1.05, res: 560, render: renderMain, onSwipe: function (d) { if (st.tab === 'games') st.page = Math.max(0, Math.min((mainPanel.state.pages || 1) - 1, st.page + d)); } });
    mainPanel.mesh.position.set(0, 1.45, -2.3);
    home.add(mainPanel.mesh); os.mainPanel = mainPanel;

    statusPanel = new ui.Panel({ w: 0.95, h: 0.11, res: 560, render: renderStatus, onTick: function (dt, P) { var d = new Date(); if (P.state.min !== d.getMinutes() || P.state.fps !== R.fps) P.dirty = true; } });
    statusPanel.mesh.position.set(0, 2.1, -2.3);
    home.add(statusPanel.mesh);

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
    os.notify('Bem-vindo ao REgo OS — ' + R.gameList.length + ' jogos prontos');
  };

  // ------------------------------------------------------------ janelas de apps
  os.openApp = function (id) {
    var app = null; for (var i = 0; i < R.apps.length; i++) if (R.apps[i].id === id) app = R.apps[i];
    if (!app) return;
    for (var j = 0; j < os.windows.length; j++) if (os.windows[j].app === app) { os.focusWindow(os.windows[j]); return; }
    if (app.launch) { app.launch(); return; }
    if (os.windows.length >= 3) os.closeWindow(os.windows[0]);
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
        P.button('bar', P.cw / 2 - 60, H + 26, 170, 24, '', null, { r: 12, fill: P.hover === 'bar' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)',
          onDrag: function (px, py, p) { dragWindow(win, p); } });
      },
      onSwipe: function (d) { if (app.onSwipe) app.onSwipe(win, d); },
      onTick: function (dt, P) { if (app.tick) app.tick(win, dt, P); }
    });
    win.panel.state = win.st;
    // posiciona em leque ao lado da janela principal
    var slots = [-0.95, 0.95, 0], used = os.windows.map(function (w) { return w.slot; }), slot = 0;
    for (var s = 0; s < slots.length; s++) if (used.indexOf(s) < 0) { slot = s; break; }
    win.slot = slot; win.yaw = slots[slot]; win.dist = slot === 2 ? 1.7 : 2.1; win.y = slot === 2 ? 1.25 : 1.45;
    placeWindow(win);
    home.add(win.panel.mesh);
    os.windows.push(win);
    if (app.open) app.open(win);
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
  os.focusWindow = function (win) { R.sfx.play('pop'); win.panel.mesh.scale.setScalar(1.06); setTimeout(function () { win.panel.mesh.scale.setScalar(1); }, 150); };
  os.closeWindow = function (win) {
    var i = os.windows.indexOf(win); if (i < 0) return;
    if (win.app.close) win.app.close(win);
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
    var ctx = new R.GameCtx(def);
    os.running.push(ctx);
    enterGame(ctx, true);
    R.sfx.play('whoosh');
    if (def.controls) ui.toast(def.controls, 4);
    ui.toast(def.name, 2.5);
  };
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
    R.scene.fog = ctx.root.fog || null;
    R.applyMods(ctx);
    mainPanel.dirty = true;
  }
  os.suspend = function () {
    var ctx = os.current; if (!ctx) return;
    ctx.player = { x: R.player.x, y: R.player.y, z: R.player.z, yaw: R.player.yaw };
    for (var i = 0; i < ctx.attached.length; i++) ctx.attached[i].visible = false;
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
    ui.roundRect(x, X, ty, Math.max(14, W * t), 14, 7); x.fillStyle = '#4b8ff8'; x.fill();
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
