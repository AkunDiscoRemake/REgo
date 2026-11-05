/* Laboratório realista (Sandbox Lab): sala industrial de concreto, faixas de perigo, símbolos de radiação,
 * luzes de alerta giratórias, decalques de tiro e sangue, modelos CC0 com física. Tudo barato para celular/Go:
 * texturas procedurais pequenas, decalques reciclados (máx. 80), poucas luzes dinâmicas.
 */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, M = R.models;
  var L = R.LAB = {};
  var texCache = {};
  function canvasTex(key, w, h, draw) {
    if (texCache[key]) return texCache[key];
    var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c); t.anisotropy = 2; return (texCache[key] = t);
  }
  // símbolo de radiação (trevo)
  L.radTex = function () {
    return canvasTex('rad', 256, 256, function (x) {
      x.fillStyle = '#f5c400'; x.beginPath(); x.arc(128, 128, 124, 0, 7); x.fill(); x.lineWidth = 8; x.strokeStyle = '#111'; x.stroke();
      x.fillStyle = '#111';
      for (var i = 0; i < 3; i++) { var a = i * Math.PI * 2 / 3 - Math.PI / 2; x.beginPath(); x.moveTo(128, 128); x.arc(128, 128, 100, a - 0.52, a + 0.52); x.closePath(); x.fill(); }
      x.fillStyle = '#f5c400'; x.beginPath(); x.arc(128, 128, 30, 0, 7); x.fill(); x.fillStyle = '#111'; x.beginPath(); x.arc(128, 128, 20, 0, 7); x.fill();
    });
  };
  L.hazardTex = function () {
    return canvasTex('haz', 256, 64, function (x, w, h) {
      x.fillStyle = '#f5c400'; x.fillRect(0, 0, w, h); x.fillStyle = '#151515';
      for (var i = -2; i < 10; i++) { x.beginPath(); x.moveTo(i * 40, h); x.lineTo(i * 40 + 20, h); x.lineTo(i * 40 + 20 + h, 0); x.lineTo(i * 40 + h, 0); x.closePath(); x.fill(); }
    });
  };
  L.signTex = function (text, sub) {
    return canvasTex('sign' + text, 512, 256, function (x, w, h) {
      x.fillStyle = '#f5c400'; x.fillRect(0, 0, w, h); x.fillStyle = '#111'; x.fillRect(10, 10, w - 20, 70);
      x.fillStyle = '#f5c400'; x.font = '800 54px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, 46);
      x.fillStyle = '#111'; x.font = '700 30px system-ui, sans-serif'; x.fillText(sub || '', w / 2 + 50, 170);
      var r = L.radTex().image; x.drawImage(r, 30, 95, 140, 140);
    });
  };
  var splatTex = null, holeTex = null;
  function splat() {
    return splatTex || (splatTex = canvasTex('blood', 128, 128, function (x) {
      for (var i = 0; i < 18; i++) {
        var a = Math.random() * 6.28, d = Math.random() * 40, r = 6 + Math.random() * 22;
        var g = x.createRadialGradient(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 0, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r);
        g.addColorStop(0, 'rgba(110,0,4,0.95)'); g.addColorStop(0.7, 'rgba(80,0,2,0.8)'); g.addColorStop(1, 'rgba(60,0,0,0)');
        x.fillStyle = g; x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, 7); x.fill();
      }
      for (var k = 0; k < 10; k++) { x.fillStyle = 'rgba(90,0,3,0.9)'; x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 0, 7); x.fill(); }
    }));
  }
  function hole() {
    return holeTex || (holeTex = canvasTex('hole', 64, 64, function (x) {
      var g = x.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.25, 'rgba(20,20,20,0.95)'); g.addColorStop(0.5, 'rgba(60,55,50,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    }));
  }
  // decalques reciclados
  L.decals = function (g) {
    var list = [], MAX = 80;
    var bloodMat = new THREE.MeshBasicMaterial({ map: splat(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    var holeMat = new THREE.MeshBasicMaterial({ map: hole(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    var geo = new THREE.PlaneBufferGeometry(1, 1), nrm = new THREE.Vector3(), q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1);
    return function (kind, hit, size, parent) {
      if (!hit || !hit.face) return;
      var m = list.length >= MAX ? list.shift() : new THREE.Mesh(geo, null);
      m.material = kind === 'blood' ? bloodMat : holeMat;
      nrm.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      q.setFromUnitVectors(z, nrm); m.quaternion.copy(q); m.rotateZ(Math.random() * 6.28);
      m.position.copy(hit.point).addScaledVector(nrm, 0.004); m.scale.setScalar(size * (0.7 + Math.random() * 0.6));
      if (parent) { parent.updateMatrixWorld(true); parent.worldToLocal(m.position); var pq = parent.getWorldQuaternion(new THREE.Quaternion()).invert(); m.quaternion.premultiply(pq); m.scale.divideScalar(parent.getWorldScale(new THREE.Vector3()).x || 1); parent.add(m); }
      else g.add(m);
      list.push(m);
    };
  };

  // sala do laboratório; devolve as superfícies estáticas (para decalques)
  L.room = function (g, ph, opts) {
    var A = R.assets, statics = [];
    g.env({ sky: 'night', ground: false, light: { hemi: 0.55, dir: 0.35, sky: '#dfe8ff', ground: '#3a3530' } });
    var W = 26, D = 26, H = 6;
    var floor = new THREE.Mesh(new THREE.PlaneBufferGeometry(W, D), A.surface('brushed_concrete', 7) || R.mat.lambert('#8d9299'));
    floor.rotation.x = -Math.PI / 2; floor.userData.ground = true; g.add(floor); statics.push(floor);
    var wallMat = A.surface('brushed_concrete', 3, '#c8ccd2') || R.mat.lambert('#b8bec6');
    [[0, -D / 2, W, 0], [0, D / 2, W, Math.PI], [-W / 2, 0, D, Math.PI / 2], [W / 2, 0, D, -Math.PI / 2]].forEach(function (w) {
      var m = new THREE.Mesh(new THREE.PlaneBufferGeometry(w[2], H), wallMat); m.position.set(w[0], H / 2, w[1]); m.rotation.y = w[3]; g.add(m); statics.push(m);
      var b = new window.CANNON.Body({ mass: 0 }); b.addShape(new window.CANNON.Box(new window.CANNON.Vec3(w[2] / 2, H / 2, 0.2)));
      b.position.set(w[0], H / 2, w[1]); b.quaternion.setFromAxisAngle(new window.CANNON.Vec3(0, 1, 0), w[3]); ph.world.addBody(b);
      // faixa de perigo no rodapé
      var hz = L.hazardTex().clone(); hz.needsUpdate = true; hz.wrapS = THREE.RepeatWrapping; hz.repeat.set(w[2] / 1.2, 1);
      var band = new THREE.Mesh(new THREE.PlaneBufferGeometry(w[2], 0.35), new THREE.MeshLambertMaterial({ map: hz })); band.position.set(w[0], 0.25, w[1]); band.rotation.y = w[3];
      band.position.add(new THREE.Vector3(0, 0, 0.01).applyAxisAngle(new THREE.Vector3(0, 1, 0), w[3])); g.add(band);
    });
    var ceil = new THREE.Mesh(new THREE.PlaneBufferGeometry(W, D), R.mat.lambert('#3b3f46')); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    // calhas de luz (emissivas, sem custo de luz dinâmica)
    for (var i = -2; i <= 2; i++) { var lt = M.box(0.25, 0.06, D - 4, null, R.mat.basic('#eef4ff')); lt.position.set(i * 4.5, H - 0.05, 0); g.add(lt); }
    for (var k = -2; k <= 2; k++) { var bm = M.box(0.3, 0.4, D, '#2a2d33'); bm.position.set(k * 4.5 + 2.25, H - 0.2, 0); g.add(bm); }
    // pilares de concreto
    [[-7, -7], [7, -7], [-7, 7], [7, 7]].forEach(function (p) {
      var pl = new THREE.Mesh(new THREE.BoxBufferGeometry(0.8, H, 0.8), wallMat); pl.position.set(p[0], H / 2, p[1]); g.add(pl); statics.push(pl); ph.box(pl, 0.8, H, 0.8, 0);
      var pz = new THREE.Mesh(new THREE.BoxBufferGeometry(0.82, 1.2, 0.82), new THREE.MeshLambertMaterial({ map: L.hazardTex() })); pz.position.set(p[0], 0.6, p[1]); g.add(pz);
    });
    // placas de radiação
    var sign = function (x, y, z, ry, t, s) { var m = new THREE.Mesh(new THREE.PlaneBufferGeometry(1.6, 0.8), new THREE.MeshLambertMaterial({ map: L.signTex(t, s) })); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); };
    sign(0, 3.4, -D / 2 + 0.02, 0, 'PERIGO', 'RADIAÇÃO'); sign(-W / 2 + 0.02, 3.2, -4, Math.PI / 2, 'ATENÇÃO', 'ÁREA NUCLEAR'); sign(W / 2 - 0.02, 3.2, 4, -Math.PI / 2, 'PERIGO', 'RISCO BIOLÓGICO');
    var rad = new THREE.Mesh(new THREE.CircleBufferGeometry(1.2, 40), new THREE.MeshLambertMaterial({ map: L.radTex() })); rad.rotation.x = -Math.PI / 2; rad.position.set(0, 0.006, -6); g.add(rad);
    var logo = M.text('WPOLLO LABS • SETOR 7', 0.32, { color: '#e8e8e8', size: 70 }); logo.position.set(0, 4.4, -D / 2 + 0.03); g.add(logo);
    // luzes de alerta giratórias
    var beacons = [];
    [[-5, -D / 2 + 0.3], [5, -D / 2 + 0.3]].forEach(function (p) {
      var base = M.cyl(0.12, 0.12, 0.1, '#222', 10); base.position.set(p[0], 4.0, p[1]); g.add(base);
      var dome = new THREE.Mesh(new THREE.SphereBufferGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff2a1a', transparent: true, opacity: 0.85 })); dome.position.set(p[0], 4.05, p[1]); g.add(dome);
      var cone = new THREE.Mesh(new THREE.ConeBufferGeometry(0.9, 4, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#ff2a1a', transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      cone.geometry.translate(0, -2, 0); cone.rotation.z = Math.PI / 2; var piv = new THREE.Group(); piv.position.copy(dome.position); piv.add(cone); g.add(piv);
      beacons.push(piv);
    });
    var alarm = new THREE.PointLight('#ff2a1a', 0.0, 14); alarm.position.set(0, 4, -D / 2 + 1); g.add(alarm);
    g.on('update', function (dt) { beacons.forEach(function (b, i) { b.rotation.y += dt * (i ? -4 : 4); }); alarm.intensity = 0.4 + Math.sin(R.time * 8) * 0.3; });
    // estantes de metal com caixas e tambores
    var metal = R.mat.lambert('#6b7178');
    [[-W / 2 + 0.7, -9], [-W / 2 + 0.7, -5], [W / 2 - 0.7, -9]].forEach(function (p) {
      var sh = new THREE.Group(); sh.position.set(p[0], 0, p[1]);
      for (var lv = 0; lv < 4; lv++) { var pl = M.box(0.8, 0.04, 2.4, null, metal); pl.position.y = 0.3 + lv * 0.75; sh.add(pl); }
      [[-0.38, -1.18], [0.38, -1.18], [-0.38, 1.18], [0.38, 1.18]].forEach(function (q) { var post = M.box(0.05, 2.6, 0.05, null, metal); post.position.set(q[0], 1.3, q[1]); sh.add(post); });
      g.add(sh); ph.box(new THREE.Object3D(), 0.8, 2.6, 2.4, 0).position.set(p[0], 1.3, p[1]);
      for (var c = 0; c < 3; c++) { var cr = A.get(c % 2 ? 'cardboard_box_01' : 'wooden_crate_01', { size: 0.5 }); if (cr) { cr.position.set(p[0], 0.32 + (c % 3) * 0.75, p[1] - 0.7 + c * 0.7); g.add(cr); } }
    });
    // área de testes com bancada
    var bench = A.get('WoodenTable_01', { size: 1.8 }); if (bench) { bench.position.set(3.5, 0, -3.2); g.add(bench); }
    return { statics: statics, floor: floor };
  };

  // spray de sangue (partículas que caem e deixam manchas)
  L.bloodSpray = function (g, pos, dir, n, decal, statics) {
    var parts = [], ray = new THREE.Raycaster();
    for (var i = 0; i < n; i++) {
      var m = new THREE.Mesh(M.geo.sphere(0.012 + Math.random() * 0.012, 4), R.mat.basic('#6e0005')); m.position.copy(pos);
      m.userData.v = dir.clone().multiplyScalar(1.5 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 2.5, Math.random() * 2.5, (Math.random() - 0.5) * 2.5));
      g.add(m); parts.push(m);
    }
    var t = 0;
    g.addFx(function (dt) {
      t += dt;
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i]; p.userData.v.y -= 9.8 * dt; var step = p.userData.v.clone().multiplyScalar(dt);
        ray.set(p.position, step.clone().normalize()); ray.far = step.length() + 0.02;
        var h = ray.intersectObjects(statics, false)[0];
        if (h || p.position.y < 0.01) { if (!h) { h = { point: p.position.clone().setY(0.002), face: { normal: new THREE.Vector3(0, 1, 0) }, object: statics[0] }; } if (Math.random() < 0.6) decal('blood', h, 0.1 + Math.random() * 0.15); g.root.remove(p); parts.splice(i, 1); continue; }
        p.position.add(step);
      }
      return parts.length > 0 && t < 3;
    });
  };
})();
