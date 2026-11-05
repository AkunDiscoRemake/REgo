/* Esportes: basquete, minigolfe, dardos, pingue-pongue, goleiro, pênalti, argolas, latas, air hockey, beisebol */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, M = R.models, G = R.G, C = window.CANNON;
  var V = THREE.Vector3;

  // ---------------------------------------------------------------- Basquete
  R.game({ id: 'basquete', name: 'Basquete 3 Pontos', cat: 'Esporte', featured: true, c1: '#ff7a2d', c2: '#5a3d2a', glyph: '🏀',
    desc: 'Arremesse na cesta! A cada 5 cestas ela se afasta. Cestas de longe valem 3.', controls: 'Segure o gatilho, balance o pulso para cima e solte.',
    build: function (g) {
      g.env({ sky: 'sunset', ground: '#c9824a', trees: 12 });
      var court = M.box(8, 0.02, 10, '#d9945a'); court.position.set(0, 0.01, -4); g.add(court);
      var hoop = new THREE.Group(), board = M.box(1.8, 1.05, 0.05, '#ffffff'), sq = M.box(0.6, 0.45, 0.06, '#e23b3b');
      board.position.set(0, 3.35, -0.2); sq.position.set(0, 3.25, -0.19);
      var rim = new THREE.Mesh(M.geo.torus(0.23, 0.02, 6, 20), R.mat.lambert('#ff5a1f')); rim.rotation.x = Math.PI / 2; rim.position.set(0, 3.05, 0.12);
      var net = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.23, 0.15, 0.4, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#fff', wireframe: true }));
      net.position.set(0, 2.85, 0.12); var pole = M.cyl(0.08, 0.08, 3.4, '#555', 8); pole.position.set(0, 1.7, -0.6);
      hoop.add(board, sq, rim, net, pole); g.add(hoop);
      var dist = 3.2; function placeHoop() { hoop.position.set((Math.random() - 0.5) * 2, 0, -dist); }
      placeHoop();
      var pr = G.proj(g), made = 0;
      G.thrower(g, {
        make: function () { var b = M.sphere(0.12, '#e8722a', 12); return b; }, base: 3, k: 1.8, min: 5, max: 11, lift: 0.35,
        thrown: function (m, v) {
          var scored = false;
          pr.add({ mesh: m, v: v, life: 4, spin: 4, floor: 0.12, onFloor: function (o) { if (Math.abs(o.v.y) > 1.2) { o.v.y = -o.v.y * 0.6; o.v.x *= 0.8; o.v.z *= 0.8; o.mesh.position.y = 0.12; R.sfx.play('thud', 0.4); return false; } return true; },
            step: function (o) {
              var p = o.mesh.position, h = hoop.position, rx = p.x - h.x, rz = p.z - (h.z + 0.12);
              if (!scored && o.v.y < 0 && Math.abs(p.y - 3.05) < 0.12 && Math.hypot(rx, rz) < 0.2) {
                scored = true; made++; var pts = dist > 5.5 ? 3 : 2; g.addScore(pts); R.sfx.play('coin'); g.burst(new V(h.x, 3, h.z), '#ffd23f', 14, 3);
                g.setInfo('Cesta! +' + pts); if (made % 5 === 0) { dist = Math.min(8, dist + 1.2); placeHoop(); }
              }
              var bz = h.z - 0.2; // tabela
              if (o.v.z < 0 && p.z < bz + 0.14 && p.z > bz - 0.2 && Math.abs(p.x - h.x) < 0.9 && p.y > 2.8 && p.y < 3.9) { o.v.z = -o.v.z * 0.6; R.sfx.play('thud', 0.6); }
              var dr = Math.hypot(rx, rz); // aro
              if (Math.abs(p.y - 3.05) < 0.1 && dr > 0.17 && dr < 0.3 && !scored) { o.v.x += rx * 6; o.v.z += rz * 6; o.v.y *= 0.5; }
            } });
        }
      });
      g.hud({ y: 4.3, z: -3.5, info: 'Arremesse para cima, em arco!' }); g.round(60);
    } });

  // ---------------------------------------------------------------- Minigolfe
  var HOLES = [
    { par: 2, start: [0, 0], hole: [0, -7], walls: [] },
    { par: 3, start: [-2, 0], hole: [2, -7], walls: [[-3.5, -3.5, 4, 0.3]] },
    { par: 3, start: [0, 0], hole: [0, -8], walls: [[-1.2, -4, 0.3, 3], [1.2, -4, 0.3, 3], [0, -6, 1.6, 0.3]] }
  ];
  R.game({ id: 'minigolfe', name: 'Minigolfe', cat: 'Esporte', c1: '#2fa84f', c2: '#f5f5f5', glyph: '⛳',
    desc: '3 buracos com obstáculos. Menos tacadas = melhor.', controls: 'Aponte no chão para mirar, segure o gatilho (força) e solte.',
    build: function (g) {
      g.env({ sky: 'day', ground: '#4e8f3a', trees: 25, clouds: 8 });
      var hi = 0, strokes = 0, total = 0, course = new THREE.Group(); g.add(course);
      var ball = M.sphere(0.06, '#ffffff', 12); g.add(ball); var vel = new V(), walls = [], holeP = new V(), charging = null, power = 0;
      var aim = new THREE.Mesh(M.geo.box(0.03, 0.01, 1), R.mat.basic('#ffd23f')); aim.geometry = new THREE.BoxBufferGeometry(0.03, 0.01, 1); aim.geometry.translate(0, 0, -0.5); g.add(aim);
      function load() {
        while (course.children.length) course.remove(course.children[0]);
        var H = HOLES[hi]; walls = [];
        var green = M.box(6, 0.04, 10, '#36b34a'); green.position.set(0, 0.02, -4); course.add(green);
        var bounds = [[0, 1, 6.4, 0.2], [0, -9, 6.4, 0.2], [-3.1, -4, 0.2, 10], [3.1, -4, 0.2, 10]].concat(H.walls);
        bounds.forEach(function (w) { var m = M.box(w[2], 0.2, w[3], '#8a5a2a'); m.position.set(w[0], 0.1, w[1]); course.add(m); walls.push(w); });
        var cup = new THREE.Mesh(new THREE.CircleBufferGeometry(0.1, 16), R.mat.basic('#111')); cup.rotation.x = -Math.PI / 2; cup.position.set(H.hole[0], 0.045, H.hole[1]); course.add(cup);
        var fl = M.cyl(0.01, 0.01, 1.2, '#eee', 4); fl.position.set(H.hole[0], 0.6, H.hole[1]); var fg = M.box(0.3, 0.2, 0.01, '#e23b3b'); fg.position.set(H.hole[0] + 0.15, 1.1, H.hole[1]); course.add(fl, fg);
        holeP.set(H.hole[0], 0.1, H.hole[1]); ball.position.set(H.start[0], 0.1, H.start[1]); vel.set(0, 0, 0); strokes = 0; movePlayer();
        g.setInfo('Buraco ' + (hi + 1) + '/3 • par ' + H.par + ' • tacadas: 0');
      }
      function movePlayer() { var d = new V().subVectors(ball.position, holeP).setY(0).normalize(); R.player.x = ball.position.x + d.x * 1.4; R.player.z = ball.position.z + d.z * 1.4; R.player.yaw = Math.atan2(d.x, d.z); }
      load();
      var gp = new THREE.Plane(new V(0, 1, 0), -0.05), pt = new V();
      g.on('press', function (p) { if (vel.lengthSq() < 0.0004 && !g.over) { charging = p; power = 0; } });
      g.on('release', function (p) {
        if (charging !== p) return; charging = null;
        if (!p.ray.ray.intersectPlane(gp, pt)) return;
        var d = pt.sub(ball.position).setY(0).normalize(); vel.copy(d.multiplyScalar(0.8 + power * 6)); strokes++; total++; g.setScore(total); R.sfx.play('hit', 0.5);
        g.setInfo('Buraco ' + (hi + 1) + '/3 • par ' + HOLES[hi].par + ' • tacadas: ' + strokes);
      });
      g.on('update', function (dt) {
        var p = R.input.pointers[0];
        if (charging) power = Math.min(1, power + dt * 0.7);
        if (p.ray.ray.intersectPlane(gp, pt) && vel.lengthSq() < 0.0004) { aim.visible = true; aim.position.copy(ball.position); aim.lookAt(pt.x, ball.position.y, pt.z); aim.rotateY(Math.PI); aim.scale.z = 0.3 + power * 2; aim.material.color.setHSL(0.33 - power * 0.33, 1, 0.5); R.input.setLaser(p, p.origin.distanceTo(pt), pt.clone()); }
        else aim.visible = false;
        if (vel.lengthSq() > 0) {
          var steps = 4; for (var s = 0; s < steps; s++) {
            ball.position.addScaledVector(vel, dt / steps);
            for (var i = 0; i < walls.length; i++) { var w = walls[i], dx = ball.position.x - w[0], dz = ball.position.z - w[1], hx = w[2] / 2 + 0.06, hz = w[3] / 2 + 0.06;
              if (Math.abs(dx) < hx && Math.abs(dz) < hz) { var ox = hx - Math.abs(dx), oz = hz - Math.abs(dz); if (ox < oz) { vel.x = -vel.x * 0.8; ball.position.x = w[0] + Math.sign(dx) * hx; } else { vel.z = -vel.z * 0.8; ball.position.z = w[1] + Math.sign(dz) * hz; } R.sfx.play('thud', 0.3); } }
          }
          vel.multiplyScalar(Math.max(0, 1 - dt * 0.9)); if (vel.length() < 0.05) { vel.set(0, 0, 0); movePlayer(); }
          ball.rotation.x -= vel.z * dt * 10; ball.rotation.z += vel.x * dt * 10;
          if (ball.position.distanceTo(holeP) < 0.1 && vel.length() < 2.5) {
            vel.set(0, 0, 0); R.sfx.play('win'); var diff = strokes - HOLES[hi].par;
            R.ui.toast(strokes === 1 ? 'HOLE IN ONE! ⛳' : diff < 0 ? 'Birdie!' : diff === 0 ? 'Par' : 'Bogey +' + diff, 2.5);
            hi++; if (hi >= HOLES.length) g.end('Campo completo: ' + total + ' tacadas', true); else g.after(1.5, load);
          }
        }
      });
      g.hud({ follow: true }); g.hudState.scoreLabel = 'Tacadas';
    } });

  // ---------------------------------------------------------------- Dardos
  R.game({ id: 'dardos', name: 'Dardos', cat: 'Esporte', c1: '#1b1c2b', c2: '#e23b3b', glyph: '🎯',
    desc: 'Alvo oficial: 20 setores, duplo, triplo e mosca. 5 rodadas de 3 dardos.', controls: 'Segure o gatilho, mire e dê um peteleco para frente.',
    build: function (g) {
      g.env({ sky: 'night', ground: '#3a2a20', light: { hemi: 0.8 } });
      var wall = M.box(4, 3, 0.1, '#2b3a2b'); wall.position.set(0, 1.5, -2.45); g.add(wall);
      var c = document.createElement('canvas'); c.width = c.height = 512; var x = c.getContext('2d'), cx = 256, R0 = 250;
      var NUM = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
      x.fillStyle = '#111'; x.beginPath(); x.arc(cx, cx, R0, 0, 7); x.fill();
      var rings = [[0.95, 'd'], [0.75, 's'], [0.6, 't'], [0.5, 's']];
      function ringFill(r1, r0, alt) { for (var i = 0; i < 20; i++) { var a0 = (i - 0.5) / 20 * Math.PI * 2 - Math.PI / 2, a1 = (i + 0.5) / 20 * Math.PI * 2 - Math.PI / 2; x.beginPath(); x.arc(cx, cx, r1 * R0 * 0.85, a0, a1); x.arc(cx, cx, r0 * R0 * 0.85, a1, a0, true); x.fillStyle = alt ? (i % 2 ? '#2fa84f' : '#e23b3b') : (i % 2 ? '#f2e6c9' : '#111'); x.fill(); } }
      ringFill(1, 0.95, true); ringFill(0.95, 0.6, false); ringFill(0.6, 0.55, true); ringFill(0.55, 0.1, false);
      x.fillStyle = '#2fa84f'; x.beginPath(); x.arc(cx, cx, 0.1 * R0 * 0.85, 0, 7); x.fill(); x.fillStyle = '#e23b3b'; x.beginPath(); x.arc(cx, cx, 0.04 * R0 * 0.85, 0, 7); x.fill();
      x.fillStyle = '#fff'; x.font = 'bold 26px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      for (var i = 0; i < 20; i++) { var a = i / 20 * Math.PI * 2 - Math.PI / 2; x.fillText(NUM[i], cx + Math.cos(a) * R0 * 0.93, cx + Math.sin(a) * R0 * 0.93); }
      var tex = new THREE.CanvasTexture(c), board = new THREE.Mesh(new THREE.CircleBufferGeometry(0.26, 40), new THREE.MeshBasicMaterial({ map: tex }));
      board.position.set(0, 1.73, -2.37); g.add(board);
      var line = M.box(1, 0.01, 0.04, '#ffd23f'); line.position.set(0, 0.01, 0); g.add(line);
      var pr = G.proj(g), darts = 0, roundPts = 0, rad = 0.26 / 0.85; // raio "útil"
      function scoreAt(px, py) {
        var dx = px, dy = py, r = Math.hypot(dx, dy) / (0.26 * 0.85 / 0.85) / 0.85; // normalizado p/ 0..1 no anel duplo
        r = Math.hypot(dx, dy) / (0.26 * 0.85);
        if (r < 0.04) return 50; if (r < 0.1) return 25; if (r > 1) return 0;
        var ang = Math.atan2(-dy, dx) + Math.PI / 2; var idx = Math.round(ang / (Math.PI * 2) * 20); idx = ((idx % 20) + 20) % 20;
        var base = NUM[idx]; if (r > 0.95) return base * 2; if (r > 0.55 && r < 0.6) return base * 3; return base;
      }
      G.thrower(g, {
        make: function () { var d = new THREE.Group(); var b = M.cyl(0.008, 0.008, 0.14, '#ccc', 6); b.rotation.x = Math.PI / 2; var f = M.box(0.04, 0.001, 0.04, '#e23b3b'); f.position.z = 0.07; d.add(b, f); return d; },
        base: 4, k: 2, min: 6, max: 13, lift: 0.04, hold: 0.25, can: function () { return darts < 15 && !g.over; },
        thrown: function (m, v) {
          darts++;
          pr.add({ mesh: m, v: v, life: 3, align: true, keep: true, floor: 0, onFloor: function (o) { o.v.set(0, 0, 0); o.grav = 0; return true; },
            step: function (o) {
              if (o.mesh.position.z <= -2.36) {
                o.v.set(0, 0, 0); o.grav = 0; o.mesh.position.z = -2.36;
                var s = scoreAt(o.mesh.position.x, o.mesh.position.y - 1.73); g.addScore(s); roundPts += s; R.sfx.play(s ? 'hit' : 'thud');
                R.ui.toast(s === 50 ? 'MOSCA! 50' : s ? '+' + s : 'Fora!', 1.2);
                if (darts % 3 === 0) { g.setInfo('Rodada ' + darts / 3 + ': ' + roundPts + ' pts'); roundPts = 0; }
                if (darts >= 15) g.after(1.2, function () { g.end(); });
                return false;
              }
            } });
        }
      });
      g.hud({ y: 2.55, z: -2.35, scale: 0.8, info: '15 dardos' });
    } });

  // ---------------------------------------------------------------- Pingue-pongue no paredão
  R.game({ id: 'pingpong', name: 'Paredão de Pingue-Pongue', cat: 'Esporte', c1: '#2d7cf6', c2: '#e23b3b', glyph: '🏓',
    desc: 'Rebata a bolinha contra a parede o máximo de vezes seguidas.', controls: 'Mova a raquete com o controle até a bolinha.',
    build: function (g) {
      g.env({ sky: 'day', ground: '#6d7a8c', light: { hemi: 0.9 } });
      var table = M.box(1.5, 0.05, 2.6, '#1f5fbf'); table.position.set(0, 0.74, -1.5); g.add(table);
      var lineM = M.box(0.02, 0.052, 2.6, '#fff'); lineM.position.set(0, 0.741, -1.5); g.add(lineM);
      var wall = M.box(3, 2.5, 0.1, '#e8e8e8'); wall.position.set(0, 1.25, -2.85); g.add(wall);
      var paddles = g.holdAll(function () { var pd = new THREE.Group(); var face = M.cyl(0.09, 0.09, 0.015, '#d32f2f', 16); face.rotation.x = Math.PI / 2; face.position.z = -0.12; var h = M.box(0.03, 0.03, 0.1, '#7a5232'); h.position.z = -0.02; pd.add(face, h); return pd; });
      var ball = M.sphere(0.022, '#ffffff', 10); g.add(ball); var v = new V(), streak = 0, cool = 0;
      function serve() { ball.position.set(0, 1.3, -2.6); v.set((Math.random() - 0.5) * 0.6, 0.5, 3.0); }
      serve();
      var pp = new V();
      g.on('update', function (dt) {
        cool -= dt; var sub = 3, h = dt / sub;
        for (var s = 0; s < sub; s++) {
          v.y -= 9.8 * g.gScale * h; ball.position.addScaledVector(v, h);
          var b = ball.position;
          if (b.y < 0.787 && b.z > -2.8 && b.z < -0.2 && Math.abs(b.x) < 0.75 && v.y < 0) { b.y = 0.787; v.y = -v.y * 0.92; R.sfx.play('tick'); R.sfx.play('thud', 0.15); }
          if (b.z < -2.78 && v.z < 0) { v.z = -v.z * 0.95; R.sfx.play('thud', 0.3); }
          var ps = R.input.pointers;
          for (var i = 0; i < ps.length && cool <= 0; i++) {
            var p = ps[i]; p.tip(0.12 * R.input.giant + 0.0, pp); pp.copy(p.obj.localToWorld(new V(0, 0, -0.12)));
            if (pp.distanceTo(b) < 0.14 * R.input.giant && v.z > 0) {
              var n = p.dir.clone(); v.set(n.x * 1.5 + (b.x - pp.x) * 4, 2.2, -Math.max(3.2, 3 + p.vel.length() * 0.4));
              streak++; g.setScore(Math.max(g.score, streak)); g.setInfo('Sequência: ' + streak); R.sfx.play('hit', 0.4); cool = 0.25;
            }
          }
          if (b.z > 0.7 || b.y < 0) { if (streak > 0) R.sfx.play('lose'); streak = 0; g.setInfo('Errou! Sequência: 0'); serve(); break; }
        }
      });
      g.hud({ y: 2.75, z: -2.75, scale: 0.8 }); g.hudState.scoreLabel = 'Melhor sequência'; g.round(90);
    } });

  // ---------------------------------------------------------------- Goleiro
  R.game({ id: 'goleiro', name: 'Goleiro', cat: 'Esporte', featured: true, c1: '#2fa84f', c2: '#ffffff', glyph: '🧤',
    desc: 'Defenda os chutes! Suas luvas aparecem onde você aponta na linha do gol.', controls: 'Aponte para onde a bola vai. 3 gols e acabou.',
    build: function (g) {
      g.env({ sky: 'day', ground: '#3d9b44', clouds: 6 });
      for (var s = 0; s < 10; s++) { var st = M.box(6, 0.01, 2, s % 2 ? '#3d9b44' : '#46a84d'); st.position.set(0, 0.005, -s * 2 - 1); g.add(st); }
      var post = function (x, y, w, h) { var m = M.box(w, h, 0.1, '#fff'); m.position.set(x, y, 0.4); g.add(m); };
      post(-2.5, 1.1, 0.1, 2.2); post(2.5, 1.1, 0.1, 2.2); post(0, 2.2, 5.1, 0.1);
      var netm = new THREE.Mesh(M.geo.plane(5, 2.2), new THREE.MeshBasicMaterial({ color: '#fff', wireframe: true, transparent: true, opacity: 0.25 })); netm.position.set(0, 1.1, 1.4); g.add(netm);
      var crowd = M.box(30, 4, 1, '#506070'); crowd.position.set(0, 2, -26); g.add(crowd);
      var kicker = M.blocky('#e23b3b', '#fff'); kicker.scale.setScalar(1.8); kicker.position.set(0, 0, -11); kicker.rotation.y = 0; g.add(kicker);
      var gloves = g.holdAll(function () { var gl = M.box(0.22, 0.26, 0.08, '#ffd23f'); gl.visible = false; return gl; });
      var gloveW = [], ball = M.sphere(0.11, '#ffffff', 12); g.add(ball); var v = new V(), live = false, goals = 0, plane = new THREE.Plane(new V(0, 0, 1), 1.5), tmp = new V();
      var markers = []; for (var i = 0; i < 2; i++) { var mk = M.box(0.34, 0.4, 0.1, '#ffd23f'); g.add(mk); markers.push(mk); }
      function kick() {
        ball.position.set(0, 0.11, -10); var tx = (Math.random() - 0.5) * 4.4, ty = 0.3 + Math.random() * 1.7, T = Math.max(0.6, 1.2 - g.score * 0.025);
        v.set(tx / T, (ty - 0.11) / T + 0.5 * 9.8 * T * 0.6, 10 / T); live = true; R.sfx.play('hit');
      }
      g.after(1.5, kick);
      g.on('update', function (dt) {
        var ps = R.input.pointers;
        for (var i = 0; i < markers.length; i++) {
          var p = ps[i]; if (!p) { markers[i].visible = false; continue; }
          markers[i].visible = true; if (p.ray.ray.intersectPlane(plane, tmp)) { tmp.x = Math.max(-2.3, Math.min(2.3, tmp.x)); tmp.y = Math.max(0.15, Math.min(2.2, tmp.y)); markers[i].position.copy(tmp); markers[i].scale.setScalar(R.input.giant > 1 ? 1.6 : 1); }
        }
        if (!live) return;
        v.y -= 9.8 * 0.6 * dt; ball.position.addScaledVector(v, dt); ball.rotation.x += dt * 10;
        if (ball.position.y < 0.11) { ball.position.y = 0.11; v.y = Math.abs(v.y) * 0.5; }
        if (ball.position.z > -1.75 && ball.position.z < -1.25 && v.z > 0) {
          for (var k = 0; k < markers.length; k++) if (markers[k].visible && Math.hypot(markers[k].position.x - ball.position.x, markers[k].position.y - ball.position.y) < 0.36 * markers[k].scale.x) {
            v.z = -v.z * 0.5; v.x += (Math.random() - 0.5) * 3; v.y += 2; g.addScore(1); R.sfx.play('thud'); g.setInfo('DEFENDEU! 🧤'); live = false; g.after(1.4, kick); return;
          }
        }
        if (ball.position.z > 0.6) {
          live = false;
          if (Math.abs(ball.position.x) < 2.5 && ball.position.y < 2.2) { goals++; R.sfx.play('lose'); g.setInfo('GOL... (' + goals + '/3)'); if (goals >= 3) { g.end('Fim! ' + g.score + ' defesas'); return; } }
          else g.setInfo('Pra fora!');
          g.after(1.4, kick);
        }
      });
      g.hud({ y: 3.2, z: -4 }); g.hudState.scoreLabel = 'Defesas';
    } });

  // ---------------------------------------------------------------- Pênalti
  R.game({ id: 'penalti', name: 'Cobrança de Pênalti', cat: 'Esporte', c1: '#ffffff', c2: '#2fa84f', glyph: '⚽',
    desc: '10 cobranças contra um goleiro esperto. Mire nos cantos!', controls: 'Aponte para o canto do gol, segure o gatilho e dê um peteleco.',
    build: function (g) {
      g.env({ sky: 'day', ground: '#3d9b44', clouds: 6 });
      var gz = -11, post = function (x, y, w, h) { var m = M.box(w, h, 0.12, '#fff'); m.position.set(x, y, gz); g.add(m); };
      post(-3.66, 1.22, 0.12, 2.44); post(3.66, 1.22, 0.12, 2.44); post(0, 2.44, 7.44, 0.12);
      var netm = new THREE.Mesh(M.geo.plane(7.3, 2.44), new THREE.MeshBasicMaterial({ color: '#fff', wireframe: true, transparent: true, opacity: 0.3 })); netm.position.set(0, 1.22, gz - 1.2); g.add(netm);
      var keeper = M.blocky('#ffd23f', '#222'); keeper.scale.setScalar(1.9); keeper.position.set(0, 0, gz + 0.3); keeper.rotation.y = Math.PI; g.add(keeper);
      var ball = M.sphere(0.11, '#fff', 12); g.add(ball); var v = new V(), live = false, shots = 0, dive = 0;
      R.player.z = 1.2;
      function place() { ball.position.set(0, 0.11, -0.6); v.set(0, 0, 0); live = false; keeper.position.set(0, 0, gz + 0.3); keeper.rotation.z = 0; }
      place();
      g.on('press', function () { });
      g.on('release', function (p) {
        if (live || shots >= 10 || g.over) return;
        var d = p.dir.clone(); var sp = Math.max(12, Math.min(28, 14 + p.vel.length() * 3)); d.y = Math.max(0.02, d.y + 0.08); d.normalize();
        v.copy(d.multiplyScalar(sp)); live = true; shots++; R.sfx.play('hit');
        var tx = ball.position.x + v.x / -v.z * (ball.position.z - gz); dive = Math.random() < 0.6 ? Math.sign(tx || 1) * Math.min(2.4, Math.abs(tx) + (Math.random() - 0.5)) : (Math.random() - 0.5) * 4;
      });
      g.on('update', function (dt) {
        if (!live) return;
        v.y -= 9.8 * g.gScale * dt; ball.position.addScaledVector(v, dt);
        keeper.position.x += (dive - keeper.position.x) * Math.min(1, dt * 3.2); keeper.rotation.z = -keeper.position.x * 0.35;
        if (ball.position.y < 0.11) { ball.position.y = 0.11; v.y = -v.y * 0.5; }
        if (ball.position.z < gz + 0.4) {
          live = false;
          var kx = keeper.position.x, saved = Math.abs(ball.position.x - kx) < 1.0 && ball.position.y < 2.1;
          var inGoal = Math.abs(ball.position.x) < 3.6 && ball.position.y < 2.44;
          if (inGoal && !saved) { g.addScore(1); R.sfx.play('win'); g.burst(ball.position, '#ffd23f', 20, 4); g.setInfo('GOOOL! ⚽ (' + shots + '/10)'); }
          else { R.sfx.play('lose'); g.setInfo((saved ? 'Defendeu!' : 'Pra fora!') + ' (' + shots + '/10)'); }
          if (shots >= 10) g.after(1.5, function () { g.end(g.score + ' gols em 10'); }); else g.after(1.5, place);
        }
      });
      g.hud({ y: 3.6, z: -9 }); g.hudState.scoreLabel = 'Gols';
    } });

  // ---------------------------------------------------------------- Argolas
  R.game({ id: 'argolas', name: 'Jogo de Argolas', cat: 'Esporte', c1: '#e23b3b', c2: '#ffd23f', glyph: '⭕',
    desc: 'Barraca de festa junina: acerte as argolas nos pinos. Pinos de trás valem mais.', controls: 'Segure o gatilho, balance e solte em arco.',
    build: function (g) {
      g.env({ sky: 'night', ground: '#4a3a2a', light: { hemi: 0.8 } });
      for (var b = 0; b < 12; b++) { var flag = M.cone(0.15, 0.25, ['#e23b3b', '#ffd23f', '#2d7cf6', '#2fa84f'][b % 4], 3); flag.rotation.x = Math.PI; flag.position.set(-3 + b * 0.55, 3, -3.5); g.add(flag); }
      var lamp = new THREE.PointLight('#ffd59a', 1, 10); lamp.position.set(0, 3, -2); g.add(lamp);
      var table = M.box(2.4, 0.6, 1.8, '#7a5232'); table.position.set(0, 0.3, -2.8); g.add(table);
      var pegs = [];
      for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) { var pg = M.cyl(0.02, 0.02, 0.35, '#eee', 6); pg.position.set((c - 1) * 0.6, 0.78, -2.2 - r * 0.55); g.add(pg); pegs.push({ m: pg, pts: r + 1 }); }
      var pr = G.proj(g), rings = 12;
      G.thrower(g, {
        make: function () { return new THREE.Mesh(M.geo.torus(0.1, 0.015, 6, 16), R.mat.lambert(['#e23b3b', '#2d7cf6', '#2fa84f', '#ffd23f'][rings % 4])); }, base: 2, k: 1.4, min: 3, max: 7.5, lift: 0.3,
        can: function () { return rings > 0 && !g.over; },
        thrown: function (m, v) {
          rings--; g.setInfo('Argolas: ' + rings); m.rotation.x = Math.PI / 2;
          pr.add({ mesh: m, v: v, life: 4, keep: true, floor: 0.62, onFloor: function (o) { o.v.set(0, 0, 0); o.grav = 0; o.mesh.position.y = Math.max(o.mesh.position.y, 0.015); return true; },
            step: function (o) {
              o.mesh.rotation.z += 0.2; o.mesh.rotation.x = Math.PI / 2;
              for (var i = 0; i < pegs.length; i++) { var pg = pegs[i].m; if (o.v.y < 0 && o.mesh.position.y < 0.96 && o.mesh.position.y > 0.6 && Math.hypot(o.mesh.position.x - pg.position.x, o.mesh.position.z - pg.position.z) < 0.08) {
                o.mesh.position.set(pg.position.x, 0.64, pg.position.z); g.addScore(pegs[i].pts); R.sfx.play('coin'); R.ui.toast('+' + pegs[i].pts, 1); return false; } }
              if (o.mesh.position.y < 0.62 && Math.abs(o.mesh.position.x) > 1.2) o.floor = 0.015;
            } });
          if (rings <= 0) g.after(2.5, function () { g.end(); });
        }
      });
      g.hud({ y: 2.3, z: -3.6, info: 'Argolas: 12' });
    } });

  // ---------------------------------------------------------------- Derruba Latas (física)
  R.game({ id: 'latas', name: 'Derruba Latas', cat: 'Física', c1: '#9aa3ad', c2: '#e23b3b', glyph: '🥫',
    desc: 'Pirâmides de latas e bolas de pano. Derrube tudo com o mínimo de bolas.', controls: 'Segure o gatilho, balance e solte.',
    build: function (g) {
      g.env({ sky: 'sunset', ground: '#4a3a2a', trees: 10 });
      var ph = g.phys({ friction: 0.4, restitution: 0.2 }), cans = [], balls = 9, level = 0;
      var table = M.box(2, 1, 0.8, '#7a5232'); table.position.set(0, 0.5, -4); ph.box(table, 2, 1, 0.8, 0);
      function stack() {
        for (var i = 0; i < cans.length; i++) ph.remove(cans[i].userData.body); cans = [];
        var rows = 3 + Math.min(2, level);
        for (var r = 0; r < rows; r++) for (var c = 0; c < rows - r; c++) {
          var cn = M.cyl(0.06, 0.06, 0.16, ['#e23b3b', '#2d7cf6', '#ffd23f', '#2fa84f'][(r + c) % 4], 10);
          cn.position.set((c - (rows - r - 1) / 2) * 0.13, 1.08 + r * 0.165, -4); ph.cylinder(cn, 0.06, 0.16, 0.3, 8); cans.push(cn);
        }
      }
      stack();
      G.thrower(g, {
        make: function () { return M.sphere(0.07, '#d9c7a0', 10); }, base: 5, k: 2.2, min: 7, max: 16, lift: 0.06, can: function () { return balls > 0 && !g.over; },
        thrown: function (m, v) { balls--; var b = ph.sphere(m, 0.07, 0.4); b.velocity.set(v.x, v.y, v.z); g.setInfo('Bolas: ' + balls); g.after(3, check); }
      });
      function check() {
        var up = cans.filter(function (c) { return c.position.y > 1.0 && Math.abs(c.position.z + 4) < 0.45 && Math.abs(c.position.x) < 1; }).length;
        if (up === 0) { level++; g.addScore(10 + balls * 5); R.sfx.play('win'); R.ui.toast('Limpou! Nível ' + (level + 1)); balls += 4; stack(); }
        else if (balls <= 0) g.end('Sobraram ' + up + ' latas');
      }
      g.hud({ y: 2.4, z: -4.4, info: 'Bolas: 9' });
    } });

  // ---------------------------------------------------------------- Air Hockey
  R.game({ id: 'airhockey', name: 'Air Hockey', cat: 'Esporte', c1: '#2de2ff', c2: '#ff2dbd', glyph: '🏒',
    desc: 'Mesa neon contra a CPU. Primeiro a 7 gols vence.', controls: 'Aponte para a mesa: o batedor segue seu laser.',
    build: function (g) {
      g.env({ sky: 'neon', ground: '#140026' });
      var W = 1.1, L = 2.0, Y = 0.85, Z = -1.3;
      var top = M.box(W + 0.12, 0.08, L + 0.12, '#1a1a2e'); top.position.set(0, Y - 0.04, Z); g.add(top);
      var surf = M.box(W, 0.01, L, null, R.mat.basic('#0d2b4a')); surf.position.set(0, Y, Z); g.add(surf);
      var mid = M.box(W, 0.012, 0.02, null, R.mat.basic('#ff2dbd')); mid.position.set(0, Y, Z); g.add(mid);
      [-1, 1].forEach(function (s) { var gl = M.box(0.35, 0.013, 0.02, null, R.mat.basic(s < 0 ? '#ff2dbd' : '#2de2ff')); gl.position.set(0, Y + 0.001, Z + s * L / 2); g.add(gl); });
      var puck = M.cyl(0.045, 0.045, 0.02, '#ffd23f', 16); g.add(puck); var pv = new V();
      var me = M.cyl(0.06, 0.06, 0.05, '#2de2ff', 16), ai = M.cyl(0.06, 0.06, 0.05, '#ff2dbd', 16); g.add(me, ai);
      me.position.set(0, Y + 0.03, Z + 0.7); ai.position.set(0, Y + 0.03, Z - 0.7);
      var plane = new THREE.Plane(new V(0, 1, 0), -Y), tmp = new V(), mePrev = new V(), cpu = 0;
      function reset(towardMe) { puck.position.set(0, Y + 0.012, Z + (towardMe ? -0.3 : 0.3)); pv.set(0, 0, 0); }
      reset(true);
      g.on('update', function (dt) {
        var p = R.input.pointers[0]; mePrev.copy(me.position);
        if (p.ray.ray.intersectPlane(plane, tmp)) { me.position.x = Math.max(-W / 2 + 0.06, Math.min(W / 2 - 0.06, tmp.x)); me.position.z = Math.max(Z + 0.08, Math.min(Z + L / 2 - 0.06, tmp.z)); R.input.setLaser(p, p.origin.distanceTo(tmp), tmp.clone()); }
        var meV = me.position.clone().sub(mePrev).divideScalar(Math.max(dt, 1e-3));
        // CPU
        var tx = puck.position.x, tz = puck.position.z < Z ? puck.position.z - 0.08 : Z - 0.7;
        ai.position.x += Math.max(-1.6 * dt, Math.min(1.6 * dt, tx - ai.position.x)); ai.position.z += Math.max(-1.2 * dt, Math.min(1.2 * dt, Math.max(Z - L / 2 + 0.06, Math.min(Z - 0.08, tz)) - ai.position.z));
        var aiV = new V(0, 0, 1.5);
        var sub = 4; for (var s = 0; s < sub; s++) {
          puck.position.addScaledVector(pv, dt / sub);
          var px = puck.position.x, pz = puck.position.z;
          if (Math.abs(px) > W / 2 - 0.045) { pv.x = -pv.x * 0.9; puck.position.x = Math.sign(px) * (W / 2 - 0.045); R.sfx.play('tick'); }
          if (Math.abs(pz - Z) > L / 2 - 0.045) {
            if (Math.abs(px) < 0.17) { if (pz > Z) { cpu++; R.sfx.play('lose'); g.setInfo('CPU marcou! ' + g.score + ' x ' + cpu); reset(true); } else { g.addScore(1); R.sfx.play('win'); g.setInfo('GOL! ' + g.score + ' x ' + cpu); reset(false); } if (g.score >= 7 || cpu >= 7) g.end(g.score >= 7 ? 'Você venceu! ' + g.score + ' x ' + cpu : 'CPU venceu ' + cpu + ' x ' + g.score); return; }
            pv.z = -pv.z * 0.9; puck.position.z = Z + Math.sign(pz - Z) * (L / 2 - 0.045); R.sfx.play('tick');
          }
          [[me, meV], [ai, aiV]].forEach(function (pair) {
            var m = pair[0], d = puck.position.clone().sub(m.position); d.y = 0; var dist = d.length();
            if (dist < 0.105 && dist > 0) { d.normalize(); puck.position.copy(m.position).addScaledVector(d, 0.106); puck.position.y = Y + 0.012; var rel = pv.clone().sub(pair[1]); var vn = rel.dot(d); if (vn < 0) pv.addScaledVector(d, -1.8 * vn); pv.clampLength(0, 4.5); R.sfx.play('hit', 0.3); }
          });
        }
        pv.multiplyScalar(1 - dt * 0.15);
      });
      g.hud({ y: 1.9, z: -2.6, info: 'Primeiro a 7!' });
    } });

  // ---------------------------------------------------------------- Beisebol
  R.game({ id: 'beisebol', name: 'Home Run Derby', cat: 'Esporte', c1: '#2fa84f', c2: '#c9824a', glyph: '⚾',
    desc: '10 arremessos. Gire o taco no tempo certo e mande a bola para longe!', controls: 'Balance o controle rápido quando a bola chegar.',
    build: function (g) {
      g.env({ sky: 'day', ground: '#3d9b44', clouds: 8 });
      var dirt = new THREE.Mesh(new THREE.CircleBufferGeometry(3, 20), R.mat.lambert('#c9824a')); dirt.rotation.x = -Math.PI / 2; dirt.position.set(0, 0.01, -9); g.add(dirt);
      var fence = new THREE.Mesh(new THREE.CylinderBufferGeometry(60, 60, 3, 32, 1, true, Math.PI * 0.75, Math.PI * 0.5), R.mat.lambert('#2a5a2a', { side: THREE.DoubleSide })); fence.position.y = 1.5; g.add(fence);
      var pitcher = M.blocky('#2d7cf6', '#fff'); pitcher.scale.setScalar(1.8); pitcher.position.set(0, 0, -16); pitcher.rotation.y = 0; g.add(pitcher);
      var bats = g.holdAll(function () { var bt = M.cyl(0.035, 0.02, 0.85, '#c9a46a', 8); bt.rotation.x = Math.PI / 2; bt.position.z = -0.45; var wr = new THREE.Group(); wr.add(bt); return wr; });
      var ball = M.sphere(0.04, '#fff', 8); g.add(ball); var v = new V(), state = 'wait', pitches = 0, best = 0, tmpA = new V(), tmpB = new V(), line = new THREE.Line3();
      function pitch() { if (pitches >= 10) { g.end('Melhor rebatida: ' + best.toFixed(0) + ' m'); return; } pitches++; ball.position.set(0, 1.4, -15.5); var ty = 0.8 + Math.random() * 0.5, vz = 13 + Math.random() * 6, T = 16.3 / vz; v.set((Math.random() - 0.5) * 0.4, (ty - 1.4) / T + 0.5 * 9.8 * 0.3 * T, vz); state = 'pitch'; R.sfx.play('whoosh'); }
      g.after(1.5, pitch);
      g.on('update', function (dt) {
        if (state === 'pitch') {
          v.y -= 9.8 * 0.3 * dt; ball.position.addScaledVector(v, dt);
          var ps = R.input.pointers;
          for (var i = 0; i < ps.length; i++) {
            var p = ps[i]; p.obj.localToWorld(tmpA.set(0, 0, -0.1)); p.obj.localToWorld(tmpB.set(0, 0, -0.9 * R.input.giant)); line.set(tmpA, tmpB);
            var cp = line.closestPointToPoint(ball.position, true, new V());
            if (cp.distanceTo(ball.position) < 0.12 * R.input.giant && p.angVel > 2.5) {
              var power = Math.min(1.6, p.angVel / 6); var ang = 0.25 + Math.random() * 0.35;
              var dir = new V((Math.random() - 0.5) * 0.8, Math.sin(ang), -Math.cos(ang)).normalize();
              v.copy(dir.multiplyScalar(18 + power * 22)); state = 'hit'; R.sfx.play('hit'); g.burst(ball.position, '#fff', 8, 2);
            }
          }
          if (ball.position.z > 1.5) { state = 'wait'; R.sfx.play('thud', 0.4); g.setInfo('Strike! (' + pitches + '/10)'); g.after(1.2, pitch); }
        } else if (state === 'hit') {
          v.y -= 9.8 * g.gScale * dt; ball.position.addScaledVector(v, dt);
          if (ball.position.y < 0.04) {
            var d = Math.hypot(ball.position.x, ball.position.z); state = 'wait'; best = Math.max(best, d);
            var hr = d > 60; g.addScore(Math.round(d)); g.setInfo((hr ? 'HOME RUN! ' : '') + d.toFixed(0) + ' m (' + pitches + '/10)'); if (hr) { R.sfx.play('win'); g.burst(ball.position, '#ffd23f', 25, 6); }
            g.after(1.5, pitch);
          }
        }
      });
      g.hud({ y: 3, z: -5, info: 'Balance o taco!' }); g.hudState.scoreLabel = 'Metros';
    } });
})();
