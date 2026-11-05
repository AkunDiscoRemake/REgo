/* Blocky World — mundo de blocos em VR (obby, torre, hangout com NPCs). Criação original. */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, M = R.models;

  // motor de plataforma simples (AABB) — barato e estável no Go
  function Platformer(g, opts) {
    var self = this;
    this.g = g; this.blocks = []; this.vy = 0; this.onGround = false; this.check = opts.spawn.slice(); this.carry = null;
    this.coins = 0; this.deaths = 0; this.t = 0; this.finished = false;
    this.speed = opts.speed || 4.2; this.jumpV = opts.jump || 6.2;
    R.player.x = opts.spawn[0]; R.player.y = opts.spawn[1]; R.player.z = opts.spawn[2];
    g.on('press', function (p) { if (self.onGround) { self.vy = self.jumpV; self.onGround = false; R.sfx.play('jump'); } });
    g.on('update', function (dt) { self.step(dt); });
  }
  var COLORS = { normal: '#a3a8b4', kill: '#ff2a2a', check: '#3ddc84', end: '#ffd23f', bounce: '#ff7ad9', move: '#4b8ff8', ice: '#bfe9ff', conveyor: '#7a5cff' };
  Platformer.prototype.block = function (x, y, z, w, h, d, type, extra) {
    type = type || 'normal';
    var mat = type === 'kill' ? R.mat.basic(COLORS.kill) : R.mat.lambert(extra && extra.color || COLORS[type]);
    var m = M.box(w, h, d, null, mat); m.position.set(x, y + h / 2, z); this.g.add(m);
    var b = { m: m, type: type, w: w, h: h, d: d, x: x, y: y, z: z, ex: extra || {} };
    if (type === 'move') { b.ox = x; b.oy = y; b.oz = z; }
    this.blocks.push(b); return b;
  };
  Platformer.prototype.coin = function (x, y, z) {
    var c = new THREE.Mesh(M.geo.cyl(0.22, 0.22, 0.05, 14), R.mat.lambert('#ffd23f', { emissive: '#664400' }));
    c.rotation.x = Math.PI / 2; c.position.set(x, y, z); this.g.add(c);
    (this.coinList = this.coinList || []).push(c);
  };
  Platformer.prototype.step = function (dt) {
    var pl = R.player, g = this.g, pad = R.input.pad, i, b;
    if (this.finished) return;
    this.t += dt;
    // plataformas móveis
    for (i = 0; i < this.blocks.length; i++) {
      b = this.blocks[i]; if (b.type !== 'move') continue;
      var e = b.ex, s = Math.sin(R.time * (e.speed || 1) + (e.phase || 0));
      var nx = b.ox + (e.dx || 0) * s, ny = b.oy + (e.dy || 0) * s, nz = b.oz + (e.dz || 0) * s;
      b.vx = (nx - b.x) / Math.max(dt, 1e-4); b.vz = (nz - b.z) / Math.max(dt, 1e-4); b.vyy = (ny - b.y);
      b.dxs = nx - b.x; b.dys = ny - b.y; b.dzs = nz - b.z;
      b.x = nx; b.y = ny; b.z = nz; b.m.position.set(nx, ny + b.h / 2, nz);
    }
    // carregado por plataforma
    if (this.carry && this.onGround) { pl.x += this.carry.dxs || 0; pl.z += this.carry.dzs || 0; pl.y += this.carry.dys || 0; }
    // andar
    var mx = 0, mz = 0;
    if (pad.down && !(Math.abs(pad.x) > 0.6 && Math.abs(pad.x) > Math.abs(pad.y))) {
      var d = R.headDir(new THREE.Vector3()); d.y = 0; d.normalize(); var f = pad.y < 0.35 ? 1 : -1;
      mx = d.x * this.speed * f; mz = d.z * this.speed * f;
    }
    var ice = this.ground && this.ground.type === 'ice';
    if (ice) { this.ivx = (this.ivx || 0) * 0.985 + mx * 0.02; this.ivz = (this.ivz || 0) * 0.985 + mz * 0.02; mx = this.ivx * 50; mz = this.ivz * 50; }
    else { this.ivx = mx / 50; this.ivz = mz / 50; }
    if (this.ground && this.ground.type === 'conveyor') { mx += (this.ground.ex.cx || 0); mz += (this.ground.ex.cz || -2); }
    this.moveAxis('x', mx * dt); this.moveAxis('z', mz * dt);
    // gravidade
    this.vy -= 16 * g.gScale * dt;
    var ny2 = pl.y + this.vy * dt; this.onGround = false; this.carry = null; this.ground = null;
    for (i = 0; i < this.blocks.length; i++) {
      b = this.blocks[i];
      if (Math.abs(pl.x - b.x) > b.w / 2 + 0.2 || Math.abs(pl.z - b.z) > b.d / 2 + 0.2) continue;
      var top = b.y + b.h;
      if (this.vy <= 0 && pl.y >= top - 0.05 - (b.dys > 0 ? b.dys : 0) && ny2 <= top) {
        ny2 = top; this.vy = 0; this.onGround = true; this.ground = b; if (b.type === 'move') this.carry = b;
        this.touch(b);
      } else if (this.vy > 0 && pl.y + 1.7 <= b.y && ny2 + 1.7 > b.y) { ny2 = b.y - 1.7; this.vy = 0; }
    }
    pl.y = ny2;
    if (pl.y < -12) this.die();
    // moedas
    if (this.coinList) for (i = this.coinList.length - 1; i >= 0; i--) {
      var c = this.coinList[i]; c.rotation.z += dt * 3;
      if (Math.abs(c.position.x - pl.x) < 0.6 && Math.abs(c.position.z - pl.z) < 0.6 && c.position.y > pl.y - 0.2 && c.position.y < pl.y + 1.9) {
        g.remove ? 0 : 0; c.parent.remove(c); this.coinList.splice(i, 1); this.coins++; R.sfx.play('coin'); g.addScore(10);
      }
    }
  };
  Platformer.prototype.moveAxis = function (ax, d) {
    if (!d) return; var pl = R.player, n = pl[ax] + d;
    for (var i = 0; i < this.blocks.length; i++) {
      var b = this.blocks[i];
      var px = ax === 'x' ? n : pl.x, pz = ax === 'z' ? n : pl.z;
      if (Math.abs(px - b.x) < b.w / 2 + 0.2 && Math.abs(pz - b.z) < b.d / 2 + 0.2 && pl.y + 0.3 < b.y + b.h && pl.y + 1.7 > b.y) {
        if (b.type === 'kill') { this.die(); return; }
        return;
      }
    }
    pl[ax] = n;
  };
  Platformer.prototype.touch = function (b) {
    if (b.type === 'kill') this.die();
    else if (b.type === 'bounce') { this.vy = 11; this.onGround = false; R.sfx.play('jump'); }
    else if (b.type === 'check' && (this.check[0] !== b.x || this.check[2] !== b.z)) { this.check = [b.x, b.y + b.h, b.z]; R.sfx.play('coin'); R.ui.toast('✅ Checkpoint!', 1.5); }
    else if (b.type === 'end' && !this.finished) { this.finished = true; if (this.onEnd) this.onEnd(); }
  };
  Platformer.prototype.die = function () {
    var pl = R.player; this.deaths++; R.sfx.play('lose'); this.vy = 0;
    pl.x = this.check[0]; pl.y = this.check[1]; pl.z = this.check[2];
    if (this.onDie) this.onDie();
  };
  R.Platformer = Platformer;

  // ---------------------------------------------------------------- Obby
  function obby(g, level) {
    g.env({ sky: 'day', ground: false, clouds: 10, light: { hemi: 0.9 } });
    var water = new THREE.Mesh(M.geo.plane(400, 400), R.mat.lambert('#3aa0e8')); water.rotation.x = -Math.PI / 2; water.position.y = -12; g.add(water);
    var pf = new Platformer(g, { spawn: [0, 0, 0] });
    pf.block(0, -1, 0, 4, 1, 4, 'normal', { color: '#5f6b7a' });
    var z = -4, y = 0, x = 0, rnd = mulberry(level * 977 + 3);
    var types = ['normal', 'normal', 'move', 'kill', 'bounce', 'ice', 'conveyor', 'normal'];
    var N = 14 + level * 6;
    for (var i = 0; i < N; i++) {
      var t = types[Math.floor(rnd() * Math.min(types.length, 3 + level * 2))];
      if (i % 7 === 6) t = 'check';
      var w = 1.4 + rnd() * 1.2;
      z -= 2.2 + rnd() * 1.4; x += (rnd() - 0.5) * 3; y += (rnd() - 0.35) * 0.9; y = Math.max(-1, Math.min(8 + level * 3, y));
      if (t === 'kill') {
        pf.block(x, y - 0.4, z, w + 1.5, 0.4, 2.4, 'normal', { color: '#5f6b7a' });
        pf.block(x + (rnd() > 0.5 ? 0.6 : -0.6), y, z, 0.6, 0.5, 2.4, 'kill');
        continue;
      }
      if (t === 'move') { pf.block(x, y - 0.4, z, w, 0.4, w, 'move', { dx: 1.8 * (rnd() > 0.5 ? 1 : -1), speed: 0.8 + rnd() * 0.8, phase: rnd() * 6 }); continue; }
      if (t === 'bounce') { pf.block(x, y - 0.4, z, w, 0.4, w, 'bounce'); y += 2.2; continue; }
      if (t === 'conveyor') { pf.block(x, y - 0.4, z, 1.6, 0.4, 3.5, 'conveyor', { cz: 2.0 }); z -= 1.2; continue; }
      pf.block(x, y - 0.4, z, w, 0.4, w, t);
      if (rnd() > 0.5) pf.coin(x, y + 1.0, z);
    }
    pf.block(x, y - 0.4, z - 4, 4, 0.4, 4, 'end');
    var flag = M.cyl(0.04, 0.04, 2.5, '#eee', 6); flag.position.set(x, y + 1.25, z - 4); g.add(flag);
    var fl = M.box(0.8, 0.5, 0.02, '#ffd23f'); fl.position.set(x + 0.4, y + 2.2, z - 4); g.add(fl);
    g.hud({ follow: true, info: 'Chegue à bandeira! Gatilho = pular' });
    g.hudState.scoreLabel = 'Moedas';
    pf.onDie = function () { g.setInfo('Ops! Mortes: ' + pf.deaths); };
    pf.onEnd = function () { g.setScore(Math.max(0, Math.round(1000 - pf.t * 5 - pf.deaths * 25 + pf.coins * 10))); g.end('Obby completo em ' + pf.t.toFixed(1) + 's!'); };
    g.on('update', function () { g.setTime(pf.t); });
    g.locoNote = true;
  }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---------------------------------------------------------------- Hub (hangout com NPCs e portais)
  var NAMES = ['Pixel_Pedro', 'Bloquinho99', 'LuaNoob', 'Craft_Ana', 'xX_Turbo_Xx', 'Mel_Builder', 'Zé_Obby', 'NinjaCubo'];
  var CHAT = ['oi!', 'alguém quer fazer obby?', 'lol', 'que mapa top', 'segue eu', 'gg', 'olha meu pulo', 'vamo pro portal azul'];
  function hub(g) {
    g.env({ sky: 'day', ground: '#58b05f', trees: 20, clouds: 8, mountains: true, grid: 2 });
    var pf = new Platformer(g, { spawn: [0, 0, 4] });
    pf.block(0, -1, 0, 60, 1, 60, 'normal', { color: '#58b05f' });
    pf.blocks[0].m.visible = false;
    // spawn pad e casinhas
    pf.block(0, 0, 4, 3, 0.2, 3, 'normal', { color: '#e8e8e8' });
    for (var h = 0; h < 4; h++) {
      var hx = -10 + h * 6.5; pf.block(hx, 0, -12, 4, 3, 4, 'normal', { color: ['#e85d5d', '#5d9be8', '#e8c15d', '#8a5de8'][h] });
      var roof = M.cone(3.2, 1.6, '#5a3d2a', 4); roof.rotation.y = Math.PI / 4; roof.position.set(hx, 3.8, -12); g.add(roof);
    }
    // escadaria / torre para escalar
    for (var s = 0; s < 14; s++) { var a = s * 0.5; pf.block(10 + Math.cos(a) * 3, s * 0.6, -2 + Math.sin(a) * 3, 1.4, 0.3, 1.4, s === 13 ? 'end' : 'normal', { color: s % 2 ? '#ff9f43' : '#feca57' }); }
    var central = M.cyl(1.5, 1.5, 8.5, '#d9d9d9', 10); central.position.set(10, 4.2, -2); g.add(central);
    pf.onEnd = function () { pf.finished = false; R.sfx.play('win'); R.ui.toast('🏆 Topo da torre!'); g.addScore(50); R.player.x = 0; R.player.y = 0; R.player.z = 4; };
    // portais para os obbies
    var portals = [];
    [['blocky-obby', '#4b8ff8', 'OBBY FÁCIL', -6], ['blocky-obby2', '#e85d5d', 'OBBY DIFÍCIL', 0], ['blocky-tower', '#8a5de8', 'TORRE INFINITA', 6]].forEach(function (pd) {
      var ring = new THREE.Mesh(M.geo.torus(1.2, 0.15, 8, 24), R.mat.basic(pd[1])); ring.position.set(pd[3], 1.4, -5); g.add(ring);
      var disc = new THREE.Mesh(new THREE.CircleBufferGeometry(1.1, 24), new THREE.MeshBasicMaterial({ color: pd[1], transparent: true, opacity: 0.35 })); disc.position.copy(ring.position); g.add(disc);
      var label = M.text(pd[2], 0.45, { color: '#fff', stroke: '#000' }); label.position.set(pd[3], 3, -5); g.add(label);
      portals.push({ id: pd[0], pos: ring.position, disc: disc });
    });
    // NPCs
    var npcs = [];
    for (var n = 0; n < 7; n++) {
      var av = M.blocky(new THREE.Color().setHSL(Math.random(), 0.65, 0.5).getStyle(), '#2e3c52');
      av.scale.setScalar(1.7); av.position.set((Math.random() - 0.5) * 20, 0, (Math.random() - 0.5) * 14);
      var tag = M.text(NAMES[n], 0.12, { color: '#fff', stroke: '#000', size: 48 }); tag.position.y = 1.15; av.add(tag);
      g.add(av); npcs.push({ a: av, tag: tag, tx: av.position.x, tz: av.position.z, t: Math.random() * 3, bubble: null, jump: 0, vy: 0 });
    }
    // placar de jogadores
    var lb = new R.ui.Panel({ w: 0.9, h: 1.0, res: 400, render: function (x, P) {
      R.ui.glass(x, 0, 0, P.cw, P.ch, 24, ['rgba(20,22,30,0.82)', 'rgba(20,22,30,0.82)']);
      R.ui.text(x, 'Jogadores', 20, 34, 24, { weight: 800 });
      R.ui.text(x, 'Você', 20, 80, 20, { color: '#9fd3ff' }); R.ui.text(x, String(g.score), P.cw - 20, 80, 20, { align: 'right' });
      for (var i = 0; i < 7; i++) { R.ui.text(x, NAMES[i], 20, 120 + i * 36, 18); R.ui.text(x, String((i * 37 + 13) % 150), P.cw - 20, 120 + i * 36, 18, { align: 'right', color: 'rgba(255,255,255,0.6)' }); }
    } });
    lb.mesh.position.set(-5, 2.2, -2); lb.mesh.rotation.y = 0.6; g.add(lb.mesh);
    g.on('update', function (dt) {
      var pl = R.player;
      for (var i = 0; i < npcs.length; i++) {
        var c = npcs[i], a = c.a; c.t -= dt;
        if (c.t < 0) { c.t = 2 + Math.random() * 4; c.tx = (Math.random() - 0.5) * 22; c.tz = (Math.random() - 0.5) * 16; if (Math.random() < 0.3) c.vy = 5;
          if (Math.random() < 0.35) { if (c.bubble) a.remove(c.bubble); c.bubble = M.text(CHAT[Math.floor(Math.random() * CHAT.length)], 0.1, { bg: 'rgba(255,255,255,0.95)', color: '#111', size: 44 }); c.bubble.position.y = 1.35; a.add(c.bubble); c.bt = 3; } }
        var dx = c.tx - a.position.x, dz = c.tz - a.position.z, dist = Math.hypot(dx, dz);
        if (dist > 0.2) { a.position.x += dx / dist * dt * 2.2; a.position.z += dz / dist * dt * 2.2; a.rotation.y = Math.atan2(dx, dz); var sw = Math.sin(R.time * 9) * 0.6; a.userData.limbs.ll.rotation.x = sw; a.userData.limbs.rl.rotation.x = -sw; a.userData.limbs.la.rotation.x = -sw; a.userData.limbs.ra.rotation.x = sw; }
        c.vy -= 16 * dt; a.position.y = Math.max(0, a.position.y + c.vy * dt); if (a.position.y === 0) c.vy = 0;
        c.tag.lookAt(R.camera.getWorldPosition(new THREE.Vector3()));
        if (c.bubble) { c.bubble.lookAt(R.camera.getWorldPosition(new THREE.Vector3())); c.bt -= dt; if (c.bt < 0) { a.remove(c.bubble); c.bubble = null; } }
      }
      for (var k = 0; k < portals.length; k++) {
        var po = portals[k]; po.disc.material.opacity = 0.3 + Math.sin(R.time * 3 + k) * 0.1;
        if (Math.hypot(pl.x - po.pos.x, pl.z - po.pos.z) < 1.0 && pl.y < 2) { R.os.closeGame(); R.os.launch(po.id); return; }
      }
      lb.state.s !== g.score && (lb.state.s = g.score, lb.dirty = true);
    });
    g.hud({ follow: true, info: 'Ande até um portal • suba a torre laranja • gatilho = pular' });
  }

  // ---------------------------------------------------------------- Torre infinita
  function tower(g) {
    g.env({ sky: 'sunset', ground: false, light: { hemi: 0.8 } });
    var pf = new Platformer(g, { spawn: [0, 0, 0] });
    pf.block(0, -1, 0, 5, 1, 5, 'normal', { color: '#5f6b7a' });
    var built = 0, ang = 0, y = 0;
    function more() {
      for (var i = 0; i < 10; i++) {
        built++; ang += 0.55 + Math.random() * 0.3; y += 0.7 + Math.min(0.4, built * 0.004);
        var r = 3.2, t = built % 9 === 0 ? 'check' : (built > 15 && Math.random() < 0.25 ? 'move' : (built > 8 && Math.random() < 0.15 ? 'ice' : 'normal'));
        pf.block(Math.cos(ang) * r, y, Math.sin(ang) * r, 1.4, 0.3, 1.4, t, t === 'move' ? { dy: 0.4, speed: 1.5, phase: Math.random() * 6 } : { color: new THREE.Color().setHSL(built / 60 % 1, 0.6, 0.6).getStyle() });
      }
    }
    var col = M.cyl(2.2, 2.2, 400, '#2a2d3a', 12); col.position.y = 200; g.add(col);
    more(); more();
    g.hud({ follow: true, info: 'Suba o máximo que puder! Gatilho = pular' }); g.hudState.scoreLabel = 'Altura';
    g.on('update', function () {
      var h = Math.max(0, Math.round(R.player.y)); if (h > g.score) g.setScore(h);
      if (y - R.player.y < 10) more();
    });
    pf.onDie = function () { g.setInfo('Caiu! Recorde da rodada: ' + g.score + ' m'); };
  }

  R.game({ id: 'blocky', name: 'Blocky World', cat: 'Ação', featured: true, c1: '#58b05f', c2: '#4b8ff8', glyph: '🧱',
    desc: 'Mundo de blocos multiexperiência: hangout com jogadores (NPCs), torre para escalar e portais para obbies.',
    controls: 'Touchpad em cima = andar para onde olha • gatilho = pular • bordas = girar.',
    build: hub });
  R.game({ id: 'blocky-obby', name: 'Obby Fácil', cat: 'Ação', c1: '#4b8ff8', c2: '#3ddc84', glyph: '🏃',
    desc: 'Percurso de obstáculos com checkpoints, moedas e plataformas que se mexem.', controls: 'Touchpad = andar • gatilho = pular.',
    build: function (g) { obby(g, 1); } });
  R.game({ id: 'blocky-obby2', name: 'Obby Difícil', cat: 'Ação', c1: '#e85d5d', c2: '#7a5cff', glyph: '🔥',
    desc: 'Blocos que matam, gelo escorregadio, esteiras e trampolins.', controls: 'Touchpad = andar • gatilho = pular.',
    build: function (g) { obby(g, 3); } });
  R.game({ id: 'blocky-tower', name: 'Torre Infinita', cat: 'Ação', c1: '#8a5de8', c2: '#ff9f43', glyph: '🗼',
    desc: 'Uma espiral de plataformas sem fim. Até onde você chega?', controls: 'Touchpad = andar • gatilho = pular.',
    build: tower });
})();
