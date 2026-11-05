/* REgo OS — engine core
 * Escrito em ES2015 "seguro" (sem ?. / ?? / class fields) para rodar no
 * Oculus Browser antigo do Oculus Go (Chromium ~77).
 */
(function () {
  'use strict';
  var R = window.REGO = window.REGO || {};
  var THREE = window.THREE;

  // ------------------------------------------------------------ settings
  var DEFAULTS = {
    scale: 1.0,          // framebufferScaleFactor (0.6 .. 1.3)
    foveation: 2,        // 0..3 fixed foveated rendering (Oculus Browser)
    fps: 72,             // 60 / 72 (Go suporta ambos)
    msaa: true,          // antialias (aplica após recarregar)
    snapAngle: 30,
    height: 1.6,
    volume: 0.8,
    showFps: false,
    homeEnv: 'lago',
    laserColor: '#7fd0ff',
    cloudUrl: 'https://www.roblox.com/games/{id}',
    leftHanded: false
  };
  R.settings = (function () {
    var s = {};
    try { s = JSON.parse(localStorage.getItem('rego.settings') || '{}') || {}; } catch (e) { s = {}; }
    for (var k in DEFAULTS) if (!(k in s)) s[k] = DEFAULTS[k];
    return s;
  })();
  R.saveSettings = function () {
    try { localStorage.setItem('rego.settings', JSON.stringify(R.settings)); } catch (e) {}
    if (R.onSettings) R.onSettings();
  };
  R.store = {
    get: function (k, d) { try { var v = localStorage.getItem('rego.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('rego.' + k, JSON.stringify(v)); } catch (e) {} }
  };

  // ------------------------------------------------------------ player (rig)
  // Jogos movem R.player; o engine aplica no rig a cada frame.
  R.player = { x: 0, y: 0, z: 0, yaw: 0, yawOffset: 0 };
  R.resetPlayer = function () { R.player.x = 0; R.player.y = 0; R.player.z = 0; R.player.yaw = 0; };

  R.isXR = false;
  R.timeScale = 1;
  R.time = 0;

  var renderer, scene, camera, rig, clock;
  var fpsAcc = 0, fpsFrames = 0;
  R.fps = 0;

  R.init = function () {
    var canvas = document.getElementById('c');
    renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: !!R.settings.msaa, alpha: false, stencil: false,
      depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: false
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.LinearEncoding; // sem pós-processamento: mais barato
    renderer.sortObjects = true;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local'); // Go é 3DoF
    renderer.xr.setFramebufferScaleFactor(R.settings.scale);

    scene = new THREE.Scene();
    scene.matrixAutoUpdate = false;
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 300);
    rig = new THREE.Group();
    rig.add(camera);
    scene.add(rig);

    R.renderer = renderer; R.scene = scene; R.camera = camera; R.rig = rig;
    clock = new THREE.Clock();

    window.addEventListener('resize', function () {
      if (R.isXR) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    R.input.init();
    R.ui.init();
    R.sfx.init();
    R.os.init();
    renderer.setAnimationLoop(frame);
  };

  // ------------------------------------------------------------ XR session
  R.xrSupported = function (cb) {
    if (!navigator.xr || !navigator.xr.isSessionSupported) return cb(false);
    navigator.xr.isSessionSupported('immersive-vr').then(cb, function () { cb(false); });
  };

  R.enterVR = function () {
    if (!navigator.xr) return Promise.reject(new Error('WebXR indisponível'));
    R.sfx.resume();
    return navigator.xr.requestSession('immersive-vr', { optionalFeatures: [] }).then(function (session) {
      session.addEventListener('end', onSessionEnd);
      return renderer.xr.setSession(session).then(function () {
        R.isXR = true;
        R.xrSession = session;
        R.applyXRPerf();
        document.body.classList.add('in-xr');
        if (R.onEnterXR) R.onEnterXR();
      });
    });
  };
  R.exitVR = function () { if (R.xrSession) return R.xrSession.end(); };

  function onSessionEnd() {
    R.isXR = false; R.xrSession = null;
    document.body.classList.remove('in-xr');
    camera.position.set(0, 0, 0);
    // No Go o botão "voltar" encerra a sessão imersiva: tratamos isso como
    // "abrir o menu" — o jogo fica pausado e um clique volta ao VR.
    if (R.onExitXR) R.onExitXR();
  }

  // Otimizações específicas do hardware (Snapdragon 821 / Adreno 530)
  R.applyXRPerf = function () {
    var s = R.xrSession; if (!s) return;
    try {
      var layer = s.renderState.baseLayer;
      if (layer && 'fixedFoveation' in layer) layer.fixedFoveation = R.settings.foveation / 3;
    } catch (e) {}
    try {
      if (s.updateTargetFrameRate && s.supportedFrameRates) {
        var want = R.settings.fps, best = null;
        for (var i = 0; i < s.supportedFrameRates.length; i++) {
          var f = s.supportedFrameRates[i];
          if (best === null || Math.abs(f - want) < Math.abs(best - want)) best = f;
        }
        if (best) s.updateTargetFrameRate(best).catch(function () {});
      }
    } catch (e) {}
  };

  // ------------------------------------------------------------ main loop
  var tmpV = new THREE.Vector3();
  function applyPlayer() {
    var p = R.player;
    rig.position.set(p.x, p.y + R.settings.height, p.z);
    rig.rotation.set(0, p.yaw + p.yawOffset, 0);
    rig.updateMatrixWorld(true);
  }

  var hooks = [];
  R.onFrame = function (fn) { hooks.push(fn); };

  function frame(tms, xrFrame) {
    var rawDt = Math.min(clock.getDelta(), 0.05);
    var dt = rawDt * R.timeScale;
    R.time += dt; R.rawDt = rawDt;

    fpsAcc += rawDt; fpsFrames++;
    if (fpsAcc >= 0.5) { R.fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }

    applyPlayer();
    R.input.update(rawDt, xrFrame);
    R.ui.update(rawDt);
    R.os.update(dt, rawDt);
    for (var i = 0; i < hooks.length; i++) hooks[i](dt, rawDt);
    applyPlayer();
    R.input.syncVisuals();

    if (R.capture && R.capture.pending) R.capture.run();
    renderer.render(scene, camera);
  }

  R.worldHeadPos = function (out) { return camera.getWorldPosition(out || tmpV); };
  R.headYaw = function () {
    var d = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    return Math.atan2(-d.x, -d.z);
  };
  R.headDir = function (out) {
    out = out || new THREE.Vector3();
    out.set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    return out;
  };
  R.recenter = function () {
    var cur = R.headYaw();
    var local = cur - (R.player.yaw + R.player.yawOffset);
    R.player.yawOffset = -local;
  };
})();
