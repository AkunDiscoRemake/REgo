/* Wpollo VR — núcleo de inferência de mãos (roda em Worker OU na thread principal).
 * Modelos: RTMDet-nano (detector de mãos) + RTMPose-m (21 pontos), OpenMMLab, Apache-2.0,
 * convertidos para ONNX fp16 (NPU/GPU) e int8 (CPU) — ver tools/build-handmodels.md.
 * Motor: ONNX Runtime Web. Ordem de execução escolhida pelo usuário:
 *   npu → WebNN (deviceType 'npu')   gpu → WebGPU / WebNN 'gpu'   cpu → WASM SIMD (int8)
 * Otimizações: detector só a cada N quadros (rastreia a caixa pelos pontos do quadro anterior),
 * pré-processamento num OffscreenCanvas pequeno, buffers reaproveitados, quadros antigos descartados.
 */
(function (G) {
  'use strict';
  var C = G.HandCore = {};
  var ort = G.ort, det = null, pose = null, ep = '', base = '', cfg = {};
  var DET = 320, POSE = 256;
  var cDet, xDet, cPose, xPose, fDet = new Float32Array(3 * DET * DET), fPose = new Float32Array(3 * POSE * POSE);
  var tracks = [], frameN = 0;

  function mk(w) { var c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, w) : (function () { var e = document.createElement('canvas'); e.width = e.height = w; return e; })(); return c; }
  function providers(engine) {
    if (engine === 'npu') return [[{ name: 'webnn', deviceType: 'npu', powerPreference: 'low-power' }], [{ name: 'webnn', deviceType: 'gpu' }], ['webgpu'], ['wasm']];
    if (engine === 'gpu') return [['webgpu'], [{ name: 'webnn', deviceType: 'gpu' }], ['wasm']];
    return [['wasm']];
  }
  function tryCreate(list, file16, file8) {
    var i = 0;
    var next = function () {
      if (i >= list.length) return Promise.reject(new Error('nenhum motor disponível'));
      var eps = list[i++], isCpu = eps[0] === 'wasm';
      return ort.InferenceSession.create(base + (isCpu ? file8 : file16), { executionProviders: eps, graphOptimizationLevel: 'all' })
        .then(function (s) { return { s: s, ep: typeof eps[0] === 'string' ? eps[0] : eps[0].name + '-' + eps[0].deviceType }; }, function () { return next(); });
    };
    return next();
  }
  C.init = function (opts) {
    cfg = opts; base = opts.modelBase || 'assets/ml/';
    ort.env.wasm.wasmPaths = opts.wasmPaths || 'js/vendor/ort/';
    ort.env.wasm.numThreads = (G.crossOriginIsolated && navigator.hardwareConcurrency) ? Math.min(4, navigator.hardwareConcurrency) : 1;
    ort.env.wasm.simd = true;
    cDet = mk(DET); xDet = cDet.getContext('2d', { willReadFrequently: true });
    cPose = mk(POSE); xPose = cPose.getContext('2d', { willReadFrequently: true });
    var list = providers(opts.engine);
    return tryCreate(list, 'hand_pose_fp16.onnx', 'hand_pose_int8.onnx').then(function (p) {
      pose = p.s; ep = p.ep;
      // o detector roda raramente: CPU basta e evita disputar o acelerador
      return tryCreate(opts.engine === 'cpu' ? list : [list[0], ['wasm']], 'hand_det_fp16.onnx', 'hand_det_int8.onnx');
    }).then(function (d) { det = d.s; return { ep: ep, detEp: d.ep }; });
  };

  function detect(img, W, H) {
    var s = Math.min(DET / W, DET / H), w = Math.round(W * s), h = Math.round(H * s);
    xDet.fillStyle = 'rgb(114,114,114)'; xDet.fillRect(0, 0, DET, DET); xDet.drawImage(img, 0, 0, w, h);
    var px = xDet.getImageData(0, 0, DET, DET).data, n = DET * DET;
    // RTMDet: BGR, média/desvio do mmdet
    for (var i = 0, j = 0; i < n; i++, j += 4) { fDet[i] = (px[j + 2] - 103.53) / 57.375; fDet[n + i] = (px[j + 1] - 116.28) / 57.12; fDet[2 * n + i] = (px[j] - 123.675) / 58.395; }
    return det.run({ input: new ort.Tensor('float32', fDet, [1, 3, DET, DET]) }).then(function (o) {
      var d = o.dets.data, cnt = o.dets.dims[1], out = [];
      for (var k = 0; k < cnt && out.length < cfg.maxHands; k++) {
        var sc = d[k * 5 + 4]; if (sc < cfg.detConf) continue;
        out.push({ x1: d[k * 5] / s, y1: d[k * 5 + 1] / s, x2: d[k * 5 + 2] / s, y2: d[k * 5 + 3] / s, s: sc });
      }
      return out;
    });
  }
  function estimate(img, box) {
    var cx = (box.x1 + box.x2) / 2, cy = (box.y1 + box.y2) / 2, side = Math.max(box.x2 - box.x1, box.y2 - box.y1) * 1.25, sc = POSE / side;
    xPose.setTransform(1, 0, 0, 1, 0, 0); xPose.fillStyle = '#000'; xPose.fillRect(0, 0, POSE, POSE);
    xPose.setTransform(sc, 0, 0, sc, POSE / 2 - cx * sc, POSE / 2 - cy * sc); xPose.drawImage(img, 0, 0);
    var px = xPose.getImageData(0, 0, POSE, POSE).data, n = POSE * POSE;
    for (var i = 0, j = 0; i < n; i++, j += 4) { fPose[i] = (px[j] - 123.675) / 58.395; fPose[n + i] = (px[j + 1] - 116.28) / 57.12; fPose[2 * n + i] = (px[j + 2] - 103.53) / 57.375; }
    return pose.run({ input: new ort.Tensor('float32', fPose, [1, 3, POSE, POSE]) }).then(function (o) {
      var X = o.simcc_x.data, Y = o.simcc_y.data, L = o.simcc_x.dims[2], kp = new Float32Array(42), score = new Float32Array(21), mean = 0;
      for (var k = 0; k < 21; k++) {
        var bx = 0, vx = -1e9, by = 0, vy = -1e9, a, b;
        for (a = 0; a < L; a++) { var v = X[k * L + a]; if (v > vx) { vx = v; bx = a; } }
        for (b = 0; b < L; b++) { var w = Y[k * L + b]; if (w > vy) { vy = w; by = b; } }
        kp[k * 2] = (bx / 2 - POSE / 2) / sc + cx; kp[k * 2 + 1] = (by / 2 - POSE / 2) / sc + cy;
        score[k] = Math.min(vx, vy); mean += score[k];
      }
      return { kp: kp, sc: score, conf: mean / 21 };
    });
  }
  function boxFrom(kp) {
    var x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    for (var k = 0; k < 21; k++) { x1 = Math.min(x1, kp[k * 2]); x2 = Math.max(x2, kp[k * 2]); y1 = Math.min(y1, kp[k * 2 + 1]); y2 = Math.max(y2, kp[k * 2 + 1]); }
    var cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, s = Math.max(x2 - x1, y2 - y1) * 1.1 / 2;
    return { x1: cx - s, y1: cy - s, x2: cx + s, y2: cy + s };
  }
  // processa um quadro; retorna mãos em pixels da imagem
  C.process = function (img, W, H) {
    frameN++;
    var t0 = (G.performance || Date).now();
    var needDet = !tracks.length || frameN % cfg.detEvery === 0;
    var boxesP = needDet ? detect(img, W, H).then(function (b) {
      // mantém rastros que o detector perdeu mas seguem confiáveis
      if (!b.length) return tracks.slice(0, cfg.maxHands);
      return b;
    }) : Promise.resolve(tracks);
    return boxesP.then(function (boxes) {
      var chain = Promise.resolve(), hands = [];
      boxes.slice(0, cfg.maxHands).forEach(function (bx) { chain = chain.then(function () { return estimate(img, bx).then(function (h) { if (h.conf >= cfg.poseConf) hands.push(h); }); }); });
      return chain.then(function () {
        tracks = hands.map(function (h) { return boxFrom(h.kp); });
        return { hands: hands, ms: (G.performance || Date).now() - t0, ep: ep };
      });
    });
  };

  // ------------------------------------------------------------ modo Worker
  if (typeof importScripts === 'function' && typeof window === 'undefined') {
    var busy = false;
    G.onmessage = function (e) {
      var m = e.data;
      if (m.type === 'init') {
        try { importScripts(m.ortUrl); ort = G.ort; } catch (er) { G.postMessage({ type: 'error', msg: 'ORT: ' + er.message }); return; }
        C.init(m.cfg).then(function (r) { G.postMessage({ type: 'ready', ep: r.ep, detEp: r.detEp }); }, function (er) { G.postMessage({ type: 'error', msg: er.message }); });
      } else if (m.type === 'frame') {
        if (busy) { m.bitmap.close(); return; }
        busy = true;
        C.process(m.bitmap, m.w, m.h).then(function (r) {
          m.bitmap.close(); busy = false;
          G.postMessage({ type: 'result', t: m.t, hands: r.hands, ms: r.ms });
        }, function (er) { busy = false; try { m.bitmap.close(); } catch (x) {} G.postMessage({ type: 'error', msg: er.message }); });
      } else if (m.type === 'cfg') { for (var k in m.cfg) cfg[k] = m.cfg[k]; }
    };
  }
})(typeof self !== 'undefined' ? self : window);
