/* Criativo e relaxante: pintura 3D, construtor, fogos, aquário, sistema solar, respiração, montanha-russa, pescaria, bolhas */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, M = R.models, ui = R.ui, G = R.G;
  var V = THREE.Vector3;
  var PALETTE = ['#ff4f4f', '#ff9f43', '#ffd23f', '#7dff9c', '#2de2ff', '#4b8ff8', '#b38cff', '#ff7ad9', '#ffffff', '#222222'];

  function palettePanel(g, st, extra) {
    var P = new ui.Panel({ w: 1.1, h: 0.36, res: 480, render: function (x, P) {
      ui.glass(x, 0, 0, P.cw, P.ch, 30);
      var s = (P.cw - 30) / PALETTE.length;
      PALETTE.forEach(function (c, i) { P.button('c' + i, 15 + i * s + 3, 14, s - 6, s - 6, '', function () { st.color = c; }, { fill: c, r: (s - 6) / 2 }); if (st.color === c) { x.lineWidth = 5; x.strokeStyle = '#fff'; x.beginPath(); x.arc(15 + i * s + s / 2, 14 + (s - 6) / 2, s / 2, 0, 7); x.stroke(); } });
      if (extra) extra(x, P);
    } });
    g.add(P.mesh); return P;
  }
  function beltPlace(P, dist, down) {
    var yaw = R.player.yaw + R.player.yawOffset;
    P.mesh.position.set(R.player.x - Math.sin(yaw) * dist, R.player.y + R.settings.height - down, R.player.z - Math.cos(yaw) * dist);
    P.mesh.rotation.set(-0.7, yaw, 0, 'YXZ');
  }

  // ---------------------------------------------------------------- Pintura 3D
  R.game({ id: 'pintura', name: 'Pintura 3D', cat: 'Relax', featured: true, c1: '#ff7ad9', c2: '#2de2ff', glyph: '🖌',
    desc: 'Pinte fitas de luz no ar ao seu redor. Escolha cores e espessura no painel abaixo.', controls: 'Segure o gatilho para desenhar • olhe para baixo para a paleta.',
    build: function (g) {
      g.env({ sky: 'night', ground: '#1b1c2b', grid: 1, stars: 800 });
      var st = { color: '#2de2ff', size: 0.012, glow: true }, strokes = [], cur = {};
      var P = palettePanel(g, st, function (x, P) {
        var by = 130;
        [['Fina', 0.006], ['Média', 0.012], ['Grossa', 0.03]].forEach(function (b, i) { P.button('s' + i, 15 + i * 110, by, 100, 50, b[0], function () { st.size = b[1]; }, { active: st.size === b[1], px: 18 }); });
        P.button('glow', 350, by, 110, 50, st.glow ? '✨ Neon' : 'Fosco', function () { st.glow = !st.glow; }, { active: st.glow, px: 18 });
        P.button('undo', 15, by + 60, 160, 50, '↶ Desfazer', function () { var s = strokes.pop(); if (s) g.root.remove(s); }, { px: 18 });
        P.button('clr', 185, by + 60, 160, 50, '🗑 Limpar', function () { strokes.forEach(function (s) { g.root.remove(s); }); strokes = []; }, { px: 18 });
        P.button('shot', 355, by + 60, 105, 50, '📷', function () { R.capture.take(); }, { px: 22 });
      });
      var MAX = 1500, tmp = new V(), up = new V();
      g.on('press', function (p) {
        var pos = new Float32Array(MAX * 2 * 3), geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        var idx = []; for (var i = 0; i < MAX - 1; i++) { var a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } geo.setIndex(idx); geo.setDrawRange(0, 0);
        var mesh = new THREE.Mesh(geo, st.glow ? new THREE.MeshBasicMaterial({ color: st.color, side: THREE.DoubleSide, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }) : new THREE.MeshBasicMaterial({ color: st.color, side: THREE.DoubleSide }));
        mesh.frustumCulled = false; g.add(mesh); strokes.push(mesh);
        cur[p.id] = { mesh: mesh, n: 0, last: null, size: st.size };
      });
      g.on('release', function (p) { delete cur[p.id]; });
      g.on('update', function () {
        beltPlace(P, 0.9, 0.85);
        for (var id in cur) {
          var c = cur[id], p = G.findP(id); if (!p || c.n >= MAX) continue;
          p.tip(0.5, tmp); if (c.last && c.last.distanceTo(tmp) < 0.012) continue;
          up.set(0, 1, 0).applyQuaternion(p.quat).multiplyScalar(c.size * R.input.giant);
          var arr = c.mesh.geometry.attributes.position.array, o = c.n * 6;
          arr[o] = tmp.x + up.x; arr[o + 1] = tmp.y + up.y; arr[o + 2] = tmp.z + up.z; arr[o + 3] = tmp.x - up.x; arr[o + 4] = tmp.y - up.y; arr[o + 5] = tmp.z - up.z;
          c.n++; c.last = tmp.clone(); c.mesh.geometry.attributes.position.needsUpdate = true; c.mesh.geometry.setDrawRange(0, Math.max(0, (c.n - 1) * 6));
        }
      });
      g.locomotion({ speed: 2 });
    } });

  // ---------------------------------------------------------------- Construtor de Blocos
  R.game({ id: 'construtor', name: 'Construtor de Blocos', cat: 'Relax', featured: true, c1: '#7cc576', c2: '#8a5a2a', glyph: '🏗',
    desc: 'Construa com blocos coloridos numa grade. Coloque, remova e salve sua construção.', controls: 'Gatilho coloca/remove • painel abaixo para cor e modo • touchpad anda.',
    build: function (g) {
      g.env({ sky: 'day', ground: '#7cc576', grid: 1, trees: 20, clouds: 8, mountains: true });
      var S = 0.3, blocks = {}, list = [], st = { color: '#ff9f43', mode: 'add' }, geo = M.geo.box(S, S, S);
      var ghost = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.35, depthWrite: false })); g.add(ghost);
      var ground = new THREE.Mesh(M.geo.plane(60, 60), new THREE.MeshBasicMaterial({ visible: false })); ground.rotation.x = -Math.PI / 2; g.add(ground);
      function key(a, b, c) { return a + ',' + b + ',' + c; }
      function add(a, b, c, col) { var k = key(a, b, c); if (blocks[k] || list.length > 600) return; var m = new THREE.Mesh(geo, R.mat.lambert(col)); m.position.set(a * S, b * S + S / 2, c * S); m.userData.cell = [a, b, c]; m.userData.col = col; g.add(m); blocks[k] = m; list.push(m); }
      function del(m) { delete blocks[key.apply(null, m.userData.cell)]; list.splice(list.indexOf(m), 1); g.root.remove(m); }
      var saved = R.store.get('builder.save', null);
      if (saved) saved.forEach(function (b) { add(b[0], b[1], b[2], b[3]); }); else for (var i = -2; i <= 2; i++) add(i, 0, -6, '#8a5a2a');
      var P = palettePanel(g, st, function (x, P) {
        var by = 130;
        P.button('add', 15, by, 140, 50, '➕ Colocar', function () { st.mode = 'add'; }, { active: st.mode === 'add', px: 18 });
        P.button('del', 165, by, 140, 50, '⛏ Remover', function () { st.mode = 'del'; }, { active: st.mode === 'del', px: 18 });
        P.button('save', 315, by, 145, 50, '💾 Salvar', function () { R.store.set('builder.save', list.map(function (m) { return m.userData.cell.concat([m.userData.col]); })); R.os.notify('🏗 Construção salva (' + list.length + ' blocos)'); }, { px: 18 });
        P.button('clr', 15, by + 60, 200, 50, '🗑 Limpar tudo', function () { list.slice().forEach(del); }, { px: 18 });
        ui.text(x, list.length + ' blocos', 300, by + 85, 20, { color: 'rgba(255,255,255,0.7)' });
      });
      var target = null;
      function pick(p) {
        var hits = p.ray.intersectObjects(list.concat([ground]), false); if (!hits.length || hits[0].distance > 12) return null;
        var h = hits[0]; R.input.setLaser(p, h.distance, h.point);
        if (h.object === ground) return { add: [Math.round(h.point.x / S), 0, Math.round(h.point.z / S)] };
        var c = h.object.userData.cell, n = h.face.normal;
        return { add: [c[0] + Math.round(n.x), c[1] + Math.round(n.y), c[2] + Math.round(n.z)], obj: h.object };
      }
      g.on('press', function (p) { var t = pick(p); if (!t) return; if (st.mode === 'add') { if (t.add[1] >= 0) { add(t.add[0], t.add[1], t.add[2], st.color); R.sfx.play('pop', 0.8); } } else if (t.obj) { del(t.obj); R.sfx.play('thud', 0.4); } P.dirty = true; });
      g.on('update', function () {
        beltPlace(P, 0.9, 0.85);
        target = pick(R.input.pointers[0]);
        ghost.visible = !!target && (st.mode === 'add' || !!target.obj);
        if (ghost.visible) { var c = st.mode === 'add' ? target.add : target.obj.userData.cell; ghost.position.set(c[0] * S, c[1] * S + S / 2, c[2] * S); ghost.material.color.set(st.mode === 'add' ? st.color : '#ff4f4f'); }
      });
      g.locomotion({ speed: 2.5 });
    } });

  // ---------------------------------------------------------------- Fogos de artifício
  R.game({ id: 'fogos', name: 'Show de Fogos', cat: 'Relax', c1: '#0b1640', c2: '#ffd23f', glyph: '🎆',
    desc: 'Aponte para o céu e lance fogos de artifício sobre a cidade à noite.', controls: 'Aponte para o céu e aperte o gatilho.',
    build: function (g) {
      g.env({ sky: 'night', ground: '#10141f', stars: 1000 });
      for (var b = 0; b < 30; b++) { var bl = M.box(2 + Math.random() * 3, 3 + Math.random() * 12, 2 + Math.random() * 3, '#1b2233'); var a = (Math.random() - 0.5) * 2.2; bl.position.set(Math.sin(a) * (30 + Math.random() * 15), bl.geometry.parameters.height / 2, -Math.cos(a) * (30 + Math.random() * 15)); g.add(bl);
        if (Math.random() < 0.7) { var w = M.box(0.4, 0.4, 0.05, null, R.mat.basic('#ffd59a')); w.position.set(bl.position.x, bl.geometry.parameters.height * 0.6, bl.position.z + bl.geometry.parameters.depth / 2 + 0.03); g.add(w); } }
      var rockets = [], shows = [], N = 90;
      function explode(pos, col) {
        var arr = new Float32Array(N * 3), vel = []; for (var i = 0; i < N; i++) { arr[i * 3] = pos.x; arr[i * 3 + 1] = pos.y; arr[i * 3 + 2] = pos.z; var d = new V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 3); vel.push(d); }
        var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        var pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: col, size: 0.35, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        g.add(pts); shows.push({ p: pts, v: vel, life: 2 }); R.sfx.play('firework'); g.addScore(1);
      }
      g.on('press', function (p) {
        var target = p.tip(40); target.y = Math.max(15, Math.min(40, target.y));
        var r = M.sphere(0.12, '#fff', 6, R.mat.basic('#ffe8a8')); r.position.set(target.x * 0.3, 0, target.z * 0.3 - 5);
        g.add(r); rockets.push({ m: r, target: target, col: new THREE.Color().setHSL(Math.random(), 1, 0.6) }); R.sfx.play('whoosh');
      });
      g.on('update', function (dt) {
        for (var i = rockets.length - 1; i >= 0; i--) { var rk = rockets[i], d = rk.target.clone().sub(rk.m.position); if (d.length() < 1) { explode(rk.m.position, rk.col); g.root.remove(rk.m); rockets.splice(i, 1); continue; } rk.m.position.addScaledVector(d.normalize(), 30 * dt); }
        for (var j = shows.length - 1; j >= 0; j--) {
          var s = shows[j], a = s.p.geometry.attributes.position.array; s.life -= dt;
          for (var k = 0; k < N; k++) { s.v[k].y -= 3 * dt; s.v[k].multiplyScalar(1 - dt * 0.8); a[k * 3] += s.v[k].x * dt; a[k * 3 + 1] += s.v[k].y * dt; a[k * 3 + 2] += s.v[k].z * dt; }
          s.p.geometry.attributes.position.needsUpdate = true; s.p.material.opacity = Math.max(0, s.life / 2);
          if (s.life <= 0) { g.root.remove(s.p); s.p.geometry.dispose(); s.p.material.dispose(); shows.splice(j, 1); }
        }
      });
      g.hud({ y: 1.2, z: -3, scale: 0.7, info: 'Aponte para o céu!' }); g.hudState.scoreLabel = 'Fogos';
    } });

  // ---------------------------------------------------------------- Aquário
  R.game({ id: 'aquario', name: 'Aquário Zen', cat: 'Relax', c1: '#0a3d6b', c2: '#2de2ff', glyph: '🐠',
    desc: 'Você está no fundo do mar. Jogue comida e veja os peixes nadarem até ela.', controls: 'Aponte e aperte o gatilho para jogar comida.',
    build: function (g) {
      g.env({ sky: 'sea', ground: '#c9b38a', fog: ['#1a6a9a', 4, 35], light: { sky: '#9be3ff', hemi: 0.9 } });
      for (var i = 0; i < 25; i++) { var cor = M.cone(0.15 + Math.random() * 0.3, 0.6 + Math.random() * 1.4, new THREE.Color().setHSL(Math.random(), 0.7, 0.55).getStyle(), 5); var a = Math.random() * 6.28, d = 2 + Math.random() * 10; cor.position.set(Math.sin(a) * d, cor.geometry.parameters.height / 2, -Math.cos(a) * d); g.add(cor); }
      for (var r = 0; r < 12; r++) { var rk = M.rock(1 + Math.random() * 2); var b = Math.random() * 6.28; rk.position.set(Math.sin(b) * (4 + Math.random() * 10), 0.2, -Math.cos(b) * (4 + Math.random() * 10)); g.add(rk); }
      var fish = [], food = [], bubbles = [];
      for (var f = 0; f < 22; f++) {
        var fg = new THREE.Group(), col = new THREE.Color().setHSL(Math.random(), 0.85, 0.55).getStyle(), s = 0.6 + Math.random() * 0.8;
        var body = M.sphere(0.12, col, 8); body.scale.set(0.6, 0.9, 1.6); var tail = M.cone(0.1, 0.16, col, 4); tail.rotation.x = Math.PI / 2; tail.position.z = 0.25; fg.add(body, tail); fg.scale.setScalar(s);
        fg.position.set((Math.random() - 0.5) * 12, 0.5 + Math.random() * 3, (Math.random() - 0.5) * 12); fg.userData = { v: new V(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), sp: 0.6 + Math.random() * 0.6, tail: tail };
        g.add(fg); fish.push(fg);
      }
      for (var bb = 0; bb < 30; bb++) { var bu = M.sphere(0.03, '#fff', 6, new THREE.MeshBasicMaterial({ color: '#cfefff', transparent: true, opacity: 0.6 })); bu.position.set((Math.random() - 0.5) * 14, Math.random() * 6, (Math.random() - 0.5) * 14); g.add(bu); bubbles.push(bu); }
      g.on('press', function (p) { for (var i = 0; i < 6; i++) { var fd = M.sphere(0.025, '#c98a3a', 4); fd.position.copy(p.tip(2.5)).add(new V((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)); g.add(fd); food.push(fd); } R.sfx.play('splash'); });
      var tmp = new V();
      g.on('update', function (dt) {
        for (var i = 0; i < bubbles.length; i++) { bubbles[i].position.y += dt * 0.5; if (bubbles[i].position.y > 7) bubbles[i].position.y = 0; }
        for (var j = food.length - 1; j >= 0; j--) { food[j].position.y = Math.max(0.05, food[j].position.y - dt * 0.15); }
        for (var k = 0; k < fish.length; k++) {
          var fi = fish[k], u = fi.userData, tgt = null, bd = 6;
          for (var j2 = 0; j2 < food.length; j2++) { var dd = food[j2].position.distanceTo(fi.position); if (dd < bd) { bd = dd; tgt = food[j2]; } }
          if (tgt) { tmp.copy(tgt.position).sub(fi.position).normalize(); u.v.lerp(tmp, dt * 2).normalize(); if (bd < 0.15) { g.root.remove(tgt); food.splice(food.indexOf(tgt), 1); g.addScore(1); R.sfx.play('pop', 1.5); } }
          else { u.v.x += (Math.random() - 0.5) * dt; u.v.z += (Math.random() - 0.5) * dt; u.v.y = (2 - fi.position.y) * 0.05; u.v.normalize(); if (fi.position.length() > 12) u.v.lerp(fi.position.clone().negate().normalize(), dt * 2); }
          fi.position.addScaledVector(u.v, u.sp * (tgt ? 2 : 1) * dt); fi.lookAt(fi.position.clone().sub(u.v)); u.tail.rotation.y = Math.sin(R.time * 10 + k) * 0.5;
        }
      });
      g.hud({ y: 2.6, z: -3, scale: 0.7, info: 'Alimente os peixes' }); g.hudState.scoreLabel = 'Petiscos';
    } });

  // ---------------------------------------------------------------- Sistema Solar
  var PLANETS = [['Mercúrio', 0.08, 2.0, '#b1a596', 4.1, 'O menor planeta e o mais próximo do Sol. Um ano dura 88 dias.'], ['Vênus', 0.14, 2.8, '#e8c48a', 1.6, 'O planeta mais quente: ~465 °C por causa do efeito estufa.'],
    ['Terra', 0.15, 3.7, '#3d8bfd', 1, 'Nosso lar. Único planeta conhecido com vida.'], ['Marte', 0.11, 4.7, '#d1572e', 0.53, 'O planeta vermelho tem o maior vulcão do Sistema Solar: o Monte Olimpo.'],
    ['Júpiter', 0.45, 6.6, '#d8b48a', 0.084, 'O gigante gasoso. A Grande Mancha Vermelha é uma tempestade maior que a Terra.'], ['Saturno', 0.38, 8.4, '#e8d29a', 0.034, 'Famoso pelos anéis de gelo e rocha.'],
    ['Urano', 0.25, 9.9, '#9fe3ef', 0.012, 'Gira "deitado", com o eixo inclinado em 98°.'], ['Netuno', 0.24, 11.2, '#4b6fff', 0.006, 'Ventos de até 2.000 km/h — os mais rápidos do Sistema Solar.']];
  R.game({ id: 'sistemasolar', name: 'Sistema Solar', cat: 'Relax', c1: '#05061a', c2: '#ffb347', glyph: '🪐',
    desc: 'Flutue no espaço entre os planetas. Aponte para um planeta para aprender sobre ele.', controls: 'Clique num planeta • touchpad anda/voa.',
    build: function (g) {
      g.env({ sky: 'space', ground: false, stars: 2000, light: { hemi: 0.25, dir: 0 } });
      var sun = M.sphere(1, '#ffd23f', 24, R.mat.basic('#ffcf4a')); sun.position.set(0, 1.4, -8); g.add(sun);
      var light = new THREE.PointLight('#fff2d0', 2, 60); sun.add(light);
      var ps = [], speed = 1, sel = 0;
      PLANETS.forEach(function (d, i) {
        var orb = new THREE.Mesh(new THREE.RingBufferGeometry(d[2] - 0.01, d[2] + 0.01, 64), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.15, side: THREE.DoubleSide })); orb.rotation.x = -Math.PI / 2; orb.position.copy(sun.position); g.add(orb);
        var p = M.sphere(d[1], d[3], 16); p.userData = { t: 'planet', i: i, a: Math.random() * 6.28 }; g.add(p); ps.push(p);
        if (d[0] === 'Saturno') { var ring = new THREE.Mesh(new THREE.RingBufferGeometry(d[1] * 1.3, d[1] * 2.1, 32), new THREE.MeshBasicMaterial({ color: '#d9c49a', side: THREE.DoubleSide, transparent: true, opacity: 0.8 })); ring.rotation.x = -1.2; p.add(ring); }
        if (d[0] === 'Terra') { var moon = M.sphere(0.04, '#ccc', 8); moon.position.x = 0.3; p.add(moon); p.userData.moon = moon; }
      });
      var P = new ui.Panel({ w: 1.0, h: 0.62, res: 480, render: function (x, P) {
        ui.glass(x, 0, 0, P.cw, P.ch, 30); var d = PLANETS[sel];
        ui.text(x, d[0], 30, 44, 36, { weight: 800 }); ui.wrap(x, d[5], 30, 80, P.cw - 60, 22, 30);
        ui.text(x, 'Velocidade: ' + speed + 'x', 30, P.ch - 50, 20, { color: 'rgba(255,255,255,0.7)' });
        P.button('s1', P.cw - 300, P.ch - 76, 80, 50, '½x', function () { speed = Math.max(0.25, speed / 2); }, { px: 20 });
        P.button('s2', P.cw - 210, P.ch - 76, 80, 50, '2x', function () { speed = Math.min(64, speed * 2); }, { px: 20 });
        P.button('s0', P.cw - 120, P.ch - 76, 90, 50, speed ? '⏸' : '▶', function () { speed = speed ? 0 : 1; }, { px: 20 });
      } });
      P.mesh.position.set(-1.3, 1.5, -1.6); P.mesh.rotation.y = 0.5; g.add(P.mesh);
      g.on('press', function (p) { var h = g.ray(p, ps, false); if (h) { sel = h.object.userData.i; P.dirty = true; R.sfx.play('notify'); g.addScore(1); } });
      g.on('update', function (dt) {
        sun.rotation.y += dt * 0.1;
        ps.forEach(function (p, i) { var d = PLANETS[i]; p.userData.a += dt * 0.25 * d[4] * speed; p.position.set(sun.position.x + Math.cos(p.userData.a) * d[2], sun.position.y, sun.position.z + Math.sin(p.userData.a) * d[2]); p.rotation.y += dt; if (p.userData.moon) p.userData.moon.position.set(Math.cos(R.time * 2) * 0.3, 0, Math.sin(R.time * 2) * 0.3); });
      });
      g.locomotion({ speed: 2.5, fly: true, minY: -1 });
      g.hud({ y: 3.2, z: -5, scale: 0.8, info: 'Clique nos planetas' }); g.hudState.scoreLabel = 'Descobertas';
    } });

  // ---------------------------------------------------------------- Respiração guiada
  R.game({ id: 'respiracao', name: 'Respiração Guiada', cat: 'Relax', c1: '#4a6fb5', c2: '#f2a7a0', glyph: '🧘',
    desc: 'Exercício de respiração 4-4-6 num lago ao pôr do sol. Siga a esfera.', controls: 'Apenas respire. Gatilho alterna música ambiente.',
    build: function (g) {
      g.env({ sky: 'lago', ground: '#3d5a4a', trees: 30, mountains: '#7a6f99' });
      var lake = new THREE.Mesh(new THREE.CircleBufferGeometry(30, 32), R.mat.lambert('#6f8fc9')); lake.rotation.x = -Math.PI / 2; lake.position.set(0, 0.02, -36); g.add(lake);
      var orb = M.sphere(0.4, '#fff', 24, new THREE.MeshBasicMaterial({ color: '#bfe3ff', transparent: true, opacity: 0.8 })); orb.position.set(0, 1.6, -3); g.add(orb);
      var halo = new THREE.Mesh(M.geo.torus(0.9, 0.01, 4, 48), R.mat.basic('#ffffff')); halo.position.copy(orb.position); g.add(halo);
      var label = M.text('Inspire', 0.18, { color: '#fff' }); label.position.set(0, 2.5, -3); g.add(label);
      var PH = [['Inspire', 4], ['Segure', 4], ['Expire', 6]], ph = 0, t = 0, cycles = 0, music = true, drone = null;
      function startDrone() { drone = [R.sfx.osc('sine'), R.sfx.osc('sine')]; drone[0].set(110, 0.04, 0); drone[1].set(164.8, 0.03, 0); }
      startDrone();
      g.on('press', function () { music = !music; if (music) startDrone(); else if (drone) { drone.forEach(function (d) { d.stop(); }); drone = null; } });
      g.on('dispose', function () { if (drone) drone.forEach(function (d) { d.stop(); }); });
      g.on('update', function (dt) {
        t += dt; if (t >= PH[ph][1]) { t = 0; ph = (ph + 1) % 3; if (ph === 0) { cycles++; g.setScore(cycles); } label.userData.setText(PH[ph][0]); R.sfx.play('note', [262, 330, 196][ph]); }
        var k = t / PH[ph][1], s = ph === 0 ? 0.4 + k * 0.5 : ph === 1 ? 0.9 : 0.9 - k * 0.5;
        orb.scale.setScalar(s / 0.4 * 0.5 + 0.5); orb.material.color.setHSL(0.55 + s * 0.1, 0.6, 0.75);
        halo.rotation.z += dt * 0.2;
      });
      g.hud({ y: 0.9, z: -2.6, scale: 0.6, info: 'Gatilho: música on/off' }); g.hudState.scoreLabel = 'Ciclos';
    } });

  // ---------------------------------------------------------------- Montanha-russa
  R.game({ id: 'montanharussa', name: 'Montanha-Russa', cat: 'Relax', c1: '#e23b3b', c2: '#3d8bfd', glyph: '🎢',
    desc: 'Um passeio de montanha-russa com subidas, quedas e curvas. (Intenso: não recomendado para quem enjoa.)', controls: 'Só curta! Gatilho = levantar os braços (grite!).',
    build: function (g) {
      g.env({ sky: 'day', ground: '#5aa864', trees: 60, clouds: 12, mountains: true });
      g.def.noTurn = true;
      var pts = []; for (var i = 0; i < 16; i++) { var a = i / 16 * Math.PI * 2, r = 22 + Math.sin(a * 3) * 8; pts.push(new V(Math.cos(a) * r, 3 + Math.max(0, Math.sin(a * 2 + 1) * 12 + Math.cos(a * 5) * 3), Math.sin(a) * r)); }
      var curve = new THREE.CatmullRomCurve3(pts, true);
      var tube = new THREE.Mesh(new THREE.TubeBufferGeometry(curve, 400, 0.12, 5, true), R.mat.lambert('#e23b3b')); g.add(tube);
      var sp = curve.getSpacedPoints(80); sp.forEach(function (p, i) { if (i % 2) return; var h = p.y - 0.1; var s = M.cyl(0.08, 0.08, h, '#888', 6); s.position.set(p.x, h / 2, p.z); g.add(s); });
      var car = new THREE.Group(); var cb = M.box(1.2, 0.5, 1.6, '#3d8bfd'); cb.position.y = -0.55; car.add(cb); g.add(car);
      var u = 0, v = 4, laps = 0, maxY = 0; pts.forEach(function (p) { maxY = Math.max(maxY, p.y); });
      var arms = g.holdAll(function () { var a = M.box(0.08, 0.08, 0.5, '#e8c7a8'); a.position.z = 0.1; a.visible = false; return a; });
      var up = new V(0, 1, 0), tg = new V(), m4 = new THREE.Matrix4();
      g.on('update', function (dt) {
        var len = curve.getLength(), p = curve.getPointAt(u); curve.getTangentAt(u, tg);
        v = Math.max(4, Math.sqrt(Math.max(0, 2 * 9.8 * (maxY + 1 - p.y)))) * 0.85;
        var nu = u + v * dt / len; if (nu >= 1) { laps++; g.setScore(laps); R.sfx.play('win'); } u = nu % 1;
        car.position.copy(p); m4.lookAt(p, p.clone().add(tg), up); car.quaternion.setFromRotationMatrix(m4); car.rotateY(Math.PI);
        R.player.x = p.x; R.player.y = p.y - R.settings.height + 0.4; R.player.z = p.z; R.player.yaw = Math.atan2(-tg.x, -tg.z);
        if (tg.y < -0.4 && Math.random() < dt * 3) R.sfx.play('whoosh');
        var ps = R.input.pointers; arms.forEach(function (a) { a.visible = a.userData.pointer.down; });
        g.setInfo(Math.round(v * 3.6) + ' km/h • altura ' + Math.round(p.y) + ' m');
      });
      g.hud({ follow: true }); g.hudState.scoreLabel = 'Voltas';
      g.on('dispose', function () { g.def.noTurn = false; });
    } });

  // ---------------------------------------------------------------- Pescaria
  var FISH = [['Lambari', 0.1, 0.3], ['Tilápia', 0.5, 2.0], ['Tucunaré', 1, 5], ['Pirarucu', 10, 60], ['Bota velha 👢', 0.4, 0.5], ['Dourado', 2, 12]];
  R.game({ id: 'pescaria', name: 'Pescaria no Lago', cat: 'Relax', c1: '#3d8bfd', c2: '#7cc576', glyph: '🎣',
    desc: 'Lance a linha, espere a boia afundar e fisgue no tempo certo. Quanto pesa o seu maior peixe?', controls: 'Segure e balance para lançar • quando a boia afundar, aperte o gatilho!',
    build: function (g) {
      g.env({ sky: 'sunset', ground: '#5aa864', trees: 40, mountains: true, clouds: 6 });
      var lake = new THREE.Mesh(new THREE.CircleBufferGeometry(25, 32), R.mat.lambert('#3a7fbf')); lake.rotation.x = -Math.PI / 2; lake.position.set(0, 0.03, -28); g.add(lake);
      var dock = M.box(2, 0.2, 5, '#8a5a2a'); dock.position.set(0, 0.3, -1.5); g.add(dock); R.player.y = 0.4; R.player.z = -2.5;
      var rods = g.holdAll(function () { var r = M.cyl(0.01, 0.015, 1.4, '#5a3d2a', 5); r.rotation.x = -Math.PI / 2 + 0.5; r.position.set(0, 0.25, -0.6); var gr = new THREE.Group(); gr.add(r); return gr; });
      var bob = M.sphere(0.06, '#e23b3b', 8); bob.visible = false; g.add(bob);
      var lineGeo = new THREE.BufferGeometry().setFromPoints([new V(), new V()]); var line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#fff' })); line.frustumCulled = false; g.add(line);
      var state = 'idle', t = 0, v = new V(), best = 0, caught = 0, tipP = new V();
      G.thrower(g, { make: function () { return new THREE.Object3D(); }, base: 4, k: 2, min: 6, max: 14, lift: 0.3, can: function () { return state === 'idle'; },
        thrown: function (m, vel) { g.root.remove(m); bob.visible = true; bob.position.copy(m.position); v.copy(vel); state = 'flying'; } });
      g.on('press', function () {
        if (state === 'bite') { state = 'reel'; t = 0; R.sfx.play('splash'); }
        else if (state === 'wait') { state = 'idle'; bob.visible = false; g.setInfo('Puxou cedo! Lance de novo.'); }
      });
      g.on('update', function (dt) {
        var p = R.input.pointers[0]; p.obj.localToWorld(tipP.set(0, 0.85, -1.3));
        var a = line.geometry.attributes.position.array; a[0] = tipP.x; a[1] = tipP.y; a[2] = tipP.z; a[3] = bob.position.x; a[4] = bob.position.y; a[5] = bob.position.z; line.geometry.attributes.position.needsUpdate = true; line.visible = bob.visible;
        if (state === 'flying') { v.y -= 9.8 * dt; bob.position.addScaledVector(v, dt); if (bob.position.y < 0.05) { if (bob.position.z > -4) { state = 'idle'; bob.visible = false; g.setInfo('Caiu no deque! Lance para o lago.'); } else { bob.position.y = 0.05; state = 'wait'; t = 2 + Math.random() * 5; R.sfx.play('splash'); g.setInfo('Espere a boia afundar…'); } } }
        else if (state === 'wait') { t -= dt; bob.position.y = 0.05 + Math.sin(R.time * 2) * 0.01; if (t <= 0) { state = 'bite'; t = 1.0; R.sfx.play('notify'); try { var gp = p.source && p.source.gamepad; if (gp && gp.hapticActuators && gp.hapticActuators[0]) gp.hapticActuators[0].pulse(0.8, 200); } catch (e) {} } }
        else if (state === 'bite') { t -= dt; bob.position.y = -0.05 + Math.sin(R.time * 30) * 0.03; g.setInfo('PUXA! 🎣'); if (t <= 0) { state = 'wait'; t = 2 + Math.random() * 4; bob.position.y = 0.05; g.setInfo('Escapou… espere de novo'); } }
        else if (state === 'reel') { t += dt; bob.position.lerp(tipP, dt * 2.5); if (t > 1.2) {
          var f = FISH[Math.floor(Math.random() * FISH.length)], w = +(f[1] + Math.random() * (f[2] - f[1])).toFixed(2); caught++; g.addScore(Math.round(w * 10)); best = Math.max(best, w);
          R.sfx.play('win'); R.ui.toast('Pegou: ' + f[0] + ' (' + w + ' kg)!', 2.5); g.setInfo('Peixes: ' + caught + ' • maior: ' + best + ' kg'); state = 'idle'; bob.visible = false; } }
      });
      g.hud({ y: 2.4, z: -5, info: 'Balance para lançar' }); g.round(120);
    } });

  // ---------------------------------------------------------------- Bolhas de sabão
  R.game({ id: 'bolhas', name: 'Bolhas de Sabão', cat: 'Relax', c1: '#9fd8ff', c2: '#ff7ad9', glyph: '🫧',
    desc: 'Bolhas flutuam num jardim tranquilo. Cada bolha estourada toca uma nota da escala pentatônica.', controls: 'Aponte e aperte o gatilho.',
    build: function (g) {
      g.env({ sky: 'day', ground: '#7cc576', trees: 30, clouds: 10 });
      var bub = [], notes = [523, 587, 659, 784, 880, 1047];
      function spawn() { var b = M.sphere(0.12 + Math.random() * 0.15, '#fff', 12, new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.6, 0.85), transparent: true, opacity: 0.45, emissive: '#223' })); b.position.set((Math.random() - 0.5) * 6, 0.3, -1.5 - Math.random() * 4); b.userData.v = new V((Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.2); g.add(b); bub.push(b); }
      g.every(0.35, function () { if (bub.length < 40) spawn(); });
      g.on('press', function (p) { var h = g.ray(p, bub, false); if (!h) return; var b = h.object; R.sfx.play('note', notes[Math.floor(Math.random() * notes.length)]); g.burst(b.position, '#ffffff', 8, 1.5); g.root.remove(b); bub.splice(bub.indexOf(b), 1); g.addScore(1); });
      g.on('update', function (dt) { for (var i = bub.length - 1; i >= 0; i--) { var b = bub[i]; b.position.addScaledVector(b.userData.v, dt); b.position.x += Math.sin(R.time + i) * 0.002; if (b.position.y > 6) { g.root.remove(b); bub.splice(i, 1); } } });
      g.hud({ y: 2.8, z: -4, scale: 0.8, info: 'Relaxe e estoure' }); g.hudState.scoreLabel = 'Bolhas';
    } });
})();
