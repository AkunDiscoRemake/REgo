/* Wpollo VR — apps do sistema */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, ui = R.ui;

  function openExternal(url) {
    ui.toast('Abrindo ' + url.replace(/^https?:\/\//, '').slice(0, 40) + '…', 3);
    R.store.set('lastExternal', url);
    var go = function () { window.location.href = url; };
    if (R.isXR && R.xrSession) { R.xrSession.end().then(go, go); } else setTimeout(go, 300);
  }
  R.openExternal = openExternal;

  function header(x, P, title, sub) {
    ui.text(x, title, 36, 50, 34, { weight: 800 });
    if (sub) ui.text(x, sub, 36, 88, 19, { color: 'rgba(255,255,255,0.6)', maxW: P.cw - 72 });
  }
  function textField(P, x, id, X, Y, W, H, val, placeholder, onFocus, focused) {
    ui.roundRect(x, X, Y, W, H, H / 2);
    x.fillStyle = focused ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.25)'; x.fill();
    if (focused) { x.lineWidth = 3; x.strokeStyle = '#4b8ff8'; x.stroke(); }
    ui.text(x, val || placeholder, X + 22, Y + H / 2, 22, { color: val ? '#fff' : 'rgba(255,255,255,0.45)', maxW: W - 40 });
    P.area(id, X, Y, W, H, onFocus);
  }
  function typeInto(obj, key, k, maxLen) {
    var v = obj[key] || '';
    if (k === '\b') v = v.slice(0, -1); else if (k !== '\n') v = (v + k).slice(0, maxLen || 200);
    obj[key] = v;
  }

  var apps = R.apps = [];
  function app(def) { apps.push(def); }

  // ---------------------------------------------------------------- Navegador WebXR
  var XR_SITES = [
    ['Montanha-russa (three.js)', 'https://threejs.org/examples/webxr_vr_rollercoaster.html', '🎢'],
    ['Panorama 360° (three.js)', 'https://threejs.org/examples/webxr_vr_panorama.html', '🌄'],
    ['Vídeo 360° (three.js)', 'https://threejs.org/examples/webxr_vr_video.html', '🎬'],
    ['Exemplos WebXR (W3C)', 'https://immersive-web.github.io/webxr-samples/', '🧪'],
    ['A-Frame — exemplos', 'https://aframe.io/examples/', '🅰'],
    ['Moon Rider', 'https://moonrider.xyz', '🌙'],
    ['Exemplos three.js (VR)', 'https://threejs.org/examples/?q=webxr', '📦']
  ];
  app({
    id: 'browser', name: 'Navegador', icon: 'browser', size: [1.25, 0.95],
    open: function (w) { w.st.url = ''; w.st.bm = R.store.get('bookmarks', []); },
    render: function (x, P, w, H) {
      header(x, P, 'Navegador WebXR', 'Sites WebXR abrem em tela cheia. Para voltar ao Wpollo VR, use o botão Voltar do navegador.');
      textField(P, x, 'url', 36, 116, P.cw - 230, 56, w.st.url, 'Digite um endereço…', function () {
        w.st.focus = true; R.os.keyboardFor(w, function (k) {
          if (k === '\n') { go(w); return; } typeInto(w.st, 'url', k); P.dirty = true;
        });
      }, w.st.focus);
      P.button('go', P.cw - 180, 116, 144, 56, 'Ir ➜', function () { go(w); }, { fill: '#2f7bf6', fillHover: '#4b8ff8' });
      var list = XR_SITES.concat(w.st.bm.map(function (u) { return [u.replace(/^https?:\/\//, ''), u, '⭐']; }));
      for (var i = 0; i < Math.min(list.length, 10); i++) (function (s, i) {
        var cx = 36 + (i % 2) * ((P.cw - 72) / 2 + 8), cy = 196 + Math.floor(i / 2) * 64;
        P.button('s' + i, cx, cy, (P.cw - 72) / 2 - 8, 56, s[2] + '  ' + s[0], function () { openExternal(s[1]); }, { align: 'left', r: 18, px: 20 });
      })(list[i], i);
      P.button('bm', 36, H - 66, 260, 46, '⭐ Favoritar endereço', function () {
        if (!w.st.url) return; w.st.bm.unshift(normalize(w.st.url)); w.st.bm = w.st.bm.slice(0, 4); R.store.set('bookmarks', w.st.bm); P.dirty = true;
      }, { px: 18 });
    }
  });
  function normalize(u) { u = u.trim(); if (!/^https?:\/\//.test(u)) u = (u.indexOf('.') > 0 ? 'https://' + u : 'https://duckduckgo.com/?q=' + encodeURIComponent(u)); return u; }
  function go(w) { if (!w.st.url) return; R.os.closeKeyboard(w); openExternal(normalize(w.st.url)); }

  // ---------------------------------------------------------------- Calculadora
  app({
    id: 'calculator', name: 'Calculadora', icon: 'calculator', size: [0.62, 0.95],
    open: function (w) { w.st.d = '0'; w.st.acc = null; w.st.op = null; w.st.fresh = true; },
    render: function (x, P, w, H) {
      ui.text(x, w.st.d, P.cw - 36, 80, w.st.d.length > 10 ? 40 : 64, { align: 'right', weight: 300, maxW: P.cw - 60 });
      var keys = [['C', '±', '%', '÷'], ['7', '8', '9', '×'], ['4', '5', '6', '−'], ['1', '2', '3', '+'], ['0', '.', '⌫', '=']];
      var kw = (P.cw - 60) / 4, kh = (H - 170) / 5;
      for (var r = 0; r < 5; r++) for (var c = 0; c < 4; c++) (function (k, X, Y) {
        var op = '÷×−+='.indexOf(k) >= 0, fn = 'C±%⌫'.indexOf(k) >= 0;
        P.button('k' + k, X, Y, kw - 10, kh - 10, k, function () { calc(w.st, k); P.dirty = true; },
          { fill: op ? '#ff9f0a' : fn ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.12)', fillHover: op ? '#ffb340' : 'rgba(255,255,255,0.4)', px: 34 });
      })(keys[r][c], 30 + c * kw, 150 + r * kh);
    }
  });
  function calc(s, k) {
    var cur = parseFloat(s.d);
    function apply() {
      if (s.op === null || s.acc === null) return cur;
      switch (s.op) { case '+': return s.acc + cur; case '−': return s.acc - cur; case '×': return s.acc * cur; case '÷': return cur === 0 ? NaN : s.acc / cur; }
      return cur;
    }
    if (/[0-9]/.test(k)) { s.d = s.fresh || s.d === '0' ? k : (s.d + k).slice(0, 14); s.fresh = false; }
    else if (k === '.') { if (s.fresh) { s.d = '0.'; s.fresh = false; } else if (s.d.indexOf('.') < 0) s.d += '.'; }
    else if (k === 'C') { s.d = '0'; s.acc = null; s.op = null; s.fresh = true; }
    else if (k === '±') s.d = String(-cur);
    else if (k === '%') s.d = String(cur / 100);
    else if (k === '⌫') { s.d = s.d.length > 1 ? s.d.slice(0, -1) : '0'; }
    else { var v = apply(); s.acc = k === '=' ? null : v; s.op = k === '=' ? null : k; s.d = isNaN(v) ? 'Erro' : String(+v.toPrecision(12)); s.fresh = true; }
  }

  // ---------------------------------------------------------------- Calendário
  var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  app({
    id: 'calendar', name: 'Calendário', icon: 'calendar', size: [1.0, 0.85],
    open: function (w) { var d = new Date(); w.st.m = d.getMonth(); w.st.y = d.getFullYear(); },
    onSwipe: function (w, d) { w.st.m += d; if (w.st.m < 0) { w.st.m = 11; w.st.y--; } if (w.st.m > 11) { w.st.m = 0; w.st.y++; } },
    render: function (x, P, w, H) {
      var app0 = this;
      header(x, P, MESES[w.st.m] + ' ' + w.st.y);
      P.button('p', P.cw - 170, 24, 60, 50, '‹', function () { app0.onSwipe(w, -1); }, { px: 30 });
      P.button('n', P.cw - 100, 24, 60, 50, '›', function () { app0.onSwipe(w, 1); }, { px: 30 });
      var dn = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'], cw = (P.cw - 72) / 7, top = 110;
      for (var i = 0; i < 7; i++) ui.text(x, dn[i], 36 + cw * i + cw / 2, top, 20, { align: 'center', color: 'rgba(255,255,255,0.55)' });
      var first = new Date(w.st.y, w.st.m, 1).getDay(), days = new Date(w.st.y, w.st.m + 1, 0).getDate(), today = new Date();
      var ch = (H - top - 40) / 6;
      for (var d = 1; d <= days; d++) {
        var idx = first + d - 1, cx = 36 + (idx % 7) * cw + cw / 2, cy = top + 40 + Math.floor(idx / 7) * ch + ch / 2;
        var isT = d === today.getDate() && w.st.m === today.getMonth() && w.st.y === today.getFullYear();
        if (isT) { x.beginPath(); x.arc(cx, cy, Math.min(cw, ch) * 0.4, 0, 7); x.fillStyle = '#ff453a'; x.fill(); }
        ui.text(x, d, cx, cy, 24, { align: 'center', weight: isT ? 800 : 500 });
      }
    }
  });

  // ---------------------------------------------------------------- Captura (camera-share)
  app({
    id: 'camera', name: 'Captura', icon: 'camera-share', size: [0.9, 0.6],
    tick: function (w, dt, P) { if (w.st.cd > 0) { var o = Math.ceil(w.st.cd); w.st.cd -= dt; if (Math.ceil(w.st.cd) !== o) { P.dirty = true; R.sfx.play('tick'); } if (w.st.cd <= 0) { R.capture.take(); P.dirty = true; } } },
    render: function (x, P, w, H) {
      header(x, P, 'Captura', 'Salva o que você vê na Galeria (sem o laser).');
      P.button('now', 36, 130, P.cw - 72, 76, '📷  Tirar foto agora', function () { R.capture.take(); }, { fill: '#2f7bf6', fillHover: '#4b8ff8' });
      P.button('t3', 36, 220, P.cw - 72, 76, w.st.cd > 0 ? 'Foto em ' + Math.ceil(w.st.cd) + '…' : '⏲  Temporizador 3s (feche e pose!)', function () { w.st.cd = 3; });
      P.button('gal', 36, H - 80, P.cw - 72, 56, 'Abrir Galeria', function () { R.os.openApp('gallery'); }, { px: 20 });
    }
  });

  // ---------------------------------------------------------------- Relógio
  app({
    id: 'clock', name: 'Relógio', icon: 'clock', size: [0.9, 0.85],
    open: function (w) { w.st.tab = 'clock'; w.st.sw = 0; w.st.run = false; w.st.tm = 60; w.st.tmRun = false; },
    tick: function (w, dt, P) {
      if (w.st.run) { w.st.sw += R.rawDt; P.dirty = true; }
      if (w.st.tmRun) { w.st.tm -= R.rawDt; P.dirty = true; if (w.st.tm <= 0) { w.st.tm = 0; w.st.tmRun = false; R.sfx.play('win'); R.os.notify('⏰ Timer finalizado!'); } }
      var s = new Date().getSeconds(); if (w.st.lastS !== s) { w.st.lastS = s; P.dirty = true; }
    },
    render: function (x, P, w, H) {
      var tabs = [['clock', 'Relógio'], ['sw', 'Cronômetro'], ['tm', 'Timer']];
      for (var i = 0; i < 3; i++) (function (t, i) { P.button('t' + t[0], 30 + i * ((P.cw - 60) / 3), 22, (P.cw - 60) / 3 - 8, 50, t[1], function () { w.st.tab = t[0]; }, { active: w.st.tab === t[0], px: 20 }); })(tabs[i], i);
      var cx = P.cw / 2, cy = 110 + (H - 110) / 2 - 10;
      if (w.st.tab === 'clock') {
        var d = new Date(), r = Math.min(P.cw, H - 120) * 0.38;
        x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fillStyle = 'rgba(255,255,255,0.92)'; x.fill();
        for (var k = 0; k < 12; k++) { var a = k / 12 * Math.PI * 2; x.fillStyle = '#222'; x.fillRect(cx + Math.sin(a) * r * 0.82 - 3, cy - Math.cos(a) * r * 0.82 - 3, 6, 6); }
        hand(x, cx, cy, (d.getHours() % 12 + d.getMinutes() / 60) / 12, r * 0.5, 10, '#111');
        hand(x, cx, cy, (d.getMinutes() + d.getSeconds() / 60) / 60, r * 0.75, 6, '#111');
        hand(x, cx, cy, d.getSeconds() / 60, r * 0.85, 2, '#ff9f0a');
        ui.text(x, d.toLocaleDateString('pt-BR'), cx, H - 26, 20, { align: 'center', color: 'rgba(255,255,255,0.7)' });
      } else if (w.st.tab === 'sw') {
        var t = w.st.sw, mm = Math.floor(t / 60), ss = (t % 60).toFixed(2);
        ui.text(x, ('0' + mm).slice(-2) + ':' + (ss.length < 5 ? '0' + ss : ss), cx, cy - 40, 80, { align: 'center', weight: 300 });
        P.button('go', cx - 210, cy + 50, 200, 70, w.st.run ? 'Parar' : 'Iniciar', function () { w.st.run = !w.st.run; }, { fill: w.st.run ? '#e5484d' : '#30a46c' });
        P.button('rs', cx + 10, cy + 50, 200, 70, 'Zerar', function () { w.st.sw = 0; w.st.run = false; });
      } else {
        var tt = Math.ceil(w.st.tm);
        ui.text(x, Math.floor(tt / 60) + ':' + ('0' + tt % 60).slice(-2), cx, cy - 60, 80, { align: 'center', weight: 300 });
        [-60, -10, 10, 60].forEach(function (dv, i) { P.button('d' + i, 40 + i * ((P.cw - 80) / 4), cy + 10, (P.cw - 80) / 4 - 10, 54, (dv > 0 ? '+' : '') + dv + 's', function () { w.st.tm = Math.max(0, w.st.tm + dv); }, { px: 20 }); });
        P.button('go', cx - 150, cy + 80, 300, 64, w.st.tmRun ? 'Pausar' : 'Iniciar', function () { w.st.tmRun = !w.st.tmRun && w.st.tm > 0; }, { fill: w.st.tmRun ? '#e5484d' : '#30a46c' });
      }
    }
  });
  function hand(x, cx, cy, f, len, wd, c) { var a = f * Math.PI * 2; x.strokeStyle = c; x.lineWidth = wd; x.lineCap = 'round'; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len); x.stroke(); }

  // ---------------------------------------------------------------- atalhos web (ícones refeitos, sem afiliação)
  function webApp(id, name, icon, url) {
    app({
      id: id, name: name, icon: icon, size: [0.85, 0.55],
      render: function (x, P, w, H) {
        R.os.appTile(x, this, 36, 36, 110, false);
        ui.text(x, name, 170, 70, 36, { weight: 800 });
        ui.text(x, 'Atalho web (não afiliado)', 170, 112, 19, { color: 'rgba(255,255,255,0.6)' });
        P.button('open', 36, H - 110, P.cw - 72, 76, 'Abrir ' + url.replace('https://', ''), function () { openExternal(url); }, { fill: '#2f7bf6', fillHover: '#4b8ff8', px: 24 });
      }
    });
  }

  // ---------------------------------------------------------------- Arquivos
  app({
    id: 'files', name: 'Arquivos', icon: 'files', size: [1.0, 0.8],
    render: function (x, P, w, H) {
      header(x, P, 'Arquivos', 'Tudo fica salvo localmente neste navegador.');
      var used = 0; try { for (var k in localStorage) if (localStorage.hasOwnProperty(k) && k.indexOf('rego.') === 0) used += localStorage[k].length * 2; } catch (e) {}
      var shots = R.capture.list().length, recs = 0, saves = R.store.get('sandbox.saves', []).length;
      R.gameList.forEach(function (g) { if (R.store.get('best.' + g.id, null) !== null) recs++; });
      var rows = [['🖼', 'Capturas de tela', shots + ' arquivo(s)', function () { R.os.openApp('gallery'); }],
        ['🏆', 'Recordes', recs + ' jogo(s)', null], ['🧱', 'Criações do Sandbox', saves + ' salva(s)', null],
        ['🔔', 'Notificações', R.os.notes.length + ' item(ns)', function () { R.os.openApp('messenger'); }],
        ['💾', 'Armazenamento usado', (used / 1024).toFixed(0) + ' KB', null]];
      for (var i = 0; i < rows.length; i++) (function (r, i) {
        var y = 120 + i * 70;
        P.button('r' + i, 36, y, P.cw - 72, 60, '', r[3], { r: 16, style: r[3] ? undefined : 'none' });
        if (!r[3]) { ui.roundRect(x, 36, y, P.cw - 72, 60, 16); x.fillStyle = 'rgba(255,255,255,0.06)'; x.fill(); }
        ui.text(x, r[0] + '  ' + r[1], 60, y + 31, 22, { weight: 600 });
        ui.text(x, r[2], P.cw - 60, y + 31, 20, { align: 'right', color: 'rgba(255,255,255,0.65)' });
      })(rows[i], i);
      P.button('clr', 36, H - 70, 300, 50, 'Apagar recordes', function () { if (w.st.confirm) { R.gameList.forEach(function (g) { try { localStorage.removeItem('rego.best.' + g.id); } catch (e) {} }); w.st.confirm = false; R.os.notify('Recordes apagados'); } else w.st.confirm = true; }, { px: 18, fill: w.st.confirm ? '#e5484d' : undefined });
      if (w.st.confirm) ui.text(x, 'Clique de novo para confirmar', 350, H - 45, 18, { color: '#ff9b9b' });
    }
  });

  // ---------------------------------------------------------------- Galeria
  var imgCache = {};
  function img(src) { if (!imgCache[src]) { var i = new Image(); i.onload = function () { ui.markAllDirty(); }; i.src = src; imgCache[src] = i; } return imgCache[src]; }
  app({
    id: 'gallery', name: 'Galeria', icon: 'gallery', size: [1.3, 0.9],
    render: function (x, P, w, H) {
      var list = R.capture.list();
      if (w.st.view !== undefined && list[w.st.view]) {
        var s = list[w.st.view], im = img(s.src);
        if (im.complete && im.naturalWidth) x.drawImage(im, 30, 30, P.cw - 60, (P.cw - 60) * 400 / 640 > H - 110 ? H - 110 : (P.cw - 60) * 400 / 640);
        ui.text(x, s.from + ' • ' + new Date(s.t).toLocaleString('pt-BR'), 36, H - 45, 20, { color: 'rgba(255,255,255,0.7)' });
        P.button('back', P.cw - 380, H - 70, 160, 50, '‹ Voltar', function () { w.st.view = undefined; }, { px: 20 });
        P.button('del', P.cw - 200, H - 70, 170, 50, '🗑 Apagar', function () { R.capture.remove(w.st.view); w.st.view = undefined; }, { px: 20, fill: '#e5484d' });
        return;
      }
      header(x, P, 'Galeria', list.length ? list.length + ' captura(s)' : 'Sem capturas ainda — use o app Captura ou o menu do jogo.');
      var tw = (P.cw - 72) / 4, th = tw * 400 / 640;
      for (var i = 0; i < Math.min(8, list.length); i++) (function (s, i) {
        var X = 36 + (i % 4) * tw, Y = 116 + Math.floor(i / 4) * (th + 14), im = img(s.src);
        if (im.complete && im.naturalWidth) { x.save(); ui.roundRect(x, X + 4, Y, tw - 8, th, 14); x.clip(); x.drawImage(im, X + 4, Y, tw - 8, th); x.restore(); }
        P.area('i' + i, X, Y, tw, th, function () { w.st.view = i; });
        if (P.hover === 'i' + i) { ui.roundRect(x, X + 4, Y, tw - 8, th, 14); x.lineWidth = 4; x.strokeStyle = '#fff'; x.stroke(); }
      })(list[i], i);
    }
  });

  // ---------------------------------------------------------------- Central de ajuda
  var HELP = [
    ['Controle do Oculus Go', 'Gatilho = ação/clicar. Touchpad: clique em cima para andar, embaixo para ré, nas bordas para girar. Deslize para trocar páginas. Segure o centro do touchpad para abrir o menu do jogo.'],
    ['Botão Voltar', 'No Go o botão Voltar sai do modo imersivo: o Wpollo VR pausa o jogo e mostra o menu. Toque em "Entrar no VR" para continuar de onde parou.'],
    ['Multitarefa', 'Use "Início (manter aberto)" no menu do jogo: o jogo fica pausado na memória. Retome pela aba ⧉ Multitarefa. Até 3 janelas de apps ficam abertas ao seu redor; arraste a barrinha embaixo da janela para movê-la.'],
    ['Braço duplo', 'No menu do jogo, ative Braço duplo: seu controle é espelhado para o outro lado, criando uma segunda mão que também atira, pega e bate.'],
    ['Desempenho', 'Configurações > Qualidade ajusta a resolução. Foveation 2–3 e 72 Hz são o melhor equilíbrio no Go. Tudo é gerado por código: nada de downloads pesados.'],
    ['Sem óculos', 'Funciona no PC/celular: mouse esquerdo = gatilho, direito arrasta para olhar, WASD = touchpad, Q/E = girar, Esc = menu.']
  ];
  app({
    id: 'help', name: 'Ajuda', icon: 'help-center', size: [1.1, 0.85],
    open: function (w) { w.st.i = 0; },
    onSwipe: function (w, d) { w.st.i = (w.st.i + d + HELP.length) % HELP.length; },
    render: function (x, P, w, H) {
      header(x, P, 'Central de Ajuda');
      for (var i = 0; i < HELP.length; i++) (function (i) { P.button('h' + i, 36, 100 + i * 62, 300, 54, HELP[i][0], function () { w.st.i = i; }, { active: w.st.i === i, align: 'left', r: 14, px: 19 }); })(i);
      ui.roundRect(x, 356, 100, P.cw - 392, H - 130, 24); x.fillStyle = 'rgba(0,0,0,0.2)'; x.fill();
      ui.text(x, HELP[w.st.i][0], 380, 134, 26, { weight: 800 });
      ui.wrap(x, HELP[w.st.i][1], 380, 170, P.cw - 440, 22, 34);
    }
  });

  // ---------------------------------------------------------------- Área remota
  app({
    id: 'remote', name: 'Área Remota', icon: 'remote-desktop', size: [0.95, 0.7],
    render: function (x, P, w, H) {
      header(x, P, 'Área de Trabalho Remota', 'Acesse seu PC por um cliente web (abre fora do VR).');
      var opts = [['Chrome Remote Desktop', 'https://remotedesktop.google.com/access'], ['Parsec (web)', 'https://web.parsec.app'], ['Guacamole/noVNC próprio…', '']];
      for (var i = 0; i < opts.length; i++) (function (o, i) {
        P.button('o' + i, 36, 130 + i * 80, P.cw - 72, 68, o[0], function () {
          if (o[1]) openExternal(o[1]);
          else { R.os.openApp('browser'); }
        }, { align: 'left', r: 18, px: 22 });
      })(opts[i], i);
    }
  });

  // ---------------------------------------------------------------- Configurações
  app({
    id: 'settings', name: 'Configurações', icon: 'settings', size: [1.2, 1.0],
    open: function (w) { w.st.tab = 'perf'; },
    render: function (x, P, w, H) {
      var tabs = [['perf', 'Desempenho'], ['comfort', 'Conforto'], ['look', 'Visual'], ['data', 'Dados']];
      for (var i = 0; i < tabs.length; i++) (function (t, i) { P.button('t' + t[0], 30 + i * ((P.cw - 60) / 4), 22, (P.cw - 60) / 4 - 8, 52, t[1], function () { w.st.tab = t[0]; }, { active: w.st.tab === t[0], px: 20 }); })(tabs[i], i);
      var s = R.settings, X = 40, Wd = P.cw - 80;
      if (w.st.tab === 'perf') {
        R.os.slider(P, x, 'scale', 'Resolução (framebuffer scale)', X, 100, Wd, s.scale, 0.6, 1.3, function (v) { s.scale = Math.round(v * 20) / 20; R.renderer.xr.setFramebufferScaleFactor(s.scale); }, function (v) { return (Math.round(v * 20) / 20).toFixed(2) + 'x' + (R.isXR ? ' (próxima sessão)' : ''); });
        R.os.slider(P, x, 'fov', 'Foveated rendering (bordas em menor resolução)', X, 200, Wd, s.foveation, 0, 3, function (v) { s.foveation = Math.round(v); R.applyXRPerf(); }, function (v) { return ['Desligado', 'Baixo', 'Médio', 'Alto'][Math.round(v)]; });
        ui.text(x, 'Taxa de atualização', X, 320, 22, { weight: 600 });
        [60, 72].forEach(function (f, i) { P.button('f' + f, X + 260 + i * 130, 296, 120, 50, f + ' Hz', function () { s.fps = f; R.saveSettings(); R.applyXRPerf(); }, { active: s.fps === f, px: 20 }); });
        ui.text(x, 'Antialiasing (MSAA)', X, 390, 22, { weight: 600 });
        P.button('msaa', X + 260, 366, 250, 50, s.msaa ? 'Ligado (recarregar)' : 'Desligado (recarregar)', function () { s.msaa = !s.msaa; R.saveSettings(); setTimeout(function () { location.reload(); }, 300); }, { active: s.msaa, px: 18 });
        ui.text(x, 'Medidor de FPS', X, 460, 22, { weight: 600 });
        P.button('sfps', X + 260, 436, 250, 50, s.showFps ? 'Visível' : 'Oculto', function () { s.showFps = !s.showFps; R.saveSettings(); }, { active: s.showFps, px: 18 });
        ui.text(x, 'Agora: ' + R.fps + ' fps', X, H - 30, 20, { color: 'rgba(255,255,255,0.6)' });
      } else if (w.st.tab === 'comfort') {
        R.os.slider(P, x, 'h', 'Altura dos olhos (m)', X, 100, Wd, s.height, 1.0, 2.0, function (v) { s.height = Math.round(v * 100) / 100; }, function (v) { return v.toFixed(2) + ' m'; });
        R.os.slider(P, x, 'snap', 'Ângulo do giro rápido', X, 200, Wd, s.snapAngle, 15, 90, function (v) { s.snapAngle = Math.round(v / 15) * 15; }, function (v) { return Math.round(v / 15) * 15 + '°'; });
        R.os.slider(P, x, 'vol', 'Volume', X, 300, Wd, s.volume, 0, 1, function (v) { s.volume = v; R.sfx.setVolume(v); }, function (v) { return Math.round(v * 100) + '%'; });
        P.button('rc', X, 420, 300, 56, '◎ Recentralizar visão', function () { R.recenter(); }, { px: 20 });
      } else if (w.st.tab === 'look') {
        ui.text(x, 'Cor do laser', X, 120, 22, { weight: 600 });
        ['#7fd0ff', '#ff6b9a', '#7dff9c', '#ffd23f', '#ffffff', '#b38cff'].forEach(function (c, i) {
          P.button('c' + i, X + 200 + i * 78, 94, 64, 52, '', function () { s.laserColor = c; R.saveSettings(); }, { fill: c, r: 26 });
          if (s.laserColor === c) { x.lineWidth = 4; x.strokeStyle = '#fff'; ui.roundRect(x, X + 196 + i * 78, 90, 72, 60, 30); x.stroke(); }
        });
        ui.text(x, 'Ambiente do Início', X, 210, 22, { weight: 600 });
        [['lago', 'Lago'], ['noite', 'Noite'], ['espaco', 'Espaço'], ['praia', 'Praia']].forEach(function (e, i) {
          P.button('e' + e[0], X + 240 + i * 150, 184, 140, 52, e[1], function () { R.os.setHomeEnv(e[0]); }, { active: s.homeEnv === e[0], px: 20 });
        });
      } else {
        ui.text(x, 'URL do Cloud Play ({id} = ID da experiência):', X, 120, 20, { weight: 600 });
        textField(P, x, 'curl', X, 140, Wd, 56, s.cloudUrl, '', function () {
          w.st.focus = true; R.os.keyboardFor(w, function (k) { if (k === '\n') { R.os.closeKeyboard(w); w.st.focus = false; R.saveSettings(); return; } typeInto(s, 'cloudUrl', k, 300); R.saveSettings(); P.dirty = true; });
        }, w.st.focus);
        P.button('cdef', X, 210, 330, 50, 'Restaurar URL padrão', function () { s.cloudUrl = 'https://www.roblox.com/games/{id}'; R.saveSettings(); }, { px: 18 });
        P.button('wipe', X, H - 80, 380, 56, w.st.wipe ? 'Confirmar: apagar TUDO' : 'Apagar todos os dados', function () {
          if (!w.st.wipe) { w.st.wipe = true; return; }
          try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('rego.') === 0) localStorage.removeItem(k); }); } catch (e) {}
          location.reload();
        }, { fill: '#e5484d', px: 20 });
        ui.text(x, 'Wpollo VR • three.js r128 • cannon.js • ' + R.gameList.length + ' jogos', X, H - 120, 18, { color: 'rgba(255,255,255,0.5)' });
      }
    },
    close: function () { R.saveSettings(); }
  });

  // ---------------------------------------------------------------- Loja (biblioteca)
  app({
    id: 'store', name: 'Loja', icon: 'store', size: [1.3, 0.95],
    open: function (w) { w.st.i = 0; },
    onSwipe: function (w, d) { w.st.i = (w.st.i + d + R.gameList.length) % R.gameList.length; },
    render: function (x, P, w, H) {
      var g = R.gameList[w.st.i], self = this;
      header(x, P, 'Loja Wpollo', 'Todos os jogos são gratuitos e já vêm instalados. Deslize para navegar.');
      ui.roundRect(x, 36, 110, P.cw - 72, 300, 30);
      var gr = x.createLinearGradient(36, 110, P.cw, 410); gr.addColorStop(0, g.c1 || '#5b6cff'); gr.addColorStop(1, g.c2 || '#b14cff');
      x.fillStyle = gr; x.fill();
      ui.drawIcon(x, R.os.gameIcon(g), 70, 150, 200);
      ui.text(x, g.name, 300, 190, 44, { weight: 800, maxW: P.cw - 360 });
      ui.text(x, g.cat + (g.featured ? ' • ⭐ Destaque' : ''), 300, 240, 22, { color: 'rgba(255,255,255,0.85)' });
      ui.wrap(x, g.desc || '', 300, 270, P.cw - 380, 20, 28, { color: 'rgba(255,255,255,0.9)' });
      P.button('prev', 36, 430, 80, 60, '‹', function () { self.onSwipe(w, -1); }, { px: 30 });
      P.button('play', 130, 430, 300, 60, '▶ Jogar', function () { R.os.launch(g.id); }, { fill: '#2f7bf6', fillHover: '#4b8ff8' });
      P.button('next', 444, 430, 80, 60, '›', function () { self.onSwipe(w, 1); }, { px: 30 });
      var b = R.store.get('best.' + g.id, null);
      ui.text(x, (w.st.i + 1) + ' / ' + R.gameList.length + (b !== null ? '   🏆 ' + b : ''), P.cw - 40, 460, 22, { align: 'right', color: 'rgba(255,255,255,0.7)' });
      if (g.controls) ui.wrap(x, '🎮 ' + g.controls, 40, 510, P.cw - 80, 19, 26, { color: 'rgba(255,255,255,0.7)' });
    }
  });

  // ---------------------------------------------------------------- Mensagens do sistema
  app({
    id: 'messenger', name: 'Mensagens', icon: 'system-messenger', size: [1.0, 0.85],
    render: function (x, P, w, H) {
      header(x, P, 'Mensagens do Sistema');
      var n = R.os.notes;
      if (!n.length) ui.text(x, 'Nada por aqui.', 36, 130, 22, { color: 'rgba(255,255,255,0.6)' });
      for (var i = 0; i < Math.min(7, n.length); i++) {
        var y = 100 + i * 62; ui.roundRect(x, 36, y, P.cw - 72, 54, 16); x.fillStyle = 'rgba(255,255,255,0.07)'; x.fill();
        ui.text(x, n[i].msg, 56, y + 27, 20, { maxW: P.cw - 260 });
        ui.text(x, new Date(n[i].t).toLocaleTimeString('pt-BR').slice(0, 5), P.cw - 56, y + 27, 18, { align: 'right', color: 'rgba(255,255,255,0.5)' });
      }
      P.button('clr', P.cw - 220, 26, 180, 46, 'Limpar', function () { R.os.notes.length = 0; R.store.set('notes', []); }, { px: 18 });
    }
  });

  // ---------------------------------------------------------------- TV (cinema)
  var CHANNELS = [
    ['Big Buck Bunny (CC-BY Blender)', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'],
    ['Sintel (CC-BY Blender)', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4'],
    ['Tears of Steel (CC-BY Blender)', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4']
  ];
  var tv = { video: null, screen: null };
  function tvPlay(url) {
    if (!tv.video) {
      var v = tv.video = document.createElement('video'); v.crossOrigin = 'anonymous'; v.playsInline = true; v.loop = true;
      v.setAttribute('webkit-playsinline', ''); v.onerror = function () { ui.toast('Não foi possível tocar (CORS/rede)', 4); };
      var tex = new THREE.VideoTexture(v); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      tv.screen = new THREE.Mesh(new THREE.PlaneBufferGeometry(6.4, 3.6), new THREE.MeshBasicMaterial({ map: tex }));
      tv.screen.position.set(0, 3.4, -6.5);
    }
    R.os.home.add(tv.screen);
    tv.video.src = url; tv.video.play().catch(function () { ui.toast('Toque em ▶ para iniciar', 3); });
  }
  app({
    id: 'tv', name: 'TV', icon: 'tv', size: [1.0, 0.8],
    render: function (x, P, w, H) {
      header(x, P, 'TV', 'Cinema gigante no seu Início. Vídeos com CORS liberado.');
      for (var i = 0; i < CHANNELS.length; i++) (function (c, i) { P.button('c' + i, 36, 110 + i * 68, P.cw - 72, 58, '▶  ' + c[0], function () { tvPlay(c[1]); }, { align: 'left', r: 16, px: 20 }); })(CHANNELS[i], i);
      textField(P, x, 'u', 36, 330, P.cw - 220, 54, w.st.url, 'URL de vídeo .mp4…', function () {
        w.st.focus = true; R.os.keyboardFor(w, function (k) { if (k === '\n') { R.os.closeKeyboard(w); w.st.focus = false; if (w.st.url) tvPlay(normalize(w.st.url)); return; } typeInto(w.st, 'url', k); P.dirty = true; });
      }, w.st.focus);
      P.button('pp', P.cw - 170, 330, 134, 54, '⏯', function () { if (tv.video) { if (tv.video.paused) tv.video.play(); else tv.video.pause(); } }, { px: 26 });
      P.button('off', 36, H - 66, 220, 48, 'Desligar TV', function () { if (tv.video) { tv.video.pause(); if (tv.screen.parent) tv.screen.parent.remove(tv.screen); } }, { px: 18 });
    }
  });

  // ---------------------------------------------------------------- Cloud Play (abrir experiências do Roblox pelo ID)
  app({
    id: 'cloudplay', name: 'Cloud Play', c1: '#3a3f4b', c2: '#111318', glyph: '☁', size: [0.95, 0.95],
    open: function (w) { w.st.id = ''; w.st.recent = R.store.get('cloud.recent', []); },
    render: function (x, P, w, H) {
      header(x, P, 'Cloud Play', 'Abra uma experiência do Roblox pelo ID (abre no site oficial).');
      ui.roundRect(x, 36, 110, P.cw - 72, 70, 35); x.fillStyle = 'rgba(0,0,0,0.3)'; x.fill();
      ui.text(x, w.st.id || 'ID da experiência (place id)', 66, 146, 30, { color: w.st.id ? '#fff' : 'rgba(255,255,255,0.4)', weight: 600 });
      var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '▶'], kw = (P.cw - 72) / 3 - 4;
      for (var i = 0; i < 12; i++) (function (k, i) {
        P.button('k' + i, 36 + (i % 3) * (kw + 6), 196 + Math.floor(i / 3) * 62, kw, 54, k === '▶' ? 'Abrir ▶' : k, function () {
          if (k === '⌫') w.st.id = w.st.id.slice(0, -1);
          else if (k === '▶') launchCloud(w);
          else if (w.st.id.length < 16) w.st.id += k;
        }, { fill: k === '▶' ? '#30a46c' : undefined, px: 24, r: 14 });
      })(keys[i], i);
      ui.text(x, 'Recentes', 36, 470, 20, { color: 'rgba(255,255,255,0.6)' });
      for (var r = 0; r < Math.min(3, w.st.recent.length); r++) (function (id, r) {
        P.button('r' + r, 36 + r * ((P.cw - 72) / 3), 490, (P.cw - 72) / 3 - 8, 46, id, function () { w.st.id = id; launchCloud(w); }, { px: 18, r: 12 });
      })(w.st.recent[r], r);
    }
  });
  function launchCloud(w) {
    if (!w.st.id) { R.sfx.play('error'); return; }
    var rec = w.st.recent.filter(function (i) { return i !== w.st.id; }); rec.unshift(w.st.id); w.st.recent = rec.slice(0, 6); R.store.set('cloud.recent', w.st.recent);
    openExternal((R.settings.cloudUrl || 'https://www.roblox.com/games/{id}').replace('{id}', w.st.id));
  }

  webApp('facebook', 'Facebook', 'facebook', 'https://m.facebook.com');
  webApp('instagram', 'Instagram', 'instagram', 'https://www.instagram.com');
  webApp('whatsapp', 'WhatsApp', 'whatsapp', 'https://web.whatsapp.com');

  // ordem do Início
  var order = ['store', 'browser', 'cloudplay', 'tv', 'gallery', 'camera', 'clock', 'calendar', 'calculator', 'files', 'messenger', 'remote', 'settings', 'help', 'facebook', 'instagram', 'whatsapp'];
  apps.sort(function (a, b) { return order.indexOf(a.id) - order.indexOf(b.id); });
})();
