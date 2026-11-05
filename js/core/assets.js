/* Wpollo VR — gerenciador de assets: modelos GLB (CC0/MIT), texturas, céus fotográficos.
 * Tudo é opcional: se um asset falhar, os jogos caem no modelo procedural.
 * Qualidade "go": Lambert + textura de cor com AO assado (barato na Adreno 530).
 * Qualidade "realista": Standard (PBR) + normal map + reflexo do céu.
 */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE;
  var A = R.assets = { models: {}, tex: {}, sky: {}, pending: {}, envMap: null };
  var loader = THREE.GLTFLoader ? new THREE.GLTFLoader() : null;
  var texLoader = new THREE.TextureLoader();

  // Go = codinome "Pacific" no user-agent; Quest/PC aguentam o modo realista
  var isGo = /Pacific/i.test(navigator.userAgent);
  if (!R.settings.quality) R.settings.quality = isGo ? 'go' : 'realista';
  A.realistic = function () { return R.settings.quality === 'realista'; };

  // converte materiais do GLB para o orçamento escolhido
  function adapt(root) {
    root.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = false; o.receiveShadow = false;
      var m = o.material; if (!m || m.userData.rego) return;
      var nm;
      if (A.realistic()) {
        nm = m; nm.envMap = A.envMap; nm.envMapIntensity = 0.8; nm.roughness = Math.max(0.35, m.roughness);
      } else {
        nm = new THREE.MeshLambertMaterial({ color: m.color, map: m.map, transparent: m.transparent, alphaTest: m.alphaTest || (m.map && m.transparent ? 0.5 : 0), side: m.side });
        if (nm.alphaTest) nm.transparent = false;
      }
      if (nm.map) { nm.map.anisotropy = 1; nm.map.generateMipmaps = true; }
      nm.userData.rego = true; o.material = nm;
    });
  }

  A.loadModel = function (name) {
    if (A.models[name]) return Promise.resolve(A.models[name]);
    if (A.pending[name]) return A.pending[name];
    if (!loader) return Promise.resolve(null);
    A.pending[name] = new Promise(function (res) {
      loader.load('assets/models/' + name + '.glb', function (g) {
        adapt(g.scene); g.scene.userData.anims = g.animations; A.models[name] = g.scene; res(g.scene);
      }, undefined, function () { A.models[name] = null; res(null); });
    });
    return A.pending[name];
  };
  A.loadTex = function (name) {
    if (A.tex[name]) return Promise.resolve(A.tex[name]);
    if (A.pending['t' + name]) return A.pending['t' + name];
    A.pending['t' + name] = new Promise(function (res) {
      texLoader.load('assets/tex/' + name + '.jpg', function (t) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping; A.tex[name] = t;
        if (A.realistic()) texLoader.load('assets/tex/' + name + '_n.jpg', function (n) { n.wrapS = n.wrapT = THREE.RepeatWrapping; t._normal = n; res(t); }, undefined, function () { res(t); });
        else res(t);
      }, undefined, function () { res(null); });
    });
    return A.pending['t' + name];
  };
  A.loadSky = function (key) {
    if (A.sky[key]) return Promise.resolve(A.sky[key]);
    if (A.pending['s' + key]) return A.pending['s' + key];
    A.pending['s' + key] = new Promise(function (res) {
      texLoader.load('assets/sky/' + key + '.jpg', function (t) { t.mapping = THREE.EquirectangularReflectionMapping; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; A.sky[key] = t; res(t); }, undefined, function () { res(null); });
    });
    return A.pending['s' + key];
  };
  // carrega a lista de um jogo: { models:[], tex:[], sky:'day' }
  A.loadAll = function (spec, onProgress) {
    var jobs = [];
    (spec.models || []).forEach(function (n) { jobs.push(A.loadModel(n)); });
    (spec.tex || []).forEach(function (n) { jobs.push(A.loadTex(n)); });
    if (spec.sky) jobs.push(A.loadSky(spec.sky));
    var done = 0;
    jobs.forEach(function (j) { j.then(function () { done++; if (onProgress) onProgress(done / jobs.length); }); });
    return Promise.all(jobs);
  };

  // clone barato (geometria/material compartilhados); null se não carregou
  A.get = function (name, opts) {
    var src = A.models[name]; if (!src) return null;
    var c = src.clone(true);
    if (A.realistic() && A.envMap) c.traverse(function (o) { if (o.isMesh && o.material.envMap !== A.envMap) { o.material.envMap = A.envMap; o.material.needsUpdate = true; } });
    if (opts) {
      if (opts.tint) c.traverse(function (o) { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(opts.tint)); } });
      if (opts.size) return A.fit(c, opts.size, opts.base !== false);
    }
    return c;
  };
  // objeto de segurar: alinha o eixo mais longo com -Z (frente do controle), cabo na mão.
  // fix = {flip:bool (inverte frente/trás), roll:rad, x/y/z: deslocamento}
  A.HOLD = {
    service_pistol: { keep: /_(pistol|slide|hammer|trigger)_a$/, z: 0.12, y: 0.02 },
    metal_detector: { flip: true, z: 0.25 }, rusted_spade_01: { flip: true, z: 0.1 },
    baseball_bat: { z: 0.05 }, antique_katana_01: { z: 0.05 }, machete: { z: 0.04 }, wooden_hammer_01: { z: 0.05 },
    sledgehammer_01: { z: 0.08 }, wooden_axe: { z: 0.06 }, vintage_flashlight: { z: 0.1 }
  };
  A.holdable = function (name, length, fix) {
    var src = A.models[name]; if (!src) return null;
    fix = fix || A.HOLD[name] || {};
    var c = src.clone(true);
    if (fix.keep) { var rm = []; c.traverse(function (o) { if (o.isMesh && !fix.keep.test(o.name)) rm.push(o); }); rm.forEach(function (o) { o.parent.remove(o); }); }
    var s = A.sizeOf(c), inner = new THREE.Group(); inner.add(c);
    var ax = s.x >= s.y && s.x >= s.z ? 'x' : s.y >= s.z ? 'y' : 'z';
    if (ax === 'x') inner.rotation.y = Math.PI / 2; else if (ax === 'y') inner.rotation.x = -Math.PI / 2;
    var mid = new THREE.Group(); mid.add(inner); if (fix.flip) mid.rotation.y = Math.PI; if (fix.roll) mid.rotation.z = fix.roll; if (fix.pitch) mid.rotation.x = fix.pitch;
    var w = A.fit(mid, length, false);
    var out = new THREE.Group(); out.add(w);
    // cabo na mão: desloca para a frente meia peça (o "fim" de trás fica no punho)
    w.position.set(fix.x || 0, fix.y || 0, -(length / 2) + (fix.z || 0.06));
    return out;
  };
  A.has = function (name) { return !!A.models[name]; };
  // ajusta para a maior dimensão = size; base=true apoia no chão (y=0) e centraliza em x/z
  var box = new THREE.Box3(), sz = new THREE.Vector3(), ct = new THREE.Vector3();
  A.fit = function (obj, size, base) {
    obj.updateMatrixWorld(true); box.setFromObject(obj); box.getSize(sz); box.getCenter(ct);
    var s = size / Math.max(sz.x, sz.y, sz.z, 1e-4);
    var g = new THREE.Group(); obj.position.set(-ct.x, base ? -box.min.y : -ct.y, -ct.z); g.add(obj); g.scale.setScalar(s);
    var w = new THREE.Group(); w.add(g); w.userData.fitSize = { x: sz.x * s, y: sz.y * s, z: sz.z * s };
    return w;
  };
  A.sizeOf = function (obj) { obj.updateMatrixWorld(true); box.setFromObject(obj); return box.getSize(new THREE.Vector3()); };

  // material de superfície texturizado (chão, mesas, paredes)
  A.surface = function (name, repeat, color) {
    var t = A.tex[name]; if (!t) return null;
    var tt = t.clone(); tt.needsUpdate = true; tt.repeat.set(repeat || 1, repeat || 1);
    if (A.realistic()) {
      var nm = t._normal ? t._normal.clone() : null; if (nm) { nm.needsUpdate = true; nm.repeat.copy(tt.repeat); }
      return new THREE.MeshStandardMaterial({ map: tt, normalMap: nm, roughness: 0.85, metalness: 0, color: color || '#ffffff', envMap: A.envMap, envMapIntensity: 0.5 });
    }
    return new THREE.MeshLambertMaterial({ map: tt, color: color || '#ffffff' });
  };
  // esfera de céu fotográfico + mapa de ambiente para PBR
  A.skyMesh = function (key) {
    var t = A.sky[key]; if (!t) return null;
    var m = new THREE.Mesh(new THREE.SphereBufferGeometry(160, 32, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, depthWrite: false, fog: false }));
    m.rotation.y = Math.PI; m.renderOrder = -10; m.userData.sky = true;
    if (A.realistic()) A.setEnv(key);
    return m;
  };
  // sala fotográfica: projeta o 360° a partir do ponto da câmera sobre uma caixa (chão/paredes na
  // profundidade certa em estéreo). Barato: 1 caixa + 1 textura, sem iluminação.
  A.roomMesh = function (key, w, d, h, eye) {
    var t = A.sky[key]; if (!t) return null;
    eye = eye || 1.6;
    var geo = new THREE.BoxBufferGeometry(w, h, d); geo.translate(0, h / 2, 0);
    var mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: t }, center: { value: new THREE.Vector3(0, eye, 0) }, rot: { value: Math.PI } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'uniform sampler2D map; uniform vec3 center; uniform float rot; varying vec3 vW;\n' +
        'void main(){ vec3 d = normalize(vW - center); float c = cos(rot), s = sin(rot); d = vec3(c*d.x + s*d.z, d.y, -s*d.x + c*d.z);\n' +
        ' vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y,-1.0,1.0)) * 0.31830989 + 0.5);\n' +
        ' gl_FragColor = texture2D(map, uv); }',
      side: THREE.BackSide, depthWrite: true
    });
    var m = new THREE.Mesh(geo, mat); m.renderOrder = -10; m.userData.sky = true;
    if (A.realistic()) A.setEnv(key);
    return m;
  };
  var pmrem = null, envCache = {};
  A.setEnv = function (key) {
    if (!A.sky[key]) return;
    try {
      if (!envCache[key]) { if (!pmrem) pmrem = new THREE.PMREMGenerator(R.renderer); envCache[key] = pmrem.fromEquirectangular(A.sky[key]).texture; }
      A.envMap = envCache[key];
    } catch (e) { A.envMap = null; }
  };

  // assets comuns pré-carregados em segundo plano logo após o boot
  A.COMMON = { skyExtra: ['apartamento'], models: ['fir_sapling', 'shrub_01', 'rock_07', 'oculus_go', 'hand_right', 'hand_left'], tex: ['sparse_grass', 'wood_floor', 'asphalt_02', 'brushed_concrete', 'coast_sand_01', 'park_dirt', 'snow_02', 'brown_planks_03', 'marble_tiles', 'laminate_floor', 'leafy_grass', 'brick_floor', 'aerial_grass_rock'], sky: 'day' };
  A.preloadCommon = function () {
    var first = R.settings.homeEnv && /apartamento|sala|lounge/.test(R.settings.homeEnv) ? R.settings.homeEnv : 'apartamento';
    return A.loadSky(first).then(function () { return A.loadAll(A.COMMON); }).then(function () { return Promise.all([A.loadSky('sunset'), A.loadSky('night')]); });
  };
})();
