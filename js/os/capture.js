/* REgo OS — captura de tela dentro do VR (render-to-texture) -> Galeria */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE;
  var rt = null, cam = null, W = 640, H = 400;
  R.capture = {
    pending: false,
    take: function () { R.capture.pending = true; },
    list: function () { return R.store.get('shots', []); },
    remove: function (i) { var l = R.capture.list(); l.splice(i, 1); R.store.set('shots', l); },
    run: function () {
      R.capture.pending = false;
      var r = R.renderer;
      if (!rt) { rt = new THREE.WebGLRenderTarget(W, H); cam = new THREE.PerspectiveCamera(70, W / H, 0.05, 300); }
      R.camera.updateMatrixWorld(true);
      cam.matrixAutoUpdate = false; cam.matrixWorld.copy(R.camera.matrixWorld); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      cam.matrix.copy(cam.matrixWorld);
      var xr = r.xr.enabled; r.xr.enabled = false;
      var prev = r.getRenderTarget();
      // esconde lasers/controles na foto
      var ps = R.input.pointers, vis = [];
      for (var i = 0; i < ps.length; i++) { vis.push(ps[i].obj.visible); ps[i].obj.visible = false; ps[i].cursor.visible = false; }
      r.setRenderTarget(rt); r.clear(); r.render(R.scene, cam);
      var px = new Uint8Array(W * H * 4); r.readRenderTargetPixels(rt, 0, 0, W, H, px);
      r.setRenderTarget(prev); r.xr.enabled = xr;
      for (var j = 0; j < ps.length; j++) ps[j].obj.visible = vis[j];
      var c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d');
      var img = x.createImageData(W, H);
      for (var y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
      x.putImageData(img, 0, 0);
      var url = c.toDataURL('image/jpeg', 0.72);
      var l = R.capture.list(); l.unshift({ t: Date.now(), src: url, from: R.os.current ? R.os.current.def.name : 'Início' });
      while (l.length > 12) l.pop();
      try { R.store.set('shots', l); } catch (e) { l.pop(); R.store.set('shots', l); }
      R.sfx.play('shoot'); R.os.notify('📷 Captura salva na Galeria');
    }
  };
})();
