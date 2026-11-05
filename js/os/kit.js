/* Wpollo VR — kit de jogos: contexto de jogo, HUD, rodadas, recordes, locomoção, helpers */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, M = R.models;

  R.gameList = []; R.gameById = {};
  R.game = function (def) { def.cat = def.cat || 'Arcade'; R.gameList.push(def); R.gameById[def.id] = def; };

  // modificadores globais do menu de pausa
  R.mods = { dualArm: false, slowmo: false, lowGrav: false, giant: false, night: false, rainbow: false, showFps: false, mute: false, noLaser: false, bigWorld: false };
  R.applyMods = function (ctx) {
    var m = R.mods;
    R.timeScale = m.slowmo ? 0.4 : 1;
    R.input.setDualArm(m.dualArm);
    R.input.giant = m.giant ? 2.4 : 1;
    R.input.rainbow = m.rainbow;
    R.sfx.setMuted(m.mute);
    for (var i = 0; i < R.input.real.length; i++) R.input.real[i].laserOn = !m.noLaser;
    R.input.mousePointer.laserOn = !m.noLaser; R.input.mirror.laserOn = !m.noLaser;
    if (ctx) {
      ctx.gScale = m.lowGrav ? 0.3 : 1;
      if (ctx._phys) ctx._phys.setGravityScale(ctx.gScale);
      ctx.applyNight();
    }
  };

  var V = THREE.Vector3;
  function Ctx(def) {
    this.def = def; this.root = new THREE.Group(); this.root.name = 'game:' + def.id;
    this.h = { update: [], press: [], release: [], dispose: [], pad: [] };
    this.timers = []; this.fx = []; this.score = 0; this.gScale = 1; this.G = 9.8;
    this.attached = []; this.paused = false; this.over = false; this.data = {};
    this.player = { x: 0, y: 0, z: 0, yaw: 0 };
  }
  R.GameCtx = Ctx;
  var P = Ctx.prototype;
  P.on = function (ev, fn) { this.h[ev].push(fn); return this; };
  P.add = function () { for (var i = 0; i < arguments.length; i++) this.root.add(arguments[i]); return arguments[0]; };
  P.env = function (opts) { var e = M.env(this.root, opts); this.lights = e.lights; this.sky = e.photo ? null : e.sky; this.envKey = this.root.userData.envKey; this.root.fog = this.root.userData.fog; if (this.envKey && R.assets.realistic()) R.assets.setEnv(this.envKey); return e; };
  // modelo CC0 carregado (ou fallback procedural)
  P.model = function (name, opts, fallback) { var m = R.assets.get(name, opts); return m || (fallback ? fallback() : null); };
  P.rand = function (a, b) { return a + Math.random() * (b - a); };
  P.irand = function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); };
  P.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  P.after = function (sec, fn) { this.timers.push({ t: sec, fn: fn }); };
  P.every = function (sec, fn) { var self = this; var tick = function () { if (fn() !== false) self.after(sec, tick); }; this.after(sec, tick); };
  P.burst = function (pos, color, n, speed) { this.fx.push(M.burst(this.root, pos, color, n, speed)); };
  P.addFx = function (fn) { this.fx.push(fn); };
  P.pointers = function () { return R.input.pointers; };
  P.pad = function () { return R.input.pad; };

  // raycast de um ponteiro contra objetos; ajusta o laser
  P.ray = function (p, objs, recursive) {
    var hits = p.ray.intersectObjects(objs, recursive !== false);
    if (hits.length) { R.input.setLaser(p, hits[0].distance, hits[0].point); return hits[0]; }
    return null;
  };
  // segura objeto na "mão" (filho do ponteiro); removido ao sair
  P.hold = function (p, obj, pos, rot) {
    p.obj.add(obj); if (pos) obj.position.copy(pos); if (rot) obj.rotation.copy(rot);
    p.holding = true; obj.userData.holder = p;
    this.attached.push(obj); return obj;
  };
  P.holdAll = function (make, pos, rot) {
    var out = [], ps = R.input.real.concat([R.input.mousePointer, R.input.mirror]);
    for (var i = 0; i < ps.length; i++) { var o = make(i); o.userData.pointer = ps[i]; out.push(this.hold(ps[i], o, pos, rot)); }
    return out;
  };
  P.heldBy = function (p, list) { for (var i = 0; i < list.length; i++) if (list[i].userData.pointer === p) return list[i]; return null; };

  P.phys = function (opts) {
    if (!this._phys) { this._phys = new R.Phys(this.root, opts); this._phys.setGravityScale(this.gScale); }
    return this._phys;
  };

  // ------------------------------------------------------------ HUD
  P.hud = function (opts) {
    opts = opts || {};
    var self = this;
    var st = this.hudState = { title: this.def.name, score: 0, time: null, info: opts.info || '', extra: '' };
    var panel = new R.ui.Panel({
      w: 1.2, h: 0.32, res: 420,
      render: function (x, Pn) {
        R.ui.glass(x, 0, 0, Pn.cw, Pn.ch, 40);
        R.ui.text(x, st.title, 28, 38, 26, { weight: 700, color: 'rgba(255,255,255,0.8)', maxW: 260 });
        R.ui.text(x, st.info, 28, 90, 24, { weight: 500, color: 'rgba(255,255,255,0.75)', maxW: Pn.cw - 56 });
        if (st.label !== false) R.ui.text(x, (st.scoreLabel || 'Pontos') + ': ' + st.score, Pn.cw - 28, 38, 30, { align: 'right', weight: 800 });
        if (st.time !== null) R.ui.text(x, '⏱ ' + Math.ceil(st.time), Pn.cw / 2 + 40, 38, 30, { align: 'center', weight: 700, color: st.time < 6 ? '#ff8080' : '#fff' });
      }
    });
    panel.mesh.position.set(opts.x || 0, opts.y || 2.5, opts.z !== undefined ? opts.z : -3.2);
    if (opts.rotY) panel.mesh.rotation.y = opts.rotY;
    if (opts.scale) panel.mesh.scale.setScalar(opts.scale);
    this.root.add(panel.mesh); this.hudPanel = panel;
    if (opts.follow) this.on('update', function () { R.ui.placeInFront(panel.mesh, 2.4, 0.75); });
    return panel;
  };
  P.setScore = function (s) { this.score = s; if (this.hudState) { this.hudState.score = s; this.hudPanel.dirty = true; } };
  P.addScore = function (n) { this.setScore(this.score + n); };
  P.setInfo = function (s) { if (this.hudState && this.hudState.info !== s) { this.hudState.info = s; this.hudPanel.dirty = true; } };
  P.setTime = function (t) { if (this.hudState) { var o = this.hudState.time; this.hudState.time = t; if (o === null || t === null || Math.ceil(o) !== Math.ceil(t)) this.hudPanel.dirty = true; } };

  // rodada com tempo; ao terminar mostra placar
  P.round = function (secs, onEnd) {
    var self = this; this.roundT = secs; this.setTime(secs);
    this.on('update', function (dt) {
      if (self.over || self.roundT === null) return;
      self.roundT -= dt; self.setTime(Math.max(0, self.roundT));
      if (self.roundT <= 0) { self.roundT = null; if (onEnd) onEnd(); self.end(); }
    });
  };
  P.best = function () { return R.store.get('best.' + this.def.id, 0); };
  P.end = function (msg, lowerIsBetter) {
    if (this.over) return; this.over = true;
    var key = 'best.' + this.def.id, best = R.store.get(key, null), isRec = false;
    if (best === null || (lowerIsBetter ? this.score < best : this.score > best)) { R.store.set(key, this.score); isRec = best !== null || this.score > 0; best = this.score; }
    R.sfx.play(isRec ? 'win' : 'lose');
    if (isRec) R.os.notify('🏆 Novo recorde em ' + this.def.name + ': ' + this.score);
    R.os.achievement('play_' + this.def.id);
    var self = this;
    var pnl = new R.ui.Panel({
      w: 1.1, h: 0.7, res: 500, onTop: true,
      render: function (x, Pn) {
        R.ui.glass(x, 0, 0, Pn.cw, Pn.ch, 50);
        R.ui.text(x, msg || 'Fim de jogo!', Pn.cw / 2, 60, 40, { align: 'center', weight: 800 });
        R.ui.text(x, 'Pontuação: ' + self.score, Pn.cw / 2, 130, 34, { align: 'center' });
        R.ui.text(x, (isRec ? '🏆 Novo recorde!' : 'Recorde: ' + best), Pn.cw / 2, 180, 28, { align: 'center', color: isRec ? '#ffd86b' : 'rgba(255,255,255,0.7)' });
        Pn.button('again', 40, 230, 210, 70, '↻ De novo', function () { R.os.restartGame(); }, { fill: '#2f7bf6', fillHover: '#4b8ff8' });
        Pn.button('exit', 270, 230, 190, 70, 'Sair', function () { R.os.closeGame(); });
      }
    });
    R.ui.placeInFront(pnl.mesh, 1.8, -0.1);
    this.root.worldToLocal(pnl.mesh.position);
    pnl.mesh.rotation.y -= this.root.rotation.y;
    this.root.add(pnl.mesh); this.endPanel = pnl;
  };

  // ------------------------------------------------------------ locomoção (touchpad)
  // cima = andar p/ onde olha, baixo = ré; bordas = giro (tratado no OS)
  P.locomotion = function (opts) {
    opts = opts || {}; var self = this, speed = opts.speed || 2.5;
    this.loco = opts;
    this.on('update', function (dt) {
      var pad = R.input.pad; if (!pad.down) return;
      if (Math.abs(pad.x) > 0.6 && Math.abs(pad.x) > Math.abs(pad.y)) return; // giro
      var fwd = pad.y < 0.35 ? 1 : -1;
      if (Math.abs(pad.y) < 0.45 && Math.abs(pad.x) < 0.45 && opts.centerJump) return;
      var d = R.headDir(new V()); if (!opts.fly) { d.y = 0; d.normalize(); }
      var pl = R.player, s = speed * dt * fwd;
      var nx = pl.x + d.x * s, nz = pl.z + d.z * s;
      if (opts.fly) pl.y = Math.max(opts.minY || 0, pl.y + d.y * s);
      if (opts.bounds) { var b = opts.bounds; nx = Math.max(b[0], Math.min(b[1], nx)); nz = Math.max(b[2], Math.min(b[3], nz)); }
      if (opts.collide && opts.collide(nx, pl.y, nz)) return;
      pl.x = nx; pl.z = nz;
    });
  };

  // noite (mod)
  P.applyNight = function () {
    if (!this.lights) return;
    var n = R.mods.night;
    if (this._baseHemi === undefined) { this._baseHemi = this.lights.hemi.intensity; this._baseDir = this.lights.dir.intensity; }
    this.lights.hemi.intensity = this._baseHemi * (n ? 0.25 : 1);
    this.lights.dir.intensity = this._baseDir * (n ? 0.15 : 1);
    if (this.sky) this.sky.material.color.set(n ? '#202640' : '#ffffff');
  };

  // ------------------------------------------------------------ ciclo
  P.start = function () {
    var self = this;
    R.resetPlayer();
    this.def.build(this);
    // andar em todos os jogos (touchpad), exceto os que controlam o jogador sozinhos
    if (!this.loco && this.def.walk !== false) this.locomotion({ speed: 2.2 });
    this.applyNight();
    this.player = { x: R.player.x, y: R.player.y, z: R.player.z, yaw: R.player.yaw };
  };
  P.tick = function (dt) {
    var ps = R.input.pointers, i, j;
    for (i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (p.pressed && !p.consumed) { p._game = true; for (j = 0; j < this.h.press.length; j++) this.h.press[j](p); }
      if (p.released && p._game) { p._game = false; for (j = 0; j < this.h.release.length; j++) this.h.release[j](p); }
      if (!p.down && !p.released) p._game = false;
    }
    var pad = R.input.pad;
    if (pad.pressed) for (j = 0; j < this.h.pad.length; j++) this.h.pad[j](pad);
    for (j = 0; j < this.h.update.length; j++) this.h.update[j](dt, R.time);
    if (this._phys) this._phys.update(dt);
    for (i = this.timers.length - 1; i >= 0; i--) { var t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); } }
    for (i = this.fx.length - 1; i >= 0; i--) if (this.fx[i](dt) === false) this.fx.splice(i, 1);
  };
  P.setHolding = function (on) { for (var i = 0; i < this.attached.length; i++) { var h = this.attached[i].userData.holder; if (h) h.holding = on && this.attached[i].visible !== false; } };
  // lista de assets do jogo (modelos/texturas/céu) usada pelo carregador
  R.gameAssets = function (def) {
    var a = def.assets || {};
    return { models: a.models || [], tex: a.tex || [], sky: a.sky || null };
  };
  P.dispose = function () {
    this.setHolding(false);
    for (var j = 0; j < this.h.dispose.length; j++) try { this.h.dispose[j](); } catch (e) {}
    for (var i = 0; i < this.attached.length; i++) if (this.attached[i].parent) this.attached[i].parent.remove(this.attached[i]);
    var toFree = [];
    this.root.traverse(function (o) { if (o.userData && o.userData.panel) toFree.push(o.userData.panel); });
    for (var k = 0; k < toFree.length; k++) toFree[k].dispose();
    if (this.root.parent) this.root.parent.remove(this.root);
    this.root.traverse(function (o) {
      if (o.geometry && !o.geometry._shared && o.geometry.dispose && o.geometry.parameters === undefined) o.geometry.dispose();
      if (o.material && o.material.map && o.material.map.isCanvasTexture) o.material.map.dispose();
    });
  };
})();
