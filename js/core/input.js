/* REgo OS — input: controle do Go (3DoF), braço duplo espelhado, mouse/teclado/toque */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE;

  var V = THREE.Vector3, Q = THREE.Quaternion;
  var tmpM = new THREE.Matrix4(), tmpV = new V(), tmpV2 = new V(), tmpQ = new Q();

  function Pointer(id, mirror) {
    this.id = id; this.mirror = !!mirror;
    this.obj = new THREE.Group(); this.obj.matrixAutoUpdate = true;
    this.origin = new V(); this.dir = new V(0, 0, -1); this.quat = new Q();
    this.down = false; this.pressed = false; this.released = false; this.consumed = false;
    this.vel = new V(); this.angVel = 0; this.hist = [];
    this.active = false; this.laserDist = 4; this.laserOn = true; this.hitUI = false;
    this.ray = new THREE.Raycaster(); this.ray.far = 60;
    this.source = null; this.gamepad = null;
  }
  Pointer.prototype.setPose = function (pos, quat) {
    this.origin.copy(pos); this.quat.copy(quat);
    this.dir.set(0, 0, -1).applyQuaternion(quat);
    this.obj.position.copy(pos); this.obj.quaternion.copy(quat);
    this.ray.set(this.origin, this.dir);
  };
  Pointer.prototype.tip = function (dist, out) {
    return (out || new V()).copy(this.dir).multiplyScalar(dist).add(this.origin);
  };
  Pointer.prototype.trackVel = function (dt) {
    var t = R.time, tip = this.tip(0.55);
    this.hist.push({ t: performance.now() / 1000, p: tip, d: this.dir.clone() });
    if (this.hist.length > 6) this.hist.shift();
    if (this.hist.length >= 2) {
      var a = this.hist[0], b = this.hist[this.hist.length - 1], span = Math.max(b.t - a.t, 1e-3);
      this.vel.copy(b.p).sub(a.p).divideScalar(span);
      this.angVel = a.d.angleTo(b.d) / span;
    }
  };

  var input = R.input = {
    pointers: [],         // ponteiros ativos (inclui o espelhado se braço duplo)
    real: [],
    mirror: null,
    pad: { x: 0, y: 0, touched: false, down: false, pressed: false, released: false, holdT: 0, swipe: 0 },
    menuPressed: false,
    dualArm: false,
    giant: 1,
    rainbow: false,
    keys: {},
    mode: 'mouse'
  };

  var controllers = [], mouse = { x: 0, y: 0, inside: false, look: false, lx: 0, ly: 0 };
  var camYaw = 0, camPitch = 0;
  var padSwipeStartX = null;

  // ---------------------------------------------------------------- visuals
  var laserMat, cursorMat;
  function buildVisual(p) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.018, 0.022, 0.11, 10), R.mat.lambert('#2a2d34'));
    body.rotation.x = Math.PI / 2; body.position.z = 0.04;
    var head = new THREE.Mesh(new THREE.SphereBufferGeometry(0.024, 10, 8), R.mat.lambert('#2a2d34'));
    head.position.z = -0.012;
    var pad = new THREE.Mesh(new THREE.CircleBufferGeometry(0.014, 14), R.mat.basic('#596070'));
    pad.position.set(0, 0.0235, -0.01); pad.rotation.x = -Math.PI / 2;
    // antebraço estilizado (aparece no "braço duplo" e mãos gigantes)
    var arm = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.03, 0.04, 0.32, 8), R.mat.lambert('#e8c7a8'));
    arm.rotation.x = Math.PI / 2; arm.position.z = 0.25; arm.visible = false;
    g.add(body, head, pad, arm);
    p.model = g; p.arm = arm;
    p.obj.add(g);

    var laser = new THREE.Mesh(new THREE.BoxBufferGeometry(0.004, 0.004, 1), laserMat);
    laser.geometry.translate(0, 0, -0.5);
    laser.renderOrder = 10;
    p.obj.add(laser); p.laser = laser;

    var cur = new THREE.Mesh(new THREE.RingBufferGeometry(0.008, 0.016, 16), cursorMat);
    cur.renderOrder = 11; cur.visible = false;
    p.cursor = cur; R.scene.add(cur);
    R.scene.add(p.obj);
  }

  input.init = function () {
    laserMat = new THREE.MeshBasicMaterial({ color: R.settings.laserColor, transparent: true, opacity: 0.55, depthWrite: false });
    cursorMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide });
    R.onSettings = (function (prev) { return function () { laserMat.color.set(R.settings.laserColor); if (prev) prev(); }; })(R.onSettings);

    // XR controllers
    for (var i = 0; i < 2; i++) (function (i) {
      var c = R.renderer.xr.getController(i);
      R.rig.add(c);
      var p = new Pointer(i, false);
      buildVisual(p);
      c.addEventListener('connected', function (e) { p.source = e.data; p.active = true; refreshList(); });
      c.addEventListener('disconnected', function () { p.source = null; p.active = false; refreshList(); });
      c.addEventListener('selectstart', function () { p._xrDown = true; });
      c.addEventListener('selectend', function () { p._xrDown = false; });
      controllers.push({ ctrl: c, p: p });
      input.real.push(p);
    })(i);

    // ponteiro de mouse/toque (fora do VR)
    var mp = new Pointer(9, false); buildVisual(mp); mp.active = true;
    input.mousePointer = mp;
    // braço espelhado
    input.mirror = new Pointer(5, true); buildVisual(input.mirror);

    var cv = R.renderer.domElement;
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('mousemove', function (e) {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = -(e.clientY / window.innerHeight) * 2 + 1; mouse.inside = true;
      if (mouse.look) { camYaw -= (e.clientX - mouse.lx) * 0.005; camPitch -= (e.clientY - mouse.ly) * 0.005; mouse.lx = e.clientX; mouse.ly = e.clientY; }
    });
    cv.addEventListener('mousedown', function (e) {
      R.sfx.resume();
      if (e.button === 2 || e.button === 1) { mouse.look = true; mouse.lx = e.clientX; mouse.ly = e.clientY; return; }
      mp._xrDown = true;
    });
    window.addEventListener('mouseup', function (e) { if (e.button === 2 || e.button === 1) mouse.look = false; else mp._xrDown = false; });
    cv.addEventListener('wheel', function (e) { input._wheel = (input._wheel || 0) + e.deltaY; e.preventDefault(); }, { passive: false });

    // toque (celular): arrastar = olhar, tocar = gatilho, dois dedos = menu
    var touch = null;
    cv.addEventListener('touchstart', function (e) {
      R.sfx.resume();
      if (e.touches.length >= 2) { input._menuKey = true; touch = null; return; }
      var t = e.touches[0];
      touch = { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, drag: false, t0: performance.now() };
      mouse.x = (t.clientX / window.innerWidth) * 2 - 1; mouse.y = -(t.clientY / window.innerHeight) * 2 + 1;
      mp._xrDown = true; e.preventDefault();
    }, { passive: false });
    cv.addEventListener('touchmove', function (e) {
      if (!touch) return; var t = e.touches[0];
      if (!touch.drag && Math.abs(t.clientX - touch.sx) + Math.abs(t.clientY - touch.sy) > 14) { touch.drag = true; mp._xrDown = false; }
      if (touch.drag) { camYaw -= (t.clientX - touch.x) * 0.006; camPitch -= (t.clientY - touch.y) * 0.006; }
      else { mouse.x = (t.clientX / window.innerWidth) * 2 - 1; mouse.y = -(t.clientY / window.innerHeight) * 2 + 1; }
      touch.x = t.clientX; touch.y = t.clientY; e.preventDefault();
    }, { passive: false });
    cv.addEventListener('touchend', function () { mp._xrDown = false; touch = null; });

    window.addEventListener('keydown', function (e) {
      R.sfx.resume();
      if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      input.keys[e.code] = true;
      if (e.code === 'Escape' || e.code === 'KeyM' || e.code === 'Backspace' || e.code === 'Tab') { input._menuKey = true; e.preventDefault(); }
      if (e.code === 'KeyQ') input._turn = -1;
      if (e.code === 'KeyE') input._turn = 1;
      if (e.code === 'KeyF' || e.code === 'Enter') mp._xrDown = true;
    });
    window.addEventListener('keyup', function (e) {
      input.keys[e.code] = false;
      if (e.code === 'KeyF' || e.code === 'Enter') mp._xrDown = false;
    });
    refreshList();
  };

  function refreshList() {
    var list = [];
    if (R.isXR) {
      for (var i = 0; i < input.real.length; i++) if (input.real[i].active) list.push(input.real[i]);
      if (!list.length) list.push(input.real[0]);
    } else list.push(input.mousePointer);
    // canhoto: só troca o lado do braço espelhado (o hardware já sabe a mão)
    if (input.dualArm && list.length === 1) list.push(input.mirror);
    input.pointers = list;
    var all = input.real.concat([input.mousePointer, input.mirror]);
    for (var j = 0; j < all.length; j++) {
      var vis = list.indexOf(all[j]) >= 0;
      all[j].obj.visible = vis; if (!vis) all[j].cursor.visible = false;
    }
    input.primary = list[0];
  }
  input.refresh = refreshList;
  input.setDualArm = function (on) { input.dualArm = !!on; refreshList(); };

  function btn(gp, i) { return gp && gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5); }

  var camQ = new Q(), camP = new V(), headP = new V(), right = new V();
  var raycaster = new THREE.Raycaster();

  input.update = function (dt, xrFrame) {
    var pad = input.pad, prevDown = pad.down;
    if (R.isXR !== input._wasXR) { input._wasXR = R.isXR; refreshList(); }
    input.menuPressed = !!input._menuKey; input._menuKey = false;
    pad.x = 0; pad.y = 0; pad.touched = false; pad.down = false; pad.swipe = 0;
    var turn = input._turn || 0; input._turn = 0;

    if (R.isXR) {
      for (var i = 0; i < controllers.length; i++) {
        var c = controllers[i], p = c.p;
        if (!p.active) continue;
        c.ctrl.updateMatrixWorld(true);
        c.ctrl.matrixWorld.decompose(camP, camQ, tmpV);
        p.setPose(camP, camQ);
        var gp = p.source && p.source.gamepad;
        var trig = !!p._xrDown || btn(gp, 0);
        setButton(p, trig);
        if (gp) {
          var ax = gp.axes || [], ix = 0;
          if (ax.length >= 4 && Math.abs(ax[0]) + Math.abs(ax[1]) < 0.01) ix = 2;
          var x = ax[ix] || 0, y = ax[ix + 1] || 0;
          if (Math.abs(x) + Math.abs(y) > 0.02) { pad.x = x; pad.y = y; pad.touched = true; }
          for (var b = 1; b < gp.buttons.length; b++) {
            if (b === 1 && gp.buttons.length > 2 && gp.mapping === 'xr-standard') {
              if (btn(gp, 1)) input._grip = true; // squeeze (Quest)
              continue;
            }
            if (b >= 4 && btn(gp, b)) { if (!p['_b' + b]) input.menuPressed = true; p['_b' + b] = true; }
            else if (b >= 4) p['_b' + b] = false;
            else if (btn(gp, b)) pad.down = true;
          }
        }
      }
    } else {
      // mouse: raio sai da câmera pelo cursor
      var mp = input.mousePointer;
      camPitch = Math.max(-1.45, Math.min(1.45, camPitch));
      var ks = input.keys;
      if (ks.ArrowLeft) camYaw += dt * 2; if (ks.ArrowRight) camYaw -= dt * 2;
      if (ks.ArrowUp) camPitch += dt * 1.5; if (ks.ArrowDown) camPitch -= dt * 1.5;
      R.camera.rotation.set(camPitch, camYaw, 0, 'YXZ');
      R.camera.updateMatrixWorld(true);
      raycaster.setFromCamera({ x: mouse.x, y: mouse.y }, R.camera);
      var o = R.camera.getWorldPosition(camP).clone();
      // ponteiro um pouco abaixo/à direita para enxergar o "controle"
      R.camera.getWorldQuaternion(camQ);
      tmpV.set(0.16, -0.2, -0.25).applyQuaternion(camQ).add(o);
      tmpM.lookAt(tmpV, tmpV2.copy(raycaster.ray.direction).multiplyScalar(6).add(o), new V(0, 1, 0));
      tmpQ.setFromRotationMatrix(tmpM);
      mp.setPose(tmpV, tmpQ);
      mp.ray.set(o, raycaster.ray.direction); mp.origin.copy(o); mp.dir.copy(raycaster.ray.direction);
      setButton(mp, !!mp._xrDown);
      if (ks.KeyW) { pad.y = -1; pad.down = true; } if (ks.KeyS) { pad.y = 1; pad.down = true; }
      if (ks.KeyA) { pad.x = -1; pad.down = true; } if (ks.KeyD) { pad.x = 1; pad.down = true; }
      if (ks.Space) { pad.down = true; }
      pad.touched = pad.down;
      if (input._wheel) { pad.swipe = input._wheel > 0 ? 1 : -1; input._wheel = 0; }
    }

    // swipe horizontal no touchpad (sem clicar) — usado p/ trocar páginas
    if (pad.touched && !pad.down) {
      if (padSwipeStartX === null) padSwipeStartX = pad.x;
      else if (Math.abs(pad.x - padSwipeStartX) > 0.9) { pad.swipe = pad.x > padSwipeStartX ? 1 : -1; padSwipeStartX = null; input._swipeLock = true; }
    } else padSwipeStartX = null;

    pad.pressed = pad.down && !prevDown;
    pad.released = !pad.down && prevDown;
    if (pad.pressed) pad.pressX = pad.x, pad.pressY = pad.y;
    // segurar o centro do touchpad = menu (alternativa ao botão voltar)
    if (pad.down && Math.abs(pad.x) < 0.45 && Math.abs(pad.y) < 0.45) {
      pad.holdT += dt;
      if (pad.holdT > 0.75 && !pad.holdFired) { pad.holdFired = true; input.menuPressed = true; }
    } else { pad.holdT = 0; if (!pad.down) pad.holdFired = false; }
    // snap turn: clicar nas bordas esquerda/direita
    if (pad.pressed && Math.abs(pad.x) > 0.6 && Math.abs(pad.x) > Math.abs(pad.y)) turn = pad.x > 0 ? 1 : -1;
    input.turn = turn;

    // braço duplo: espelha o ponteiro principal pelo plano sagital da cabeça
    var prim = input.pointers[0];
    if (input.dualArm && input.pointers.length > 1 && input.pointers[1] === input.mirror) {
      var m = input.mirror;
      R.camera.getWorldPosition(headP);
      var yaw = R.headYaw();
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      var src = R.isXR ? prim.obj.position : prim.obj.position;
      var d = tmpV.copy(src).sub(headP).dot(right);
      var mpos = tmpV2.copy(src).addScaledVector(right, -2 * d);
      var fwd = new V(0, 0, -1).applyQuaternion(prim.quat), up = new V(0, 1, 0).applyQuaternion(prim.quat);
      fwd.addScaledVector(right, -2 * fwd.dot(right)); up.addScaledVector(right, -2 * up.dot(right));
      tmpM.lookAt(new V(0, 0, 0), fwd.clone().negate(), up);
      tmpQ.setFromRotationMatrix(tmpM);
      m.setPose(mpos, tmpQ);
      if (!R.isXR) {
        // no modo mouse o raio principal sai da câmera; espelhamos esse raio
        var rd = prim.dir.clone(); rd.addScaledVector(right, -2 * rd.dot(right));
        m.dir.copy(rd); m.ray.set(m.origin, rd);
      }
      setButton(m, prim.down);
    }
    for (var k = 0; k < input.pointers.length; k++) { input.pointers[k].consumed = false; input.pointers[k].hitUI = false; input.pointers[k].trackVel(dt); }
  };

  function setButton(p, d) {
    p.pressed = d && !p.down; p.released = !d && p.down; p.down = d;
  }

  var hue = 0;
  input.syncVisuals = function () {
    hue = (hue + R.rawDt * 0.3) % 1;
    if (input.rainbow) laserMat.color.setHSL(hue, 0.9, 0.6);
    for (var i = 0; i < input.pointers.length; i++) {
      var p = input.pointers[i];
      var g = input.giant;
      p.model.scale.setScalar(g);
      if (p.hand) R.hands.update(p);
      p.arm.visible = input.dualArm || g > 1.01;
      p.laser.visible = p.laserOn;
      p.laser.scale.set(1, 1, Math.max(0.01, p.laserDist));
      if (p.cursorAt && p.laserOn) {
        p.cursor.visible = true; p.cursor.position.copy(p.cursorAt);
        p.cursor.lookAt(R.camera.getWorldPosition(tmpV));
        var s = p.cursor.position.distanceTo(tmpV) * 0.7; p.cursor.scale.setScalar(Math.max(0.3, s));
      } else p.cursor.visible = false;
      p.cursorAt = null;
      p.laserDist = 4;
    }
  };

  // troca o controle procedural por mão realista + controle do Go (quando os modelos carregarem)
  input.upgradeHands = function () {
    var lh = !!R.settings.leftHanded, ok = false;
    input.real.concat([input.mousePointer]).forEach(function (p, i) { ok = R.hands.attach(p, i === 1 ? !lh : lh) || ok; });
    R.hands.attach(input.mirror, !lh);
    return ok;
  };
  input.setLaser = function (p, dist, point) { p.laserDist = dist; p.cursorAt = point || null; };
  input.Pointer = Pointer;
})();
