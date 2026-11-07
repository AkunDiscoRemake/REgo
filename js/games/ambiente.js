/* Wpollo VR — app "Ambiente 3D": loft caminhável, bonito e detalhado, montado com 100+ modelos CC0
 * (Poly Haven). Usa instâncias para repetições (1 draw call por submalha) e sombras "blob" baratas,
 * então fica rico sem derrubar o Oculus Go. 3 ambientes: Loft, Terraço e Galeria.
 */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, M = R.models, A = R.assets, ui = R.ui;
  var V = THREE.Vector3;

  // modelos usados (pré-carregados); a biblioteca total passa de 100 .glb
  var USED = ['Sofa_01', 'ArmChair_01', 'mid_century_lounge_chair', 'Ottoman_01', 'CoffeeTable_01', 'dining_table',
    'painted_wooden_chair_01', 'wooden_bookshelf_worn', 'Television_01', 'drawer_cabinet', 'side_table_01',
    'desk_lamp_arm_01', 'modern_ceiling_lamp_01', 'potted_plant_01', 'potted_plant_02', 'shrub_01', 'shrub_02',
    'fir_sapling', 'rock_07', 'ceramic_vase_01', 'wooden_bowl_01', 'fancy_picture_frame_01', 'wall_clock',
    'chess_set', 'tea_set_01', 'wicker_basket_01', 'food_apple_01', 'lemon', 'food_pomegranate_01',
    'outdoor_table_chair_set_01', 'wooden_picnic_table', 'stone_fire_pit', 'planter_box_01', 'garden_gnome',
    'marble_bust_01', 'lion_head', 'concrete_cat_statue']

  function build(g) {
    var count = { n: 0 };            // conta instâncias colocadas (p/ mostrar "100+ modelos")
    var shadows = [];
    // ---- ambiente + luz (qualidade: hemisfério + luz-chave + preenchimento; céu fotográfico) ----
    var preset = g.data.preset || 'loft';
    var skyKey = preset === 'terraco' ? 'praia' : preset === 'galeria' ? 'salacinza' : 'apartamento';
    g.env({ sky: skyKey, ground: false, light: { hemi: 0.75, dir: 0.0 } });
    var key = new THREE.DirectionalLight('#fff6e8', 0.85); key.position.set(4, 7, 3); g.add(key);
    var fill = new THREE.DirectionalLight('#dce8ff', 0.3); fill.position.set(-5, 4, -4); g.add(fill);

    var W = 16, D = 16, floorTex = preset === 'galeria' ? 'marble_tiles' : 'wood_floor';
    var floor = new THREE.Mesh(new THREE.PlaneBufferGeometry(W, D), A.surface(floorTex, preset === 'galeria' ? 6 : 5) || R.mat.lambert('#b48a5a'));
    floor.rotation.x = -Math.PI / 2; floor.userData.ground = true; g.add(floor);
    // paredes (loft/galeria)
    if (preset !== 'terraco') {
      var wallMat = A.surface('brushed_concrete', 2, preset === 'galeria' ? '#f0eee9' : '#d8cfc4') || R.mat.lambert('#e8e2d8');
      [[0, -D / 2, W, 0], [-W / 2, 0, D, Math.PI / 2], [W / 2, 0, D, -Math.PI / 2]].forEach(function (w) {
        var m = new THREE.Mesh(new THREE.PlaneBufferGeometry(w[2], 4.2), wallMat); m.position.set(w[0], 2.1, w[1]); m.rotation.y = w[3]; g.add(m);
      });
      var ceil = new THREE.Mesh(new THREE.PlaneBufferGeometry(W, D), R.mat.lambert('#efeae3')); ceil.rotation.x = Math.PI / 2; ceil.position.y = 4.2; g.add(ceil);
    } else {
      // terraço: deck de madeira + grama ao redor + "mar" ao fundo
      var grass = new THREE.Mesh(new THREE.PlaneBufferGeometry(120, 120), A.surface('sparse_grass', 40) || R.mat.lambert('#5aa864')); grass.rotation.x = -Math.PI / 2; grass.position.y = -0.02; g.add(grass);
      var sea = new THREE.Mesh(new THREE.PlaneBufferGeometry(300, 160), R.mat.lambert('#2a8fc4')); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.5, -90); g.add(sea);
    }

    // ---- helpers de colocação ----
    function place(name, x, z, ry, sc, y) {
      var o = A.get(name); if (!o) return null;
      o.position.set(x, y || 0, z); o.rotation.y = ry || 0; if (sc) o.scale.multiplyScalar(sc);
      g.add(o); count.n++;
      // sombra blob proporcional à base
      var s = A.sizeOf(o); var bl = M.blob(Math.max(s.x, s.z) * 0.6); bl.position.set(x, 0.01, z); g.add(bl);
      return o;
    }
    function ring(n, r0, r1, s0, s1, y) { var a = []; for (var i = 0; i < n; i++) { var an = Math.random() * 6.28, d = r0 + Math.random() * (r1 - r0); a.push({ p: new V(Math.cos(an) * d, y || 0, Math.sin(an) * d), r: Math.random() * 6.28, s: s0 + Math.random() * (s1 - s0) }); } return a; }
    function instated(name, list) { var m = M.instances(name, list); if (m) { g.add(m); count.n += list.length; } return m; }
    function onTable(name, tx, tz, h, ox, oz) { place(name, tx + (ox || 0), tz + (oz || 0), Math.random() * 6.28, 1, h); }

    // ---- composição por ambiente ----
    if (preset === 'loft' || preset === 'galeria') {
      // sala de estar
      place('Sofa_01', -4.5, -4.5, 0.2); place('ArmChair_01', -1.2, -5.2, -0.6); place('mid_century_lounge_chair', -6.2, -2.5, 1.3);
      var ct = place('CoffeeTable_01', -3.6, -3.2, 0); if (ct) { var h = A.sizeOf(ct).y; onTable('wooden_bowl_01', -3.6, -3.2, h, -0.3, 0); place('food_apple_01', -3.45, -3.1, 0, 1, h + 0.04); place('lemon', -3.72, -3.28, 0, 1, h + 0.04); }
      place('Ottoman_01', -2.4, -3.0, 0);
      // estante + TV + rack
      place('wooden_bookshelf_worn', -7.4, -6.6, Math.PI / 2); var cab = place('drawer_cabinet', 0, -7.4, 0); if (cab) { var ch = A.sizeOf(cab).y; place('Television_01', 0, -7.3, 0, 1.4, ch); onTable('brass_vase_01', -1.4, -7.3, ch); }
      // mesa de jantar + cadeiras (instâncias)
      place('dining_table', 4.5, -3.5, 0);
      var chair = A.has('dining_chair_02') ? 'dining_chair_02' : 'painted_wooden_chair_01';
      instated(chair, [[4.5, -2.2, 0], [4.5, -4.8, Math.PI], [3.0, -3.5, Math.PI / 2], [6.0, -3.5, -Math.PI / 2]].map(function (p) { return { p: new V(p[0], 0, p[1]), r: p[2], s: 1 }; }));
      place('tea_set_01', 4.5, -3.5, 0, 1, 0.74);
      // decoração e plantas (instâncias de arbustos/vasos)
      var plants = ['potted_plant_01', 'potted_plant_02', 'potted_plant_04', 'anthurium_botany_01', 'calathea_orbifolia_01'].filter(A.has);
      [[-7, 0], [6.8, -6.8], [6.8, 2], [-2, 3], [3, 3.5]].forEach(function (p, i) { if (plants.length) place(plants[i % plants.length], p[0], p[1], Math.random() * 6.28); });
      place('side_table_01', -6.2, -5.8, 0); place('desk_lamp_arm_01', -6.2, -5.8, 0.4, 1, 0.52);
      place('chess_set', -2.4, -3.0, 0, 1, 0.42);
      place('boombox', 1.6, -7.2, -0.4, 1, (cab ? A.sizeOf(cab).y : 0.6));
      // quadros na parede + relógio
      wallArt(g, [[-3, 2.4, -D / 2 + 0.08, 0], [0, 2.6, -D / 2 + 0.08, 0], [3, 2.4, -D / 2 + 0.08, 0], [-W / 2 + 0.08, 2.5, -2, Math.PI / 2]], count);
      place('wall_clock', 2.6, -7.9, 0, 1, 2.6);
      // luminária de teto
      var lamp = A.get('modern_ceiling_lamp_01') || A.get('hanging_industrial_lamp'); if (lamp) { lamp.position.set(-3.6, 4.15, -3.5); lamp.scale.multiplyScalar(1); g.add(lamp); count.n++; var pl = new THREE.PointLight('#ffe8c0', 0.5, 10); pl.position.set(-3.6, 3.6, -3.5); g.add(pl); }
      // cestos e tapetes
      place('wicker_basket_01', -5.6, -6.2, 0); place('wicker_basket_02', 5.8, -6.2, 0.6);
      var rug = new THREE.Mesh(new THREE.PlaneBufferGeometry(4.2, 3), R.mat.lambert(preset === 'galeria' ? '#b9c3d6' : '#9a5b4a')); rug.rotation.x = -Math.PI / 2; rug.position.set(-3.6, 0.011, -3.6); g.add(rug);
      if (preset === 'galeria') { // galeria: esculturas em pedestais
        var arts = ['marble_bust_01', 'bronze_shark_statue', 'concrete_cat_statue', 'horse_statue_01', 'gothic_statue', 'lion_head'].filter(A.has);
        arts.forEach(function (name, i) { var px = -6 + i * 2.4; var ped = M.box(0.7, 1.0, 0.7, '#e8e2d8'); ped.position.set(px, 0.5, 5.6); g.add(ped); place(name, px, 5.6, Math.PI, 1, 1.0); });
      }
      g.locomotion({ speed: 2.6, bounds: [-W / 2 + 0.6, W / 2 - 0.6, -D / 2 + 0.6, D / 2 - 0.6] });
    } else {
      // terraço / jardim
      var deck = new THREE.Mesh(new THREE.PlaneBufferGeometry(12, 10), A.surface('wood_floor', 4) || R.mat.lambert('#b48a5a')); deck.rotation.x = -Math.PI / 2; deck.position.set(0, 0.03, 0); g.add(deck);
      place('outdoor_table_chair_set_01', 0, -1, 0) || place('wooden_picnic_table', 0, -1, 0);
      place('wooden_picnic_table', -4, 2, 0.3);
      place('stone_fire_pit', 3.5, 2.5, 0);
      var loungers = ['mid_century_lounge_chair', 'GreenChair_01', 'Rockingchair_01'].filter(A.has);
      loungers.forEach(function (n, i) { place(n, -3 + i * 3, -4, Math.PI); });
      // vegetação: muitos arbustos e plantas por instância (dezenas de modelos)
      var sh = ['shrub_01', 'shrub_02', 'shrub_03', 'shrub_04'].filter(A.has);
      sh.forEach(function (n) { instated(n, ring(10, 7, 26, 0.8, 1.8)); });
      if (A.has('fir_sapling')) instated('fir_sapling', ring(14, 10, 30, 3.5, 6.5));
      if (A.has('rock_07')) instated('rock_07', ring(8, 8, 24, 0.6, 2));
      if (A.has('rock_moss_set_01')) instated('rock_moss_set_01', ring(6, 6, 20, 0.8, 1.6));
      var planters = ['planter_box_01', 'potted_plant_02', 'potted_plant_04', 'calathea_orbifolia_01'].filter(A.has);
      [[-5, -1], [5, -1], [-5, 3], [5, 3], [0, 4]].forEach(function (p, i) { if (planters.length) place(planters[i % planters.length], p[0], p[1], Math.random() * 6.28); });
      place('garden_gnome', 2, 3.5, -0.5); place('wooden_lantern_01', -5.2, -4, 0, 1, 0);
      g.locomotion({ speed: 3, bounds: [-28, 28, -28, 28] });
    }

    // ---- painel: trocar ambiente / HUD com contagem ----
    var P = new ui.Panel({ w: 1.2, h: 0.3, res: 440, render: function (x, Pn) {
      ui.glass(x, 0, 0, Pn.cw, Pn.ch, 36);
      ui.text(x, 'Ambiente 3D', 24, 36, 26, { weight: 800 });
      ui.text(x, '100+ modelos CC0 • ' + count.n + ' nesta cena', Pn.cw - 24, 36, 17, { align: 'right', color: 'rgba(255,255,255,0.7)' });
      var opts = [['loft', 'Loft'], ['terraco', 'Terraço'], ['galeria', 'Galeria']], bw = (Pn.cw - 40) / 3;
      opts.forEach(function (o, i) { Pn.button('p' + o[0], 20 + i * bw, 64, bw - 8, 54, o[1], function () { g.data.preset = o[0]; R.os.restartGame(); }, { active: preset === o[0], px: 20 }); });
    } });
    P.mesh.position.set(0, 1.0, -1.4); P.mesh.rotation.x = -0.35; g.add(P.mesh);
    g.on('update', function () { R.ui.placeInFront(P.mesh, 1.4, -0.55); P.mesh.rotation.x = -0.35; });
  }

  function wallArt(g, spots, count) {
    var frames = ['fancy_picture_frame_01', 'hanging_picture_frame_01'].filter(R.assets.has);
    if (!frames.length) return;
    spots.forEach(function (s, i) { var o = R.assets.get(frames[i % frames.length]); if (!o) return; o.position.set(s[0], s[1], s[2]); o.rotation.y = s[3]; g.add(o); count.n++; });
  }

  R.game({ id: 'ambiente3d', name: 'Ambiente 3D', cat: 'Relax', featured: true, c1: '#6a9bff', c2: '#2a4fb0', glyph: '🏛',
    assets: { models: USED, sky: 'apartamento' },
    desc: 'Um loft/terraço/galeria caminhável, montado com mais de 100 modelos 3D CC0 reais. Explore e troque de ambiente.',
    controls: 'Touchpad para cima = andar para onde olha • bordas = girar.',
    build: build });

  // tile no Início que abre a cena 3D
  R.apps.push({ id: 'ambiente3d', name: 'Ambiente 3D', launch: function () { R.os.launch('ambiente3d'); } });
})();
