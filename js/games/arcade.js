/* Jogos de ação/arcade + helpers compartilhados (R.G) */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, M = R.models;
  var V = THREE.Vector3;
  var G = R.G = {};

  // ---------------------------------------------------------------- helpers
  G.root = function (o) { while (o && !(o.userData && o.userData.t)) o = o.parent; return o; };
  G.guns = function (g, color) { return g.holdAll(function () { return R.assets.holdable('service_pistol', 0.21) || M.gun(color); }); };
  // aplica textura fotográfica (se carregada) a uma malha
  G.tex = function (mesh, name, rep) { var m = R.assets.surface(name, rep || 1); if (m) mesh.material = m; return mesh; };
  G.place = function (g, name, size, x, y, z, ry) { var m = R.assets.get(name, { size: size }); if (m) { m.position.set(x, y, z); m.rotation.y = ry || 0; g.add(m); } return m; };
  G.shoot = function (g, p, targets, onHit) {
    R.sfx.play('shoot');
    var hit = p.ray.intersectObjects(targets, true)[0];
    var end = hit ? hit.point : p.tip(30);
    G.tracer(g, p.tip(0.2), end);
    if (hit) { var rt = G.root(hit.object); if (rt) onHit(rt, hit); }
    return hit;
  };
  G.tracer = function (g, a, b) {
    var geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
    var l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffe08a', transparent: true }));
    g.add(l); var t = 0.08;
    g.addFx(function (dt) { t -= dt; l.material.opacity = t / 0.08; if (t <= 0) { g.root.remove(l); geo.dispose(); l.material.dispose(); return false; } });
  };
  // projéteis simples (sem cannon) — baratos
  G.proj = function (g) {
    var list = [];
    g.on('update', function (dt) {
      for (var i = list.length - 1; i >= 0; i--) {
        var o = list[i]; o.life -= dt;
        o.v.y -= (o.grav !== undefined ? o.grav : 9.8) * g.gScale * dt;
        if (o.drag) o.v.multiplyScalar(1 - o.drag * dt);
        o.mesh.position.addScaledVector(o.v, dt);
        if (o.spin) { o.mesh.rotation.x += dt * o.spin; o.mesh.rotation.y += dt * o.spin * 0.7; }
        if (o.align) o.mesh.lookAt(o.mesh.position.clone().add(o.v));
        var kill = o.life <= 0 || (o.step && o.step(o, dt) === false);
        if (!kill && o.floor !== undefined && o.mesh.position.y < o.floor) { kill = o.onFloor ? o.onFloor(o) !== false : true; }
        if (kill) { if (o.keep) { list.splice(i, 1); continue; } g.root.remove(o.mesh); list.splice(i, 1); }
      }
    });
    return { add: function (o) { if (!o.mesh.parent) g.add(o.mesh); list.push(o); return o; }, list: list };
  };
  // segurar e arremessar (força = balanço do pulso)
  G.thrower = function (g, opts) {
    var holding = {};
    g.on('press', function (p) {
      if (opts.can && !opts.can(p)) return;
      var m = opts.make(); holding[p.id] = { m: m, t: 0 }; g.add(m); R.sfx.play('click');
    });
    g.on('update', function (dt) {
      for (var id in holding) {
        var h = holding[id], p = findP(id); if (!p) { delete holding[id]; continue; }
        h.t += dt; p.tip(opts.hold || 0.35, h.m.position);
      }
    });
    g.on('release', function (p) {
      var h = holding[p.id]; if (!h) return; delete holding[p.id];
      var sp = Math.max(opts.min || 4, Math.min(opts.max || 14, (opts.base || 3) + p.vel.length() * (opts.k || 2.2) + Math.min(h.t, 1) * (opts.holdK || 0)));
      var d = p.dir.clone(); d.y += opts.lift !== undefined ? opts.lift : 0.12; d.normalize();
      opts.thrown(h.m, d.multiplyScalar(sp), p);
      R.sfx.play('whoosh');
    });
  };
  function findP(id) { var ps = R.input.pointers; for (var i = 0; i < ps.length; i++) if (String(ps[i].id) === String(id)) return ps[i]; return null; }
  G.findP = findP;
  G.ringPos = function (r, a, y) { return new V(Math.sin(a) * r, y, -Math.cos(a) * r); };

  // ---------------------------------------------------------------- Tiro ao Alvo
  R.game({ id: 'alvo', assets: { models: ['service_pistol', 'WoodenTable_01', 'wooden_crate_01', 'Barrel_01'], sky: 'day' }, name: 'Tiro ao Alvo', cat: 'Ação', featured: true, c1: '#e23b3b', c2: '#ffd23f', glyph: '🎯',
    desc: 'Alvos surgem no campo de tiro. Centro vale mais. 60 segundos.', controls: 'Mire com o controle e aperte o gatilho.',
    build: function (g) {
      g.env({ sky: 'day', ground: '#c9b38a', trees: 25, mountains: true });
      if (!G.place(g, 'WoodenTable_01', 1.6, 0, 0, -0.9)) { var bench = M.box(2.5, 0.9, 0.5, '#7a5232'); bench.position.set(0, 0.45, -0.8); g.add(bench); }
      G.place(g, 'wooden_crate_01', 0.6, -1.6, 0, -1, 0.4); G.place(g, 'Barrel_01', 0.9, 1.7, 0, -1.2);
      G.guns(g); var targets = [];
      function spawn() {
        var t = M.target(0.35 + Math.random() * 0.2); t.userData.t = 'alvo';
        var a = (Math.random() - 0.5) * 1.6, d = 8 + Math.random() * 14;
        t.position.copy(G.ringPos(d, a, 0.8 + Math.random() * 2.2)); t.lookAt(0, 1.6, 0);
        t.userData.life = 4 + Math.random() * 2; t.scale.setScalar(0.01); g.add(t); targets.push(t);
      }
      for (var i = 0; i < 3; i++) spawn();
      g.on('press', function (p) {
        G.shoot(g, p, targets, function (t, hit) {
          var loc = t.worldToLocal(hit.point.clone()), r = Math.hypot(loc.x, loc.y) / (t.children[0].geometry.parameters.radiusTop);
          var pts = r < 0.25 ? 50 : r < 0.5 ? 25 : r < 0.75 ? 10 : 5;
          g.addScore(pts); g.setInfo('+' + pts + (pts === 50 ? ' NA MOSCA!' : '')); g.burst(hit.point, '#ffd23f', 10, 3); R.sfx.play('hit');
          g.root.remove(t); targets.splice(targets.indexOf(t), 1); spawn();
        });
      });
      g.on('update', function (dt) {
        for (var i = targets.length - 1; i >= 0; i--) { var t = targets[i]; t.scale.setScalar(Math.min(1, t.scale.x + dt * 4)); t.userData.life -= dt; if (t.userData.life < 0) { g.root.remove(t); targets.splice(i, 1); spawn(); } }
      });
      g.hud({ info: 'Acerte o centro!' }); g.round(60);
    } });

  // ---------------------------------------------------------------- Estoura Balões
  R.game({ id: 'baloes', assets: { sky: 'day' }, name: 'Estoura Balões', cat: 'Ação', c1: '#ff4f8b', c2: '#ffb36b', glyph: '🎈',
    desc: 'Balões sobem ao seu redor. Dourados valem 5! Pretos tiram pontos.', controls: 'Aponte e aperte o gatilho para estourar.',
    build: function (g) {
      g.env({ sky: 'day', ground: '#7cc576', clouds: 10, trees: 20 });
      var balloons = [];
      function spawn() {
        var r = Math.random(), type = r < 0.1 ? 'gold' : r < 0.2 ? 'bomb' : 'norm';
        var c = type === 'gold' ? '#ffd23f' : type === 'bomb' ? '#222' : new THREE.Color().setHSL(Math.random(), 0.8, 0.55).getStyle();
        var b = M.sphere(0.25, c, 12); b.scale.y = 1.2; b.userData.t = type;
        var str = M.box(0.005, 0.5, 0.005, '#fff'); str.position.y = -0.55; b.add(str);
        b.position.copy(G.ringPos(3 + Math.random() * 5, (Math.random() - 0.5) * 3.5, -0.5)); b.userData.v = 0.6 + Math.random() * 0.8;
        g.add(b); balloons.push(b);
      }
      g.every(0.45, function () { if (!g.over) spawn(); });
      g.on('press', function (p) {
        var hit = g.ray(p, balloons, false); R.sfx.play('laser');
        if (hit) {
          var b = hit.object, t = b.userData.t; g.addScore(t === 'gold' ? 5 : t === 'bomb' ? -5 : 1);
          g.burst(b.position, b.material.color.getStyle(), 10, 3); R.sfx.play(t === 'bomb' ? 'boom' : 'pop');
          g.root.remove(b); balloons.splice(balloons.indexOf(b), 1);
        }
      });
      g.on('update', function (dt) {
        for (var i = balloons.length - 1; i >= 0; i--) { var b = balloons[i]; b.position.y += b.userData.v * dt; b.position.x += Math.sin(R.time + i) * 0.003; if (b.position.y > 7) { g.root.remove(b); balloons.splice(i, 1); } }
      });
      g.hud({ info: 'Dourado = +5 • Preto = -5' }); g.round(60);
    } });

  // ---------------------------------------------------------------- Defensor Espacial
  R.game({ id: 'asteroides', assets: { models: ['service_pistol'] }, name: 'Defensor Espacial', cat: 'Ação', featured: true, c1: '#05061a', c2: '#7a5cff', glyph: '☄',
    desc: 'Asteroides vêm de todos os lados em direção à sua estação. Destrua-os antes do impacto!', controls: 'Gatilho atira lasers. Gire o corpo para cobrir 360°.',
    build: function (g) {
      g.env({ sky: 'space', ground: false, stars: 1500 });
      var deck = new THREE.Mesh(new THREE.CylinderBufferGeometry(1.4, 1.6, 0.3, 16), R.mat.lambert('#3a3f4b')); deck.position.y = -0.15; g.add(deck);
      var planet = M.sphere(30, '#2a6fd6', 24); planet.position.set(0, -40, -20); g.add(planet);
      G.guns(g, '#5b6cff'); var rocks = [], lives = 5;
      function spawn() {
        var r = new THREE.Mesh(M.flatGeo('rock', function () { return new THREE.IcosahedronBufferGeometry(1, 0); }), R.mat.lambert('#8a7f72')); r.scale.setScalar(0.4 + Math.random() * 0.5);
        r.userData.t = 'rock'; var a = Math.random() * Math.PI * 2;
        r.position.set(Math.sin(a) * 40, 1 + Math.random() * 8, -Math.cos(a) * 40);
        r.userData.v = new V(0, 1.6, 0).sub(r.position).normalize().multiplyScalar(3 + Math.min(6, g.score / 15)); g.add(r); rocks.push(r);
      }
      var spawnT = 0;
      g.on('press', function (p) {
        R.sfx.play('laser');
        var hit = G.shoot(g, p, rocks, function (r) { g.addScore(1); g.burst(r.position, '#ffb36b', 14, 5); R.sfx.play('boom'); g.root.remove(r); rocks.splice(rocks.indexOf(r), 1); });
      });
      g.on('update', function (dt) {
        if (g.over) return;
        spawnT -= dt; if (spawnT < 0) { spawn(); spawnT = Math.max(0.5, 2 - g.score / 30); }
        for (var i = rocks.length - 1; i >= 0; i--) {
          var r = rocks[i]; r.position.addScaledVector(r.userData.v, dt); r.rotation.x += dt; r.rotation.y += dt * 0.7;
          if (r.position.distanceTo(new V(0, 1.6, 0)) < 1.5) { g.root.remove(r); rocks.splice(i, 1); lives--; R.sfx.play('hit'); g.setInfo('❤'.repeat(Math.max(0, lives))); if (lives <= 0) g.end('A estação caiu!'); }
        }
      });
      g.hud({ info: '❤❤❤❤❤', follow: true });
    } });

  // ---------------------------------------------------------------- Noite dos Zumbis
  R.game({ id: 'zumbis', assets: { models: ['service_pistol', 'street_lamp_01', 'wooden_crate_01', 'Barrel_01'], sky: 'night' }, name: 'Noite dos Zumbis', cat: 'Ação', c1: '#1d3b1f', c2: '#7dff9c', glyph: '🧟',
    desc: 'Ondas de zumbis de blocos avançam. Tiro na cabeça vale o dobro.', controls: 'Gatilho atira. Gire para vigiar todos os lados.',
    build: function (g) {
      g.env({ sky: 'night', ground: '#263325', trees: 30, fog: ['#0b1640', 8, 40] });
      for (var f = 0; f < 10; f++) { var fe = M.box(1.6, 0.8, 0.1, '#5a3d2a'); var a = f / 10 * Math.PI * 2; fe.position.set(Math.sin(a) * 3, 0.4, -Math.cos(a) * 3); fe.rotation.y = -a; g.add(fe); }
      var lamp = new THREE.PointLight('#ffcf8a', 1.2, 14); lamp.position.set(0, 3, 0); g.add(lamp);
      for (var pr2 = 0; pr2 < 4; pr2++) { var pa = pr2 * Math.PI / 2 + 0.78; G.place(g, 'street_lamp_01', 3.5, Math.sin(pa) * 4, 0, -Math.cos(pa) * 4, -pa); }
      for (var bc = 0; bc < 8; bc++) { var ba = bc / 8 * Math.PI * 2 + 0.4; G.place(g, bc % 2 ? 'Barrel_01' : 'wooden_crate_01', bc % 2 ? 0.9 : 0.7, Math.sin(ba) * 3.4, 0, -Math.cos(ba) * 3.4, ba); }
      G.guns(g, '#555'); var zs = [], wave = 1, toSpawn = 5, lives = 3, spawnT = 0;
      function spawn() {
        var z = M.blocky('#3c6e3c', '#3b2f2f', '#7fbf7f'); z.scale.setScalar(1.8); var a = Math.random() * Math.PI * 2;
        z.position.set(Math.sin(a) * 26, 0, -Math.cos(a) * 26); z.userData.t = 'z'; z.userData.hp = 2 + Math.floor(wave / 3); z.userData.sp = 0.8 + wave * 0.12 + Math.random() * 0.4;
        z.children[1].userData.head = true; g.add(z); zs.push(z);
      }
      g.on('press', function (p) {
        G.shoot(g, p, zs, function (z, hit) {
          var head = hit.object.userData.head || hit.point.y > z.position.y + 1.45;
          z.userData.hp -= head ? 2 : 1; g.burst(hit.point, '#7dff9c', 6, 2); R.sfx.play('hit');
          z.position.addScaledVector(z.position.clone().setY(0).normalize(), 0.4);
          if (z.userData.hp <= 0) { g.addScore(head ? 20 : 10); g.root.remove(z); zs.splice(zs.indexOf(z), 1); }
        });
      });
      g.on('update', function (dt) {
        if (g.over) return;
        spawnT -= dt; if (toSpawn > 0 && spawnT < 0) { spawn(); toSpawn--; spawnT = Math.max(0.6, 2.5 - wave * 0.2); }
        if (toSpawn === 0 && !zs.length) { wave++; toSpawn = 4 + wave * 2; R.sfx.play('win'); R.ui.toast('Onda ' + wave + '!'); }
        for (var i = zs.length - 1; i >= 0; i--) {
          var z = zs[i], d = Math.hypot(z.position.x, z.position.z);
          z.position.x -= z.position.x / d * z.userData.sp * dt; z.position.z -= z.position.z / d * z.userData.sp * dt;
          z.rotation.y = Math.atan2(-z.position.x, -z.position.z);
          var sw = Math.sin(R.time * 5 + i) * 0.5; z.userData.limbs.ll.rotation.x = sw; z.userData.limbs.rl.rotation.x = -sw; z.userData.limbs.la.rotation.x = -1.4; z.userData.limbs.ra.rotation.x = -1.4;
          if (d < 1.2) { lives--; g.root.remove(z); zs.splice(i, 1); R.sfx.play('lose'); if (lives <= 0) g.end('Os zumbis venceram na onda ' + wave); }
        }
        g.setInfo('Onda ' + wave + ' • Vidas ' + '❤'.repeat(Math.max(0, lives)));
      });
      g.hud({ follow: true });
    } });

  // ---------------------------------------------------------------- Galeria de Tiro (parque)
  R.game({ id: 'galeria', assets: { models: ['service_pistol', 'rubber_duck_toy', 'wooden_lantern_01'], sky: 'sunset' }, name: 'Galeria do Parque', cat: 'Ação', c1: '#d9480f', c2: '#ffd23f', glyph: '🦆',
    desc: 'Barraca de parque de diversões: patinhos em três esteiras. Patos dourados valem mais.', controls: 'Mire e aperte o gatilho.',
    build: function (g) {
      g.env({ sky: 'sunset', ground: '#3a2a3a' });
      var booth = G.tex(M.box(6, 3, 0.2, '#b3202a'), 'brown_planks_03', 2); booth.position.set(0, 1.5, -5.5); g.add(booth);
      for (var rl = 0; rl < 3; rl++) { var rail = M.box(6, 0.05, 0.1, '#6b4a2a'); rail.position.set(0, 0.62 + rl * 0.7, -5.25); g.add(rail); }
      G.place(g, 'wooden_lantern_01', 0.4, -2.6, 3.0, -5.2); G.place(g, 'wooden_lantern_01', 0.4, 2.6, 3.0, -5.2);
      for (var s = 0; s < 8; s++) { var st = M.box(0.75, 0.4, 0.05, s % 2 ? '#fff' : '#e23b3b'); st.position.set(-2.62 + s * 0.75, 3.2, -5.3); g.add(st); }
      G.guns(g, '#8a5a2a'); var ducks = [];
      function duck(row) {
        var gold = Math.random() < 0.12, d = new THREE.Group(); d.userData.t = gold ? 'gold' : 'duck';
        var real = R.assets.get('rubber_duck_toy', { size: 0.42, tint: gold ? '#ffcc33' : null });
        if (real) { real.rotation.y = Math.PI / 2; d.add(real); } else {
          var b = M.sphere(0.18, gold ? '#ffd23f' : '#f5e663', 10); b.scale.set(1.3, 1, 1); var h = M.sphere(0.11, gold ? '#ffd23f' : '#f5e663', 8); h.position.set(0.14, 0.17, 0);
          var bk = M.cone(0.04, 0.1, '#ff8a00', 6); bk.rotation.z = -Math.PI / 2; bk.position.set(0.27, 0.16, 0); d.add(b, h, bk); }
        d.userData.dir = row % 2 ? 1 : -1; d.userData.sp = 1 + row * 0.5; d.position.set(-3 * d.userData.dir, 0.8 + row * 0.7, -5.2); d.scale.x = d.userData.dir;
        g.add(d); ducks.push(d);
      }
      g.every(0.7, function () { if (!g.over) duck(Math.floor(Math.random() * 3)); });
      g.on('press', function (p) { G.shoot(g, p, ducks, function (d, hit) { g.addScore(d.userData.t === 'gold' ? 5 : 1); R.sfx.play('hit'); g.burst(hit.point, '#fff', 8, 2); d.userData.fall = true; }); });
      g.on('update', function (dt) {
        for (var i = ducks.length - 1; i >= 0; i--) { var d = ducks[i];
          if (d.userData.fall) { d.rotation.x -= dt * 8; d.position.y -= dt * 2; if (d.rotation.x < -1.6) { g.root.remove(d); ducks.splice(i, 1); } continue; }
          d.position.x += d.userData.dir * d.userData.sp * dt; d.position.y += Math.sin(R.time * 8 + i) * 0.002;
          if (Math.abs(d.position.x) > 3.2) { g.root.remove(d); ducks.splice(i, 1); } }
      });
      g.hud({ y: 3.7, z: -5.4 }); g.round(45);
    } });

  // ---------------------------------------------------------------- Tiro ao Prato
  R.game({ id: 'skeet', assets: { models: ['service_pistol'], sky: 'day' }, name: 'Tiro ao Prato', cat: 'Esporte', c1: '#ff8a00', c2: '#3d8bfd', glyph: '🥏',
    desc: 'Pratos são lançados em arco. Acerte-os no ar! 20 pratos.', controls: 'Siga o prato e aperte o gatilho.',
    build: function (g) {
      g.env({ sky: 'day', ground: '#8bbf6a', trees: 30, mountains: true });
      G.guns(g, '#5a3d2a'); var pr = G.proj(g), plates = [], left = 20;
      function launch() {
        if (left <= 0) { if (!plates.length) g.end(g.score + '/20 pratos'); return; }
        left--; g.setInfo('Restam ' + left);
        var m = new THREE.Mesh(M.geo.cyl(0.13, 0.13, 0.04, 14), R.mat.lambert('#ff8a00')); m.userData.t = 'plate';
        var side = Math.random() > 0.5 ? 1 : -1; m.position.set(side * 8, 0.5, -10 - Math.random() * 6);
        plates.push(m);
        pr.add({ mesh: m, v: new V(-side * (5 + Math.random() * 3), 9 + Math.random() * 3, Math.random() * 2), life: 5, floor: 0, spin: 3, grav: 6 });
        R.sfx.play('whoosh');
      }
      g.every(1.6, function () { launch(); return !g.over; });
      g.on('press', function (p) { G.shoot(g, p, plates, function (m) { if (!m.parent) return; g.addScore(1); g.burst(m.position, '#ff8a00', 14, 4); R.sfx.play('hit'); g.root.remove(m); plates.splice(plates.indexOf(m), 1); }); });
      g.on('update', function () { for (var i = plates.length - 1; i >= 0; i--) if (!plates[i].parent) plates.splice(i, 1); });
      g.hud({ y: 2.8 });
    } });

  // ---------------------------------------------------------------- Martelo na Toupeira
  R.game({ id: 'toupeira', assets: { models: ['garden_gnome', 'wooden_hammer_01'], sky: 'day' }, name: 'Martelo Maluco', cat: 'Ação', featured: true, c1: '#7a5232', c2: '#7cc576', glyph: '🔨',
    desc: 'Bichinhos saem dos buracos. Martele rápido! Os de capacete precisam de 2 golpes.', controls: 'Aponte para o bichinho e aperte o gatilho.',
    build: function (g) {
      g.env({ sky: 'day', ground: '#7cc576', trees: 15, clouds: 6 });
      var table = G.tex(M.box(2.4, 0.8, 1.6, '#a0703c'), 'brown_planks_03', 1); table.position.set(0, 0.4, -1.4); g.add(table);
      var holes = [], moles = [];
      for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
        var h = new THREE.Mesh(new THREE.CircleBufferGeometry(0.18, 16), R.mat.basic('#2a1a0a')); h.rotation.x = -Math.PI / 2;
        h.position.set((c - 1) * 0.7, 0.805, -0.9 - r * 0.45); g.add(h); holes.push(h.position.clone());
        var m = new THREE.Group(), gn = R.assets.get('garden_gnome', { size: 0.42 });
        var helmet = M.sphere(0.14, '#ffd23f', 10); helmet.scale.y = 0.6;
        if (gn) { gn.position.y = -0.17; m.add(gn); helmet.scale.set(0.6, 0.4, 0.6); helmet.position.y = 0.25; m.add(helmet); m.userData.real = true; }
        else { var body = M.cyl(0.13, 0.15, 0.3, '#8a5a3c', 10); var nose = M.sphere(0.04, '#ff7aa8', 6); nose.position.set(0, 0.06, 0.13);
          var e1 = M.sphere(0.025, '#111', 6); e1.position.set(-0.05, 0.1, 0.11); var e2 = e1.clone(); e2.position.x = 0.05; helmet.position.y = 0.15; m.add(body, nose, e1, e2, helmet); } m.userData = { t: 'mole', real: !!gn, up: 0, state: 'down', timer: 0, helmet: helmet, hp: 1 };
        m.position.copy(h.position); m.position.y = gn ? 0.35 : 0.6; g.add(m); moles.push(m);
      }
      var hammers = g.holdAll(function () { var real = R.assets.holdable('wooden_hammer_01', 0.45); if (real) return real; var hm = new THREE.Group(); var hd = M.cyl(0.07, 0.07, 0.2, '#c0392b', 10); hd.rotation.z = Math.PI / 2; hd.position.z = -0.32; var hn = M.cyl(0.015, 0.015, 0.32, '#7a5232', 6); hn.rotation.x = Math.PI / 2; hn.position.z = -0.16; hm.add(hd, hn); return hm; });
      g.on('press', function (p) {
        var hm = g.heldBy(p, hammers); if (hm) { hm.rotation.x = -0.7; setTimeout(function () { hm.rotation.x = 0; }, 90); }
        var hit = g.ray(p, moles, true); if (!hit) { R.sfx.play('thud', 0.5); return; }
        var m = G.root(hit.object); if (m.userData.state !== 'up') return;
        m.userData.hp--; R.sfx.play('hit');
        if (m.userData.hp <= 0) { g.addScore(m.userData.helmet.visible ? 3 : 1); m.userData.state = 'hit'; m.userData.timer = 0.3; g.burst(m.position.clone().setY(0.9), '#ffd23f', 8, 2); }
        else m.userData.helmet.visible = false;
      });
      g.on('update', function (dt) {
        if (g.over) return;
        for (var i = 0; i < moles.length; i++) {
          var m = moles[i], u = m.userData; u.timer -= dt;
          if (u.state === 'down' && u.timer < 0 && Math.random() < dt * (0.25 + g.score / 120)) { u.state = 'up'; u.timer = 1.4 - Math.min(0.8, g.score / 80); u.hp = Math.random() < 0.25 ? 2 : 1; u.helmet.visible = u.hp === 2; }
          else if ((u.state === 'up' || u.state === 'hit') && u.timer < 0) { u.state = 'down'; u.timer = 0.4 + Math.random(); }
          var target = u.state === 'up' ? (u.real ? 0.88 : 0.95) : (u.real ? 0.35 : 0.6); m.position.y += (target - m.position.y) * Math.min(1, dt * 18);
          if (u.state === 'hit') m.scale.y = 0.6; else m.scale.y = 1;
        }
      });
      g.hud({ y: 2.1, z: -2.6, info: 'Capacete = 2 golpes, vale 3' }); g.round(45);
    } });

  // ---------------------------------------------------------------- Fatiador de Frutas
  R.game({ id: 'frutas', assets: { models: ['antique_katana_01', 'food_apple_01', 'lemon', 'food_kiwi_01', 'food_pomegranate_01', 'food_avocado_01', 'food_lime_01', 'WoodenTable_01'], sky: 'sunset' }, name: 'Fatiador de Frutas', cat: 'Ação', c1: '#ff4f4f', c2: '#7dff9c', glyph: '🍉',
    desc: 'Frutas voam pelo ar: passe a lâmina por elas! Cuidado com as bombas.', controls: 'Segure o gatilho e varra o laser sobre as frutas (ou só passe a espada).',
    build: function (g) {
      g.env({ sky: 'sunset', ground: '#5a3d2a', trees: 10 });
      var blades = g.holdAll(function () { var k = R.assets.holdable('antique_katana_01', 1.0); if (k) return k; var b = M.box(0.02, 0.04, 1.0, null, R.mat.glow('#7fd0ff')); b.position.z = -0.55; var w = new THREE.Group(); w.add(b); return w; });
      var FR = ['food_apple_01', 'lemon', 'food_kiwi_01', 'food_pomegranate_01', 'food_avocado_01', 'food_lime_01'];
      G.place(g, 'WoodenTable_01', 1.4, 0, 0, -2.6);
      var pr = G.proj(g), fruits = [], lives = 3;
      var KINDS = [['#2fa84f', 0.2, '#ff4f6b'], ['#ff8a00', 0.13, '#ffc04d'], ['#ffe23f', 0.1, '#fff2a8'], ['#d81b60', 0.11, '#ff9ec4'], ['#7cb342', 0.12, '#e6ffcc']];
      function toss() {
        var bomb = Math.random() < 0.15, k = KINDS[Math.floor(Math.random() * KINDS.length)];
        var fi = Math.floor(Math.random() * FR.length), real = !bomb && R.assets.get(FR[fi], { size: 0.24, base: false });
        var m = real || (bomb ? M.sphere(0.13, '#111', 10) : M.sphere(k[1], k[0], 10)); m.userData = { t: bomb ? 'bomb' : 'fruit', inner: k[2], r: real ? 0.12 : (bomb ? 0.13 : k[1]), col: k[0] };
        m.position.set((Math.random() - 0.5) * 3, 0, -2.4 - Math.random());
        fruits.push(m);
        pr.add({ mesh: m, v: new V(-m.position.x * 0.5, 6.5 + Math.random() * 1.5, 0.6), life: 4, spin: 2, floor: -0.5, onFloor: function (o) { var i = fruits.indexOf(o.mesh); if (i >= 0) { fruits.splice(i, 1); if (o.mesh.userData.t === 'fruit') { lives--; if (lives <= 0) g.end('Deixou cair frutas demais!'); } } } });
      }
      g.every(0.9, function () { if (g.over) return false; var n = 1 + Math.floor(Math.random() * Math.min(4, 1 + g.score / 15)); for (var i = 0; i < n; i++) toss(); });
      var tmpS = new THREE.Sphere();
      g.on('update', function () {
        g.setInfo('Vidas: ' + '❤'.repeat(Math.max(0, lives)));
        var ps = R.input.pointers;
        for (var i = 0; i < ps.length; i++) {
          var p = ps[i]; if (p.angVel < 2.2 && !p.down) continue;
          for (var j = fruits.length - 1; j >= 0; j--) {
            var f = fruits[j]; tmpS.set(f.position, f.userData.r + 0.08);
            var near = p.ray.ray.intersectsSphere(tmpS) && f.position.distanceTo(p.origin) < (p.down ? 6 : 1.6);
            if (!near) continue;
            fruits.splice(j, 1); f.parent && g.root.remove(f);
            if (f.userData.t === 'bomb') { R.sfx.play('boom'); g.burst(f.position, '#ff8a00', 20, 5); lives = 0; g.end('BOOM! Cortou uma bomba.'); return; }
            g.addScore(1); R.sfx.play('slice'); g.burst(f.position, f.userData.inner, 12, 3);
            for (var hlf = 0; hlf < 2; hlf++) { var hm = M.sphere(f.userData.r, f.userData.col, 8); hm.scale.x = 0.5; hm.position.copy(f.position); pr.add({ mesh: hm, v: new V(hlf ? 1.5 : -1.5, 1, 0), life: 1.2, spin: 6 }); }
          }
        }
      });
      g.hud({ y: 2.6, z: -3.5 });
    } });

  // ---------------------------------------------------------------- Arqueiro
  R.game({ id: 'arqueiro', assets: { sky: 'day' }, name: 'Arqueiro', cat: 'Esporte', c1: '#2f6b3a', c2: '#c9b38a', glyph: '🏹',
    desc: 'Segure o gatilho para puxar a corda (mais tempo = mais força) e solte. Considere a gravidade e o vento!', controls: 'Segure e solte o gatilho. Mire acima de alvos distantes.',
    build: function (g) {
      g.env({ sky: 'day', ground: '#8bbf6a', trees: 40, mountains: true, clouds: 6 });
      var bows = g.holdAll(function () { var b = new THREE.Mesh(new THREE.TorusBufferGeometry(0.35, 0.012, 4, 16, Math.PI), R.mat.lambert('#7a5232')); b.rotation.set(0, Math.PI / 2, Math.PI / 2); b.position.z = -0.1; return b; });
      var targets = [], pr = G.proj(g), charge = {}, wind = 0, arrows = 10;
      [[0, 15], [-4, 25], [5, 35], [-1, 50]].forEach(function (d, i) { var t = M.target(0.7); t.userData.t = 'tgt'; t.position.set(d[0], 1.4, -d[1]); var st = M.box(0.1, 1.4, 0.1, '#5a3d2a'); st.position.set(d[0], 0.7, -d[1] - 0.1); g.add(t, st); targets.push(t); });
      function newWind() { wind = (Math.random() - 0.5) * 3; g.setInfo('Vento: ' + (wind > 0 ? '→ ' : '← ') + Math.abs(wind).toFixed(1) + ' • flechas: ' + arrows); }
      newWind();
      g.on('press', function (p) { if (arrows > 0) charge[p.id] = 0.01; });
      g.on('update', function (dt) { for (var k in charge) charge[k] = Math.min(1.2, charge[k] + dt); });
      g.on('release', function (p) {
        var c = charge[p.id]; delete charge[p.id]; if (!c || arrows <= 0) return; arrows--;
        var a = new THREE.Group(); var sh = M.cyl(0.008, 0.008, 0.7, '#d9c7a0', 4); sh.rotation.x = Math.PI / 2; var tip = M.cone(0.02, 0.06, '#666', 4); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.37; a.add(sh, tip);
        a.position.copy(p.tip(0.3)); R.sfx.play('whoosh');
        pr.add({ mesh: a, v: p.dir.clone().multiplyScalar(14 + c * 28), life: 6, align: true, floor: 0.02, keep: true, grav: 9.8,
          onFloor: function (o) { o.v.set(0, 0, 0); o.grav = 0; return true; },
          step: function (o, dt) {
            o.v.x += wind * dt;
            for (var i = 0; i < targets.length; i++) {
              var t = targets[i]; if (Math.abs(o.mesh.position.z - t.position.z) < 0.25 && Math.hypot(o.mesh.position.x - t.position.x, o.mesh.position.y - t.position.y) < 0.75) {
                var r = Math.hypot(o.mesh.position.x - t.position.x, o.mesh.position.y - t.position.y) / 0.7, d = -t.position.z;
                var pts = Math.round((r < 0.2 ? 10 : r < 0.4 ? 7 : r < 0.6 ? 5 : r < 0.8 ? 3 : 1) * (d / 15));
                g.addScore(pts); R.sfx.play('hit'); R.ui.toast('+' + pts + ' (' + d + 'm)', 1.2); return false;
              }
            }
          } });
        newWind();
        if (arrows <= 0) g.after(3, function () { g.end('Fim das flechas!'); });
      });
      g.hud({ y: 2.6, z: -4 });
    } });

  // ---------------------------------------------------------------- Caça-Fantasmas (lanterna)
  R.game({ id: 'fantasmas', assets: { models: ['Sofa_01', 'ArmChair_01', 'vintage_grandfather_clock_01', 'wooden_bookshelf_worn', 'drawer_cabinet', 'WoodenTable_01', 'vintage_flashlight'] }, name: 'Casa Assombrada', cat: 'Ação', c1: '#1b1c2b', c2: '#9fd8ff', glyph: '👻',
    desc: 'Um casarão escuro. Sua lanterna revela fantasmas: mantenha a luz neles para capturá-los.', controls: 'Aponte a lanterna. Segure o gatilho para o feixe forte.',
    build: function (g) {
      g.env({ sky: 'night', ground: false, light: { hemi: 0.06, dir: 0.02 } });
      var phong = function (c) { return new THREE.MeshPhongMaterial({ color: c, shininess: 5 }); }; // por pixel: spot aparece
      var floor = new THREE.Mesh(M.geo.plane(16, 16), phong('#3a2c20')); floor.rotation.x = -Math.PI / 2; g.add(floor);
      var wallMat = phong('#4a3b2d');
      for (var w = 0; w < 4; w++) { var wl = M.box(16, 5, 0.2, null, wallMat); var a = w * Math.PI / 2; wl.position.set(Math.sin(a) * 8, 2.5, -Math.cos(a) * 8); wl.rotation.y = -a; g.add(wl); }
      var FURN = [['Sofa_01', 2.0], ['ArmChair_01', 1.0], ['vintage_grandfather_clock_01', 2.1], ['wooden_bookshelf_worn', 2.0], ['drawer_cabinet', 1.2], ['ArmChair_01', 1.0], ['WoodenTable_01', 1.4], ['wooden_bookshelf_worn', 2.0]];
      var toPhong = function (o) { o.traverse(function (c) { if (c.isMesh) c.material = new THREE.MeshPhongMaterial({ map: c.material.map, color: c.material.color, shininess: 8 }); }); return o; };
      for (var f = 0; f < FURN.length; f++) {
        var b = f / FURN.length * Math.PI * 2 + 0.3, fu = R.assets.get(FURN[f][0], { size: FURN[f][1] });
        if (fu) { toPhong(fu); fu.position.set(Math.sin(b) * 6.6, 0, -Math.cos(b) * 6.6); fu.rotation.y = -b + Math.PI; g.add(fu); }
        else { fu = M.box(0.6 + Math.random(), 0.5 + Math.random() * 1.5, 0.6, null, wallMat); fu.position.set(Math.sin(b) * 6, fu.geometry.parameters.height / 2, -Math.cos(b) * 6); g.add(fu); }
      }
      var fl = R.assets.surface('wood_floor', 6); if (fl) floor.material = new THREE.MeshPhongMaterial({ map: fl.map, shininess: 10 });
      g.holdAll(function () { return R.assets.holdable('vintage_flashlight', 0.22) || new THREE.Group(); });
      var spot = new THREE.SpotLight('#fff3c4', 2.5, 20, 0.3, 0.5, 1); var tgt = new THREE.Object3D(); spot.target = tgt; g.add(spot, tgt);
      var ghosts = [];
      function ghost() {
        var gh = new THREE.Group(); var body = M.sphere(0.35, '#e8f6ff', 10, new THREE.MeshLambertMaterial({ color: '#e8f6ff', transparent: true, opacity: 0.1 })); body.scale.y = 1.3;
        var e1 = M.sphere(0.05, '#111', 6, new THREE.MeshBasicMaterial({ color: '#111', transparent: true, opacity: 0.1 })); e1.position.set(-0.1, 0.1, 0.3); var e2 = e1.clone(); e2.position.x = 0.1;
        gh.add(body, e1, e2); gh.userData = { t: 'ghost', a: Math.random() * 6.28, r: 3 + Math.random() * 3, y: 1 + Math.random() * 2, hp: 1, mats: [body.material, e1.material] };
        g.add(gh); ghosts.push(gh);
      }
      for (var k = 0; k < 4; k++) ghost();
      var tmp = new V();
      g.on('update', function (dt) {
        var p = R.input.pointers[0], strong = p.down;
        spot.position.copy(p.origin); p.tip(5, tmp); tgt.position.copy(tmp);
        spot.angle = strong ? 0.18 : 0.32; spot.intensity = strong ? 4 : 2;
        for (var i = ghosts.length - 1; i >= 0; i--) {
          var gh = ghosts[i], u = gh.userData; u.a += dt * 0.3;
          gh.position.set(Math.sin(u.a) * u.r, u.y + Math.sin(R.time * 2 + i) * 0.3, -Math.cos(u.a) * u.r); gh.lookAt(0, 1.6, 0);
          var to = gh.position.clone().sub(p.origin).normalize(), lit = to.dot(p.dir) > (strong ? 0.985 : 0.95);
          var op = Math.max(0.1, Math.min(0.85, u.mats[0].opacity + (lit ? dt * 2 : -dt)));
          u.mats[0].opacity = op; u.mats[1].opacity = op;
          if (lit && strong) { u.hp -= dt; gh.scale.setScalar(Math.max(0.2, u.hp)); if (u.hp <= 0) { g.addScore(1); R.sfx.play('coin'); g.burst(gh.position, '#9fd8ff', 16, 3); g.root.remove(gh); ghosts.splice(i, 1); ghost(); } }
          else gh.scale.setScalar(Math.min(1, gh.scale.x + dt));
        }
      });
      g.hud({ follow: true, info: 'Ilumine um fantasma e segure o gatilho' }); g.round(90);
    } });

  // ---------------------------------------------------------------- Canhão vs Castelo
  R.game({ id: 'canhao', assets: { models: ['cannon_01'], sky: 'day' }, name: 'Canhão vs Castelo', cat: 'Física', featured: true, c1: '#5a5f6b', c2: '#ff8a00', glyph: '💣',
    desc: 'Derrube o castelo de blocos com 8 balas de canhão. Física real!', controls: 'Aponte para onde quer atirar e aperte o gatilho.',
    build: function (g) {
      g.env({ sky: 'day', ground: '#7cc576', mountains: true, clouds: 8 });
      var ph = g.phys({ friction: 0.5, iterations: 6 }), blocks = [], shots = 8;
      var realC = R.assets.get('cannon_01', { size: 1.8 }), cannon;
      if (realC) { cannon = realC; cannon.position.set(0.9, 0, -1.2); g.add(cannon); }
      else { cannon = M.cyl(0.15, 0.2, 1.2, '#333', 10); cannon.rotation.x = Math.PI / 2 - 0.3; cannon.position.set(0.5, 1.1, -0.5); g.add(cannon);
        var wheel = M.cyl(0.35, 0.35, 0.1, '#5a3d2a', 12); wheel.rotation.z = Math.PI / 2; wheel.position.set(0.5, 0.35, -0.3); g.add(wheel); }
      var stone = R.assets.surface('brick_floor', 0.4), stone2 = R.assets.surface('brushed_concrete', 0.4);
      var base = new V(0, 0, -16);
      for (var y = 0; y < 6; y++) for (var x = -3; x <= 3; x++) {
        if (y > 3 && Math.abs(x) < 2) continue;
        var m = M.box(0.6, 0.6, 0.6, y % 2 ? '#bfb6a6' : '#a89f8f'); if (stone) m.material = y % 2 ? stone : stone2; m.position.set(base.x + x * 0.62, 0.3 + y * 0.61, base.z); ph.box(m, 0.6, 0.6, 0.6, 2); blocks.push(m);
      }
      for (var t = -1; t <= 1; t += 2) for (var y2 = 0; y2 < 3; y2++) { var m2 = M.box(0.6, 0.6, 0.6, '#8f8676'); m2.position.set(base.x + t * 0.62, 3.95 + y2 * 0.61, base.z); ph.box(m2, 0.6, 0.6, 0.6, 2); blocks.push(m2); }
      var flag = M.box(0.5, 0.3, 0.02, '#e23b3b'); flag.position.set(base.x, 5.4, base.z); g.add(flag); var fb = ph.box(flag, 0.5, 0.3, 0.02, 0.3); blocks.push(flag);
      g.on('press', function (p) {
        if (shots <= 0) return; shots--;
        var d = p.dir.clone(); d.y = Math.max(0.05, d.y + 0.12); d.normalize();
        if (realC) cannon.rotation.y = Math.atan2(d.x, d.z) + (cannon.userData.yawFix || 0); else { cannon.lookAt(cannon.position.clone().add(d)); cannon.rotateX(Math.PI / 2); }
        var ball = M.sphere(0.25, '#222', 12); ball.position.copy(new V(0.9, 1.2, -2.2)); var b = ph.sphere(ball, 0.25, 30);
        b.velocity.set(d.x * 24, d.y * 24, d.z * 24); R.sfx.play('boom'); g.burst(ball.position, '#aaa', 10, 2);
        g.setInfo('Balas: ' + shots);
        if (shots === 0) g.after(5, function () { g.end(); });
      });
      g.on('update', function () {
        var fallen = 0; for (var i = 0; i < blocks.length; i++) if (blocks[i].position.y < 0.25 || Math.abs(blocks[i].position.z - base.z) > 1.2) fallen++;
        if (fallen !== g.score) g.setScore(fallen);
      });
      g.hud({ y: 3, z: -6, info: 'Balas: 8' }); g.hudState.scoreLabel = 'Blocos caídos';
    } });

  // ---------------------------------------------------------------- Pássaro Saltitante (3D)
  R.game({ id: 'saltitante', assets: { sky: 'day' }, name: 'Pássaro Saltitante', cat: 'Ação', c1: '#3d8bfd', c2: '#7cc576', glyph: '🐤',
    desc: 'Você É o pássaro. Bata as asas para passar pelos vãos dos canos.', controls: 'Aperte o gatilho para bater as asas.',
    build: function (g) {
      g.env({ sky: 'day', ground: '#7cc576', clouds: 12 });
      var vy = 0, alive = true, pipes = [], speed = 4, nextZ = -12;
      R.player.y = 2;
      function pipe(z) {
        var gap = 2.4, gy = 1.8 + Math.random() * 3; var grp = new THREE.Group();
        var top = M.box(1.4, 20, 1.4, '#3fae4a'); top.position.y = gy + gap / 2 + 10; var bot = M.box(1.4, 20, 1.4, '#3fae4a'); bot.position.y = gy - gap / 2 - 10;
        grp.add(top, bot); grp.position.z = z; grp.userData = { gy: gy, gap: gap, passed: false }; g.add(grp); pipes.push(grp);
      }
      for (var i = 0; i < 6; i++) { pipe(nextZ); nextZ -= 9; }
      g.on('press', function () { if (alive) { vy = 4.2; R.sfx.play('jump'); } });
      g.on('update', function (dt) {
        if (!alive) return;
        vy -= 11 * g.gScale * dt; R.player.y += vy * dt; R.player.z -= speed * dt; speed += dt * 0.03;
        var head = R.player.y + R.settings.height;
        if (R.player.y < -R.settings.height + 0.3 || head > 9) die();
        for (var i = pipes.length - 1; i >= 0; i--) {
          var pp = pipes[i], dz = Math.abs(pp.position.z - R.player.z), u = pp.userData;
          if (dz < 0.8 && (head < u.gy - u.gap / 2 + 0.2 || head > u.gy + u.gap / 2 - 0.2)) die();
          if (!u.passed && pp.position.z > R.player.z + 0.8) { u.passed = true; g.addScore(1); R.sfx.play('coin'); }
          if (pp.position.z > R.player.z + 10) { g.root.remove(pp); pipes.splice(i, 1); pipe(nextZ); nextZ -= 9; }
        }
      });
      function die() { if (!alive) return; alive = false; R.sfx.play('hit'); g.end('Bateu! ' + g.score + ' canos'); }
      g.hud({ follow: true, info: 'Gatilho = bater asas' });
    } });
})();
