/* Wpollo VR — hand tracking pela câmera traseira do celular (modo VR Box).
 * Motor próprio sobre ONNX Runtime (NPU via WebNN > GPU > CPU), em Worker (assíncrono) ou na thread principal.
 * Filtros: One Euro, Kalman (velocidade constante), EMA ou nenhum + predição para esconder a latência.
 * Visual: luvas sem dedos ("luva cortada") nos estilos Clássico e Fofinho (peludinho), 4 draw calls por mão.
 * Gestos: pinça (polegar+indicador) = gatilho; pinça longa da mão esquerda = menu.
 * Com Joy-Con conectado o clique vem dos botões; a mão continua dando a posição/rotação (6DoF) do ponteiro.
 */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, V3 = THREE.Vector3;
  var DEF = { engine: 'npu', async: true, mrHand: false, filter: 'oneeuro', minCutoff: 1.0, beta: 0.04, kalmanQ: 0.02, kalmanR: 0.4, ema: 0.5, predictMs: 25,
    camRes: '640x480', detEvery: 8, maxHands: 2, detConf: 0.35, poseConf: 0.45, camFov: 66, handScale: 1.0, camOffsetX: 0.0 };
  var H = R.handtrack = {};
  // o APK entrega o canal binário assim que a página carrega: guarda já (o motor de mãos carrega depois)
  window.addEventListener('message', function (e) { if (e.data === 'wpnn-port' && e.ports && e.ports[0]) window.__wpnnPort = e.ports[0]; });
  H.cfg = (function () { var c = R.store.get('handtrack', {}); for (var k in DEF) if (!(k in c)) c[k] = DEF[k]; if (c.poseConf < 0.4) c.poseConf = 0.45; if (c.engine === 'webnn' && window.WpolloAndroid) c.engine = 'npu'; return c; })();
  H.save = function () { R.store.set('handtrack', H.cfg); if (worker) worker.postMessage({ type: 'cfg', cfg: workerCfg() }); };
  var run = false, ready = false, stat = 'desligado', worker = null, lastMs = 0, epName = '', video = null, lastT = 0;
  H.supported = function () { return !!(R.vrbox && R.vrbox.active && navigator.mediaDevices); };
  H.running = function () { return run; };
  H.status = function () { return stat; };
  H.info = function () { return { ep: epName, ms: lastMs }; };
  function workerCfg() { return { engine: H.cfg.engine, maxHands: H.cfg.maxHands, detEvery: H.cfg.detEvery, detConf: H.cfg.detConf, poseConf: H.cfg.poseConf, modelBase: new URL('assets/ml/', location.href).href, wasmPaths: new URL('js/vendor/ort/', location.href).href }; }

  // ------------------------------------------------------------ filtros
  function OneEuro() { this.x = null; this.dx = 0; this.t = 0; }
  function alpha(cut, dt) { var tau = 1 / (2 * Math.PI * cut); return 1 / (1 + tau / dt); }
  OneEuro.prototype.f = function (v, t) {
    if (this.x === null) { this.x = v; this.t = t; return v; }
    var dt = Math.max(1e-3, t - this.t); this.t = t;
    var d = (v - this.x) / dt; this.dx += alpha(1.0, dt) * (d - this.dx);
    var cut = H.cfg.minCutoff + H.cfg.beta * Math.abs(this.dx) * 100;
    this.x += alpha(cut, dt) * (v - this.x); return this.x;
  };
  function Kalman() { this.x = null; this.v = 0; this.P = [1, 0, 0, 1]; this.t = 0; }
  Kalman.prototype.f = function (z, t) {
    if (this.x === null) { this.x = z; this.t = t; return z; }
    var dt = Math.max(1e-3, t - this.t), q = H.cfg.kalmanQ, r = H.cfg.kalmanR * 1e-3; this.t = t;
    var x = this.x + this.v * dt, P = this.P;
    var p00 = P[0] + dt * (P[2] + P[1]) + dt * dt * P[3] + q * dt, p01 = P[1] + dt * P[3], p10 = P[2] + dt * P[3], p11 = P[3] + q;
    var S = p00 + r, k0 = p00 / S, k1 = p10 / S, y = z - x;
    this.x = x + k0 * y; this.v += k1 * y; this.P = [(1 - k0) * p00, (1 - k0) * p01, p10 - k1 * p00, p11 - k1 * p01];
    return this.x;
  };
  function Ema() { this.x = null; this.vv = 0; this.t = 0; }
  Ema.prototype.f = function (v, t) { if (this.x === null) { this.x = v; this.t = t; return v; } var a = H.cfg.ema, nx = this.x + a * (v - this.x), dt = Math.max(1e-3, t - this.t); this.vv = (nx - this.x) / dt; this.x = nx; this.t = t; return nx; };
  function mkFilter() { var F = H.cfg.filter === 'kalman' ? Kalman : H.cfg.filter === 'ema' ? Ema : H.cfg.filter === 'none' ? null : OneEuro; return F ? new F() : null; }
  function vel(f) { return !f ? 0 : f.dx !== undefined ? f.dx : f.v !== undefined ? f.v : f.vv || 0; }

  // ------------------------------------------------------------ mão 3D
  // comprimentos canônicos dos ossos (m)
  var BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17]];
  var LEN = [0.04, 0.035, 0.03, 0.025, 0.085, 0.045, 0.025, 0.022, 0.085, 0.05, 0.03, 0.024, 0.08, 0.045, 0.028, 0.023, 0.075, 0.035, 0.02, 0.02, 0.02, 0.02, 0.02];
  var GLOVE_BONE = function (i) { return i <= 1 || i === 4 || i === 5 || i === 8 || i === 9 || i === 12 || i === 13 || i === 16 || i === 17 || i >= 20; };
  var RAD = [0.013, 0.012, 0.011, 0.01, 0.012, 0.0105, 0.0095, 0.0085, 0.012, 0.011, 0.01, 0.009, 0.012, 0.0105, 0.0095, 0.0085, 0.012, 0.0095, 0.0085, 0.0075, 0.012, 0.012, 0.012];

  var furTex = null, fabricTex = null;
  function tex(kind) {
    var c = document.createElement('canvas'); c.width = c.height = 128; var x = c.getContext('2d');
    if (kind === 'fur') { x.clearRect(0, 0, 128, 128); for (var i = 0; i < 2600; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.3 + Math.random() * 0.7) + ')'; x.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 3 + Math.random() * 4); } }
    else { x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, 128, 128); for (var j = 0; j < 128; j += 4) { x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(0, j, 128, 1); x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(j, 0, 1, 128); } }
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  function Hand(side) {
    this.side = side; this.g = new THREE.Group(); this.g.visible = false;
    this.pts = []; for (var i = 0; i < 21; i++) this.pts.push(new V3());
    this.f = []; this.seen = 0; this.pinch = false; this.pinchT = 0;
    var cyl = new THREE.CylinderBufferGeometry(1, 1, 1, 8, 1, true), sph = new THREE.SphereBufferGeometry(1, 8, 6);
    this.mGlove = new THREE.MeshLambertMaterial({ color: '#1d1f26' }); this.mSkin = new THREE.MeshLambertMaterial({ color: R.hands ? R.hands.skin : '#d9a383' });
    this.mFur = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, alphaTest: 0.35, depthWrite: false });
    this.bG = new THREE.InstancedMesh(cyl, this.mGlove, BONES.length); this.bS = new THREE.InstancedMesh(cyl, this.mSkin, BONES.length);
    this.jG = new THREE.InstancedMesh(sph, this.mGlove, 21); this.jS = new THREE.InstancedMesh(sph, this.mSkin, 21);
    this.fz = new THREE.InstancedMesh(cyl, this.mFur, BONES.length);
    var palmG = new THREE.BufferGeometry(); palmG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3 * 2 * 3), 3));
    this.palm = new THREE.Mesh(palmG, this.mGlove); this.palm.frustumCulled = false;
    var cuff = new THREE.Mesh(new THREE.TorusBufferGeometry(0.03, 0.01, 6, 14), this.mGlove); this.cuff = cuff;
    [this.bG, this.bS, this.jG, this.jS, this.fz].forEach(function (m) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); });
    this.g.add(this.bG, this.bS, this.jG, this.jS, this.fz, this.palm, cuff);
    this.applyStyle();
  }
  Hand.prototype.applyStyle = function () {
    var st = R.settings.handStyle === 'fofinho' ? 'fofinho' : 'classico', col = R.settings.gloveColor || (st === 'fofinho' ? '#ffb3d9' : '#1d1f26');
    if (!fabricTex) { fabricTex = tex('fabric'); furTex = tex('fur'); }
    this.mGlove.color.set(col); this.mGlove.map = st === 'fofinho' ? furTex : fabricTex; this.mGlove.needsUpdate = true;
    this.mFur.color.set(col); this.mFur.map = furTex; this.mFur.needsUpdate = true;
    this.fz.visible = st === 'fofinho'; this.style = st;
  };
  var mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), up = new V3(0, 1, 0), dv = new V3(), mid = new V3(), sc = new V3();
  Hand.prototype.draw = function () {
    var p = this.pts, ng = 0, ns = 0, nf = 0, fluffy = this.style === 'fofinho';
    for (var i = 0; i < BONES.length; i++) {
      var a = p[BONES[i][0]], b = p[BONES[i][1]]; dv.subVectors(b, a); var len = dv.length(); if (len < 1e-4) continue;
      mid.addVectors(a, b).multiplyScalar(0.5); qq.setFromUnitVectors(up, dv.divideScalar(len));
      var r = RAD[i] * H.cfg.handScale * (GLOVE_BONE(i) && fluffy ? 1.18 : 1);
      mtx.compose(mid, qq, sc.set(r, len, r));
      if (GLOVE_BONE(i)) { this.bG.setMatrixAt(ng++, mtx); if (fluffy) { mtx.compose(mid, qq, sc.set(r * 1.45, len * 1.05, r * 1.45)); this.fz.setMatrixAt(nf++, mtx); } }
      else this.bS.setMatrixAt(ns++, mtx);
    }
    var jg = 0, js = 0;
    for (var k = 0; k < 21; k++) {
      var glove = k === 0 || k === 1 || k === 2 || k === 5 || k === 9 || k === 13 || k === 17 || k === 6 || k === 10 || k === 14 || k === 18;
      var rr = (k % 4 === 0 && k ? 0.0085 : 0.0105) * H.cfg.handScale * (glove && fluffy ? 1.2 : 1);
      mtx.compose(p[k], qq.identity(), sc.set(rr, rr, rr));
      if (glove) this.jG.setMatrixAt(jg++, mtx); else this.jS.setMatrixAt(js++, mtx);
    }
    this.bG.count = ng; this.bS.count = ns; this.jG.count = jg; this.jS.count = js; this.fz.count = nf;
    this.bG.instanceMatrix.needsUpdate = this.bS.instanceMatrix.needsUpdate = this.jG.instanceMatrix.needsUpdate = this.jS.instanceMatrix.needsUpdate = this.fz.instanceMatrix.needsUpdate = true;
    // palma (leque fechado, dois lados)
    var ring = [0, 1, 5, 9, 13, 17], pa = this.palm.geometry.attributes.position.array, o = 0, c = new V3();
    for (var q = 0; q < ring.length; q++) c.add(p[ring[q]]); c.multiplyScalar(1 / ring.length);
    for (var s = 0; s < ring.length; s++) { var A = p[ring[s]], B = p[ring[(s + 1) % ring.length]]; [c, A, B, c, B, A].forEach(function (v) { pa[o++] = v.x; pa[o++] = v.y; pa[o++] = v.z; }); }
    this.palm.geometry.attributes.position.needsUpdate = true; this.palm.geometry.computeVertexNormals();
    this.cuff.position.copy(p[0]); this.cuff.lookAt(p[9]); this.cuff.scale.setScalar(H.cfg.handScale * (fluffy ? 1.3 : 1));
  };

  // ------------------------------------------------------------ mão realista (malha com pele) movida pelos pontos
  var MAP = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'];
  ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'].forEach(function (f) { MAP.push(f + '-phalanx-proximal', f + '-phalanx-intermediate', f + '-phalanx-distal', f + '-tip'); });
  var NEXT = { 0: 9, 1: 2, 2: 3, 3: 4, 4: 4 }; for (var fi = 0; fi < 4; fi++) { var b0 = 5 + fi * 4; NEXT[b0] = b0 + 1; NEXT[b0 + 1] = b0 + 2; NEXT[b0 + 2] = b0 + 3; NEXT[b0 + 3] = b0 + 3; }
  function SkinHand(side) {
    var src = R.assets.models[side === 'left' ? 'hand_left' : 'hand_right']; this.ok = !!src; if (!src) return;
    this.root = THREE.SkeletonUtils ? THREE.SkeletonUtils.clone(src) : src.clone(true);
    var j = this.j = {}, self = this;
    this.root.traverse(function (o) {
      if (o.name && /wrist|finger|thumb/.test(o.name)) j[o.name] = { o: o, p: o.position.clone(), q: o.quaternion.clone() };
      if (o.isSkinnedMesh) { self.mesh = o; o.frustumCulled = false; }
    });
    var g = this.mesh.geometry = this.mesh.geometry.clone();
    this.mesh.material = new THREE.MeshLambertMaterial({ vertexColors: true, skinning: true });
    // luva: vértices presos principalmente ao punho/metacarpos/falange proximal
    var si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = this.mesh.skeleton.bones, n = si.count;
    this.glove = new Float32Array(n);
    for (var v = 0; v < n; v++) {
      var best = 0, bw = -1, W4 = [sw.getX(v), sw.getY(v), sw.getZ(v), sw.getW(v)], I4 = [si.getX(v), si.getY(v), si.getZ(v), si.getW(v)]; for (var k = 0; k < 4; k++) { if (W4[k] > bw) { bw = W4[k]; best = I4[k]; } }
      var nm = (bones[best] && bones[best].name) || '';
      this.glove[v] = /wrist|metacarpal|phalanx-proximal/.test(nm) ? 1 : 0;
    }
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('gloveMask', new THREE.BufferAttribute(this.glove, 1));
    // pelúcia (estilo Fofinho): casca inflada pela normal, só nas áreas da luva, com recortes de ruído
    var fur = new THREE.MeshLambertMaterial({ color: '#ffffff', skinning: true, transparent: true, depthWrite: false });
    fur.onBeforeCompile = function (sh) {
      sh.vertexShader = 'attribute float gloveMask; varying float vGlove; varying vec3 vP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += objectNormal * 0.0045 * gloveMask; vGlove = gloveMask; vP = position * 900.0;');
      sh.fragmentShader = 'varying float vGlove; varying vec3 vP;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', 'float nz = fract(sin(dot(floor(vP), vec3(12.9898,78.233,37.719))) * 43758.5453); if (vGlove < 0.5 || nz < 0.45) discard;\n#include <alphatest_fragment>');
    };
    this.fur = new THREE.SkinnedMesh(g, fur); this.fur.bind(this.mesh.skeleton, this.mesh.bindMatrix); this.fur.frustumCulled = false;
    this.mesh.parent.add(this.fur);
    var a = j['index-finger-phalanx-proximal'].p, b = j['pinky-finger-phalanx-proximal'].p, w0 = j.wrist.p;
    this.rn = new V3().subVectors(a, w0).cross(new V3().subVectors(b, w0)).normalize();
    this.restPos = MAP.map(function (nm) { return j[nm].p.clone(); });
    this.applyStyle();
  }
  SkinHand.prototype.applyStyle = function () {
    if (!this.ok) return;
    var st = R.settings.handStyle, skin = new THREE.Color(R.hands ? R.hands.skin : '#d9a383');
    var glove = new THREE.Color(R.settings.gloveColor || (st === 'fofinho' ? '#ffb3d9' : '#1d1f26')), useGlove = st === 'classico' || st === 'fofinho';
    var c = this.mesh.geometry.attributes.color;
    for (var v = 0; v < c.count; v++) { var col = useGlove && this.glove[v] ? glove : skin; c.setXYZ(v, col.r, col.g, col.b); }
    c.needsUpdate = true; this.fur.visible = st === 'fofinho'; this.fur.material.color.copy(glove);
  };
  var bR = new THREE.Matrix4(), bC = new THREE.Matrix4(), rot = new THREE.Matrix4(), qR = new THREE.Quaternion();
  function basis(m, d, n) { var nn = n.clone().addScaledVector(d, -n.dot(d)).normalize(); var t = new V3().crossVectors(d, nn); m.makeBasis(d, nn, t); return m; }
  SkinHand.prototype.pose = function (pts) {
    if (!this.ok) return;
    var cn = new V3().subVectors(pts[5], pts[0]).cross(new V3().subVectors(pts[17], pts[0])).normalize();
    for (var i = 0; i < 21; i++) {
      var jj = this.j[MAP[i]]; if (!jj) continue;
      var nx = NEXT[i], from = i === nx ? (i === 4 ? 3 : i - 1) : i, to = i === nx ? i : nx;
      var rd = new V3().subVectors(this.restPos[to], this.restPos[from]).normalize(), cd = new V3().subVectors(pts[to], pts[from]).normalize();
      if (!isFinite(cd.x) || cd.lengthSq() < 0.5) continue;
      basis(bR, rd, this.rn); basis(bC, cd, cn); rot.multiplyMatrices(bC, bR.transpose()); qR.setFromRotationMatrix(rot);
      jj.o.quaternion.copy(qR).multiply(jj.q); jj.o.position.copy(pts[i]);
    }
    // metacarpos (entre o punho e a junta da base) seguem o punho
    var self = this;
    ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'].forEach(function (f, k) {
      var m = self.j[f + '-metacarpal']; if (!m) return; m.o.position.lerpVectors(pts[0], pts[5 + k * 4], 0.3); m.o.quaternion.copy(self.j.wrist.o.quaternion);
    });
  };
  var hands = [new Hand('left'), new Hand('right')];
  H.hands = hands;
  H.applyStyle = function () { hands.forEach(function (h) { h.applyStyle(); if (h.skin) h.skin.applyStyle(); }); };

  // ------------------------------------------------------------ 2D → 3D (câmera traseira ≈ olhos)
  var tmp = new V3(), headQ = new THREE.Quaternion(), headP = new V3();
  function lift(h, kp, W, Ht, t) {
    var f = (W / 2) / Math.tan(THREE.MathUtils.degToRad(H.cfg.camFov) / 2), cx = W / 2, cy = Ht / 2;
    var d = function (a, b) { return Math.hypot(kp[a * 2] - kp[b * 2], kp[a * 2 + 1] - kp[b * 2 + 1]); };
    var s = H.cfg.handScale, Z = Math.min(f * 0.085 * s / Math.max(1, d(0, 9)), f * 0.07 * s / Math.max(1, d(5, 17)));
    Z = Math.max(0.15, Math.min(1.2, Z));
    // profundidade relativa dos dedos pelo encurtamento dos ossos (dedos dobram para longe da câmera)
    var z = new Float32Array(21); z[0] = Z;
    for (var i = 0; i < 20; i++) {
      var a = BONES[i][0], b = BONES[i][1], px = d(a, b) * z[a] / f, L = LEN[i] * s;
      z[b] = z[a] + (b % 4 === 1 ? 0 : Math.sqrt(Math.max(0, L * L - px * px)) * 0.6);
    }
    R.camera.getWorldQuaternion(headQ); R.camera.getWorldPosition(headP);
    var pts = h.raw || (h.raw = []);
    for (var k = 0; k < 21; k++) {
      var zz = z[k], X = (kp[k * 2] - cx) / f * zz + H.cfg.camOffsetX, Y = -(kp[k * 2 + 1] - cy) / f * zz;
      pts[k] = (pts[k] || new V3()).set(X, Y, -zz);
    }
    return pts;
  }
  function filterHand(h, t) {
    if (!h.f.length || h.filterKind !== H.cfg.filter) { h.f = []; for (var i = 0; i < 63; i++) h.f.push(mkFilter()); h.filterKind = H.cfg.filter; }
    var lead = (H.cfg.predictMs + lastMs) / 1000;
    for (var k = 0; k < 21; k++) {
      var r = h.raw[k], o = h.loc || (h.loc = []), out = o[k] || (o[k] = new V3());
      var c = [r.x, r.y, r.z];
      for (var a = 0; a < 3; a++) { var fl = h.f[k * 3 + a]; var v = fl ? fl.f(c[a], t) : c[a]; c[a] = v + (fl ? vel(fl) * lead : 0); }
      out.set(c[0], c[1], c[2]);
    }
  }

  // ------------------------------------------------------------ resultados → mãos/ponteiros
  var pointers = {};
  H.pointers = function () { var o = []; hands.forEach(function (h) { if (h.g.visible && h.ptr) o.push(h.ptr); }); return o; };
  function onResult(res, W, Ht) {
    var t = performance.now() / 1000; lastMs = res.ms;
    var seen = { left: false, right: false };
    res.hands.forEach(function (hr) {
      // câmera traseira não é espelhada: mão na metade esquerda da imagem = mão esquerda (heurística + continuidade)
      var wx = hr.kp[0] / W, side = wx < 0.5 ? 'left' : 'right';
      if (seen[side]) side = side === 'left' ? 'right' : 'left';
      seen[side] = true;
      var h = side === 'left' ? hands[0] : hands[1];
      lift(h, hr.kp, W, Ht, t); filterHand(h, t); h.seen = t; h.sc = hr.sc;
    });
  }
  var tmpQ = new THREE.Quaternion(), m4 = new THREE.Matrix4();
  H.update = function () {
    if (!run) { hands.forEach(function (h) { h.g.visible = false; }); return; }
    var now = performance.now() / 1000;
    R.camera.updateMatrixWorld(true);
    hands.forEach(function (h, i) {
      var vis = h.loc && now - h.seen < 0.35;
      h.g.visible = !!vis; if (h.skin && h.skin.ok) h.skin.root.visible = !!vis; if (h.tipDot && !vis) h.tipDot.visible = false; if (!vis) { if (h.ptr) h.ptr.lost = true; return; }
      if (!h.g.parent) R.scene.add(h.g);
      for (var k = 0; k < 21; k++) h.pts[k].copy(h.loc[k]).applyMatrix4(R.camera.matrixWorld);
      if (!h.skin && R.assets.models.hand_left && R.assets.models.hand_right) { h.skin = new SkinHand(h.side); if (h.skin.ok) R.scene.add(h.skin.root); }
      // realidade mista: a mão real já aparece pela câmera (latência zero) => esconde a malha, fica só o ponteiro
      var hideMesh = R.vrbox && R.vrbox.passthrough && !H.cfg.mrHand;
      if (!h.tipDot) { h.tipDot = new THREE.Mesh(new THREE.SphereBufferGeometry(0.006, 10, 8), new THREE.MeshBasicMaterial({ color: '#c9a2ff', depthTest: false })); h.tipDot.renderOrder = 71; R.scene.add(h.tipDot); }
      h.tipDot.visible = hideMesh; h.tipDot.position.copy(h.pts[8]);
      var useSkin = !hideMesh && h.skin && h.skin.ok && R.settings.handLook !== 'capsulas';
      if (useSkin) { h.skin.root.visible = true; h.skin.pose(h.pts); [h.bG, h.bS, h.jG, h.jS, h.fz, h.palm, h.cuff].forEach(function (m) { m.visible = false; }); }
      else if (hideMesh) { if (h.skin && h.skin.ok) h.skin.root.visible = false; [h.bG, h.bS, h.jG, h.jS, h.fz, h.palm, h.cuff].forEach(function (m) { m.visible = false; }); }
      else { if (h.skin && h.skin.ok) h.skin.root.visible = false; [h.bG, h.bS, h.jG, h.jS, h.palm, h.cuff].forEach(function (m) { m.visible = true; }); h.draw(); }
      // ponteiro: do "ombro" passando pelo ponto da pinça
      if (!h.ptr) { h.ptr = R.input.makePointer(70 + i); h.ptr.isHand = true; }
      var head = R.camera.getWorldPosition(new V3()), yaw = R.headYaw();
      var sh = new V3(Math.cos(yaw) * (i ? 0.17 : -0.17), -0.2, -Math.sin(yaw) * (i ? 0.17 : -0.17)).add(head);
      var pin = new V3().addVectors(h.pts[4], h.pts[8]).multiplyScalar(0.5);
      var dir = new V3().subVectors(pin, sh).normalize();
      m4.lookAt(new V3(), dir.clone().negate(), new V3(0, 1, 0)); tmpQ.setFromRotationMatrix(m4);
      h.ptr.setPose(pin, tmpQ); h.ptr.lost = false;
      // pinça com histerese (desligada quando há Joy-Con: o clique vem dos botões)
      var dd = h.pts[4].distanceTo(h.pts[8]) / H.cfg.handScale;
      if (!R.input.joycon) { if (!h.pinch && dd < 0.025) h.pinch = true; else if (h.pinch && dd > 0.042) h.pinch = false; }
      else h.pinch = false;
      h.ptr._handDown = h.pinch && !h.touching;
      poke(h, i);
      if (i === 0 && h.pinch) { h.pinchT += R.rawDt; if (h.pinchT > 1.0 && !h.menuFired) { h.menuFired = true; R.input._menuKey = true; } } else { h.pinchT = 0; h.menuFired = false; }
    });
  };

  // ------------------------------------------------------------ toque direto com o indicador (comitê de detectores)
  var ring = null, focusOn = false;
  function setFocus(on, idx) {
    if (on === focusOn) return; focusOn = on;
    var c = { focus: on, focusPad: on ? 1.08 : 1.25, focusIdx: idx || 0 };
    if (worker) worker.postMessage({ type: 'cfg', cfg: c }); else if (mainCore && mainCore.setCfg) mainCore.setCfg(c);
  }
  function angle(a, b, c) { var u = new V3().subVectors(b, a).normalize(), v = new V3().subVectors(c, b).normalize(); return Math.acos(Math.max(-1, Math.min(1, u.dot(v)))); }
  function poke(h, i) {
    var p = h.pts, tip = p[8], now = performance.now();
    var hit = R.ui.touchProbe(tip);
    h.touching = !!hit && hit.z < 0.08;
    if (!ring) { ring = new THREE.Mesh(new THREE.RingBufferGeometry(0.008, 0.012, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthTest: false })); ring.renderOrder = 70; R.scene.add(ring); }
    var any = hands.some(function (q) { return q.touching; });
    setFocus(any, i);
    if (!hit) { if (!any) ring.visible = false; h.poke = null; return; }
    // anel mostra onde o dedo vai tocar; fecha conforme aproxima
    ring.visible = true; ring.position.copy(tip); ring.quaternion.copy(hit.P.mesh.getWorldQuaternion(new THREE.Quaternion()));
    var k = Math.max(0.35, Math.min(1.6, hit.z / 0.05)); ring.scale.setScalar(k); ring.material.color.set(hit.item ? '#c9a2ff' : '#ffffff');
    var st = h.poke || (h.poke = { prevZ: hit.z, armed: hit.z > 0.012, last: 0, t0: now, x0: hit.px, y0: hit.py });
    var dt = Math.max(1, now - (st.tPrev || now)) / 1000, vz = (st.prevZ - hit.z) / dt; st.tPrev = now;
    if (hit.z > 0.015) st.armed = true;            // histerese: rearma só ao recuar
    if (hit.z > 0.03) { st.x0 = hit.px; st.y0 = hit.py; } // referência lateral = início da aproximação
    if (st.armed && st.prevZ >= 0 && hit.z < 0) {
      var votes = {
        penetrou: true,
        velocidade: vz > 0.06,
        indicadorEsticado: angle(p[5], p[6], p[8]) < 0.75,
        outrosDobrados: p[12].distanceTo(p[0]) < p[9].distanceTo(p[0]) * 1.35 || p[16].distanceTo(p[0]) < p[13].distanceTo(p[0]) * 1.35,
        estavel: Math.hypot((hit.px - st.x0) / hit.P.cw * hit.P.w, (hit.py - st.y0) / hit.P.ch * hit.P.h) < 0.025, // < 2,5 cm de deriva lateral
        confianca: !h.sc || (h.sc[8] + h.sc[7] + h.sc[6]) / 3 > 0.25
      };
      var ok = 0; for (var kk in votes) if (votes[kk]) ok++;
      if (votes.penetrou && votes.estavel && ok >= 5 && now - st.last > 280) {
        st.armed = false; st.last = now;
        if (R.ui.touchClick(hit)) { ring.material.color.set('#7dff9c'); try { if (window.WpolloAndroid && WpolloAndroid.vibrate) WpolloAndroid.vibrate(15); else if (navigator.vibrate) navigator.vibrate(15); } catch (e) {} }
      }
      H.lastVotes = votes;
    }
    st.prevZ = hit.z;
  }

  // ------------------------------------------------------------ captura de quadros
  var mainCore = null;
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('falha ao carregar ' + src)); }; document.head.appendChild(s); }); }
  H.start = function () {
    if (run) return Promise.resolve();
    if (!H.supported()) { R.ui.toast('Hand tracking: use o modo VR Box no celular'); return Promise.resolve(); }
    run = true; stat = 'iniciando…';
    var res = H.cfg.camRes.split('x');
    return R.vrbox.camera(+res[0], +res[1]).then(function (v) {
      video = v;
      var native = H.cfg.engine === 'npu' && window.WpolloAndroid && WpolloAndroid.nnAvailable && WpolloAndroid.nnAvailable();
      if (native) {
        // APK: NPU de verdade pelo NNAPI (a ponte nativa já roda fora da thread de render)
        return (window.HandCore ? Promise.resolve() : loadScript('js/core/handcore.js')).then(function () {
          mainCore = window.HandCore; return mainCore.initNative(workerCfg());
        }).then(function (r) { ready = true; epName = r.ep; stat = 'ativo (' + r.ep + ')'; R.ui.toast('Mãos: ' + stat, 2); });
      }
      if (H.cfg.async && window.Worker && window.OffscreenCanvas) {
        worker = new Worker('js/core/handcore.js');
        worker.onmessage = function (e) {
          var m = e.data;
          if (m.type === 'ready') { ready = true; epName = m.ep; stat = 'ativo (' + label(m.ep) + ', assíncrono)'; R.ui.toast('Mãos: ' + label(m.ep), 2); }
          else if (m.type === 'result') { busy = false; onResult(m, video.videoWidth, video.videoHeight); }
          else if (m.type === 'error') { busy = false; stat = 'erro: ' + m.msg; if (!ready) { R.ui.toast('Hand tracking: ' + m.msg, 4); H.stop(); } }
        };
        worker.postMessage({ type: 'init', cfg: workerCfg(), ortUrl: new URL('js/vendor/ort/ort.all.min.js', location.href).href });
      } else {
        return (window.ort ? Promise.resolve() : loadScript('js/vendor/ort/ort.all.min.js')).then(function () { return window.HandCore ? 0 : loadScript('js/core/handcore.js'); }).then(function () {
          mainCore = window.HandCore; return mainCore.init(workerCfg());
        }).then(function (r) { ready = true; epName = r.ep; stat = 'ativo (' + label(r.ep) + ')'; });
      }
    }).then(function () { pump(); }, function (e) { stat = 'erro: ' + e.message; run = false; R.ui.toast('Câmera: ' + e.message, 4); });
  };
  function label(ep) { return /nnapi|npu/.test(ep) ? 'NPU' : /webgpu|gpu/.test(ep) ? 'GPU' : 'CPU'; }
  H.stop = function () { run = false; ready = false; stat = 'desligado'; if (worker) { worker.terminate(); worker = null; } hands.forEach(function (h) { h.g.visible = false; if (h.skin && h.skin.ok) h.skin.root.visible = false; }); };
  H._SkinHand = SkinHand; H._poke = function (h, i) { return poke(h, i); };
  var busy = false;
  function pump() {
    if (!run) return;
    var next = function () { if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(pump); else requestAnimationFrame(pump); };
    if (!ready || busy || video.readyState < 2) return next();
    busy = true; var W = video.videoWidth, Ht = video.videoHeight;
    if (worker) {
      // só um quadro "em voo" por vez: quadros novos esperam => latência mínima, sem fila
      createImageBitmap(video).then(function (bmp) { worker.postMessage({ type: 'frame', bitmap: bmp, w: W, h: Ht, t: performance.now() }, [bmp]); }, function () { busy = false; });
    } else {
      mainCore.process(video, W, Ht).then(function (r) { busy = false; onResult(r, W, Ht); }, function () { busy = false; });
    }
    next();
  }
})();
