/* Boliche VR — física real (cannon), 10 frames com strikes/spares */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, M = R.models, C = window.CANNON;

  function scoreFrames(rolls) {
    var out = [], i = 0, total = 0;
    for (var f = 0; f < 10; f++) {
      if (rolls[i] === undefined) break;
      if (rolls[i] === 10) { if (rolls[i + 2] === undefined) break; total += 10 + rolls[i + 1] + rolls[i + 2]; i += 1; }
      else if (rolls[i + 1] === undefined) break;
      else if (rolls[i] + rolls[i + 1] === 10) { if (rolls[i + 2] === undefined) break; total += 10 + rolls[i + 2]; i += 2; }
      else { total += rolls[i] + rolls[i + 1]; i += 2; }
      out.push(total);
    }
    return out;
  }

  function buildBowling(g, opts) {
    opts = opts || {};
    var LEN = opts.len || 14, W = 1.06;
    g.env({ sky: opts.sky || 'night', ground: '#20232b', light: { hemi: 0.9, dir: 0.6 } });
    // salão
    var wallMat = R.mat.lambert('#2b2f3d');
    var back = M.box(12, 6, 0.2, null, wallMat); back.position.set(0, 3, -LEN - 2.5); g.add(back);
    for (var s = -1; s <= 1; s += 2) { var sw = M.box(0.2, 6, LEN + 8, null, wallMat); sw.position.set(s * 6, 3, -LEN / 2); g.add(sw); }
    for (var n = 0; n < 6; n++) { var neon = M.box(0.05, 0.05, LEN, null, R.mat.basic(n % 2 ? '#ff2dbd' : '#2de2ff')); neon.position.set(-5.8 + (n % 2) * 11.6, 2.5 + Math.floor(n / 2) * 1.0, -LEN / 2); g.add(neon); }
    // pistas vizinhas (decorativas)
    for (var l = -2; l <= 2; l++) {
      var lane = M.box(W, 0.1, LEN + 1, l === 0 ? '#d9a466' : '#b98a55'); lane.position.set(l * 2.2, -0.05, -LEN / 2 - 0.5); g.add(lane);
      for (var a = 0; a < 7; a++) { var ar = M.cone(0.04, 0.12, '#3a2a1a', 3); ar.rotation.x = -Math.PI / 2; ar.position.set(l * 2.2 + (a - 3) * 0.13, 0.005, -4.5 - Math.abs(a - 3) * 0.12); g.add(ar); }
      var gl = M.box(0.25, 0.04, LEN + 1, '#3a3d48'); gl.position.set(l * 2.2 - W / 2 - 0.125, -0.12, -LEN / 2 - 0.5); g.add(gl);
      var gr = gl.clone(); gr.position.x = l * 2.2 + W / 2 + 0.125; g.add(gr);
    }
    var ph = g.phys({ friction: 0.08, restitution: 0.3, iterations: 10 });
    var laneMatC = new C.Material('lane'), pinMatC = new C.Material('pin'), ballMatC = new C.Material('ball');
    ph.world.addContactMaterial(new C.ContactMaterial(ballMatC, pinMatC, { friction: 0.1, restitution: 0.55 }));
    ph.world.addContactMaterial(new C.ContactMaterial(pinMatC, pinMatC, { friction: 0.2, restitution: 0.5 }));
    ph.world.addContactMaterial(new C.ContactMaterial(ballMatC, laneMatC, { friction: 0.02, restitution: 0.05 }));
    ph.floor.material = laneMatC;
    // calhas: paredes invisíveis baixas p/ conter a bola
    [-1, 1].forEach(function (sd) { var b = new C.Body({ mass: 0 }); b.addShape(new C.Box(new C.Vec3(0.05, 0.3, LEN))); b.position.set(sd * (W / 2 + 0.3), 0.3, -LEN / 2); ph.world.addBody(b); });
    var pit = new C.Body({ mass: 0 }); pit.addShape(new C.Box(new C.Vec3(3, 1, 0.1))); pit.position.set(0, 1, -LEN - 1.6); ph.world.addBody(pit);
    var hood = M.box(2.6, 0.6, 0.6, '#14161c'); hood.position.set(0, 1.4, -LEN - 0.4); g.add(hood);
    var logo = M.text('REgo Lanes', 0.22, { color: '#ffd23f', size: 60 }); logo.position.set(0, 1.4, -LEN - 0.09); g.add(logo);

    var PIN_SPOTS = [], sp = 0.305;
    for (var r = 0; r < 4; r++) for (var c = 0; c <= r; c++) PIN_SPOTS.push([(c - r / 2) * sp, -LEN + 1 - r * sp * 0.866]);
    var pins = [];
    function placePins(onlyStanding) {
      for (var i = 0; i < 10; i++) {
        var p = pins[i];
        if (!p) {
          var m = M.pin(); m.position.set(PIN_SPOTS[i][0], 0.195, PIN_SPOTS[i][1]);
          var b = ph.cylinder(m, 0.055, 0.38, 1.5, 8); b.material = pinMatC; b.linearDamping = 0.1; b.angularDamping = 0.2;
          pins[i] = p = { mesh: m, body: b, down: false };
        }
        if (onlyStanding && p.down) { p.mesh.visible = false; p.body.collisionResponse = false; p.body.position.set(PIN_SPOTS[i][0], -5, 0); p.body.velocity.set(0, 0, 0); p.body.sleep(); continue; }
        p.down = false; p.mesh.visible = true; p.body.collisionResponse = true;
        p.body.position.set(PIN_SPOTS[i][0], 0.195, PIN_SPOTS[i][1]); p.body.quaternion.set(0, 0, 0, 1);
        p.body.velocity.set(0, 0, 0); p.body.angularVelocity.set(0, 0, 0); p.body.wakeUp();
      }
    }
    placePins(false);

    // bola
    var ballMesh = M.sphere(0.109, opts.ballColor || '#3b5bff', 16);
    var ballBody = ph.sphere(ballMesh, 0.109, 6.5); ballBody.material = ballMatC; ballBody.linearDamping = 0.02; ballBody.angularDamping = 0.05;
    var holdP = null, state = 'ready', rollT = 0, rolls = [], frameRoll = 0, frame = 0;
    function resetBall() {
      ballBody.type = C.Body.KINEMATIC; ballBody.velocity.set(0, 0, 0); ballBody.angularVelocity.set(0, 0, 0);
      ballBody.position.set(0.35, 0.9, -0.3); state = 'ready';
    }
    resetBall();

    // placar
    var board = new R.ui.Panel({
      w: 2.6, h: 0.5, res: 400,
      render: function (x, P) {
        R.ui.glass(x, 0, 0, P.cw, P.ch, 30, ['rgba(20,24,40,0.9)', 'rgba(10,12,20,0.9)']);
        var tot = scoreFrames(rolls), fw = (P.cw - 40) / 10, ri = 0;
        for (var f = 0; f < 10; f++) {
          var X = 20 + f * fw;
          x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 2; x.strokeRect(X, 20, fw, P.ch - 40);
          R.ui.text(x, f + 1, X + 12, 38, 18, { color: 'rgba(255,255,255,0.5)' });
          var marks = [];
          if (f < 9) {
            if (rolls[ri] === 10) { marks = ['', 'X']; ri += 1; }
            else { if (rolls[ri] !== undefined) marks.push(rolls[ri] || '-'); if (rolls[ri + 1] !== undefined) marks.push(rolls[ri] + rolls[ri + 1] === 10 ? '/' : (rolls[ri + 1] || '-')); ri += 2; }
          } else { for (var k = 0; k < 3; k++) if (rolls[ri + k] !== undefined) marks.push(rolls[ri + k] === 10 ? 'X' : rolls[ri + k]); }
          R.ui.text(x, marks.join(' '), X + fw - 12, 44, 26, { align: 'right', weight: 700, color: f === frame ? '#ffd23f' : '#fff' });
          if (tot[f] !== undefined) R.ui.text(x, tot[f], X + fw / 2, P.ch - 60, 38, { align: 'center', weight: 800 });
        }
      }
    });
    board.mesh.position.set(0, 2.6, -4); g.add(board.mesh);
    g.hud({ y: 1.95, z: -4, info: 'Aponte para a pista, segure o gatilho e balance o pulso para lançar!' });

    function countDown() {
      var n = 0;
      for (var i = 0; i < 10; i++) {
        var p = pins[i]; if (p.down) continue;
        var up = new THREE.Vector3(0, 1, 0).applyQuaternion(p.mesh.quaternion);
        var moved = Math.hypot(p.body.position.x - PIN_SPOTS[i][0], p.body.position.z - PIN_SPOTS[i][1]) > 0.25;
        if (up.y < 0.75 || p.body.position.y < 0.05 || moved) { p.down = true; n++; }
      }
      return n;
    }
    function finishRoll() {
      var knocked = countDown(); rolls.push(knocked);
      var allDown = pins.every(function (p) { return p.down; });
      var tot = scoreFrames(rolls); g.setScore(tot.length ? tot[tot.length - 1] : 0);
      if (allDown && frameRoll === 0) { g.setInfo('STRIKE! 🎳'); R.sfx.play('strike'); g.burst(new THREE.Vector3(0, 1, -LEN + 0.5), '#ffd23f', 30, 4); }
      else if (allDown) { g.setInfo('SPARE! ✨'); R.sfx.play('win'); }
      else g.setInfo(knocked + ' pino(s)');
      board.dirty = true;
      var next = false;
      if (frame < 9) {
        if (allDown || frameRoll === 1) { frame++; frameRoll = 0; placePins(false); } else { frameRoll = 1; placePins(true); }
      } else {
        frameRoll++;
        var r10 = rolls.slice(rolls.length - frameRoll), sum = r10[0] + (r10[1] || 0);
        var bonus = r10[0] === 10 || sum === 10;
        if (frameRoll >= 3 || (frameRoll === 2 && !bonus)) { g.after(1.5, function () { g.end(g.score >= 200 ? 'Jogo perfeito-ish! 🏆' : 'Fim da partida'); }); next = true; }
        else if (allDown) placePins(false); else placePins(true);
      }
      resetBall();
    }

    g.on('press', function (p) {
      if (state !== 'ready' || holdP) return;
      holdP = p; state = 'held'; R.sfx.play('click');
    });
    g.on('release', function (p) {
      if (p !== holdP || state !== 'held') return;
      holdP = null;
      // direção = para onde aponta (horizontal); força = velocidade do balanço
      var d = p.dir.clone(); d.y = 0; d.normalize();
      if (d.z > -0.3) d.set(0, 0, -1);
      d.x = Math.max(-0.12, Math.min(0.12, d.x));
      d.normalize();
      var speed = Math.max(4.5, Math.min(11, p.vel.length() * 2.2 + 3));
      ballBody.type = C.Body.DYNAMIC; ballBody.mass = 6.5; ballBody.updateMassProperties();
      var bp = ballBody.position; bp.x = Math.max(-0.4, Math.min(0.4, bp.x)); bp.y = 0.2; bp.z = -0.6;
      ballBody.velocity.set(d.x * speed, 0, d.z * speed);
      ballBody.angularVelocity.set(-speed / 0.109, 0, 0);
      ballBody.wakeUp(); state = 'rolling'; rollT = 0; R.sfx.play('roll', 1);
      g.setInfo('Velocidade: ' + (speed * 3.6).toFixed(0) + ' km/h');
    });
    var tmp = new THREE.Vector3();
    g.on('update', function (dt) {
      if (state === 'held' && holdP) {
        holdP.tip(0.45, tmp); ballBody.position.set(tmp.x, Math.max(0.15, tmp.y), tmp.z);
        ballMesh.position.copy(ballBody.position);
      } else if (state === 'ready') {
        ballMesh.position.set(ballBody.position.x, ballBody.position.y + Math.sin(R.time * 3) * 0.01, ballBody.position.z);
      } else if (state === 'rolling') {
        rollT += dt;
        if (rollT % 0.5 < dt) R.sfx.play('roll', 0.6);
        if (ballBody.position.z < -LEN - 0.5 || rollT > 7 || ballBody.position.y < -1) { state = 'settle'; g.after(1.6, finishRoll); }
      }
    });
  }

  R.game({ id: 'bowling', name: 'Boliche VR', cat: 'Esporte', featured: true, c1: '#3b5bff', c2: '#ff2dbd', glyph: '🎳',
    desc: 'Pista neon com física real de pinos. 10 frames, strikes e spares de verdade.',
    controls: 'Aponte para a pista, segure o gatilho, balance o pulso e solte.',
    build: function (g) { buildBowling(g); } });
  R.game({ id: 'bowling-cosmic', name: 'Boliche Cósmico', cat: 'Esporte', c1: '#1b0f4a', c2: '#2de2ff', glyph: '🪐',
    desc: 'Boliche numa pista flutuando no espaço. Combine com Baixa gravidade!',
    controls: 'Igual ao boliche: aponte, segure, balance e solte.',
    build: function (g) { buildBowling(g, { sky: 'space', ballColor: '#ff7a2d' }); } });
  R.buildBowling = buildBowling;
})();
