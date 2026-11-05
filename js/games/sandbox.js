/* Sandbox Lab — sandbox de física inspirado em BoneLab: puxar à distância, ragdolls, TNT, ferramentas */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, M = R.models, C = window.CANNON;

  var ITEMS = [
    ['box', '📦', 'Caixa'], ['barrel', '☢', 'Tambor'], ['tank', '🧯', 'Botijão'], ['tv', '📺', 'TV'], ['chair', '🪑', 'Cadeira'],
    ['tyre', '⭕', 'Pneu'], ['ball', '⚽', 'Bola'], ['tnt', '🧨', 'TNT'], ['dummy', '🧍', 'Boneco'], ['tower', '🏗', 'Torre'], ['domino', '🁢', 'Dominós'], ['gnome', '🎅', 'Gnomo']
  ];
  var TOOLS = [['grab', '✊', 'Puxar'], ['spawn', '✨', 'Criar'], ['gun', '🔫', 'Pistola'], ['hammer', '🔨', 'Marreta'], ['push', '💨', 'Empurrar'], ['freeze', '❄', 'Congelar'], ['del', '🗑', 'Apagar']];
  // modelo CC0 com corpo físico aproximado pela caixa do modelo
  var REAL = { box: ['wooden_crate_01', 0.55, 'box', 6], barrel: ['Barrel_01', 0.9, 'cyl', 14], tank: ['propane_tank', 0.75, 'cyl', 8], tv: ['Television_01', 0.7, 'box', 9],
    chair: ['plastic_monobloc_chair_01', 0.85, 'box', 3], tyre: ['old_tyre', 0.65, 'cyl', 7], gnome: ['garden_gnome', 0.45, 'box', 2], ball: ['football', 0.22, 'sphere', 0.45] };

  function build(g, opts) {
    opts = opts || {};
    var ph = g.phys({ friction: 0.4, restitution: 0.2, iterations: 8 });
    var objs = []; // meshes clicáveis
    var room, A = R.assets;
    if (opts.sky === 'space') {
      g.env({ sky: 'space', ground: '#8d8a84', tex: 'brushed_concrete', light: { hemi: 0.7, dir: 0.6 } });
      [[0, -15, 30, 0.4], [0, 15, 30, 0.4], [-15, 0, 0.4, 30], [15, 0, 0.4, 30]].forEach(function (w) { var m = M.box(w[2], 1, w[3], '#6b7178'); m.position.set(w[0], 0.5, w[1]); ph.box(m, w[2], 1, w[3], 0); });
      room = { statics: [] }; g.root.traverse(function (o) { if (o.userData.ground) room.statics.push(o); });
      for (var mr = 0; mr < 10; mr++) { var rk = A.get('moon_rock_01', { size: 1 + Math.random() * 2 }); if (rk) { var ra = Math.random() * 6.28; rk.position.set(Math.cos(ra) * (17 + Math.random() * 10), 0, Math.sin(ra) * (17 + Math.random() * 10)); g.add(rk); } }
    } else room = R.LAB.room(g, ph, opts);
    var decal = R.LAB.decals(g);
    // rampa e plataforma de testes (metal com faixa de perigo)
    var hzm = new THREE.MeshLambertMaterial({ map: R.LAB.hazardTex() });
    var ramp = M.box(3, 0.2, 6, null, R.mat.lambert('#6b7178')); ramp.position.set(-6, 1, -6); ramp.rotation.x = 0.35; ph.box(ramp, 3, 0.2, 6, 0); room.statics.push(ramp);
    var plat = M.box(4, 2, 4, null, hzm); plat.position.set(-6, 1, -10.5); ph.box(plat, 4, 2, 4, 0); room.statics.push(plat);

    var st = { tool: 'grab', item: 'box', page: 0 };
    var held = {}; // por ponteiro

    function addObj(mesh, body, type) { mesh.userData.type = type; objs.push(mesh); body.userData = { mesh: mesh, type: type }; return mesh; }
    function spawn(type, pos) {
      var m, b, col = new THREE.Color().setHSL(Math.random(), 0.6, 0.55).getStyle(), rl = REAL[type], real = rl && R.assets.get(rl[0], { size: rl[1], base: false });
      if (real) {
        var fs = real.userData.fitSize; m = real; m.position.copy(pos); if (type === 'barrel') m.userData.rad = true;
        b = rl[2] === 'sphere' ? ph.sphere(m, fs.x / 2, rl[3]) : rl[2] === 'cyl' ? ph.cylinder(m, Math.max(fs.x, fs.z) / 2, fs.y, rl[3], 10) : ph.box(m, fs.x, fs.y, fs.z, rl[3]);
        if (type === 'ball') b.material = bouncy;
        if (type === 'barrel') { var rs = new THREE.Mesh(new THREE.CircleBufferGeometry(fs.y * 0.18, 24), new THREE.MeshLambertMaterial({ map: R.LAB.radTex() })); rs.position.set(0, 0, Math.max(fs.x, fs.z) / 2 + 0.01); m.add(rs); m.traverse(function (o) { if (o.isMesh && o !== rs) { o.material = o.material.clone(); o.material.color.set('#e8c020'); } }); }
        addObj(m, b, type); return b;
      }
      if (type === 'box') { m = M.box(0.4, 0.4, 0.4, col); m.position.copy(pos); b = ph.box(m, 0.4, 0.4, 0.4, 3); }
      else if (type === 'ball') { m = M.sphere(0.2, col, 14); m.position.copy(pos); b = ph.sphere(m, 0.2, 1.5); b.material = bouncy; }
      else if (type === 'barrel') { m = M.cyl(0.25, 0.25, 0.7, '#2d6b4a', 12); m.position.copy(pos); b = ph.cylinder(m, 0.25, 0.7, 5, 10); }
      else if (type === 'plank') { m = M.box(1.8, 0.08, 0.35, '#b07a46'); m.position.copy(pos); b = ph.box(m, 1.8, 0.08, 0.35, 2); }
      else if (type === 'tnt') { m = M.box(0.35, 0.45, 0.35, '#d32f2f'); var lab = M.box(0.36, 0.12, 0.36, '#f5f5f5'); m.add(lab); m.position.copy(pos); b = ph.box(m, 0.35, 0.45, 0.35, 2); }
      else if (type === 'dummy') { dummy(pos); return; }
      else if (type === 'tower') { for (var y = 0; y < 8; y++) for (var k = 0; k < 2; k++) spawn('box', new THREE.Vector3(pos.x + (k - 0.5) * 0.42, 0.2 + y * 0.41, pos.z)); return; }
      else if (type === 'domino') {
        var dir = new THREE.Vector3(pos.x - R.player.x, 0, pos.z - R.player.z).normalize(), yaw = Math.atan2(dir.x, dir.z);
        for (var i = 0; i < 12; i++) { var d = M.box(0.25, 0.5, 0.06, i % 2 ? '#fafafa' : '#222'); d.position.set(pos.x + dir.x * i * 0.28, 0.26, pos.z + dir.z * i * 0.28); d.rotation.y = yaw; var db = ph.box(d, 0.25, 0.5, 0.06, 0.6); addObj(d, db, 'box'); }
        return;
      }
      addObj(m, b, type);
      return b;
    }
    var bouncy = new C.Material('bouncy');
    ph.world.addContactMaterial(new C.ContactMaterial(bouncy, ph.world.defaultMaterial, { restitution: 0.8, friction: 0.3 }));

    // boneco ragdoll de blocos (constraints ponto-a-ponto)
    function dummy(pos) {
      var parts = {}, skin = '#e3b23c', shirt = '#d9a52a';
      function part(name, w, h, d, x, y, z, c, mass) {
        var m = M.box(w, h, d, c); m.position.set(pos.x + x, pos.y + y, pos.z + z); m.userData.flesh = true;
        if (name === 'torso' || name === 'head') { var mk = new THREE.Mesh(new THREE.CircleBufferGeometry(Math.min(w, h) * 0.22, 20), new THREE.MeshBasicMaterial({ map: dummyMark() })); mk.position.z = d / 2 + 0.002; m.add(mk); }
        var b = ph.box(m, w, h, d, mass); b.angularDamping = 0.6; b.linearDamping = 0.1; addObj(m, b, 'dummy'); parts[name] = b; return b;
      }
      part('torso', 0.4, 0.5, 0.22, 0, 1.15, 0, shirt, 6);
      part('head', 0.26, 0.26, 0.26, 0, 1.58, 0, skin, 2);
      part('la', 0.14, 0.5, 0.14, -0.29, 1.15, 0, skin, 1.5); part('ra', 0.14, 0.5, 0.14, 0.29, 1.15, 0, skin, 1.5);
      part('ll', 0.16, 0.6, 0.18, -0.11, 0.6, 0, '#2e3c52', 2.5); part('rl', 0.16, 0.6, 0.18, 0.11, 0.6, 0, '#2e3c52', 2.5);
      function join(a, b, pa, pb) { ph.world.addConstraint(new C.PointToPointConstraint(parts[a], new C.Vec3(pa[0], pa[1], pa[2]), parts[b], new C.Vec3(pb[0], pb[1], pb[2]))); }
      join('torso', 'head', [0, 0.27, 0], [0, -0.15, 0]);
      join('torso', 'la', [-0.22, 0.22, 0], [0.0, 0.25, 0]); join('torso', 'ra', [0.22, 0.22, 0], [0.0, 0.25, 0]);
      join('torso', 'll', [-0.11, -0.26, 0], [0, 0.3, 0]); join('torso', 'rl', [0.11, -0.26, 0], [0, 0.3, 0]);
    }

    var markTex = null;
    function dummyMark() { if (markTex) return markTex; var c = document.createElement('canvas'); c.width = c.height = 64; var x = c.getContext('2d'); x.fillStyle = '#ffd400'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#111'; x.beginPath(); x.moveTo(32, 32); x.arc(32, 32, 30, 0, Math.PI / 2); x.closePath(); x.fill(); x.beginPath(); x.moveTo(32, 32); x.arc(32, 32, 30, Math.PI, Math.PI * 1.5); x.closePath(); x.fill(); return (markTex = new THREE.CanvasTexture(c)); }
    // ferimento: spray + manchas no chão/paredes + mancha no próprio boneco
    function bleed(hit, dir, power) {
      R.LAB.bloodSpray(g, hit.point, dir.clone().multiplyScalar(-0.3).add(new THREE.Vector3(0, 0.3, 0)).add(dir), 10 + Math.round(power * 10), decal, room.statics);
      decal('blood', hit, 0.12, hit.object);
      var far = new THREE.Raycaster(hit.point.clone().addScaledVector(dir, 0.3), dir, 0, 4).intersectObjects(room.statics, false)[0];
      if (far) decal('blood', far, 0.35 + power * 0.3);
      R.sfx.play('hit');
    }
    // pistola e marreta na mão quando a ferramenta está ativa
    var heldTool = g.holdAll(function () {
      var gr = new THREE.Group(), pist = R.assets.holdable('service_pistol', 0.21), ham = R.assets.holdable('sledgehammer_01', 0.9);
      if (pist) { pist.userData.tool = 'gun'; gr.add(pist); } if (ham) { ham.userData.tool = 'hammer'; gr.add(ham); }
      return gr;
    });
    var flash = new THREE.PointLight('#ffcf80', 0, 6); g.add(flash);
    function explode(body) {
      var c = body.position.clone();
      g.burst(new THREE.Vector3(c.x, c.y, c.z), '#ff8a00', 30, 6); g.burst(new THREE.Vector3(c.x, c.y, c.z), '#ffd23f', 20, 4);
      R.sfx.play('boom');
      removeBody(body);
      for (var i = 0; i < ph.links.length; i++) {
        var b = ph.links[i].body; if (b.mass === 0) continue;
        var d = b.position.vsub(c), dist = d.length(); if (dist > 5) continue;
        d.normalize(); d.y += 0.5; var f = 30 / (dist + 0.6);
        b.wakeUp(); b.applyImpulse(d.scale(f * b.mass * 0.4), b.position);
        if (b.userData && b.userData.type === 'tnt' && b !== body && !b.userData.lit) { b.userData.lit = true; (function (bb) { g.after(0.15, function () { if (ph.links.some(function (l) { return l.body === bb; })) explode(bb); }); })(b); }
      }
    }
    function removeBody(b) {
      var m = b.userData && b.userData.mesh; var i = objs.indexOf(m); if (i >= 0) objs.splice(i, 1);
      // remove constraints ligadas
      for (var k = ph.world.constraints.length - 1; k >= 0; k--) { var cs = ph.world.constraints[k]; if (cs.bodyA === b || cs.bodyB === b) ph.world.removeConstraint(cs); }
      ph.remove(b);
    }

    // cinto de ferramentas (painel que acompanha o giro do corpo)
    var belt = new R.ui.Panel({
      w: 1.5, h: 0.42, res: 480,
      render: function (x, P) {
        R.ui.glass(x, 0, 0, P.cw, P.ch, 36);
        var tw = (P.cw - 30) / TOOLS.length;
        for (var i = 0; i < TOOLS.length; i++) (function (t, i) {
          P.button('t' + t[0], 15 + i * tw, 14, tw - 8, 74, t[1] + ' ' + t[2], function () { st.tool = t[0]; P.dirty = true; }, { active: st.tool === t[0], r: 18, px: 17 });
        })(TOOLS[i], i);
        var iw = (P.cw - 30) / ITEMS.length;
        for (var j = 0; j < ITEMS.length; j++) (function (it, j) {
          P.button('i' + it[0], 15 + j * iw, 100, iw - 6, 70, it[1], function () { st.item = it[0]; st.tool = 'spawn'; P.dirty = true; }, { active: st.item === it[0] && st.tool === 'spawn', r: 16, px: 30 });
          R.ui.text(x, it[2], 15 + j * iw + iw / 2 - 3, 182, 14, { align: 'center', color: 'rgba(255,255,255,0.65)' });
        })(ITEMS[j], j);
        P.button('save', 15, P.ch - 0 - 0, 0, 0, '', null, { style: 'none' });
      }
    });
    g.add(belt.mesh);
    var mini = new R.ui.Panel({
      w: 0.9, h: 0.12, res: 480,
      render: function (x, P) {
        R.ui.glass(x, 0, 0, P.cw, P.ch, 28);
        P.button('save', 10, 8, 135, P.ch - 16, '💾 Salvar', function () { save(); }, { px: 18 });
        P.button('load', 152, 8, 135, P.ch - 16, '📂 Carregar', function () { load(); }, { px: 18 });
        P.button('clear', 294, 8, 135, P.ch - 16, '🧹 Limpar', function () { clearAll(); }, { px: 18 });
      }
    });
    g.add(mini.mesh);
    function placeBelt() {
      var yaw = R.player.yaw + R.player.yawOffset, px = R.player.x, pz = R.player.z, h = R.player.y + R.settings.height;
      belt.mesh.position.set(px - Math.sin(yaw) * 0.95, h - 0.75, pz - Math.cos(yaw) * 0.95);
      belt.mesh.rotation.set(-0.75, yaw, 0, 'YXZ');
      mini.mesh.position.set(px - Math.sin(yaw) * 1.18, h - 0.98, pz - Math.cos(yaw) * 1.18);
      mini.mesh.rotation.set(-0.75, yaw, 0, 'YXZ');
    }

    function serialize() {
      var out = [];
      for (var i = 0; i < ph.links.length; i++) { var b = ph.links[i].body, t = b.userData && b.userData.type; if (!t || t === 'dummy' || b.mass === 0 && !b.userData.frozen) continue; out.push([t, +b.position.x.toFixed(2), +b.position.y.toFixed(2), +b.position.z.toFixed(2)]); }
      return out;
    }
    function save() { var saves = R.store.get('sandbox.saves', []); saves.unshift({ t: Date.now(), objs: serialize() }); R.store.set('sandbox.saves', saves.slice(0, 5)); R.os.notify('💾 Criação salva (' + serialize().length + ' objetos)'); }
    function load() { var s = R.store.get('sandbox.saves', [])[0]; if (!s) { R.ui.toast('Nada salvo ainda'); return; } clearAll(); s.objs.forEach(function (o) { spawn(o[0], new THREE.Vector3(o[1], o[2], o[3])); }); }
    function clearAll() { for (var i = ph.links.length - 1; i >= 0; i--) { var b = ph.links[i].body; if (b.userData && b.userData.type) removeBody(b); } }

    // cena inicial
    spawn('tower', new THREE.Vector3(2, 0, -5)); spawn('dummy', new THREE.Vector3(-1.5, 0, -4));
    spawn('tnt', new THREE.Vector3(3.5, 0.3, -4)); spawn('ball', new THREE.Vector3(0, 1, -2.5)); spawn('barrel', new THREE.Vector3(-3, 0.4, -3));
    spawn('domino', new THREE.Vector3(4, 0, -1));

    g.locomotion({ speed: 3, bounds: [-14, 14, -14, 14] });
    var tmp = new THREE.Vector3(), tv = new C.Vec3();
    g.on('press', function (p) {
      var hit = g.ray(p, objs, false);
      var gh = p.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      var body = hit ? ph.bodyOf(hit.object) : null;
      if (st.tool === 'grab' && body) {
        if (body.mass === 0 && !(body.userData && body.userData.frozen)) return;
        held[p.id] = { body: body, dist: Math.max(0.8, Math.min(5, hit.distance)) }; R.sfx.play('whoosh');
      } else if (st.tool === 'spawn') {
        var at = hit ? hit.point.clone().add(new THREE.Vector3(0, 0.6, 0)) : gh && gh.distanceTo(p.origin) < 12 ? gh.add(new THREE.Vector3(0, 0.6, 0)) : p.tip(2.5);
        if (st.item === 'dummy' || st.item === 'tower' || st.item === 'domino') at.y = st.item === 'dummy' ? 0.05 : 0;
        spawn(st.item, at); R.sfx.play('pop');
      } else if (st.tool === 'gun') {
        R.sfx.play('shoot');
        var muzzle = p.tip(0.22); flash.position.copy(muzzle); flash.intensity = 3; g.after(0.05, function () { flash.intensity = 0; });
        var gh2 = g.heldBy(p, heldTool); if (gh2) { gh2.rotation.x = 0.25; g.after(0.08, function () { gh2.rotation.x = 0; }); }
        // cápsula ejetada
        var shell = M.cyl(0.005, 0.005, 0.02, '#c8a24a', 6); shell.position.copy(p.tip(0.1)); var sb = ph.cylinder(shell, 0.005, 0.02, 0.01, 6);
        sb.velocity.set(p.dir.z * 1.5, 1.5, -p.dir.x * 1.5); g.after(4, function () { ph.remove(sb); });
        var allHit = p.ray.intersectObjects(objs.concat(room.statics), false)[0];
        if (allHit) {
          var hb = ph.bodyOf(allHit.object);
          if (hb && hb.userData && hb.userData.type === 'tnt') return explode(hb);
          if (hb && hb.mass > 0) { hb.wakeUp(); hb.applyImpulse(new C.Vec3(p.dir.x * 14, p.dir.y * 14 + 1, p.dir.z * 14), new C.Vec3(allHit.point.x, allHit.point.y, allHit.point.z)); }
          if (allHit.object.userData.flesh) bleed(allHit, p.dir, 0.6);
          else { decal('hole', allHit, 0.035, hb ? allHit.object : null); g.burst(allHit.point, '#ffd08a', 5, 2.5); }
        }
      } else if (st.tool === 'hammer') {
        // marreta: o golpe é detectado no update (balanço do pulso)
      } else if (st.tool === 'push' && body) {
        body.wakeUp(); body.velocity.set(body.velocity.x + p.dir.x * 9, body.velocity.y + 4, body.velocity.z + p.dir.z * 9); R.sfx.play('whoosh');
      } else if (st.tool === 'freeze' && body) {
        if (body.mass > 0) { body.userData.mass = body.mass; body.mass = 0; body.type = C.Body.STATIC; body.userData.frozen = true; body.velocity.set(0, 0, 0); body.angularVelocity.set(0, 0, 0); body.updateMassProperties(); hit.object.material = R.mat.lambert('#9fd8ff'); }
        else if (body.userData.frozen) { body.mass = body.userData.mass; body.type = C.Body.DYNAMIC; body.userData.frozen = false; body.updateMassProperties(); body.wakeUp(); }
        R.sfx.play('click');
      } else if (st.tool === 'del' && body && body.userData.type) { g.burst(hit.point, '#ffffff', 8, 2); removeBody(body); R.sfx.play('pop', 0.6); }
    });
    g.on('release', function (p) {
      var h = held[p.id]; if (!h) return; delete held[p.id];
      if (h.body.mass > 0) { h.body.velocity.set(h.body.velocity.x + p.vel.x * 1.6, h.body.velocity.y + p.vel.y * 1.6, h.body.velocity.z + p.vel.z * 1.6); }
    });
    var hamA = new THREE.Vector3(), hamB = new THREE.Vector3(), hamLine = new THREE.Line3(), hamCd = 0;
    g.on('update', function (dt) {
      // mostra a ferramenta certa na mão
      heldTool.forEach(function (h) { h.children.forEach(function (c) { c.visible = c.userData.tool === st.tool; }); });
      hamCd -= dt;
      if (st.tool === 'hammer' && hamCd <= 0) R.input.pointers.forEach(function (p) {
        if (p.angVel < 3) return;
        p.obj.localToWorld(hamA.set(0, 0, -0.75 * R.input.giant)); p.obj.localToWorld(hamB.set(0, 0, -0.95 * R.input.giant)); hamLine.set(hamA, hamB);
        for (var i = 0; i < objs.length; i++) {
          var o = objs[i], b = ph.bodyOf(o); if (!b || b.mass === 0) continue;
          var cp = hamLine.closestPointToPoint(o.getWorldPosition(new THREE.Vector3()), true, new THREE.Vector3());
          if (cp.distanceTo(o.getWorldPosition(new THREE.Vector3())) < 0.35) {
            var f = Math.min(40, p.angVel * 4); b.wakeUp(); b.applyImpulse(new C.Vec3(p.vel.x * f * 0.2 + p.dir.x * f, f * 0.25, p.vel.z * f * 0.2 + p.dir.z * f), b.position);
            if (o.userData.flesh) bleed({ point: cp, object: o, face: { normal: p.dir.clone().negate() } }, p.dir, 1); else { R.sfx.play('thud'); g.burst(cp, '#ccc', 6, 2); }
            if (b.userData.type === 'tnt') explode(b);
            hamCd = 0.25; break;
          }
        }
      });
      placeBelt();
      var pad = R.input.pad;
      for (var id in held) {
        var h = held[id], p = null; for (var i = 0; i < R.input.pointers.length; i++) if (String(R.input.pointers[i].id) === id) p = R.input.pointers[i];
        if (!p || !h.body.world) { delete held[id]; continue; }
        if (pad.touched && Math.abs(pad.y) > 0.5) h.dist = Math.max(0.6, Math.min(6, h.dist - pad.y * dt * 3));
        p.tip(h.dist, tmp);
        var b = h.body; if (b.mass === 0) continue;
        b.wakeUp();
        b.velocity.set((tmp.x - b.position.x) * 14, (tmp.y - b.position.y) * 14, (tmp.z - b.position.z) * 14);
        b.angularVelocity.scale(0.85, b.angularVelocity);
        R.input.setLaser(p, h.dist, tmp.clone());
      }
      // TNT explode com impacto forte
      for (var j = 0; j < ph.links.length; j++) {
        var bb = ph.links[j].body; if (!bb.userData || bb.userData.type !== 'tnt') continue;
        var sp = bb.velocity.length(); if (bb.userData.lastSp !== undefined && bb.userData.lastSp - sp > 7) { explode(bb); break; } bb.userData.lastSp = sp;
      }
      g.setInfo('Ferramenta: ' + TOOLS.filter(function (t) { return t[0] === st.tool; })[0][2] + (st.tool === 'spawn' ? ' → ' + ITEMS.filter(function (t) { return t[0] === st.item; })[0][2] : '') + ' • objetos: ' + objs.length);
    });
    g.on('pad', function (pad) { /* toques no touchpad: andar (locomoção) */ });
    g.hud({ y: 3.4, z: -6, info: '' });
    spawn('barrel', new THREE.Vector3(-2.5, 0.6, -6)); spawn('barrel', new THREE.Vector3(-1.8, 0.6, -6.6)); spawn('tank', new THREE.Vector3(4.5, 0.5, -5)); spawn('tv', new THREE.Vector3(3.5, 1.4, -3.2));
    g.hudState.label = false;
  }

  R.game({ id: 'sandbox', assets: { models: ['service_pistol', 'sledgehammer_01', 'wooden_crate_01', 'cardboard_box_01', 'Barrel_01', 'propane_tank', 'Television_01', 'plastic_monobloc_chair_01', 'old_tyre', 'garden_gnome', 'football', 'WoodenTable_01'] }, name: 'Sandbox Lab', cat: 'Física', featured: true, c1: '#f2b134', c2: '#d9480f', glyph: '🧪',
    desc: 'Laboratório industrial ultra realista (setor nuclear): pistola com recuo e cápsulas, marreta, bonecos de teste com sangue, tambores radioativos, TNT em cadeia e física real.',
    controls: 'Olhe para baixo: cinto de ferramentas. Gatilho usa a ferramenta. Segurando algo, touchpad cima/baixo aproxima/afasta.',
    build: function (g) { build(g); } });
  R.game({ id: 'sandbox-moon', assets: { models: ['service_pistol', 'sledgehammer_01', 'wooden_crate_01', 'Barrel_01', 'propane_tank', 'old_tyre', 'football', 'moon_rock_01'] }, name: 'Sandbox Lunar', cat: 'Física', c1: '#5d5f73', c2: '#1b1c2b', glyph: '🌑',
    desc: 'O mesmo laboratório numa base lunar — gravidade baixa ativada automaticamente.',
    controls: 'Igual ao Sandbox Lab. Ative Baixa gravidade no menu para o efeito lunar completo.',
    build: function (g) { R.mods.lowGrav = true; g.gScale = 0.3; build(g, { sky: 'space' }); } });
})();
