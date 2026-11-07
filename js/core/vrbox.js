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
  var DEF = { ipd: 0.063, fov: 95, distortion: true, k1: 0.22, k2: 0.24, track: '3dof', predictMs: 18, scale: 1.4, useMag: true, accelMove: true, flip: 'auto' };
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
    // tela cheia PRIMEIRO; só então o navegador aceita travar em paisagem
    var fs = Promise.resolve();
    try { var rq = de.requestFullscreen || de.webkitRequestFullscreen; if (rq && !document.fullscreenElement) fs = Promise.resolve(rq.call(de, { navigationUI: 'hide' })).catch(function () {}); } catch (e) {}
    fs.then(function () { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); } catch (e) {} });
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

  // ---------------------------------------------------------------- cabeça 3DoF: fusão própria (Mahony)
  // giroscópio integrado a ~200 Hz; o acelerômetro corrige a inclinação (gravidade) e o magnetômetro corrige
  // a deriva do giro em torno do eixo vertical. A predição usa a velocidade angular medida (não diferenças).
  var qF = new THREE.Quaternion(), wF = new THREE.Vector3(), eI = new THREE.Vector3(), lastGT = 0, have = false;
  var acc = new THREE.Vector3(0, 0, 9.81), mag = null, accOk = false;
  var qWorld = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); // mundo z-up -> three y-up
  var yawFix = new THREE.Quaternion();
  V.headAccel = new THREE.Vector3(); V.headVel = new THREE.Vector3(); V.headOffset = new THREE.Vector3(); V.events = {};
  R.headAccel = V.headAccel;
  var KP = 1.2, KI = 0.02, KM = 0.6;
  var vA = new THREE.Vector3(), vE = new THREE.Vector3(), eTot = new THREE.Vector3(), qi = new THREE.Quaternion(), tmpq = new THREE.Quaternion();
  function fuse(gx, gy, gz, dt) {
    eTot.set(0, 0, 0);
    if (accOk) {
      vA.copy(acc).normalize();
      vE.set(0, 0, 1).applyQuaternion(qi.copy(qF).invert()); // gravidade estimada no referencial do aparelho
      eTot.add(vA.clone().cross(vE).multiplyScalar(KP));
    }
    if (mag && V.cfg.useMag) {
      var m = mag.clone().normalize(), h = m.clone().applyQuaternion(qF), bx = Math.hypot(h.x, h.y);
      var w = new THREE.Vector3(0, bx, h.z).applyQuaternion(qi.copy(qF).invert()); // norte magnético estimado
      var em = m.cross(w); var up = new THREE.Vector3(0, 0, 1).applyQuaternion(qi);
      eTot.addScaledVector(up, em.dot(up) * KM); // só a componente de guinada (yaw) — não mexe na inclinação
    }
    eI.addScaledVector(eTot, KI * dt);
    wF.set(gx, gy, gz).add(eTot).add(eI);
    var ang = wF.length() * dt;
    if (ang > 1e-9) { tmpq.setFromAxisAngle(wF.clone().normalize(), ang); qF.multiply(tmpq); qF.normalize(); }
    have = true;
  }
  function initFromAccel() {
    // orientação inicial a partir da gravidade (sem esperar a convergência)
    var g = acc.clone().normalize(); qF.setFromUnitVectors(g, new THREE.Vector3(0, 0, 1)); have = true;
  }
  // celular girado 180° no VR Box (o WebView às vezes informa a rotação da tela errada):
  // detecta pela gravidade e corrige todos os sensores juntos (giro, acelerômetro, magnetômetro)
  V.flip = V.cfg.flip === '180'; var flipVotes = 0;
  function fx(x) { return V.flip ? -x : x; }
  function checkFlip(ay) {
    if (V.cfg.flip !== 'auto') { V.flip = V.cfg.flip === '180'; return; }
    // olhando para a frente, a gravidade (reação) aponta para cima na tela: y > 0. Se ficar negativa por ~1 s, está invertido.
    if (ay < -6) flipVotes++; else if (ay > 6) flipVotes = 0;
    if (flipVotes > 60) { V.flip = !V.flip; flipVotes = 0; have = false; if (accOk) initFromAccel(); R.ui.toast('Orientação do celular corrigida (girado 180°)', 2); }
  }
  function startSensors() {
    V.mode = '3dof'; var ok = false;
    try {
      if (window.Gyroscope && window.Accelerometer) {
        var hz = 200, gyro = new Gyroscope({ frequency: hz, referenceFrame: 'screen' }), ac = new Accelerometer({ frequency: 100, referenceFrame: 'screen' });
        ac.addEventListener('reading', function () {
          if (!accOk && V.cfg.flip === 'auto' && ac.y < -5) V.flip = true; // primeira leitura já diz se está de cabeça para baixo
          acc.set(fx(ac.x), fx(ac.y), ac.z); checkFlip(acc.y);
          if (!accOk) { accOk = true; if (!have) initFromAccel(); } updateMotion();
        });
        gyro.addEventListener('reading', function () {
          var t = gyro.timestamp / 1000; var dt = lastGT ? Math.min(0.12, t - lastGT) : 0; lastGT = t;
          if (dt > 0 && accOk) fuse(fx(gyro.x), fx(gyro.y), gyro.z, dt); // só integra depois de saber onde é "para baixo"
          V.lastSensor = performance.now();
        });
        gyro.addEventListener('error', function () { if (!have) fallback(); });
        gyro.start(); ac.start(); ok = true; V.sensor = 'fusão própria (giroscópio ' + hz + ' Hz + acelerômetro' + (window.Magnetometer ? ' + magnetômetro' : '') + ')';
        if (window.Magnetometer && V.cfg.useMag) { try { var mg = new Magnetometer({ frequency: 30, referenceFrame: 'screen' }); mg.addEventListener('reading', function () { mag = new THREE.Vector3(fx(mg.x), fx(mg.y), mg.z); }); mg.start(); } catch (e) {} }
        V.fusion = true;
      }
    } catch (e) { ok = false; }
    if (!ok) fallback();
  }
  // aceleração linear da cabeça em coordenadas do mundo (para jogos: "para onde a cabeça acelera")
  var gW = new THREE.Vector3(0, 0, 9.81), aw = new THREE.Vector3(), lastMT = 0;
  function updateMotion() {
    var t = performance.now() / 1000, dt = lastMT ? Math.min(0.05, t - lastMT) : 0; lastMT = t;
    aw.copy(acc).applyQuaternion(qF).sub(gW); // z-up, sem gravidade
    aw.set(aw.x, aw.z, -aw.y).applyQuaternion(yawFix); // -> y-up do three
    V.headAccel.lerp(aw, 0.35);
    if (dt > 0) {
      // velocidade e deslocamento com "vazamento": só gestos curtos (agachar, pular, inclinar), sem deriva
      V.headVel.addScaledVector(V.headAccel, dt).multiplyScalar(Math.exp(-dt * 3));
      V.headOffset.addScaledVector(V.headVel, dt).multiplyScalar(Math.exp(-dt * 1.5));
      V.headOffset.clampLength(0, 0.25);
      if (V.headAccel.y > 7 && !V.events.jumpLock) { V.events.jump = true; V.events.jumpLock = true; setTimeout(function () { V.events.jumpLock = false; }, 500); }
    }
  }
  V.consume = function (ev) { if (V.events[ev]) { V.events[ev] = false; return true; } return false; };
  // reserva: sensor de orientação pronto do sistema ou evento deviceorientation
  var qSensor = new THREE.Quaternion();
  var euler = new THREE.Euler(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)), zee = new THREE.Vector3(0, 0, 1);
  function fallback() {
    if (V._fb) return; V._fb = true; V.fusion = false;
    try {
      if (window.RelativeOrientationSensor) {
        var s2 = new RelativeOrientationSensor({ frequency: 120, referenceFrame: 'screen' });
        s2.addEventListener('reading', function () { qSensor.fromArray(s2.quaternion); qSensor.premultiply(qWorld); have = true; V.sys = true; });
        s2.start(); V.sensor = 'sensor de orientação do sistema'; return;
      }
    } catch (e) {}
    var go = function () {
      window.addEventListener('deviceorientation', function (e) {
        if (e.alpha === null) return;
        var a = THREE.MathUtils.degToRad(e.alpha), b = THREE.MathUtils.degToRad(e.beta), g = THREE.MathUtils.degToRad(e.gamma);
        var orient = THREE.MathUtils.degToRad((screen.orientation && screen.orientation.angle) || window.orientation || 0);
        euler.set(b, a, -g, 'YXZ'); qSensor.setFromEuler(euler); qSensor.multiply(q1); qSensor.multiply(q0.setFromAxisAngle(zee, -orient)); have = true; V.sys = true;
      }, true);
      V.sensor = 'deviceorientation (reserva)';
    };
    if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().then(go, go); else go();
  }
  var qFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
  // reserva sem acelerômetro próprio: usa a gravidade do devicemotion para detectar a virada
  window.addEventListener('devicemotion', function (e) {
    if (V.fusion || !V.active || !e.accelerationIncludingGravity) return;
    var g = e.accelerationIncludingGravity, ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    var ay = ang === 90 ? -g.x : ang === 270 || ang === -90 ? g.x : ang === 180 ? -g.y : g.y; // gravidade no eixo "para cima" da tela
    checkFlip(V.flip ? -ay : ay);
  });
  var qPred = new THREE.Quaternion(), wpred = new THREE.Vector3();
  V.updateHead = function () {
    if (!V.active || V.mode !== '3dof' || !have) return;
    if (V.fusion) {
      // predição: gira pela velocidade angular atual pelo tempo até a imagem chegar aos olhos
      var lead = (V.cfg.predictMs + (performance.now() - (V.lastSensor || performance.now()))) / 1000;
      qPred.copy(qF); var ang = wF.length() * lead;
      if (ang > 1e-6 && ang < 0.6) { qPred.multiply(tmpq.setFromAxisAngle(wpred.copy(wF).normalize(), ang)); }
      qPred.premultiply(qWorld);
    } else { qPred.copy(qSensor); if (V.flip) qPred.multiply(qFlip); }
    R.camera.quaternion.copy(yawFix).multiply(qPred);
    if (V.cfg.accelMove) R.camera.position.copy(V.headOffset); else R.camera.position.set(0, 0, 0);
    if (V.floorH) R.settings.height = V.floorH;
  };
  V.recenter = function () {
    var q = V.fusion ? qF.clone().premultiply(qWorld) : qSensor;
    var d = new THREE.Vector3(0, 0, -1).applyQuaternion(q); var yaw = Math.atan2(-d.x, -d.z);
    yawFix.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
  };
  // altura cabeça↔chão: barômetro do APK (o magnetômetro mede campo magnético, não distância)
  V.calibrateFloor = function (step) {
    if (!(window.WpolloAndroid && WpolloAndroid.pressure)) { R.ui.toast('Este modo precisa do APK (barômetro)'); return; }
    var p = WpolloAndroid.pressure(); if (!(p > 0)) { R.ui.toast('Este celular não tem barômetro'); return; }
    if (step === 'floor') { V.p0 = p; R.ui.toast('Chão gravado. Agora coloque o VR Box na cabeça e toque em "Cabeça".', 4); }
    else if (V.p0) { var h = (V.p0 - p) * 8.3; if (h > 0.6 && h < 2.4) { V.floorH = h; R.settings.height = h; R.saveSettings(); R.ui.toast('Altura medida: ' + h.toFixed(2) + ' m'); } else R.ui.toast('Medida instável (' + h.toFixed(2) + ' m) — tente de novo parado'); }
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
  // realidade mista: a câmera preenche o olho inteiro (fundo em tela cheia, recorte "cover").
  // Em passthrough, o olho virtual usa o MESMO campo de visão da câmera, então mãos e objetos
  // virtuais alinham com a imagem real e tudo fica imersivo (sem moldura cinza).
  var bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), bgScene = new THREE.Scene();
  var bgMat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, uvScale: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }',
    fragmentShader: 'uniform sampler2D tex; uniform vec2 uvScale; varying vec2 vUv;\n' +
      'void main(){ vec2 uv = (vUv - 0.5) * uvScale + 0.5; gl_FragColor = texture2D(tex, uv); }',
    depthTest: false, depthWrite: false
  });
  bgScene.add(new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), bgMat));
  function bgCover(eyeAsp) {
    var v = V.video, camAsp = v && v.videoWidth ? v.videoWidth / v.videoHeight : 4 / 3;
    // "cover": preenche o viewport do olho sem distorcer, cortando o excedente
    if (camAsp > eyeAsp) bgMat.uniforms.uvScale.value.set(eyeAsp / camAsp, 1);
    else bgMat.uniforms.uvScale.value.set(1, camAsp / eyeAsp);
  }
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
    var half = W / 2, asp = half / H, mrPass = V.passthrough && V.bgTex && V.mode !== '6dof';
    [eyeL, eyeR].forEach(function (e, i) {
      e.fov = (mrPass ? ((R.handtrack && R.handtrack.cfg.camFov) || 66) : V.cfg.fov); e.aspect = asp; e.near = camera.near; e.far = camera.far; e.updateProjectionMatrix();
      e.position.copy(camW).addScaledVector(right, (i ? 0.5 : -0.5) * V.cfg.ipd); e.quaternion.copy(qW); e.updateMatrixWorld(true);
    });
    // realidade mista: esconde céu/chão virtuais e desenha a câmera atrás
    var mr = V.passthrough && V.bgTex;
    if (mr) { if ((hideT -= R.rawDt) < 0) { collectSky(scene); hideT = 1; } for (var i = 0; i < hidden.length; i++) hidden[i].visible = false; bgMat.uniforms.tex.value = V.bgTex; }
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
      if (mr) { if (V.mode === '6dof') r.render(bgScene, bgCam); else { bgCover(asp); r.render(bgScene, bgCam); } }
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
  window.addEventListener('resize', function () {
    if (!V.active) return; R.renderer.setSize(window.innerWidth, window.innerHeight);
    if (window.innerHeight > window.innerWidth) R.ui.toast('Gire o celular para a horizontal (paisagem)', 3);
  });
  V.toggleFullscreen = function () {
    var de = document.documentElement;
    if (document.fullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
    else { var rq = de.requestFullscreen || de.webkitRequestFullscreen; if (rq) Promise.resolve(rq.call(de, { navigationUI: 'hide' })).then(function () { try { screen.orientation.lock('landscape').catch(function () {}); } catch (e) {} }, function () {}); }
  };
})();
