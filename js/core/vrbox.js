/* Wpollo VR — modo VR Box (celular dentro de um óculos de lentes):
 *  - render estéreo lado a lado + distorção de lente opcional (1 passada extra, barata)
 *  - rastreio de cabeça 3DoF por sensor de orientação a 60–120 Hz com predição de movimento
 *  - 6DoF via ARCore (WebXR "immersive-ar" no Chrome Android) com render estéreo próprio
 *  - realidade mista: câmera traseira como fundo (getUserMedia ou "camera-access" do ARCore)
 *  - lanterna do celular (torch da câmera; ponte nativa no APK)
 */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE;
  var V = R.vrbox = { active: false, passthrough: false, torchOn: false, mode: '3dof', stream: null, video: null };
  var DEF = { ipd: 0.063, fov: 95, distortion: true, k1: 0.22, k2: 0.24, track: '3dof', predictMs: 18, scale: 1.4 };
  V.cfg = (function () { var c = R.store.get('vrbox', {}); for (var k in DEF) if (!(k in c)) c[k] = DEF[k]; return c; })();
  V.save = function () { R.store.set('vrbox', V.cfg); };

  V.isPhone = function () { return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) && !/Pacific|OculusBrowser|Quest/i.test(navigator.userAgent); };
  V.isApk = function () { return !!window.WpolloAndroid || /WpolloVR/i.test(navigator.userAgent); };
  V.arSupported = function (cb) { if (!navigator.xr || !navigator.xr.isSessionSupported) return cb(false); navigator.xr.isSessionSupported('immersive-ar').then(cb, function () { cb(false); }); };

  // ---------------------------------------------------------------- início
  V.start = function (cfg) {
    if (cfg) for (var k in cfg) V.cfg[k] = cfg[k];
    V.save();
    R.sfx.resume();
    var de = document.documentElement;
    try { (de.requestFullscreen || de.webkitRequestFullscreen).call(de, { navigationUI: 'hide' }); } catch (e) {}
    try { screen.orientation.lock('landscape').catch(function () {}); } catch (e) {}
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(function () {}); } catch (e) {}
    if (window.WpolloAndroid && WpolloAndroid.keepScreenOn) try { WpolloAndroid.keepScreenOn(true); } catch (e) {}
    V.active = true;
    document.body.classList.add('in-xr', 'vrbox');
    R.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, V.cfg.scale));
    R.renderer.setSize(window.innerWidth, window.innerHeight);
    if (V.cfg.track === '6dof') return startAR().catch(function (e) { R.ui.toast('6DoF indisponível (' + e.message + '): usando 3DoF', 4); V.cfg.track = '3dof'; startSensors(); });
    startSensors();
    return Promise.resolve();
  };

  // ---------------------------------------------------------------- cabeça 3DoF (baixa latência)
  var qSensor = new THREE.Quaternion(), qPrev = new THREE.Quaternion(), tPrev = 0, tCur = 0, have = false;
  var qWorld = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  var yawFix = new THREE.Quaternion();
  function startSensors() {
    V.mode = '3dof';
    var ok = false;
    try {
      if (window.RelativeOrientationSensor) {
        var s = new RelativeOrientationSensor({ frequency: 120, referenceFrame: 'screen' });
        s.addEventListener('reading', function () {
          qPrev.copy(qSensor); tPrev = tCur; tCur = performance.now();
          qSensor.fromArray(s.quaternion); qSensor.premultiply(qWorld); have = true;
        });
        s.addEventListener('error', function () { if (!have) fallback(); });
        s.start(); ok = true; V.sensor = s;
      }
    } catch (e) { ok = false; }
    if (!ok) fallback();
  }
  // deviceorientation (evento): mesma matemática do DeviceOrientationControls
  var euler = new THREE.Euler(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)), zee = new THREE.Vector3(0, 0, 1);
  function fallback() {
    if (V._fb) return; V._fb = true;
    var go = function () {
      window.addEventListener('deviceorientation', function (e) {
        if (e.alpha === null) return;
        var a = THREE.MathUtils.degToRad(e.alpha), b = THREE.MathUtils.degToRad(e.beta), g = THREE.MathUtils.degToRad(e.gamma);
        var orient = THREE.MathUtils.degToRad((screen.orientation && screen.orientation.angle) || window.orientation || 0);
        qPrev.copy(qSensor); tPrev = tCur; tCur = performance.now();
        euler.set(b, a, -g, 'YXZ'); qSensor.setFromEuler(euler); qSensor.multiply(q1); qSensor.multiply(q0.setFromAxisAngle(zee, -orient)); have = true;
      }, true);
    };
    if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().then(go, go); else go();
  }
  var qPred = new THREE.Quaternion(), qDelta = new THREE.Quaternion(), qInv = new THREE.Quaternion();
  V.updateHead = function () {
    if (!V.active || V.mode !== '3dof' || !have) return;
    // predição: extrapola a rotação pela velocidade angular medida (compensa latência sensor→tela)
    qPred.copy(qSensor);
    var dt = tCur - tPrev, ahead = V.cfg.predictMs + (performance.now() - tCur);
    if (dt > 0 && dt < 100 && ahead > 0) {
      qDelta.copy(qPrev).invert(); qDelta.premultiply(qSensor); // delta = atual · anterior⁻¹
      var f = Math.min(2, ahead / dt), w = Math.min(1, Math.max(-1, qDelta.w)), ang = 2 * Math.acos(Math.abs(w));
      if (ang > 1e-4 && ang < 0.5) { var ax = new THREE.Vector3(qDelta.x, qDelta.y, qDelta.z).normalize(); if (w < 0) ax.negate(); qPred.premultiply(new THREE.Quaternion().setFromAxisAngle(ax, ang * f)); }
    }
    R.camera.quaternion.copy(yawFix).multiply(qPred);
    R.camera.position.set(0, 0, 0);
  };
  V.recenter = function () {
    var d = new THREE.Vector3(0, 0, -1).applyQuaternion(qSensor); var yaw = Math.atan2(-d.x, -d.z);
    yawFix.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
  };

  // ---------------------------------------------------------------- 6DoF (ARCore pelo WebXR)
  var arSession = null, arRef = null, arLayer = null, glBinding = null, camTex = null;
  function startAR() {
    if (!navigator.xr) return Promise.reject(new Error('sem WebXR'));
    return navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['local'], optionalFeatures: ['camera-access', 'dom-overlay'], domOverlay: { root: document.getElementById('overlay') } }).then(function (session) {
      arSession = session; V.mode = '6dof';
      var gl = R.renderer.getContext();
      return (gl.makeXRCompatible ? gl.makeXRCompatible() : Promise.resolve()).then(function () {
        arLayer = new XRWebGLLayer(session, gl, { antialias: false, alpha: false });
        session.updateRenderState({ baseLayer: arLayer, depthNear: 0.05, depthFar: 300 });
        try { if (window.XRWebGLBinding) glBinding = new XRWebGLBinding(session, gl); } catch (e) {}
        return session.requestReferenceSpace('local');
      }).then(function (ref) {
        arRef = ref; R.renderer.setAnimationLoop(null);
        session.addEventListener('end', function () { arSession = null; V.mode = '3dof'; R.renderer.setFramebuffer(null); R.renderer.setAnimationLoop(R._frame); startSensors(); });
        session.requestAnimationFrame(arFrame);
        R.ui.toast('6DoF ativo (ARCore): ande de verdade pelo espaço!', 3);
      });
    });
  }
  var tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  function arFrame(t, frame) {
    if (!arSession) return;
    arSession.requestAnimationFrame(arFrame);
    var pose = frame.getViewerPose(arRef);
    if (pose) {
      var tr = pose.transform; R.camera.position.set(tr.position.x, tr.position.y, tr.position.z); R.camera.quaternion.set(tr.orientation.x, tr.orientation.y, tr.orientation.z, tr.orientation.w);
      R.camera.quaternion.premultiply(yawFix);
      if (V.passthrough && glBinding && pose.views[0] && pose.views[0].camera) {
        try { var glt = glBinding.getCameraImage(pose.views[0].camera); if (glt) { if (!camTex) camTex = new THREE.Texture(); R.renderer.properties.get(camTex).__webglTexture = glt; R.renderer.properties.get(camTex).__webglInit = true; V.bgTex = camTex; } } catch (e) {}
      }
    }
    V._fb6 = arLayer.framebuffer; V._fbW = arLayer.framebufferWidth; V._fbH = arLayer.framebufferHeight;
    R._frame(t, null);
  }

  // ---------------------------------------------------------------- câmera traseira (realidade mista / mãos / lanterna)
  V.camera = function (w, h) {
    if (V.stream) return Promise.resolve(V.video);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('câmera indisponível'));
    return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: w || 640 }, height: { ideal: h || 480 }, frameRate: { ideal: 60, max: 60 } } }).then(function (st) {
      V.stream = st; var v = V.video = document.createElement('video'); v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.srcObject = st;
      return v.play().then(function () { V.videoTex = new THREE.VideoTexture(v); V.videoTex.minFilter = THREE.LinearFilter; V.videoTex.generateMipmaps = false; return v; });
    });
  };
  V.togglePassthrough = function () {
    if (V.passthrough) { V.passthrough = false; R.ui.toast('Realidade mista desligada'); return; }
    if (V.mode === '6dof') { if (!glBinding) { R.ui.toast('Este aparelho não libera a câmera durante o 6DoF'); return; } V.passthrough = true; return; }
    V.camera(1280, 720).then(function () { V.passthrough = true; V.bgTex = V.videoTex; R.ui.toast('Realidade mista: câmera ligada', 2); }, function (e) { R.ui.toast('Câmera: ' + e.message, 3); });
  };
  V.toggleTorch = function () {
    var want = !V.torchOn;
    var native = function () { if (window.WpolloAndroid && WpolloAndroid.setTorch) { try { WpolloAndroid.setTorch(want); V.torchOn = want; return true; } catch (e) {} } return false; };
    if (V.mode === '6dof') { if (!native()) R.ui.toast('Lanterna indisponível com o ARCore ativo'); return; }
    V.camera(640, 480).then(function () {
      var tr = V.stream.getVideoTracks()[0], caps = tr.getCapabilities ? tr.getCapabilities() : {};
      if (caps.torch) return tr.applyConstraints({ advanced: [{ torch: want }] }).then(function () { V.torchOn = want; });
      if (!native()) R.ui.toast('Este celular não permite controlar a lanterna pelo navegador');
    }, function () { if (!native()) R.ui.toast('Sem acesso à câmera/lanterna'); });
  };

  // ---------------------------------------------------------------- render estéreo
  var eyeL = new THREE.PerspectiveCamera(), eyeR = new THREE.PerspectiveCamera(), rt = null, post = null;
  var bgScene = new THREE.Scene(), bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), bgMat = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false });
  bgScene.add(new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), bgMat));
  var hidden = [], hideT = 0;
  function collectSky(scene) { hidden = []; scene.traverse(function (o) { if (o.userData && (o.userData.sky || o.userData.ground)) hidden.push(o); }); }
  function buildPost() {
    var m = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null }, k1: { value: V.cfg.k1 }, k2: { value: V.cfg.k2 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tex; uniform float k1, k2; varying vec2 vUv;\n' +
        'void main(){ float eye = step(0.5, vUv.x); vec2 c = vec2(eye * 0.5 + 0.25, 0.5); vec2 p = (vUv - c) * vec2(4.0, 2.0);\n' +
        ' float r2 = dot(p, p); vec2 q = p * (1.0 + k1 * r2 + k2 * r2 * r2) / (1.0 + k1 + k2) * 1.0; vec2 uv = c + q / vec2(4.0, 2.0);\n' +
        ' if (uv.x < eye * 0.5 || uv.x > eye * 0.5 + 0.5 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0); return; }\n' +
        ' gl_FragColor = texture2D(tex, uv); }',
      depthTest: false, depthWrite: false
    });
    var sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), m));
    post = { scene: sc, mat: m, cam: bgCam };
  }
  var camW = new THREE.Vector3(), right = new THREE.Vector3(), qW = new THREE.Quaternion();
  V.render = function (scene, camera) {
    var r = R.renderer, six = V.mode === '6dof' && V._fb6;
    var W, H, pr = r.getPixelRatio();
    if (six) { r.setFramebuffer(V._fb6); W = V._fbW; H = V._fbH; } else { var s = r.getSize(new THREE.Vector2()); W = s.x * pr; H = s.y * pr; }
    camera.updateMatrixWorld(true); camera.getWorldPosition(camW); camera.getWorldQuaternion(qW);
    right.set(1, 0, 0).applyQuaternion(qW);
    var half = W / 2, asp = half / H;
    [eyeL, eyeR].forEach(function (e, i) {
      e.fov = V.cfg.fov; e.aspect = asp; e.near = camera.near; e.far = camera.far; e.updateProjectionMatrix();
      e.position.copy(camW).addScaledVector(right, (i ? 0.5 : -0.5) * V.cfg.ipd); e.quaternion.copy(qW); e.updateMatrixWorld(true);
    });
    // realidade mista: esconde céu/chão virtuais e desenha a câmera atrás
    var mr = V.passthrough && V.bgTex;
    if (mr) { if ((hideT -= R.rawDt) < 0) { collectSky(scene); hideT = 1; } for (var i = 0; i < hidden.length; i++) hidden[i].visible = false; bgMat.map = V.bgTex; bgMat.needsUpdate = bgMat._t !== V.bgTex; bgMat._t = V.bgTex; }
    var dist = V.cfg.distortion && !six;
    if (dist) {
      if (!rt || rt.width !== W || rt.height !== H) { if (rt) rt.dispose(); rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, stencilBuffer: false }); }
      if (!post) buildPost();
      r.setRenderTarget(rt);
    }
    r.setScissorTest(true); r.autoClear = false;
    r.setClearColor(0x000000, 1); r.clear();
    for (var k = 0; k < 2; k++) {
      var x = k * half / pr, w = half / pr, h = H / pr; // setViewport multiplica pelo pixelRatio
      r.setViewport(x, 0, w, h); r.setScissor(x, 0, w, h);
      if (mr) r.render(bgScene, bgCam);
      r.clearDepth();
      r.render(scene, k ? eyeR : eyeL);
    }
    r.setScissorTest(false); r.autoClear = true; r.setViewport(0, 0, W / pr, H / pr);
    if (mr) for (var j = 0; j < hidden.length; j++) hidden[j].visible = true;
    if (dist) {
      r.setRenderTarget(null); post.mat.uniforms.tex.value = rt.texture; post.mat.uniforms.k1.value = V.cfg.k1; post.mat.uniforms.k2.value = V.cfg.k2;
      r.render(post.scene, post.cam);
    }
    if (six) r.setFramebuffer(null);
  };
  // olhar = ponteiro quando não há mãos/controle; toque na tela (botão do VR Box) = gatilho
  window.addEventListener('resize', function () { if (V.active) R.renderer.setSize(window.innerWidth, window.innerHeight); });
})();
