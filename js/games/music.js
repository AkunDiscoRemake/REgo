/* Música: piano, bateria rítmica, teremim, beat maker, Neon Beats */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, M = R.models, ui = R.ui;
  var V = THREE.Vector3;
  function freq(n) { return 440 * Math.pow(2, (n - 69) / 12); } // n = nota MIDI

  function stage(g) {
    g.env({ sky: 'neon', ground: '#140026', stars: 600 });
    for (var i = 0; i < 6; i++) { var l = M.box(0.06, 4, 0.06, null, R.mat.basic(i % 2 ? '#ff2dbd' : '#2de2ff')); var a = (i / 6 - 0.5) * 2.4; l.position.set(Math.sin(a) * 6, 2, -Math.cos(a) * 6); g.add(l); }
  }

  // ---------------------------------------------------------------- Piano
  var SONG = [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60, 67, 67, 65, 65, 64, 64, 62, 67, 67, 65, 65, 64, 64, 62, 60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60];
  R.game({ id: 'piano', name: 'Piano Gigante', cat: 'Música', featured: true, c1: '#111', c2: '#f5f5f5', glyph: '🎹',
    desc: 'Duas oitavas para tocar livre — ou siga as teclas brilhantes e toque "Brilha, Brilha Estrelinha".', controls: 'Aponte para a tecla e aperte o gatilho.',
    build: function (g) {
      stage(g);
      var keys = [], white = [0, 2, 4, 5, 7, 9, 11], wi = 0, piano = new THREE.Group(); piano.position.set(0, 0.95, -1.15); piano.rotation.x = 0.35; g.add(piano);
      for (var n = 60; n < 84; n++) {
        var s = (n - 60) % 12, isW = white.indexOf(s) >= 0, k;
        if (isW) { k = M.box(0.075, 0.03, 0.36, '#f5f5f5'); k.position.set((wi - 6.5) * 0.08, 0, 0); wi++; }
        else { k = M.box(0.045, 0.04, 0.22, '#111'); k.position.set((wi - 7) * 0.08, 0.025, -0.07); }
        k.userData = { t: 'key', n: n, base: k.material, lit: R.mat.basic(isW ? '#7fd0ff' : '#2d7cf6'), guide: R.mat.basic('#ffd23f'), down: 0 };
        piano.add(k); keys.push(k);
      }
      var body = M.box(1.25, 0.1, 0.45, '#1a1a1a'); body.position.set(0, -0.07, 0); piano.add(body);
      var gi = 0, guide = true;
      function mark() { keys.forEach(function (k) { k.material = k.userData.down > 0 ? k.userData.lit : guide && k.userData.n === SONG[gi] ? k.userData.guide : k.userData.base; }); }
      mark();
      g.on('press', function (p) {
        var h = g.ray(p, keys, false); if (!h) return; var k = h.object;
        R.sfx.play('note', freq(k.userData.n)); k.userData.down = 0.25; k.position.y -= 0.01;
        if (guide && k.userData.n === SONG[gi]) { gi++; g.addScore(1); if (gi >= SONG.length) { gi = 0; R.sfx.play('win'); R.ui.toast('🎵 Música completa!'); } }
        mark();
      });
      g.on('update', function (dt) { var ch = false; keys.forEach(function (k) { if (k.userData.down > 0) { k.userData.down -= dt; if (k.userData.down <= 0) { k.position.y += 0.01; ch = true; } } }); if (ch) mark(); });
      var P = new ui.Panel({ w: 0.6, h: 0.14, res: 500, render: function (x, P) { ui.glass(x, 0, 0, P.cw, P.ch, 30); P.button('g', 10, 8, P.cw - 20, P.ch - 16, guide ? '⭐ Guia ligado' : 'Toque livre', function () { guide = !guide; mark(); }, { active: guide, px: 24 }); } });
      P.mesh.position.set(0, 1.55, -1.5); g.add(P.mesh);
      g.hud({ y: 2.1, z: -1.8, scale: 0.7, info: 'Siga as teclas amarelas' }); g.hudState.scoreLabel = 'Notas';
    } });

  // ---------------------------------------------------------------- Bateria rítmica
  R.game({ id: 'bateria', name: 'Bateria no Ritmo', cat: 'Música', c1: '#e23b3b', c2: '#1b1c2b', glyph: '🥁',
    desc: 'O tambor que acender é o próximo: acerte no tempo! O ritmo acelera. Ou só toque livre.', controls: 'Aponte para o tambor e aperte o gatilho (ou balance).',
    build: function (g) {
      stage(g);
      var DR = [['Bumbo', 60, '#e23b3b', -0.0, 0.45, -1.0, 0.28], ['Caixa', 1800, '#f5f5f5', -0.38, 0.85, -0.85, 0.18], ['Chimbal', 6000, '#ffd23f', -0.7, 1.05, -0.7, 0.16], ['Tom 1', 400, '#2d7cf6', -0.18, 1.1, -1.05, 0.15], ['Tom 2', 300, '#2fa84f', 0.18, 1.1, -1.05, 0.15], ['Surdo', 200, '#7a5cff', 0.45, 0.8, -0.85, 0.2], ['Prato', 8000, '#ffb347', 0.75, 1.35, -0.75, 0.22]];
      var drums = [];
      DR.forEach(function (d, i) {
        var m = d[0] === 'Prato' || d[0] === 'Chimbal' ? M.cyl(d[6], d[6] * 0.9, 0.015, '#d4af37', 16) : M.cyl(d[6], d[6], i === 0 ? 0.35 : 0.18, d[2], 16);
        m.position.set(d[3], d[4], d[5]); if (i === 0) m.rotation.x = Math.PI / 2; else m.rotation.x = 0.4;
        m.userData = { t: 'drum', i: i, base: m.material, lit: R.mat.basic('#7dff9c'), f: d[1] }; g.add(m); drums.push(m);
      });
      var target = -1, beat = 0, bpm = 80, combo = 0, window_ = 0;
      function hit(i) {
        var d = drums[i]; R.sfx.play('drum', d.userData.f); d.scale.setScalar(1.1); setTimeout(function () { d.scale.setScalar(1); }, 80);
        if (i === target) { combo++; g.addScore(1 + Math.floor(combo / 5)); target = -1; d.material = d.userData.base; g.setInfo('Combo x' + combo); }
        else if (target >= 0) { combo = 0; g.setInfo('Ops! combo 0'); }
      }
      g.on('press', function (p) { var h = g.ray(p, drums, false); if (h) hit(h.object.userData.i); });
      g.on('update', function (dt) {
        beat -= dt; if (beat <= 0) {
          beat = 60 / bpm; if (target >= 0) { drums[target].material = drums[target].userData.base; combo = 0; }
          target = Math.floor(Math.random() * drums.length); drums[target].material = drums[target].userData.lit; R.sfx.play('tick'); bpm = Math.min(150, bpm + 1);
        }
      });
      g.hud({ y: 2.1, z: -1.8, scale: 0.7 }); g.round(60);
    } });

  // ---------------------------------------------------------------- Teremim
  R.game({ id: 'teremim', name: 'Teremim Cósmico', cat: 'Música', c1: '#05061a', c2: '#2de2ff', glyph: '🌊',
    desc: 'Instrumento sem toque: altura do laser = nota, lado = vibrato. Segure o gatilho para soar. Escala pentatônica para soar sempre bonito.', controls: 'Segure o gatilho e mova o controle para cima/baixo.',
    build: function (g) {
      g.env({ sky: 'space', ground: false, stars: 1500 });
      var ring = new THREE.Mesh(M.geo.torus(1.2, 0.02, 6, 48), R.mat.glow('#2de2ff')); ring.position.set(0, 1.6, -3); g.add(ring);
      var orbs = []; for (var i = 0; i < 30; i++) { var o = M.sphere(0.04, '#fff', 6, R.mat.glow('#7fd0ff')); o.position.set(0, 1.6, -3); g.add(o); orbs.push(o); }
      var osc = null, pent = [0, 2, 4, 7, 9], played = 0, note = 0;
      g.on('press', function () { if (!osc) osc = R.sfx.osc('triangle'); });
      g.on('release', function () { if (osc) { osc.stop(); osc = null; } });
      g.on('dispose', function () { if (osc) osc.stop(); });
      g.on('update', function (dt) {
        var p = R.input.pointers[0], y = Math.max(-0.6, Math.min(0.8, p.dir.y)), t = (y + 0.6) / 1.4;
        var step = Math.floor(t * 15), n = 48 + Math.floor(step / 5) * 12 + pent[step % 5];
        var f = freq(n); note = n;
        if (osc) { osc.set(f, 0.25, Math.abs(p.dir.x) * 20); played += dt; if (Math.floor(played) > g.score) g.setScore(Math.floor(played)); }
        ring.scale.setScalar(1 + (osc ? Math.sin(R.time * f / 40) * 0.05 : 0)); ring.material.color.setHSL(t, 0.9, 0.6);
        for (var i = 0; i < orbs.length; i++) { var a = i / orbs.length * Math.PI * 2 + R.time * (osc ? 2 : 0.3); var r = 1.2 + (osc ? Math.sin(R.time * 6 + i) * 0.3 * t : 0); orbs[i].position.set(Math.cos(a) * r, 1.6 + Math.sin(a) * r, -3); }
        g.setInfo(osc ? '♪ nota ' + ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'][n % 12] : 'Segure o gatilho');
      });
      g.hud({ y: 3.2, z: -3 }); g.hudState.scoreLabel = 'Segundos';
    } });

  // ---------------------------------------------------------------- Beat Maker
  R.game({ id: 'beatmaker', name: 'Beat Maker', cat: 'Música', c1: '#ff2dbd', c2: '#7a5cff', glyph: '🎛',
    desc: 'Sequenciador de 16 passos com 6 instrumentos. Monte sua batida e ajuste o andamento.', controls: 'Clique nas casas para ligar/desligar.',
    build: function (g) {
      stage(g);
      var INS = [['Bumbo', function () { R.sfx.play('drum', 60); }], ['Caixa', function () { R.sfx.noise(0.15, 0.3, 3000); }], ['Chimbal', function () { R.sfx.noise(0.05, 0.15, 9000); }],
        ['Baixo', function (s) { R.sfx.tone([41, 41, 44, 39][Math.floor(s / 4)] && freq([41, 41, 44, 39][Math.floor(s / 4)]), 0.2, 'sawtooth', 0.12, 0.98); }],
        ['Lead', function (s) { R.sfx.tone(freq([72, 75, 77, 79, 82, 79, 77, 75][s % 8]), 0.15, 'square', 0.06); }], ['Palma', function () { R.sfx.noise(0.08, 0.25, 1500); R.sfx.noise(0.08, 0.2, 1500, 0.02); }]];
      var grid = INS.map(function (_, r) { var row = []; for (var s = 0; s < 16; s++) row.push(r === 0 ? s % 4 === 0 : r === 2 ? s % 2 === 0 : r === 1 ? s % 8 === 4 : false); return row; });
      var step = 0, t = 0, bpm = 110, playing = true;
      var P = new ui.Panel({ w: 1.9, h: 1.0, res: 520, render: function (x, P) {
        ui.glass(x, 0, 0, P.cw, P.ch, 36);
        var cw = (P.cw - 170) / 16, ch = (P.ch - 140) / INS.length;
        INS.forEach(function (ins, r) {
          ui.text(x, ins[0], 20, 40 + r * ch + ch / 2, 20, { weight: 700 });
          for (var s = 0; s < 16; s++) (function (r, s) {
            var on = grid[r][s], cur = s === step;
            P.button('c' + r + '_' + s, 140 + s * cw + 2, 40 + r * ch + 3, cw - 4, ch - 6, '', function () { grid[r][s] = !grid[r][s]; }, { r: 8, fill: on ? new THREE.Color().setHSL(r / 6, 0.8, cur ? 0.75 : 0.55).getStyle() : cur ? 'rgba(255,255,255,0.3)' : s % 4 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)' });
          })(r, s);
        });
        var by = P.ch - 84;
        P.button('play', 20, by, 160, 60, playing ? '⏸ Pausar' : '▶ Tocar', function () { playing = !playing; }, { active: playing, px: 22 });
        P.button('slow', 200, by, 70, 60, '−', function () { bpm = Math.max(60, bpm - 10); }, { px: 30 });
        ui.text(x, bpm + ' BPM', 330, by + 30, 24, { align: 'center', weight: 700 });
        P.button('fast', 390, by, 70, 60, '+', function () { bpm = Math.min(200, bpm + 10); }, { px: 30 });
        P.button('clr', 480, by, 160, 60, 'Limpar', function () { grid.forEach(function (row) { for (var s = 0; s < 16; s++) row[s] = false; }); }, { px: 22 });
        P.button('rnd', 660, by, 200, 60, '🎲 Aleatório', function () { grid.forEach(function (row, r) { for (var s = 0; s < 16; s++) row[s] = Math.random() < [0.3, 0.15, 0.5, 0.25, 0.2, 0.1][r]; }); }, { px: 22 });
      } });
      P.mesh.position.set(0, 1.45, -1.6); g.add(P.mesh);
      g.on('update', function (dt) {
        if (!playing) return; t -= R.rawDt; if (t > 0) return; t = 60 / bpm / 4;
        step = (step + 1) % 16; for (var r = 0; r < INS.length; r++) if (grid[r][step]) INS[r][1](step);
        P.dirty = true;
      });
      g.hud({ y: 2.3, z: -1.7, scale: 0.6, info: 'Monte sua batida!' }); g.hudState.label = false;
    } });

  // ---------------------------------------------------------------- Neon Beats (ritmo com sabre)
  R.game({ id: 'neonbeats', name: 'Neon Beats', cat: 'Música', featured: true, c1: '#ff2dbd', c2: '#2de2ff', glyph: '⚔',
    desc: 'Cubos vêm no ritmo da batida: corte-os com o sabre de luz balançando o controle. Combos multiplicam!', controls: 'Balance o controle para cortar os cubos quando chegarem.',
    build: function (g) {
      g.env({ sky: 'neon', ground: false, stars: 800 });
      for (var i = 0; i < 20; i++) { var rl = M.box(0.04, 0.04, 2, null, R.mat.basic(i % 2 ? '#ff2dbd' : '#2de2ff')); rl.position.set(i % 2 ? 1.2 : -1.2, 0.2, -i * 2); g.add(rl); }
      var floor = new THREE.Mesh(M.geo.plane(2.4, 50), R.mat.basic('#12002a')); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -20); g.add(floor);
      var sabers = g.holdAll(function (i) { var s = new THREE.Group(); var h = M.cyl(0.02, 0.02, 0.15, '#333', 6); h.rotation.x = Math.PI / 2; var b = M.box(0.025, 0.025, 1.0, null, R.mat.glow(i === 2 ? '#2de2ff' : '#ff2dbd')); b.position.z = -0.55; s.add(h, b); return s; });
      var cubes = [], bpm = 100, beat = 0, combo = 0, misses = 0, speed = 8, tmpA = new V(), tmpB = new V(), line = new THREE.Line3();
      function spawn() {
        var c = M.box(0.35, 0.35, 0.35, null, R.mat.lambert(Math.random() < 0.5 ? '#ff2dbd' : '#2de2ff'));
        c.position.set((Math.floor(Math.random() * 4) - 1.5) * 0.4, 0.9 + Math.floor(Math.random() * 3) * 0.35, -30); c.userData.t = 'cube'; g.add(c); cubes.push(c);
      }
      g.on('update', function (dt) {
        beat -= dt; if (beat <= 0) { beat = 60 / bpm; R.sfx.play('drum', 60); if (Math.random() < 0.8) spawn(); if (Math.random() < 0.25) spawn(); bpm = Math.min(150, bpm + 0.3); }
        var ps = R.input.pointers;
        for (var i = cubes.length - 1; i >= 0; i--) {
          var c = cubes[i]; c.position.z += speed * dt;
          for (var k = 0; k < ps.length; k++) {
            var p = ps[k]; if (p.angVel < 2.0) continue;
            p.obj.localToWorld(tmpA.set(0, 0, -0.1)); p.obj.localToWorld(tmpB.set(0, 0, -1.05 * R.input.giant)); line.set(tmpA, tmpB);
            if (line.closestPointToPoint(c.position, true, new V()).distanceTo(c.position) < 0.3) {
              combo++; g.addScore(10 * (1 + Math.floor(combo / 8))); R.sfx.play('slice'); g.burst(c.position, c.material.color.getStyle(), 12, 3);
              g.root.remove(c); cubes.splice(i, 1); c = null; break;
            }
          }
          if (c && c.position.z > 0.8) { g.root.remove(c); cubes.splice(i, 1); combo = 0; misses++; R.sfx.play('error'); if (misses >= 15) g.end('Muitos cubos perdidos!'); }
        }
        g.setInfo('Combo x' + (1 + Math.floor(combo / 8)) + ' • ' + combo + ' • erros ' + misses + '/15');
      });
      g.hud({ y: 2.6, z: -3 }); g.round(90);
    } });
})();
