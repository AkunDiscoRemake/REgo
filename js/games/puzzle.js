/* Puzzles e jogos de raciocínio */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, M = R.models, ui = R.ui, G = R.G;
  var V = THREE.Vector3;

  function room(g, sky) {
    g.env({ sky: sky || 'night', ground: '#6b4f3a', light: { hemi: 0.9, dir: 0.5 } });
    var rug = new THREE.Mesh(new THREE.CircleBufferGeometry(2.5, 24), R.mat.lambert('#8a3b4a')); rug.rotation.x = -Math.PI / 2; rug.position.y = 0.01; g.add(rug);
    for (var i = 0; i < 3; i++) { var plant = M.tree(0.5, '#3f9d4b'); plant.position.set(-3 + i * 3, 0, -4.5); g.add(plant); }
  }
  // tela interativa (painel em canvas) — ótimo para jogos de tabuleiro
  function screen(g, opts, render) {
    var P = new ui.Panel({ w: opts.w || 1.5, h: opts.h || 1.1, res: opts.res || 520, render: function (x, P) { ui.glass(x, 0, 0, P.cw, P.ch, 40); render(x, P); } });
    P.mesh.position.set(0, opts.y || 1.45, opts.z || -1.7); g.add(P.mesh); return P;
  }

  // ---------------------------------------------------------------- Sequência de Cores
  R.game({ id: 'sequencia', name: 'Sequência de Cores', cat: 'Puzzle', c1: '#2fa84f', c2: '#e23b3b', glyph: '🔴',
    desc: 'Memorize a sequência de luzes e sons e repita. Cada rodada adiciona uma cor.', controls: 'Aponte e aperte o gatilho nos botões.',
    build: function (g) {
      room(g);
      var COLS = [['#2fa84f', '#7dff9c', 330], ['#e23b3b', '#ff9b9b', 262], ['#ffd23f', '#fff3a8', 392], ['#2d7cf6', '#9fd3ff', 523]];
      var pads = [], seq = [], idx = 0, state = 'show';
      for (var i = 0; i < 4; i++) {
        var m = M.box(0.55, 0.55, 0.1, COLS[i][0]); m.position.set((i % 2 - 0.5) * 0.62, 1.75 - Math.floor(i / 2) * 0.62, -1.8); m.userData = { t: 'pad', i: i, off: m.material, on: R.mat.basic(COLS[i][1]) }; g.add(m); pads.push(m);
      }
      function flash(i, d) { var p = pads[i]; p.material = p.userData.on; R.sfx.play('note', COLS[i][2]); g.after(d || 0.35, function () { p.material = p.userData.off; }); }
      function show() {
        state = 'show'; seq.push(Math.floor(Math.random() * 4)); idx = 0; g.setInfo('Observe…');
        seq.forEach(function (s, k) { g.after(0.8 + k * 0.6, function () { flash(s); }); });
        g.after(0.8 + seq.length * 0.6, function () { state = 'input'; g.setInfo('Sua vez! (' + seq.length + ')'); });
      }
      g.on('press', function (p) {
        if (state !== 'input') return; var h = g.ray(p, pads, false); if (!h) return;
        var i = h.object.userData.i; flash(i, 0.2);
        if (i !== seq[idx]) { state = 'over'; R.sfx.play('error'); g.end('Errou na sequência ' + seq.length); return; }
        idx++; if (idx >= seq.length) { g.setScore(seq.length); state = 'show'; g.after(0.6, show); }
      });
      g.after(0.5, show);
      g.hud({ y: 2.45, z: -1.85, scale: 0.8 }); g.hudState.scoreLabel = 'Nível';
    } });

  // ---------------------------------------------------------------- Jogo da Memória
  var EMO = ['🍎', '🚀', '🐱', '⚽', '🎸', '🌈', '🍕', '🦄'];
  R.game({ id: 'memoria', name: 'Jogo da Memória', cat: 'Puzzle', c1: '#7a5cff', c2: '#ff7ad9', glyph: '🃏',
    desc: 'Encontre os 8 pares com o mínimo de jogadas.', controls: 'Aponte e clique nas cartas.',
    build: function (g) {
      room(g);
      var cards = EMO.concat(EMO).sort(function () { return Math.random() - 0.5; }).map(function (e) { return { e: e, open: false, done: false }; });
      var sel = [], moves = 0, lock = false, pairs = 0, t0 = R.time;
      var P = screen(g, { w: 1.4, h: 1.2 }, function (x, P) {
        ui.text(x, 'Jogadas: ' + moves + '   Pares: ' + pairs + '/8', P.cw / 2, 40, 28, { align: 'center', weight: 700 });
        var cw = (P.cw - 60) / 4, chh = (P.ch - 90) / 4;
        cards.forEach(function (c, i) {
          var X = 30 + (i % 4) * cw, Y = 74 + Math.floor(i / 4) * chh;
          P.button('c' + i, X + 6, Y + 6, cw - 12, chh - 12, c.open || c.done ? c.e : '', function () { pick(i); },
            { r: 20, px: 64, fill: c.done ? 'rgba(125,255,156,0.35)' : c.open ? 'rgba(255,255,255,0.85)' : 'rgba(122,92,255,0.75)', fillHover: c.open ? undefined : 'rgba(150,120,255,0.95)' });
        });
      });
      function pick(i) {
        var c = cards[i]; if (lock || c.open || c.done) return; c.open = true; sel.push(i); P.dirty = true;
        if (sel.length === 2) {
          moves++; var a = cards[sel[0]], b = cards[sel[1]];
          if (a.e === b.e) { a.done = b.done = true; pairs++; sel = []; R.sfx.play('coin'); if (pairs === 8) { g.setScore(Math.max(0, 200 - moves * 6)); g.end('Completo em ' + moves + ' jogadas!'); } }
          else { lock = true; g.after(0.8, function () { a.open = b.open = false; sel = []; lock = false; P.dirty = true; }); }
        }
      }
      g.hud({ y: 2.35, z: -1.75, scale: 0.7 });
    } });

  // ---------------------------------------------------------------- Jogo da Velha
  R.game({ id: 'velha', name: 'Jogo da Velha', cat: 'Puzzle', c1: '#ff9f43', c2: '#2d7cf6', glyph: '❌',
    desc: 'Contra a CPU. Melhor de muitas: cada vitória vale 3, empate 1.', controls: 'Clique na casa.',
    build: function (g) {
      room(g);
      var b, turn, msg = '', W = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
      function win(bd, p) { return W.some(function (l) { return bd[l[0]] === p && bd[l[1]] === p && bd[l[2]] === p; }); }
      function full(bd) { return bd.every(function (c) { return c; }); }
      function mm(bd, p) { if (win(bd, 'O')) return 1; if (win(bd, 'X')) return -1; if (full(bd)) return 0; var best = p === 'O' ? -2 : 2; for (var i = 0; i < 9; i++) if (!bd[i]) { bd[i] = p; var s = mm(bd, p === 'O' ? 'X' : 'O'); bd[i] = ''; best = p === 'O' ? Math.max(best, s) : Math.min(best, s); } return best; }
      function cpu() {
        var free = []; for (var i = 0; i < 9; i++) if (!b[i]) free.push(i);
        var mv = free[Math.floor(Math.random() * free.length)];
        if (Math.random() > 0.25) { var bs = -2; free.forEach(function (i) { b[i] = 'O'; var s = mm(b, 'X'); b[i] = ''; if (s > bs) { bs = s; mv = i; } }); }
        b[mv] = 'O'; R.sfx.play('click'); check();
      }
      function check() {
        if (win(b, 'X')) { msg = 'Você venceu! +3'; g.addScore(3); R.sfx.play('win'); turn = 'end'; }
        else if (win(b, 'O')) { msg = 'CPU venceu'; R.sfx.play('lose'); turn = 'end'; }
        else if (full(b)) { msg = 'Empate +1'; g.addScore(1); turn = 'end'; }
        else turn = turn === 'X' ? 'O' : 'X';
        P.dirty = true;
        if (turn === 'O') g.after(0.5, cpu);
      }
      function reset() { b = ['', '', '', '', '', '', '', '', '']; turn = 'X'; msg = 'Sua vez (X)'; if (P) P.dirty = true; }
      reset();
      var P = screen(g, { w: 1.2, h: 1.25 }, function (x, P) {
        ui.text(x, msg, P.cw / 2, 44, 30, { align: 'center', weight: 700 });
        var s = (P.cw - 120) / 3;
        for (var i = 0; i < 9; i++) (function (i) {
          P.button('c' + i, 60 + (i % 3) * s + 6, 90 + Math.floor(i / 3) * s + 6, s - 12, s - 12, b[i], function () { if (turn === 'X' && !b[i]) { b[i] = 'X'; check(); } }, { r: 18, px: 110, color: b[i] === 'X' ? '#ff9f43' : '#9fd3ff' });
        })(i);
        if (turn === 'end') P.button('again', P.cw / 2 - 140, P.ch - 70, 280, 56, 'Nova partida', function () { reset(); }, { fill: '#2f7bf6' });
      });
      g.hud({ y: 2.4, z: -1.75, scale: 0.7 }); g.round(180);
    } });

  // ---------------------------------------------------------------- Ligue 4
  R.game({ id: 'lig4', name: 'Ligue 4', cat: 'Puzzle', c1: '#2d7cf6', c2: '#ffd23f', glyph: '🟡',
    desc: 'Alinhe 4 peças antes da CPU. Ela bloqueia e ataca!', controls: 'Clique na coluna.',
    build: function (g) {
      room(g);
      var COLS = 7, ROWS = 6, b, over, msg;
      function reset() { b = []; for (var i = 0; i < ROWS; i++) b.push([0, 0, 0, 0, 0, 0, 0]); over = false; msg = 'Sua vez (amarelo)'; if (P) P.dirty = true; }
      function drop(c, p) { for (var r = ROWS - 1; r >= 0; r--) if (!b[r][c]) { b[r][c] = p; return r; } return -1; }
      function four(p) { for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) { if (b[r][c] !== p) continue; var dirs = [[0, 1], [1, 0], [1, 1], [1, -1]]; for (var d = 0; d < 4; d++) { var k = 1; while (k < 4) { var rr = r + dirs[d][0] * k, cc = c + dirs[d][1] * k; if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || b[rr][cc] !== p) break; k++; } if (k === 4) return true; } } return false; }
      function undo(c) { for (var r = 0; r < ROWS; r++) if (b[r][c]) { b[r][c] = 0; return; } }
      function cpu() {
        var order = [3, 2, 4, 1, 5, 0, 6], c, i;
        for (i = 0; i < 7; i++) { c = order[i]; if (drop(c, 2) >= 0) { if (four(2)) return c; undo(c); } }
        for (i = 0; i < 7; i++) { c = order[i]; if (drop(c, 1) >= 0) { var w = four(1); undo(c); if (w) return c; } }
        var opts = order.filter(function (c) { return !b[0][c]; });
        return Math.random() < 0.6 ? opts[0] : opts[Math.floor(Math.random() * opts.length)];
      }
      function play(c) {
        if (over || b[0][c]) return; drop(c, 1); R.sfx.play('click');
        if (four(1)) { over = true; msg = 'Você venceu! 🎉'; g.addScore(1); R.sfx.play('win'); P.dirty = true; return; }
        lock = true; P.dirty = true;
        g.after(0.4, function () { var cc = cpu(); if (cc !== undefined) drop(cc, 2); lock = false; if (four(2)) { over = true; msg = 'CPU venceu'; R.sfx.play('lose'); } else if (b[0].every(function (v) { return v; })) { over = true; msg = 'Empate'; } P.dirty = true; });
      }
      var lock = false; reset();
      var P = screen(g, { w: 1.5, h: 1.3 }, function (x, P) {
        ui.text(x, msg, P.cw / 2, 40, 28, { align: 'center', weight: 700 });
        var s = Math.min((P.cw - 60) / COLS, (P.ch - 150) / ROWS), ox = (P.cw - s * COLS) / 2;
        ui.roundRect(x, ox - 8, 76, s * COLS + 16, s * ROWS + 16, 20); x.fillStyle = '#1f4fbf'; x.fill();
        for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) { x.beginPath(); x.arc(ox + c * s + s / 2, 84 + r * s + s / 2, s * 0.4, 0, 7); x.fillStyle = b[r][c] === 1 ? '#ffd23f' : b[r][c] === 2 ? '#e23b3b' : '#0b1a3a'; x.fill(); }
        for (var cc = 0; cc < COLS; cc++) (function (cc) { P.area('col' + cc, ox + cc * s, 76, s, s * ROWS + 16, function () { if (!lock) play(cc); }); if (P.hover === 'col' + cc) { x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(ox + cc * s, 76, s, s * ROWS + 16); } })(cc);
        if (over) P.button('again', P.cw / 2 - 140, P.ch - 62, 280, 52, 'Nova partida', function () { reset(); }, { fill: '#2f7bf6' });
      });
      g.hud({ y: 2.45, z: -1.75, scale: 0.7 }); g.hudState.scoreLabel = 'Vitórias'; g.round(240);
    } });

  // ---------------------------------------------------------------- Apaga as Luzes
  R.game({ id: 'luzes', name: 'Apaga as Luzes', cat: 'Puzzle', c1: '#ffd23f', c2: '#1b1c2b', glyph: '💡',
    desc: 'Cada clique inverte a lâmpada e as vizinhas. Apague todas!', controls: 'Clique nas lâmpadas.',
    build: function (g) {
      room(g);
      var N = 5, grid, moves, level = 1;
      function tog(r, c) { [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var rr = r + d[0], cc = c + d[1]; if (rr >= 0 && rr < N && cc >= 0 && cc < N) grid[rr][cc] = !grid[rr][cc]; }); }
      function gen() { grid = []; for (var i = 0; i < N; i++) grid.push([false, false, false, false, false]); for (var k = 0; k < 2 + level * 2; k++) tog(Math.floor(Math.random() * N), Math.floor(Math.random() * N)); moves = 0; if (grid.every(function (r) { return r.every(function (v) { return !v; }); })) tog(2, 2); }
      gen();
      var P = screen(g, { w: 1.2, h: 1.25 }, function (x, P) {
        ui.text(x, 'Nível ' + level + ' • jogadas ' + moves, P.cw / 2, 42, 28, { align: 'center', weight: 700 });
        var s = (P.cw - 100) / N;
        for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) (function (r, c) {
          P.button('l' + r + c, 50 + c * s + 5, 86 + r * s + 5, s - 10, s - 10, grid[r][c] ? '💡' : '', function () {
            tog(r, c); moves++; R.sfx.play('note', 300 + (r * 5 + c) * 20);
            if (grid.every(function (row) { return row.every(function (v) { return !v; }); })) { g.addScore(level); level++; R.sfx.play('win'); R.ui.toast('Nível ' + (level - 1) + ' completo!'); gen(); }
          }, { r: 16, px: 50, fill: grid[r][c] ? '#ffd23f' : 'rgba(255,255,255,0.08)', fillHover: grid[r][c] ? '#ffe27a' : 'rgba(255,255,255,0.22)' });
        })(r, c);
      });
      g.hud({ y: 2.4, z: -1.75, scale: 0.7 }); g.round(180);
    } });

  // ---------------------------------------------------------------- Quebra-cabeça deslizante
  R.game({ id: 'deslizante', name: 'Quebra-cabeça 15', cat: 'Puzzle', c1: '#5d6b7a', c2: '#c9b38a', glyph: '🔢',
    desc: 'Coloque as peças de 1 a 15 em ordem deslizando para o espaço vazio.', controls: 'Clique numa peça vizinha ao espaço.',
    build: function (g) {
      room(g);
      var t = [], moves = 0, empty = 15; for (var i = 0; i < 16; i++) t.push(i + 1); t[15] = 0;
      function nb(e) { var r = Math.floor(e / 4), c = e % 4, o = []; if (r > 0) o.push(e - 4); if (r < 3) o.push(e + 4); if (c > 0) o.push(e - 1); if (c < 3) o.push(e + 1); return o; }
      for (var k = 0; k < 200; k++) { var n = nb(empty), m = n[Math.floor(Math.random() * n.length)]; t[empty] = t[m]; t[m] = 0; empty = m; }
      var t0 = R.time;
      var P = screen(g, { w: 1.2, h: 1.25 }, function (x, P) {
        ui.text(x, 'Jogadas: ' + moves, P.cw / 2, 42, 28, { align: 'center', weight: 700 });
        var s = (P.cw - 100) / 4;
        for (var i = 0; i < 16; i++) (function (i) {
          if (!t[i]) return;
          P.button('t' + i, 50 + (i % 4) * s + 5, 86 + Math.floor(i / 4) * s + 5, s - 10, s - 10, String(t[i]), function () {
            if (nb(empty).indexOf(i) < 0) { R.sfx.play('error'); return; }
            t[empty] = t[i]; t[i] = 0; empty = i; moves++; R.sfx.play('click');
            var ok = true; for (var k = 0; k < 15; k++) if (t[k] !== k + 1) ok = false;
            if (ok) { g.setScore(Math.max(10, 500 - moves)); g.end('Resolvido em ' + moves + ' jogadas!'); }
          }, { r: 18, px: 48, fill: t[i] === i + 1 ? '#30a46c' : '#c9b38a', fillHover: '#e0cfa8', color: '#1b1b1b' });
        })(i);
      });
      g.hud({ y: 2.4, z: -1.75, scale: 0.7 });
    } });

  // ---------------------------------------------------------------- Campo Minado
  R.game({ id: 'minas', name: 'Campo Minado', cat: 'Puzzle', c1: '#9aa3ad', c2: '#e23b3b', glyph: '💣',
    desc: 'Tabuleiro 9x9 com 10 minas. Use o modo bandeira para marcar.', controls: 'Clique para revelar. Botão 🚩 alterna modo bandeira.',
    build: function (g) {
      room(g);
      var N = 9, MINES = 10, cells = [], first = true, flagMode = false, done = false, t0 = R.time, left = N * N - MINES;
      for (var i = 0; i < N * N; i++) cells.push({ m: false, o: false, f: false, n: 0 });
      function nbs(i) { var r = Math.floor(i / N), c = i % N, o = []; for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; var rr = r + dr, cc = c + dc; if (rr >= 0 && rr < N && cc >= 0 && cc < N) o.push(rr * N + cc); } return o; }
      function place(safe) { var k = 0; while (k < MINES) { var j = Math.floor(Math.random() * N * N); if (j === safe || cells[j].m || nbs(safe).indexOf(j) >= 0) continue; cells[j].m = true; k++; } cells.forEach(function (c, i) { c.n = nbs(i).filter(function (j) { return cells[j].m; }).length; }); }
      function open(i) { var c = cells[i]; if (c.o || c.f) return; c.o = true; left--; if (!c.n && !c.m) nbs(i).forEach(open); }
      var COL = ['', '#4b8ff8', '#30a46c', '#e5484d', '#7a5cff', '#b3202a', '#2de2ff', '#111', '#666'];
      var P = screen(g, { w: 1.3, h: 1.4 }, function (x, P) {
        ui.text(x, done ? (left === 0 ? 'Venceu!' : 'BOOM!') : 'Restam ' + left, 40, 44, 28, { weight: 700 });
        P.button('flag', P.cw - 210, 16, 170, 56, flagMode ? '🚩 Bandeira' : '⛏ Revelar', function () { flagMode = !flagMode; }, { active: flagMode, px: 22 });
        var s = (P.cw - 60) / N;
        cells.forEach(function (c, i) {
          var X = 30 + (i % N) * s, Y = 90 + Math.floor(i / N) * s;
          var lab = c.o ? (c.m ? '💣' : c.n ? String(c.n) : '') : c.f ? '🚩' : '';
          P.button('c' + i, X + 2, Y + 2, s - 4, s - 4, lab, function () {
            if (done) return;
            if (flagMode && !c.o) { c.f = !c.f; return; }
            if (first) { place(i); first = false; }
            if (c.f) return;
            if (c.m) { done = true; c.o = true; cells.forEach(function (cc) { if (cc.m) cc.o = true; }); R.sfx.play('boom'); g.setScore(0); g.end('Pisou numa mina!'); return; }
            open(i); R.sfx.play('click');
            if (left === 0) { done = true; g.setScore(Math.max(10, Math.round(600 - (R.time - t0) * 2))); g.end('Campo limpo em ' + Math.round(R.time - t0) + 's!'); }
          }, { r: 8, px: 30, fill: c.o ? 'rgba(255,255,255,0.75)' : 'rgba(120,130,150,0.8)', fillHover: c.o ? undefined : 'rgba(160,170,190,0.95)', color: COL[c.n] || '#111' });
        });
      });
      g.hud({ y: 2.5, z: -1.75, scale: 0.7 });
    } });

  // ---------------------------------------------------------------- Labirinto inclinável (usa a rotação do controle 3DoF!)
  R.game({ id: 'labirinto', name: 'Labirinto Inclinável', cat: 'Puzzle', featured: true, c1: '#7a5232', c2: '#c9b38a', glyph: '🌀',
    desc: 'Incline o tabuleiro girando o controle e leve a bolinha até a saída verde. Perfeito para o controle do Go!', controls: 'Gire/incline o controle para inclinar o labirinto.',
    build: function (g) {
      room(g, 'sunset');
      var level = 0, board = new THREE.Group(); board.position.set(0, 1.05, -1.0); g.add(board);
      var ball = M.sphere(0.025, '#c0c0c0', 12), walls, goal, N, S = 0.09, vel = new V(), t0;
      function maze(n) {
        var cells = [], stack = [0], vis = { 0: true }, W = [];
        for (var i = 0; i < n * n; i++) cells.push({ r: true, b: true });
        while (stack.length) {
          var cur = stack[stack.length - 1], r = Math.floor(cur / n), c = cur % n, opts = [];
          if (r > 0 && !vis[cur - n]) opts.push([cur - n, 'u']); if (r < n - 1 && !vis[cur + n]) opts.push([cur + n, 'd']);
          if (c > 0 && !vis[cur - 1]) opts.push([cur - 1, 'l']); if (c < n - 1 && !vis[cur + 1]) opts.push([cur + 1, 'rr']);
          if (!opts.length) { stack.pop(); continue; }
          var o = opts[Math.floor(Math.random() * opts.length)]; vis[o[0]] = true; stack.push(o[0]);
          if (o[1] === 'u') cells[o[0]].b = false; if (o[1] === 'd') cells[cur].b = false; if (o[1] === 'l') cells[o[0]].r = false; if (o[1] === 'rr') cells[cur].r = false;
        }
        return cells;
      }
      function load() {
        while (board.children.length) board.remove(board.children[0]);
        N = 5 + level * 2; var cells = maze(N), half = N * S / 2; walls = [];
        var base = M.box(N * S + 0.04, 0.02, N * S + 0.04, '#c9b38a'); base.position.y = -0.01; board.add(base);
        function wall(x, z, w, d) { var m = M.box(w, 0.04, d, '#7a5232'); m.position.set(x, 0.02, z); board.add(m); walls.push([x, z, w / 2, d / 2]); }
        wall(0, -half, N * S + 0.02, 0.012); wall(-half, 0, 0.012, N * S + 0.02);
        cells.forEach(function (c, i) { var r = Math.floor(i / N), cc = i % N, x = -half + cc * S, z = -half + r * S; if (c.r) wall(x + S, z + S / 2, 0.012, S + 0.012); if (c.b) wall(x + S / 2, z + S, S + 0.012, 0.012); });
        goal = new THREE.Mesh(new THREE.CircleBufferGeometry(S * 0.35, 16), R.mat.basic('#30d158')); goal.rotation.x = -Math.PI / 2; goal.position.set(half - S / 2, 0.002, half - S / 2); board.add(goal);
        ball.position.set(-half + S / 2, 0.025, -half + S / 2); board.add(ball); vel.set(0, 0, 0); t0 = R.time;
        board.scale.setScalar(Math.min(1.4, 0.75 / (N * S)) * 1.0);
      }
      load();
      var e = new THREE.Euler(), q = new THREE.Quaternion();
      g.on('update', function (dt) {
        var p = R.input.pointers[0];
        // inclinação = orientação do controle (pitch/roll), ou do mouse/raio no 2D
        e.setFromQuaternion(p.quat, 'YXZ');
        var tx = Math.max(-0.35, Math.min(0.35, R.isXR ? -e.z * 0.8 : p.dir.x * 0.9)), tz = Math.max(-0.35, Math.min(0.35, R.isXR ? -(e.x + 0.35) * 0.8 : -(p.dir.y + 0.35) * 0.9));
        board.rotation.x += (-tz - board.rotation.x) * Math.min(1, dt * 10); board.rotation.z += (-tx - board.rotation.z) * Math.min(1, dt * 10);
        vel.x += -board.rotation.z * 9.8 * 0.7 * dt * -1 * -1; vel.z += board.rotation.x * 9.8 * 0.7 * dt;
        vel.x = vel.x; vel.multiplyScalar(1 - dt * 0.8);
        var sub = 4; for (var s = 0; s < sub; s++) {
          ball.position.x += vel.x * dt / sub; ball.position.z += vel.z * dt / sub;
          for (var i = 0; i < walls.length; i++) { var w = walls[i], dx = ball.position.x - w[0], dz = ball.position.z - w[1], hx = w[2] + 0.025, hz = w[3] + 0.025;
            if (Math.abs(dx) < hx && Math.abs(dz) < hz) { if (hx - Math.abs(dx) < hz - Math.abs(dz)) { ball.position.x = w[0] + Math.sign(dx) * hx; vel.x *= -0.3; } else { ball.position.z = w[1] + Math.sign(dz) * hz; vel.z *= -0.3; } } }
        }
        ball.rotation.x += vel.z * dt * 30; ball.rotation.z -= vel.x * dt * 30;
        if (ball.position.distanceTo(goal.position) < S * 0.3) { level++; g.addScore(Math.max(5, Math.round(60 - (R.time - t0)))); R.sfx.play('win'); if (level >= 4) g.end('Todos os labirintos!'); else { R.ui.toast('Labirinto ' + level + ' concluído!'); load(); } }
      });
      g.hud({ y: 2.0, z: -1.8, scale: 0.75, info: 'Incline o controle para mover a bolinha' });
    } });

  // ---------------------------------------------------------------- Quiz
  var QUIZ = [
    ['Qual é a capital do Brasil?', ['Brasília', 'Rio de Janeiro', 'São Paulo', 'Salvador']],
    ['Quantos planetas tem o Sistema Solar?', ['8', '9', '7', '10']],
    ['Qual o maior oceano da Terra?', ['Pacífico', 'Atlântico', 'Índico', 'Ártico']],
    ['Quanto é 7 × 8?', ['56', '54', '64', '48']],
    ['Qual gás as plantas absorvem?', ['Gás carbônico', 'Oxigênio', 'Hélio', 'Nitrogênio']],
    ['Em que ano o homem pisou na Lua?', ['1969', '1972', '1959', '1981']],
    ['Qual é o maior bioma do Brasil?', ['Amazônia', 'Cerrado', 'Caatinga', 'Pampa']],
    ['Quantos lados tem um hexágono?', ['6', '5', '8', '7']],
    ['Qual planeta é conhecido como planeta vermelho?', ['Marte', 'Vênus', 'Júpiter', 'Mercúrio']],
    ['Qual a fórmula da água?', ['H₂O', 'CO₂', 'O₂', 'NaCl']],
    ['Quem pintou a Mona Lisa?', ['Leonardo da Vinci', 'Van Gogh', 'Picasso', 'Michelangelo']],
    ['Qual o osso mais longo do corpo?', ['Fêmur', 'Tíbia', 'Úmero', 'Rádio']],
    ['Qual é a velocidade da luz (aprox.)?', ['300.000 km/s', '30.000 km/s', '3.000 km/s', '1 milhão km/s']],
    ['Quantos estados tem o Brasil?', ['26 + DF', '25 + DF', '27 + DF', '24 + DF']],
    ['O que significa a sigla VR?', ['Realidade Virtual', 'Vídeo Rápido', 'Visão Real', 'Volume Reduzido']],
    ['Qual animal é o maior mamífero?', ['Baleia-azul', 'Elefante', 'Girafa', 'Tubarão-baleia']]
  ];
  R.game({ id: 'quiz', name: 'Quiz Relâmpago', cat: 'Puzzle', c1: '#7a5cff', c2: '#2de2ff', glyph: '❓',
    desc: '10 perguntas de conhecimentos gerais. Responda rápido para ganhar bônus.', controls: 'Clique na resposta.',
    build: function (g) {
      room(g, 'neon');
      var qs = QUIZ.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 10), qi = 0, opts, ans = null, qt = R.time;
      function next() { var q = qs[qi]; opts = q[1].slice().sort(function () { return Math.random() - 0.5; }); ans = null; qt = R.time; if (P) P.dirty = true; }
      next();
      var P = screen(g, { w: 1.6, h: 1.1 }, function (x, P) {
        var q = qs[qi];
        ui.text(x, 'Pergunta ' + (qi + 1) + '/10', 40, 40, 22, { color: 'rgba(255,255,255,0.6)' });
        ui.wrap(x, q[0], 40, 70, P.cw - 80, 34, 44, { color: '#fff', weight: 800 });
        opts.forEach(function (o, i) {
          var ok = o === q[1][0], fill = ans === null ? undefined : ok ? '#30a46c' : ans === o ? '#e5484d' : undefined;
          P.button('o' + i, 40 + (i % 2) * ((P.cw - 80) / 2 + 10), 200 + Math.floor(i / 2) * 110, (P.cw - 80) / 2 - 10, 96, o, function () {
            if (ans !== null) return; ans = o;
            if (ok) { var bonus = Math.max(0, Math.round(10 - (R.time - qt))); g.addScore(10 + bonus); R.sfx.play('coin'); } else R.sfx.play('error');
            g.after(1.3, function () { qi++; if (qi >= qs.length) g.end('Quiz completo!'); else next(); });
          }, { r: 22, px: 28, fill: fill });
        });
      });
      g.hud({ y: 2.25, z: -1.75, scale: 0.7 });
    } });

  // ---------------------------------------------------------------- Teste de Reflexo
  R.game({ id: 'reflexo', name: 'Teste de Reflexo', cat: 'Puzzle', c1: '#30a46c', c2: '#e5484d', glyph: '⚡',
    desc: 'Espere ficar verde e clique o mais rápido possível. Média de 5 tentativas (menor é melhor).', controls: 'Aperte o gatilho quando ficar verde.',
    build: function (g) {
      room(g);
      var state = 'wait', t = 0, times = [], goT = 0;
      var P = screen(g, { w: 1.6, h: 1.0 }, function (x, P) {
        var col = state === 'go' ? '#30a46c' : state === 'early' ? '#ff9f0a' : '#e5484d';
        ui.roundRect(x, 20, 20, P.cw - 40, P.ch - 40, 30); x.fillStyle = col; x.fill();
        var txt = state === 'go' ? 'AGORA!' : state === 'early' ? 'Cedo demais!' : state === 'show' ? times[times.length - 1] + ' ms' : 'Espere o verde…';
        ui.text(x, txt, P.cw / 2, P.ch / 2 - 20, 70, { align: 'center', weight: 800 });
        ui.text(x, 'Tentativa ' + Math.min(5, times.length + 1) + '/5', P.cw / 2, P.ch / 2 + 60, 26, { align: 'center' });
        P.area('all', 0, 0, P.cw, P.ch, function () { hit(); });
      });
      function arm() { state = 'wait'; t = 1.2 + Math.random() * 2.5; P.dirty = true; }
      function hit() {
        if (state === 'go') { var ms = Math.round((performance.now() - goT)); times.push(ms); state = 'show'; P.dirty = true; R.sfx.play('click');
          if (times.length >= 5) { var avg = Math.round(times.reduce(function (a, b) { return a + b; }, 0) / 5); g.setScore(avg); g.end('Média: ' + avg + ' ms', true); } else g.after(1.2, arm); }
        else if (state === 'wait') { state = 'early'; P.dirty = true; R.sfx.play('error'); g.after(1.2, arm); }
      }
      g.on('press', function () { hit(); });
      g.on('update', function (dt) { if (state === 'wait') { t -= dt / R.timeScale; if (t <= 0) { state = 'go'; goT = performance.now(); P.dirty = true; R.sfx.play('notify'); } } });
      arm();
      g.hud({ y: 2.2, z: -1.75, scale: 0.7 }); g.hudState.scoreLabel = 'ms';
    } });

  // ---------------------------------------------------------------- Empilha Blocos
  R.game({ id: 'empilha', name: 'Empilha Blocos', cat: 'Puzzle', c1: '#ff7ad9', c2: '#2de2ff', glyph: '🧊',
    desc: 'Solte o bloco no tempo certo. O que sobrar para fora é cortado!', controls: 'Aperte o gatilho para soltar o bloco.',
    build: function (g) {
      g.env({ sky: 'sunset', ground: false });
      var tower = new THREE.Group(); tower.position.set(0, 0, -2.2); g.add(tower);
      var H = 0.12, top = { x: 0, z: 0, w: 0.6, d: 0.6 }, level = 0, cur, axis = 'x', dir = 1, speed = 0.7, alive = true;
      var base = M.box(0.6, 1.0, 0.6, '#3a3f4b'); base.position.y = 0.5; tower.add(base);
      function color(i) { return new THREE.Color().setHSL((i * 0.04) % 1, 0.7, 0.6).getStyle(); }
      function spawn() {
        level++; axis = level % 2 ? 'x' : 'z';
        cur = M.box(top.w, H, top.d, color(level)); cur.position.set(axis === 'x' ? -1 : top.x, 1.0 + level * H - H / 2, axis === 'z' ? -1 : top.z); tower.add(cur); dir = 1;
        var targetY = 1.0 + level * H; tower.userData.ty = -(targetY - 1.4);
      }
      spawn();
      g.on('press', function () {
        if (!alive) return;
        var pos = cur.position[axis], prev = top[axis], size = axis === 'x' ? top.w : top.d, delta = pos - prev, over = Math.abs(delta);
        if (over >= size) { alive = false; R.sfx.play('lose'); g.end('Errou! Altura ' + (level - 1)); return; }
        var ns = size - over, nc = prev + delta / 2;
        if (over < 0.015) { ns = size; nc = prev; R.sfx.play('coin'); g.burst(cur.position.clone().add(tower.position), '#fff', 10, 2); } else R.sfx.play('thud', 0.6);
        cur.geometry = new THREE.BoxBufferGeometry(axis === 'x' ? ns : top.w, H, axis === 'z' ? ns : top.d);
        cur.position[axis] = nc;
        if (axis === 'x') { top.w = ns; top.x = nc; } else { top.d = ns; top.z = nc; }
        g.setScore(level); speed = Math.min(2, speed + 0.04); spawn();
      });
      g.on('update', function (dt) {
        if (!alive) return;
        cur.position[axis] += dir * speed * dt; if (Math.abs(cur.position[axis]) > 1) dir = -Math.sign(cur.position[axis]);
        tower.position.y += ((tower.userData.ty || 0) - tower.position.y) * Math.min(1, dt * 3);
      });
      g.hud({ y: 2.3, z: -2.5, scale: 0.8 }); g.hudState.scoreLabel = 'Altura';
    } });

  // ---------------------------------------------------------------- Cobrinha no Paredão
  R.game({ id: 'cobrinha', name: 'Cobrinha no Paredão', cat: 'Puzzle', c1: '#30a46c', c2: '#1b1c2b', glyph: '🐍',
    desc: 'A cobra vai em direção ao seu laser. Coma as frutas sem bater em si mesma.', controls: 'Aponte para onde a cobra deve ir.',
    build: function (g) {
      g.env({ sky: 'night', ground: '#1b1c2b' });
      var COLS = 24, ROWS = 16, S = 0.1, wall = new THREE.Group(); wall.position.set(0, 1.5, -2.2); g.add(wall);
      var bg = new THREE.Mesh(M.geo.plane(COLS * S + 0.04, ROWS * S + 0.04), R.mat.basic('#0f1720')); bg.position.z = -0.01; wall.add(bg);
      var snake = [[12, 8], [11, 8], [10, 8]], dir = [1, 0], segs = [], food = null, t = 0, alive = true;
      var segGeo = M.geo.box(S * 0.9, S * 0.9, 0.05);
      function cellPos(c, r) { return new V((c - COLS / 2 + 0.5) * S, (ROWS / 2 - r - 0.5) * S, 0.02); }
      function placeFood() { do { food = [Math.floor(Math.random() * COLS), Math.floor(Math.random() * ROWS)]; } while (snake.some(function (s) { return s[0] === food[0] && s[1] === food[1]; })); fm.position.copy(cellPos(food[0], food[1])); }
      var fm = M.sphere(S * 0.4, '#e5484d', 8); wall.add(fm); placeFood();
      function sync() { while (segs.length < snake.length) { var m = new THREE.Mesh(segGeo, R.mat.lambert(segs.length ? '#30a46c' : '#7dff9c')); wall.add(m); segs.push(m); } for (var i = 0; i < snake.length; i++) segs[i].position.copy(cellPos(snake[i][0], snake[i][1])); }
      sync();
      var plane = new THREE.Plane(new V(0, 0, 1), 2.2 - 0.02), tmp = new V();
      g.on('update', function (dt) {
        if (!alive) return;
        var p = R.input.pointers[0];
        if (p.ray.ray.intersectPlane(plane, tmp)) {
          R.input.setLaser(p, p.origin.distanceTo(tmp), tmp.clone());
          var h = cellPos(snake[0][0], snake[0][1]).add(wall.position), dx = tmp.x - h.x, dy = -(tmp.y - h.y);
          var nd = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
          if (Math.abs(dx) + Math.abs(dy) > S * 0.6 && !(nd[0] === -dir[0] && nd[1] === -dir[1])) dir = nd;
        }
        t += dt; var step = Math.max(0.08, 0.2 - snake.length * 0.003);
        if (t < step) return; t = 0;
        var nh = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
        if (nh[0] < 0 || nh[1] < 0 || nh[0] >= COLS || nh[1] >= ROWS || snake.some(function (s) { return s[0] === nh[0] && s[1] === nh[1]; })) { alive = false; R.sfx.play('lose'); g.end('Bateu! Tamanho ' + snake.length); return; }
        snake.unshift(nh);
        if (nh[0] === food[0] && nh[1] === food[1]) { g.addScore(1); R.sfx.play('coin'); placeFood(); } else snake.pop();
        sync();
      });
      g.hud({ y: 2.65, z: -2.2, scale: 0.8 });
    } });

  // ---------------------------------------------------------------- Quebra-Tijolos
  R.game({ id: 'tijolos', name: 'Quebra-Tijolos', cat: 'Ação', c1: '#ff9f43', c2: '#7a5cff', glyph: '🧱',
    desc: 'Rebata a bola com a raquete e destrua todos os tijolos no paredão.', controls: 'A raquete segue seu laser na horizontal.',
    build: function (g) {
      g.env({ sky: 'space', ground: false, stars: 800 });
      var W = 2.4, H = 1.7, wall = new THREE.Group(); wall.position.set(0, 1.5, -2.4); g.add(wall);
      var bg = new THREE.Mesh(M.geo.plane(W + 0.1, H + 0.1), R.mat.basic('#0d1020')); bg.position.z = -0.02; wall.add(bg);
      var bricks = [];
      function build() { for (var r = 0; r < 6; r++) for (var c = 0; c < 10; c++) { var b = M.box(W / 10 - 0.02, 0.07, 0.05, null, R.mat.lambert(new THREE.Color().setHSL(r / 7, 0.75, 0.55).getStyle())); b.position.set(-W / 2 + (c + 0.5) * W / 10, H / 2 - 0.15 - r * 0.09, 0); wall.add(b); bricks.push(b); } }
      build();
      var pad = M.box(0.35, 0.05, 0.05, '#2de2ff'); pad.position.set(0, -H / 2 + 0.08, 0); wall.add(pad);
      var ball = M.sphere(0.03, '#fff', 10); wall.add(ball); var v = new V(), lives = 3, stuck = true;
      var plane = new THREE.Plane(new V(0, 0, 1), 2.4), tmp = new V();
      g.on('press', function () { if (stuck) { stuck = false; v.set(0.6, 1.4, 0); } });
      g.on('update', function (dt) {
        var p = R.input.pointers[0];
        if (p.ray.ray.intersectPlane(plane, tmp)) { pad.position.x = Math.max(-W / 2 + 0.17, Math.min(W / 2 - 0.17, tmp.x - wall.position.x)); R.input.setLaser(p, p.origin.distanceTo(tmp), tmp.clone()); }
        if (stuck) { ball.position.set(pad.position.x, pad.position.y + 0.06, 0); return; }
        var sub = 3; for (var s = 0; s < sub; s++) {
          ball.position.addScaledVector(v, dt / sub); var b = ball.position;
          if (Math.abs(b.x) > W / 2 - 0.03) { v.x = -v.x; b.x = Math.sign(b.x) * (W / 2 - 0.03); R.sfx.play('tick'); }
          if (b.y > H / 2 - 0.03) { v.y = -Math.abs(v.y); R.sfx.play('tick'); }
          if (v.y < 0 && b.y < pad.position.y + 0.055 && b.y > pad.position.y - 0.03 && Math.abs(b.x - pad.position.x) < 0.2) { v.y = Math.abs(v.y); v.x = (b.x - pad.position.x) * 8; v.setLength(Math.min(2.6, v.length() * 1.02)); R.sfx.play('hit', 0.3); }
          for (var i = bricks.length - 1; i >= 0; i--) { var br = bricks[i]; if (Math.abs(b.x - br.position.x) < W / 20 + 0.02 && Math.abs(b.y - br.position.y) < 0.055) { v.y = -v.y; wall.remove(br); bricks.splice(i, 1); g.addScore(10); R.sfx.play('pop'); break; } }
          if (b.y < -H / 2) { lives--; stuck = true; R.sfx.play('lose'); g.setInfo('Vidas: ' + lives); if (lives <= 0) g.end('Sem vidas!'); break; }
        }
        if (!bricks.length) { R.sfx.play('win'); build(); stuck = true; }
      });
      g.hud({ y: 2.7, z: -2.4, scale: 0.8, info: 'Gatilho lança a bola • Vidas: 3' });
    } });
})();
