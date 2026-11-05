/* Corrida e voo: kart, corredor infinito, voo de anéis, esqui, túnel neon */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, M = R.models;
  var V = THREE.Vector3;

  function steerFromPointer(p, fwdYaw) {
    var a = Math.atan2(-p.dir.x, -p.dir.z), d = a - fwdYaw;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    return Math.max(-1, Math.min(1, d / 0.6));
  }

  // ---------------------------------------------------------------- Kart
  R.game({ id: 'kart', name: 'Kart Turbo', cat: 'Corrida', featured: true, c1: '#e23b3b', c2: '#ffd23f', glyph: '🏎',
    desc: '3 voltas contra 3 rivais. Aponte para onde quer virar e segure o gatilho para acelerar.', controls: 'Gatilho = acelerar • aponte para a esquerda/direita para virar.',
    build: function (g) {
      g.env({ sky: 'day', ground: '#5aa864', trees: 50, mountains: true, clouds: 10 });
      g.def.noTurn = true;
      var pts = [], N = 12;
      for (var i = 0; i < N; i++) { var a = i / N * Math.PI * 2, r = 38 + Math.sin(a * 3) * 10 + Math.cos(a * 2) * 6; pts.push(new V(Math.cos(a) * r, 0, Math.sin(a) * r * 0.75)); }
      var curve = new THREE.CatmullRomCurve3(pts, true), S = 300, sp = curve.getSpacedPoints(S), Wd = 7;
      var pos = [], idx = [];
      for (var k = 0; k <= S; k++) {
        var p0 = sp[k % S], p1 = sp[(k + 1) % S], d = p1.clone().sub(p0).normalize(), n = new V(-d.z, 0, d.x);
        pos.push(p0.x + n.x * Wd / 2, 0.02, p0.z + n.z * Wd / 2, p0.x - n.x * Wd / 2, 0.02, p0.z - n.z * Wd / 2);
        if (k < S) { var b = k * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      var road = new THREE.BufferGeometry(); road.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); road.setIndex(idx); road.computeVertexNormals();
      g.add(new THREE.Mesh(road, R.mat.lambert('#4a4d57', { side: THREE.DoubleSide })));
      for (var c = 0; c < S; c += 6) { var p0b = sp[c], d2 = sp[(c + 1) % S].clone().sub(p0b).normalize(), n2 = new V(-d2.z, 0, d2.x);
        [1, -1].forEach(function (s) { var cb = M.box(0.6, 0.25, 0.6, (c / 6) % 2 ? '#e23b3b' : '#fff'); cb.position.set(p0b.x + n2.x * s * (Wd / 2 + 0.3), 0.12, p0b.z + n2.z * s * (Wd / 2 + 0.3)); g.add(cb); }); }
      var finish = M.box(Wd, 0.03, 1, '#fff'); finish.position.copy(sp[0]); finish.position.y = 0.03; finish.lookAt(sp[1].x, 0.03, sp[1].z); g.add(finish);
      var arch = M.box(Wd + 1, 0.4, 0.4, '#e23b3b'); arch.position.set(sp[0].x, 4, sp[0].z); arch.rotation.y = finish.rotation.y; g.add(arch);
      function kartModel(col) { var k = new THREE.Group(); var b = M.box(1.0, 0.25, 1.6, col); b.position.y = 0.3; k.add(b); [[-0.55, 0.55], [0.55, 0.55], [-0.55, -0.55], [0.55, -0.55]].forEach(function (w) { var wh = M.cyl(0.2, 0.2, 0.18, '#222', 10); wh.rotation.z = Math.PI / 2; wh.position.set(w[0], 0.2, w[1]); k.add(wh); }); var drv = M.blocky(col, '#222'); drv.position.set(0, 0.2, 0.1); drv.scale.setScalar(0.9); k.add(drv); return k; }
      var me = { u: 0, x: sp[0].x, z: sp[0].z, yaw: 0, v: 0, lap: 0, lastU: 0 }, kart = kartModel('#2d7cf6'); g.add(kart);
      var d0 = sp[1].clone().sub(sp[0]); me.yaw = Math.atan2(-d0.x, -d0.z); kart.children[kart.children.length - 1].visible = false;
      var ais = ['#e23b3b', '#ffd23f', '#2fa84f'].map(function (col, i) { var m = kartModel(col); g.add(m); return { m: m, u: -0.004 * (i + 1), sp: 0.0105 + i * 0.0008, lap: 0, off: (i - 1) * 1.8 }; });
      var t = 0, done = false, LAPS = 3;
      function nearestU(x, z, guess) { var best = guess, bd = 1e9; for (var j = -20; j <= 20; j++) { var kk = ((Math.round(guess * S) + j) % S + S) % S, pp = sp[kk], dd = (pp.x - x) * (pp.x - x) + (pp.z - z) * (pp.z - z); if (dd < bd) { bd = dd; best = kk / S; } } return { u: best, d: Math.sqrt(bd) }; }
      var countdown = 3;
      g.on('update', function (dt) {
        if (countdown > 0) { var o = Math.ceil(countdown); countdown -= dt; if (Math.ceil(countdown) !== o) { R.sfx.play(countdown <= 0 ? 'win' : 'tick'); R.ui.toast(countdown <= 0 ? 'VAI!' : String(Math.ceil(countdown)), 0.8); } }
        var p = R.input.pointers[0];
        if (!done && countdown <= 0) {
          t += dt;
          var steer = steerFromPointer(p, me.yaw), acc = p.down ? 9 : -4;
          var nu = nearestU(me.x, me.z, me.u), off = nu.d > Wd / 2 + 0.5;
          me.v = Math.max(0, Math.min(off ? 7 : 19, me.v + acc * dt)); if (off) me.v *= 1 - dt * 1.5;
          me.yaw -= steer * dt * 1.8 * Math.min(1, me.v / 6);
          me.x += -Math.sin(me.yaw) * me.v * dt; me.z += -Math.cos(me.yaw) * me.v * dt;
          if (me.lastU > 0.9 && nu.u < 0.1) { me.lap++; R.sfx.play('coin'); if (me.lap >= LAPS) { done = true; var place = 1 + ais.filter(function (a) { return a.lap + a.u > me.lap; }).length; g.setScore(Math.round(t * 10) / 10); g.end(place + 'º lugar • ' + t.toFixed(1) + 's', true); } else R.ui.toast('Volta ' + (me.lap + 1) + '/' + LAPS); }
          else if (me.lastU < 0.1 && nu.u > 0.9) me.lap--;
          me.u = nu.u; me.lastU = nu.u;
          ais.forEach(function (a) { a.u += a.sp * dt * (1 + Math.sin(R.time + a.off) * 0.1); if (a.u >= 1) { a.u -= 1; a.lap++; } });
        }
        ais.forEach(function (a) { var uu = ((a.u % 1) + 1) % 1, pp = curve.getPointAt(uu), tg = curve.getTangentAt(uu), n = new V(-tg.z, 0, tg.x); a.m.position.set(pp.x + n.x * a.off, 0, pp.z + n.z * a.off); a.m.rotation.y = Math.atan2(-tg.x, -tg.z); });
        kart.position.set(me.x, 0, me.z); kart.rotation.y = me.yaw;
        R.player.x = me.x; R.player.z = me.z; R.player.y = -0.8; R.player.yaw = me.yaw;
        var place = 1 + ais.filter(function (a) { return a.lap + a.u > me.lap + me.u; }).length;
        g.setInfo('Volta ' + Math.min(LAPS, me.lap + 1) + '/' + LAPS + ' • ' + place + 'º • ' + Math.round(me.v * 3.6) + ' km/h'); g.setTime(t);
      });
      g.hud({ follow: true }); g.hudState.scoreLabel = 'Tempo';
      g.on('dispose', function () { g.def.noTurn = false; });
    } });

  // ---------------------------------------------------------------- Corredor Infinito
  R.game({ id: 'corredor', name: 'Corredor Infinito', cat: 'Corrida', c1: '#ff9f43', c2: '#2d7cf6', glyph: '🏃',
    desc: 'Corra pelos trilhos: aponte para trocar de faixa, gatilho para pular as barreiras. Pegue as moedas!', controls: 'Aponte para esquerda/centro/direita • gatilho = pular.',
    build: function (g) {
      g.env({ sky: 'sunset', ground: '#3d3f4b', fog: ['#e2738c', 20, 70] });
      g.def.noTurn = true;
      var lane = 0, x = 0, y = 0, vy = 0, z = 0, speed = 8, objs = [], nextZ = -20, alive = true, coins = 0;
      var rails = new THREE.Group(); g.add(rails);
      for (var i = 0; i < 3; i++) { var r = M.box(1.6, 0.02, 400, '#2b2d36'); r.position.set((i - 1) * 2, 0.01, -180); rails.add(r); }
      for (var b = 0; b < 40; b++) { var bl = M.box(3 + Math.random() * 3, 4 + Math.random() * 14, 4, new THREE.Color().setHSL(0.6 + Math.random() * 0.2, 0.3, 0.3 + Math.random() * 0.2).getStyle()); bl.position.set((b % 2 ? 1 : -1) * (7 + Math.random() * 3), bl.geometry.parameters.height / 2, -b * 10); g.add(bl); }
      function spawnRow(zz) {
        var kinds = ['bar', 'block', 'coin', 'coin', 'none'];
        for (var l = -1; l <= 1; l++) {
          var k = kinds[Math.floor(Math.random() * kinds.length)], m;
          if (k === 'bar') { m = M.box(1.6, 0.5, 0.2, '#ffd23f'); m.position.set(l * 2, 0.25, zz); }
          else if (k === 'block') { m = M.box(1.6, 2.2, 1.0, '#e23b3b'); m.position.set(l * 2, 1.1, zz); }
          else if (k === 'coin') { m = new THREE.Mesh(M.geo.cyl(0.25, 0.25, 0.05, 12), R.mat.lambert('#ffd23f')); m.rotation.x = Math.PI / 2; m.position.set(l * 2, 1.0, zz); }
          else continue;
          m.userData.k = k; g.add(m); objs.push(m);
        }
        if (objs.filter(function (o) { return o.position.z === zz && o.userData.k === 'block'; }).length === 3) { var last = objs.pop(); g.root.remove(last); }
      }
      g.on('press', function () { if (y <= 0.001 && alive) { vy = 6.5; R.sfx.play('jump'); } });
      g.on('update', function (dt) {
        if (!alive) return;
        var p = R.input.pointers[0], hx = p.dir.x;
        lane = hx < -0.25 ? -1 : hx > 0.25 ? 1 : 0;
        x += (lane * 2 - x) * Math.min(1, dt * 10); vy -= 18 * g.gScale * dt; y = Math.max(0, y + vy * dt); if (y === 0) vy = 0;
        speed = Math.min(22, speed + dt * 0.25); z -= speed * dt;
        while (nextZ > z - 60) { spawnRow(nextZ); nextZ -= 10 + Math.random() * 6; }
        rails.position.z = Math.floor(z / 40) * 40;
        for (var i = objs.length - 1; i >= 0; i--) {
          var o = objs[i], dz = o.position.z - z;
          if (o.userData.k === 'coin') o.rotation.z += dt * 4;
          if (Math.abs(dz) < 0.5 && Math.abs(o.position.x - x) < 0.9) {
            if (o.userData.k === 'coin') { coins++; g.addScore(10); R.sfx.play('coin'); g.root.remove(o); objs.splice(i, 1); continue; }
            if (o.userData.k === 'bar' && y > 0.5) continue;
            alive = false; R.sfx.play('hit'); g.end('Bateu! ' + Math.round(-z) + ' m'); return;
          }
          if (dz > 5) { g.root.remove(o); objs.splice(i, 1); }
        }
        g.setScore(Math.round(-z / 2) + coins * 10); g.setInfo(Math.round(-z) + ' m • ' + coins + ' moedas');
        R.player.x = x; R.player.y = y; R.player.z = z; R.player.yaw = 0;
      });
      g.hud({ follow: true });
      g.on('dispose', function () { g.def.noTurn = false; });
    } });

  // ---------------------------------------------------------------- Voo de Anéis
  R.game({ id: 'voo', name: 'Voo Livre', cat: 'Corrida', c1: '#3d8bfd', c2: '#bfe3ff', glyph: '✈',
    desc: 'Voe apontando o controle. Passe pelos anéis para ganhar tempo extra.', controls: 'Aponte para onde quer voar • gatilho = turbo.',
    build: function (g) {
      g.env({ sky: 'day', ground: '#5aa864', trees: 60, mountains: true, clouds: 20, size: 400 });
      var pos = new V(0, 20, 0), vel = new V(0, 0, -12), rings = [], time = 30, tmpD = new V();
      var plane = new THREE.Group(); var body = M.box(0.3, 0.2, 1.2, '#e23b3b'); var wing = M.box(2.0, 0.04, 0.35, '#f5f5f5'); wing.position.z = -0.1; var tail = M.box(0.6, 0.04, 0.2, '#f5f5f5'); tail.position.z = 0.5;
      plane.add(body, wing, tail); g.add(plane);
      function ring(prev) {
        var d = new V((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.3, -1).normalize();
        var p = prev.clone().addScaledVector(d, 35 + Math.random() * 15); p.y = Math.max(6, Math.min(60, p.y));
        var r = new THREE.Mesh(M.geo.torus(3, 0.25, 6, 24), R.mat.basic('#ffd23f')); r.position.copy(p); r.lookAt(prev); g.add(r); rings.push(r); return p;
      }
      var last = new V(0, 20, -30); for (var i = 0; i < 6; i++) last = ring(last);
      g.on('update', function (dt) {
        var p = R.input.pointers[0], sp = p.down ? 28 : 16;
        tmpD.copy(p.dir); vel.lerp(tmpD.multiplyScalar(sp), Math.min(1, dt * 1.5));
        pos.addScaledVector(vel, dt); pos.y = Math.max(2, Math.min(90, pos.y));
        R.player.x = pos.x; R.player.y = pos.y - R.settings.height; R.player.z = pos.z;
        var vn = vel.clone().normalize(); plane.position.copy(pos).addScaledVector(vn, 2.2); plane.position.y -= 0.9;
        plane.lookAt(plane.position.clone().add(vn)); plane.rotateY(Math.PI); plane.rotation.z += 0;
        time -= dt; g.setTime(Math.max(0, time));
        for (var i = rings.length - 1; i >= 0; i--) {
          var r = rings[i], d = r.position.distanceTo(pos);
          if (d < 3) { g.addScore(1); time += 4; R.sfx.play('coin'); g.root.remove(r); rings.splice(i, 1); last = ring(last); }
          else if (r.position.clone().sub(pos).dot(vel) < -20) { g.root.remove(r); rings.splice(i, 1); last = ring(last); }
        }
        if (time <= 0 && !g.over) g.end(g.score + ' anéis!');
        g.setInfo('Altitude ' + Math.round(pos.y) + ' m • ' + Math.round(vel.length() * 3.6) + ' km/h');
      });
      g.hud({ follow: true }); g.hudState.scoreLabel = 'Anéis';
    } });

  // ---------------------------------------------------------------- Esqui Slalom
  R.game({ id: 'esqui', name: 'Esqui Slalom', cat: 'Corrida', c1: '#bfe9ff', c2: '#2d7cf6', glyph: '⛷',
    desc: 'Desça a montanha passando entre as bandeiras. Evite as árvores!', controls: 'Aponte para os lados para curvar • gatilho = agachar (mais rápido).',
    build: function (g) {
      g.env({ sky: 'day', ground: false, clouds: 10, light: { hemi: 1 } });
      g.def.noTurn = true;
      var SL = 0.25, x = 0, z = 0, v = 6, gates = [], trees = [], nextZ = -15, alive = true, missed = 0;
      var slope = new THREE.Mesh(M.geo.plane(80, 2000), R.mat.lambert('#f4f8ff')); slope.rotation.x = -Math.PI / 2 - SL; slope.position.set(0, 0, -950); g.add(slope);
      function hAt(zz) { return Math.tan(SL) * zz; } // altura (negativa à frente)
      slope.position.y = hAt(-950);
      function spawn(zz) {
        var gx = (Math.random() - 0.5) * 14, col = gates.length % 2 ? '#e23b3b' : '#2d7cf6';
        [-1.6, 1.6].forEach(function (o) { var f = M.cyl(0.04, 0.04, 1.4, col, 4); f.position.set(gx + o, hAt(zz) + 0.7, zz); g.add(f); var fl = M.box(0.5, 0.35, 0.02, col); fl.position.set(gx + o + (o > 0 ? 0.25 : -0.25), hAt(zz) + 1.2, zz); g.add(fl); });
        gates.push({ x: gx, z: zz, done: false });
        for (var t = 0; t < 3; t++) { var tx = (Math.random() - 0.5) * 30; if (Math.abs(tx - gx) < 3) continue; var tr = M.tree(1 + Math.random(), '#2e6b3a'); tr.position.set(tx, hAt(zz - 5), zz - 5 - Math.random() * 5); g.add(tr); trees.push(tr); }
      }
      g.on('update', function (dt) {
        if (!alive) return;
        var p = R.input.pointers[0];
        while (nextZ > z - 120) { spawn(nextZ); nextZ -= 14 + Math.random() * 6; }
        var steer = Math.max(-1, Math.min(1, p.dir.x / 0.5));
        v = Math.min(p.down ? 26 : 20, v + dt * (p.down ? 4 : 2.2)) * (1 - Math.abs(steer) * dt * 0.4);
        x += steer * v * 0.55 * dt; x = Math.max(-25, Math.min(25, x)); z -= v * dt;
        for (var i = 0; i < gates.length; i++) { var gt = gates[i]; if (!gt.done && gt.z > z) { gt.done = true; if (Math.abs(x - gt.x) < 1.6) { g.addScore(10); R.sfx.play('coin'); } else { missed++; R.sfx.play('error'); g.setInfo('Portão perdido! (' + missed + '/5)'); if (missed >= 5) { alive = false; g.end('Perdeu 5 portões'); } } } }
        for (var k = 0; k < trees.length; k++) { var tr = trees[k]; if (Math.abs(tr.position.z - z) < 0.6 && Math.abs(tr.position.x - x) < 0.7) { alive = false; R.sfx.play('hit'); g.end('Bateu numa árvore!'); return; } }
        R.player.x = x; R.player.z = z; R.player.y = hAt(z) - (p.down ? 0.4 : 0); R.player.yaw = -steer * 0.25;
        g.setScore(g.score); if (!missed) g.setInfo(Math.round(v * 3.6) + ' km/h');
      });
      g.hud({ follow: true });
      g.on('dispose', function () { g.def.noTurn = false; });
    } });

  // ---------------------------------------------------------------- Túnel Neon
  R.game({ id: 'tunel', name: 'Túnel Neon', cat: 'Corrida', c1: '#7a5cff', c2: '#2de2ff', glyph: '🌀',
    desc: 'Atravesse um túnel em hipervelocidade desviando dos painéis. Sua nave segue o laser.', controls: 'Aponte para onde a nave deve ir.',
    build: function (g) {
      g.env({ sky: 'space', ground: false, stars: 800 });
      g.def.noTurn = true;
      var Rr = 3, z = 0, sp = 18, pos = new THREE.Vector2(), walls = [], nextZ = -30, alive = true;
      var tube = new THREE.Mesh(new THREE.CylinderBufferGeometry(Rr, Rr, 120, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#7a5cff', wireframe: true }));
      tube.rotation.x = Math.PI / 2; g.add(tube);
      var ship = new THREE.Group(); var sb = M.cone(0.25, 0.8, '#2de2ff', 4); sb.rotation.x = -Math.PI / 2; ship.add(sb); g.add(ship);
      function spawn(zz) {
        var grp = new THREE.Group(), gapA = Math.random() * Math.PI * 2, n = 6 + Math.floor(Math.min(4, -zz / 400));
        for (var i = 0; i < 8; i++) { var a = i / 8 * Math.PI * 2, da = Math.abs(((a - gapA + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (da < Math.PI * (1 - n / 10)) continue; var pnl = M.box(2.2, 1.6, 0.2, null, R.mat.lambert(new THREE.Color().setHSL(Math.random(), 0.8, 0.55).getStyle())); pnl.position.set(Math.cos(a) * 1.9, Math.sin(a) * 1.9, 0); pnl.rotation.z = a + Math.PI / 2; pnl.userData.a = a; grp.add(pnl); }
        var core = M.box(0.8, 0.8, 0.2, '#e23b3b'); if (Math.random() < 0.4) grp.add(core);
        grp.position.z = zz; grp.userData.gap = gapA; grp.userData.core = core.parent === grp; g.add(grp); walls.push(grp);
      }
      var plane = new THREE.Plane(new V(0, 0, 1), 0), tmp = new V();
      g.on('update', function (dt) {
        if (!alive) return;
        sp = Math.min(40, sp + dt * 0.5); z -= sp * dt;
        while (nextZ > z - 120) { spawn(nextZ); nextZ -= 22; }
        var p = R.input.pointers[0]; plane.constant = -(z - 10);
        if (p.ray.ray.intersectPlane(plane, tmp)) { var tx = tmp.x, ty = tmp.y - 1.6, l = Math.hypot(tx, ty); if (l > Rr - 0.6) { tx *= (Rr - 0.6) / l; ty *= (Rr - 0.6) / l; } pos.x += (tx - pos.x) * Math.min(1, dt * 5); pos.y += (ty - pos.y) * Math.min(1, dt * 5); }
        ship.position.set(pos.x, 1.6 + pos.y, z - 3);
        tube.position.set(0, 1.6, z - 50);
        R.player.x = pos.x * 0.7; R.player.y = pos.y * 0.7; R.player.z = z;
        for (var i = walls.length - 1; i >= 0; i--) {
          var w = walls[i];
          if (Math.abs(w.position.z - ship.position.z) < 0.4) {
            var sa = Math.atan2(pos.y, pos.x), sr = Math.hypot(pos.x, pos.y), hit = false;
            w.children.forEach(function (c) { if (c.userData.a === undefined) { if (sr < 0.6) hit = true; return; } var da = Math.abs(((sa - c.userData.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (sr > 0.9 && da < 0.42) hit = true; });
            if (hit) { alive = false; R.sfx.play('boom'); g.burst(ship.position, '#2de2ff', 25, 5); g.end('Colidiu a ' + Math.round(-z) + ' m'); return; }
          }
          if (w.position.z > z + 5) { g.root.remove(w); walls.splice(i, 1); g.addScore(1); }
        }
        g.setInfo(Math.round(sp * 3.6) + ' km/h • ' + Math.round(-z) + ' m');
      });
      g.hud({ follow: true }); g.hudState.scoreLabel = 'Portais';
      g.on('dispose', function () { g.def.noTurn = false; });
    } });
})();
