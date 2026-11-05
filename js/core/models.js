/* REgo OS — modelos procedurais low-poly (CC0, gerados por código) + materiais em cache
 * Todo modelo aqui é original e liberado em domínio público (CC0).
 * Materiais Lambert (iluminação por vértice) = barato para a Adreno 530.
 */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE;

  var matCache = {};
  R.mat = {
    lambert: function (c, opts) {
      var k = 'l' + c + (opts ? JSON.stringify(opts) : '');
      if (!matCache[k]) { var o = { color: c }; if (opts) for (var i in opts) o[i] = opts[i]; matCache[k] = new THREE.MeshLambertMaterial(o); }
      return matCache[k];
    },
    basic: function (c, opts) {
      var k = 'b' + c + (opts ? JSON.stringify(opts) : '');
      if (!matCache[k]) { var o = { color: c }; if (opts) for (var i in opts) o[i] = opts[i]; matCache[k] = new THREE.MeshBasicMaterial(o); }
      return matCache[k];
    },
    glow: function (c) { return R.mat.basic(c, { transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }); },
    vcol: function () { if (!matCache.vc) matCache.vc = new THREE.MeshLambertMaterial({ vertexColors: true }); return matCache.vc; }
  };

  var geoCache = {};
  function g(key, make) { if (!geoCache[key]) geoCache[key] = make(); return geoCache[key]; }
  var M = R.models = {};
  M.geo = {
    box: function (w, h, d) { return g('b' + w + ',' + h + ',' + d, function () { return new THREE.BoxBufferGeometry(w, h, d); }); },
    sphere: function (r, s) { s = s || 12; return g('s' + r + ',' + s, function () { return new THREE.SphereBufferGeometry(r, s, Math.max(6, s * 0.66 | 0)); }); },
    cyl: function (rt, rb, h, s) { s = s || 12; return g('c' + rt + ',' + rb + ',' + h + ',' + s, function () { return new THREE.CylinderBufferGeometry(rt, rb, h, s); }); },
    cone: function (r, h, s) { s = s || 10; return g('k' + r + ',' + h + ',' + s, function () { return new THREE.ConeBufferGeometry(r, h, s); }); },
    torus: function (r, t, a, b) { return g('t' + r + ',' + t, function () { return new THREE.TorusBufferGeometry(r, t, a || 8, b || 20); }); },
    plane: function (w, h) { return g('p' + w + ',' + h, function () { return new THREE.PlaneBufferGeometry(w, h); }); },
    ico: function (r, d) { return g('i' + r + ',' + (d || 0), function () { return new THREE.IcosahedronBufferGeometry(r, d || 0); }); }
  };
  // geometria facetada (normais por face) — visual low-poly com Lambert
  M.flatGeo = function (key, make) { return g('f' + key, function () { var ge = make(); if (ge.index) ge = ge.toNonIndexed(); ge.computeVertexNormals(); return ge; }); };
  M.box = function (w, h, d, c, mat) { return new THREE.Mesh(M.geo.box(w, h, d), mat || R.mat.lambert(c)); };
  M.sphere = function (r, c, s, mat) { return new THREE.Mesh(M.geo.sphere(r, s), mat || R.mat.lambert(c)); };
  M.cyl = function (rt, rb, h, c, s, mat) { return new THREE.Mesh(M.geo.cyl(rt, rb, h, s), mat || R.mat.lambert(c)); };
  M.cone = function (r, h, c, s) { return new THREE.Mesh(M.geo.cone(r, h, s), R.mat.lambert(c)); };
  M.at = function (o, x, y, z) { o.position.set(x, y, z); return o; };

  // ------------------------------------------------------------ props
  M.pin = function () { // pino de boliche (lathe)
    var pts = [], prof = [[0, 0], [0.026, 0], [0.04, 0.05], [0.058, 0.13], [0.05, 0.2], [0.03, 0.26], [0.022, 0.29], [0.033, 0.33], [0.03, 0.36], [0.015, 0.378], [0, 0.38]];
    for (var i = 0; i < prof.length; i++) pts.push(new THREE.Vector2(prof[i][0], prof[i][1]));
    var geo = g('pin', function () { var lg = new THREE.LatheBufferGeometry(pts, 10); lg.translate(0, -0.19, 0); return lg; });
    var m = new THREE.Mesh(geo, R.mat.lambert('#f4f1ea'));
    var band = new THREE.Mesh(M.geo.cyl(0.0235, 0.0235, 0.02, 10), R.mat.lambert('#d0262e'));
    band.position.y = 0.09; m.add(band);
    return m;
  };
  M.tree = function (s, c) {
    s = s || 1; var t = new THREE.Group();
    var trunk = M.cyl(0.08 * s, 0.12 * s, 0.8 * s, '#7a5232', 6); trunk.position.y = 0.4 * s;
    var leaf = M.cone(0.6 * s, 1.4 * s, c || '#3f9d4b', 7); leaf.position.y = 1.4 * s;
    var leaf2 = M.cone(0.45 * s, 1.0 * s, c || '#4cb35a', 7); leaf2.position.y = 1.95 * s;
    t.add(trunk, leaf, leaf2); return t;
  };
  M.rock = function (s, c) { var r = new THREE.Mesh(M.geo.ico(0.5, 0), R.mat.lambert(c || '#8a8f99')); r.scale.set(s, s * 0.6, s * 0.9); r.rotation.y = Math.random() * 6; return r; };
  M.cloud = function () { var c = new THREE.Group(); for (var i = 0; i < 4; i++) { var b = M.sphere(0.6 + Math.random() * 0.5, '#ffffff', 8, R.mat.basic('#ffffff')); b.position.set(i * 0.7 - 1, Math.random() * 0.3, Math.random() * 0.4); c.add(b); } return c; };

  // avatar de blocos (original — estilo "bonequinho de blocos" genérico)
  M.blocky = function (shirt, pants, skin) {
    skin = skin || '#f2c94c';
    var a = new THREE.Group();
    var torso = M.box(0.4, 0.4, 0.2, shirt || '#2d7cf6'); torso.position.y = 0.6;
    var head = M.box(0.24, 0.24, 0.24, skin); head.position.y = 0.92;
    var face = M.box(0.12, 0.03, 0.01, '#222'); face.position.set(0, 0.88, 0.121);
    var e1 = M.box(0.03, 0.04, 0.01, '#222'); e1.position.set(-0.05, 0.95, 0.121);
    var e2 = e1.clone(); e2.position.x = 0.05;
    var la = M.box(0.18, 0.4, 0.2, skin); la.position.set(-0.29, 0.6, 0);
    var ra = la.clone(); ra.position.x = 0.29;
    var ll = M.box(0.19, 0.4, 0.2, pants || '#2e3c52'); ll.position.set(-0.1, 0.2, 0);
    var rl = ll.clone(); rl.position.x = 0.1;
    a.add(torso, head, face, e1, e2, la, ra, ll, rl);
    a.userData.limbs = { la: la, ra: ra, ll: ll, rl: rl };
    return a;
  };
  M.target = function (r) {
    var t = new THREE.Group(); var cols = ['#ffffff', '#e23b3b', '#ffffff', '#e23b3b', '#ffd23f'];
    for (var i = 0; i < 5; i++) { var c = new THREE.Mesh(M.geo.cyl(r * (1 - i * 0.2), r * (1 - i * 0.2), 0.03 + i * 0.004, 20), R.mat.lambert(cols[i])); c.rotation.x = Math.PI / 2; t.add(c); }
    return t;
  };
  M.gun = function (c) {
    var gr = new THREE.Group();
    var b = M.box(0.04, 0.05, 0.2, c || '#3a3f4b'); b.position.z = -0.06;
    var h = M.box(0.035, 0.09, 0.04, '#222'); h.position.set(0, -0.05, 0.02); h.rotation.x = -0.3;
    var tip = M.cyl(0.012, 0.012, 0.06, '#ff9e2c', 8); tip.rotation.x = Math.PI / 2; tip.position.z = -0.18;
    gr.add(b, h, tip); return gr;
  };

  // ------------------------------------------------------------ texto em canvas
  M.textTexture = function (text, opts) {
    opts = opts || {};
    var fs = opts.size || 64, font = (opts.weight || '700') + ' ' + fs + 'px ' + (opts.font || 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif');
    var c = document.createElement('canvas'), x = c.getContext('2d');
    x.font = font; var lines = String(text).split('\n'), w = 0;
    for (var i = 0; i < lines.length; i++) w = Math.max(w, x.measureText(lines[i]).width);
    var pad = fs * 0.4; c.width = Math.min(2048, Math.ceil(w + pad * 2)); c.height = Math.ceil(lines.length * fs * 1.2 + pad * 2);
    x.font = font; x.textBaseline = 'middle'; x.textAlign = 'center';
    if (opts.bg) { x.fillStyle = opts.bg; R.ui && R.ui.roundRect(x, 0, 0, c.width, c.height, Math.min(c.height / 2, fs * 0.6)); x.fill(); }
    if (opts.stroke) { x.strokeStyle = opts.stroke; x.lineWidth = fs * 0.12; }
    x.fillStyle = opts.color || '#fff';
    for (var j = 0; j < lines.length; j++) {
      var yy = pad + fs * 0.6 + j * fs * 1.2;
      if (opts.stroke) x.strokeText(lines[j], c.width / 2, yy);
      x.fillText(lines[j], c.width / 2, yy);
    }
    var t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    t.userData = { w: c.width, h: c.height };
    return t;
  };
  M.text = function (text, height, opts) {
    var t = M.textTexture(text, opts);
    var h = height || 0.2, w = h * t.userData.w / t.userData.h;
    var m = new THREE.Mesh(new THREE.PlaneBufferGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    m.userData.setText = function (s) {
      var nt = M.textTexture(s, opts); m.material.map.dispose(); m.material.map = nt; m.material.needsUpdate = true;
      var nw = h * nt.userData.w / nt.userData.h; m.geometry.dispose(); m.geometry = new THREE.PlaneBufferGeometry(nw, h);
    };
    return m;
  };

  // ------------------------------------------------------------ ambientes
  var skyPresets = {
    day: ['#3d8bfd', '#bfe3ff', '#e9f6ff'],
    sunset: ['#2b2a6b', '#e2738c', '#ffc27a'],
    night: ['#02030b', '#0b1640', '#1d2a5c'],
    space: ['#000004', '#05061a', '#0b0b25'],
    lago: ['#4a6fb5', '#f2a7a0', '#ffd9b0'],
    neon: ['#08001a', '#2a0050', '#ff2dbd'],
    cave: ['#0b0a09', '#1f1a16', '#2b241d'],
    sea: ['#0a3d6b', '#2a8fc4', '#9be3ff']
  };
  M.sky = function (preset) {
    var cols = skyPresets[preset] || skyPresets.day;
    var geo = new THREE.SphereBufferGeometry(150, 16, 10);
    var c = [], a = new THREE.Color(cols[0]), b = new THREE.Color(cols[1]), h = new THREE.Color(cols[2]), tmp = new THREE.Color();
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i) / 150;
      if (y > 0.05) tmp.copy(b).lerp(a, Math.min(1, (y - 0.05) / 0.6)); else tmp.copy(h).lerp(b, Math.max(0, (y + 0.2) / 0.25));
      c.push(tmp.r, tmp.g, tmp.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false }));
    m.renderOrder = -10; m.userData.sky = true;
    return m;
  };
  M.stars = function (n, r) {
    var p = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      p[i * 3] = s * Math.cos(th) * r; p[i * 3 + 1] = Math.abs(u) * r * 0.9 + 5; p[i * 3 + 2] = s * Math.sin(th) * r;
    }
    var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.2, sizeAttenuation: false, fog: false }));
  };
  M.ground = function (size, c, grid) {
    var m = new THREE.Mesh(M.geo.plane(size, size), R.mat.lambert(c || '#5aa864'));
    m.rotation.x = -Math.PI / 2; m.userData.ground = true;
    if (grid) { var gh = new THREE.GridHelper(size, size / grid, grid === true ? '#ffffff' : '#ffffff', '#ffffff'); gh.material.transparent = true; gh.material.opacity = 0.12; gh.position.z = 0.002; gh.rotation.x = Math.PI / 2; m.add(gh); }
    return m;
  };
  M.lights = function (root, opts) {
    opts = opts || {};
    var hemi = new THREE.HemisphereLight(opts.sky || '#ffffff', opts.ground || '#555566', opts.hemi !== undefined ? opts.hemi : 0.75);
    var dir = new THREE.DirectionalLight(opts.sun || '#ffffff', opts.dir !== undefined ? opts.dir : 0.7);
    dir.position.set(3, 8, 4);
    root.add(hemi, dir);
    return { hemi: hemi, dir: dir };
  };
  // cenário completo padrão
  // instâncias de um modelo GLB (1 draw call por submalha, para dezenas de cópias)
  M.instances = function (name, list) {
    var src = R.assets && R.assets.models[name]; if (!src || !list.length) return null;
    var g = new THREE.Group(); src.updateMatrixWorld(true);
    var inv = new THREE.Matrix4().copy(src.matrixWorld).invert(), tmp = new THREE.Matrix4(), mm = new THREE.Matrix4();
    src.traverse(function (o) {
      if (!o.isMesh) return;
      var local = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      var im = new THREE.InstancedMesh(o.geometry, o.material, list.length);
      for (var i = 0; i < list.length; i++) {
        var t = list[i]; tmp.compose(t.p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.r || 0), new THREE.Vector3(t.s, t.s, t.s));
        im.setMatrixAt(i, mm.multiplyMatrices(tmp, local));
      }
      im.frustumCulled = false; g.add(im);
    });
    return g;
  };
  var SKY_PHOTO = { day: 'day', sunset: 'sunset', lago: 'sunset', night: 'night' };
  // escolhe textura fotográfica para o chão a partir da cor pedida
  M.groundTex = function (c) {
    var hsl = {}; new THREE.Color(c).getHSL(hsl);
    if (hsl.s < 0.16) return hsl.l > 0.85 ? 'snow_02' : hsl.l > 0.45 ? 'brushed_concrete' : 'asphalt_02';
    if (hsl.h > 0.18 && hsl.h < 0.47) return 'sparse_grass';
    if (hsl.h >= 0.07 && hsl.h <= 0.17 && hsl.l > 0.55) return 'coast_sand_01';
    if (hsl.h < 0.12 || hsl.h > 0.95) return hsl.l < 0.45 ? 'wood_floor' : 'park_dirt';
    return null;
  };
  M.env = function (root, opts) {
    opts = opts || {};
    var A = R.assets, isGo = A && !A.realistic();
    var photo = opts.photo || SKY_PHOTO[opts.sky || 'day'];
    var sky = A && photo && A.sky[photo] ? A.skyMesh(photo) : null;
    if (sky) root.userData.envKey = photo; else sky = M.sky(opts.sky || 'day');
    root.add(sky);
    if (!sky.material.map && (opts.stars || opts.sky === 'night' || opts.sky === 'space' || opts.sky === 'neon')) root.add(M.stars(opts.stars || 600, 120));
    var l = M.lights(root, opts.light);
    if (opts.ground !== false) {
      var size = opts.size || (sky.material.map ? 300 : 120), gcol = opts.ground || '#5aa864';
      var tname = opts.tex === false ? null : (opts.tex || M.groundTex(gcol));
      var tint = new THREE.Color('#ffffff').lerp(new THREE.Color(gcol), 0.35);
      var mat = tname && A ? A.surface(tname, size / 3, tint) : null;
      var gr = mat ? new THREE.Mesh(M.geo.plane(size, size), mat) : M.ground(size, gcol, opts.grid);
      if (mat) { gr.rotation.x = -Math.PI / 2; gr.userData.ground = true; }
      root.add(gr);
    }
    var rnd = function (min, max) { return min + Math.random() * (max - min); };
    var ring = function (n, r0, r1, s0, s1) { var o = []; for (var i = 0; i < n; i++) { var a = Math.random() * Math.PI * 2, d = rnd(r0, r1); o.push({ p: new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), r: Math.random() * 6.28, s: rnd(s0, s1) }); } return o; };
    if (opts.trees) {
      var nReal = A && A.models.fir_sapling ? Math.min(opts.trees, isGo ? 14 : 30) : 0;
      if (nReal) { var hgt = A.sizeOf(A.models.fir_sapling).y || 1; var tr = M.instances('fir_sapling', ring(nReal, 14, 36, 4 / hgt, 7.5 / hgt)); if (tr) root.add(tr); }
      for (var i = nReal; i < opts.trees; i++) {
        var a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 25;
        var t = M.tree(0.8 + Math.random() * 1.4); t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); root.add(t);
      }
      if (A && A.models.shrub_01 && opts.shrubs !== 0) { var sh = M.instances('shrub_01', ring(opts.shrubs || Math.min(10, Math.ceil(opts.trees / 3)), 9, 30, 0.8, 1.6)); if (sh) root.add(sh); }
    }
    if (opts.rocks && A && A.models.rock_07) { var rk = M.instances('rock_07', ring(opts.rocks, 10, 35, 0.6, 2.2)); if (rk) root.add(rk); }
    if (opts.mountains && !sky.material.map) {
      for (var j = 0; j < 14; j++) {
        var an = j / 14 * Math.PI * 2 + Math.random() * 0.2, dd = 70 + Math.random() * 20;
        var mt = new THREE.Mesh(M.flatGeo('mt' + (j % 4), function () { return new THREE.ConeBufferGeometry(1, 1, 5); }), R.mat.lambert(opts.mountains === true ? '#6b7f99' : opts.mountains));
        mt.scale.set(14 + Math.random() * 10, 16 + Math.random() * 14, 14 + Math.random() * 10);
        mt.position.set(Math.cos(an) * dd, mt.scale.y / 2 - 2, Math.sin(an) * dd); root.add(mt);
      }
    }
    if (opts.clouds && !sky.material.map) for (var k = 0; k < opts.clouds; k++) {
      var cl = M.cloud(); var ca = Math.random() * 6.28; cl.position.set(Math.cos(ca) * 50, 18 + Math.random() * 10, Math.sin(ca) * 50); cl.scale.setScalar(2 + Math.random() * 2); root.add(cl);
    }
    if (opts.fog) root.userData.fog = new THREE.Fog(opts.fog[0], opts.fog[1], opts.fog[2]);
    return { sky: sky, lights: l, photo: !!sky.material.map };
  };

  // sombra "blob" barata (sem shadow maps)
  var blobTex;
  M.blob = function (r) {
    if (!blobTex) {
      var c = document.createElement('canvas'); c.width = c.height = 64; var x = c.getContext('2d');
      var gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64); blobTex = new THREE.CanvasTexture(c);
    }
    var m = new THREE.Mesh(M.geo.plane(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; return m;
  };

  // efeito de partículas reaproveitável (pool) — explosões/confete
  M.burst = function (root, pos, color, n, speed) {
    n = n || 12; speed = speed || 2.5;
    var parts = [];
    for (var i = 0; i < n; i++) {
      var m = new THREE.Mesh(M.geo.box(0.04, 0.04, 0.04), R.mat.basic(color || '#ffd23f'));
      m.position.copy(pos);
      m.userData.v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      root.add(m); parts.push(m);
    }
    var life = 0.8;
    return function (dt) {
      life -= dt;
      for (var j = 0; j < parts.length; j++) {
        var p = parts[j]; p.userData.v.y -= 6 * dt; p.position.addScaledVector(p.userData.v, dt);
        p.rotation.x += dt * 8; p.scale.setScalar(Math.max(0.01, life / 0.8));
      }
      if (life <= 0) { for (var k = 0; k < parts.length; k++) root.remove(parts[k]); return false; }
      return true;
    };
  };
})();
