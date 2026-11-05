/* REgo OS — UI em canvas no espaço 3D, estilo "vidro" (inspirado no visionOS)
 * Modo imediato: cada painel tem render(ctx, P) que desenha e registra botões.
 * Só redesenha quando algo muda (hover/estado) => quase zero custo por frame.
 */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE;
  var ui = R.ui = { panels: [], toasts: [] };
  var FONT = 'system-ui, -apple-system, "SF Pro Display", Roboto, "Segoe UI", sans-serif';
  ui.FONT = FONT;
  ui.font = function (px, w) { return (w || 600) + ' ' + px + 'px ' + FONT; };

  ui.roundRect = function (x, X, Y, W, H, r) {
    r = Math.min(r, W / 2, H / 2);
    x.beginPath(); x.moveTo(X + r, Y); x.lineTo(X + W - r, Y); x.quadraticCurveTo(X + W, Y, X + W, Y + r);
    x.lineTo(X + W, Y + H - r); x.quadraticCurveTo(X + W, Y + H, X + W - r, Y + H); x.lineTo(X + r, Y + H);
    x.quadraticCurveTo(X, Y + H, X, Y + H - r); x.lineTo(X, Y + r); x.quadraticCurveTo(X, Y, X + r, Y); x.closePath();
  };
  ui.glass = function (x, X, Y, W, H, r, tint) {
    var g = x.createLinearGradient(0, Y, 0, Y + H);
    g.addColorStop(0, tint ? tint[0] : 'rgba(86,88,104,0.78)'); g.addColorStop(1, tint ? tint[1] : 'rgba(40,42,54,0.78)');
    ui.roundRect(x, X, Y, W, H, r); x.fillStyle = g; x.fill();
    x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,0.22)'; x.stroke();
    // brilho na borda superior
    var hl = x.createLinearGradient(0, Y, 0, Y + 40);
    hl.addColorStop(0, 'rgba(255,255,255,0.14)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    ui.roundRect(x, X + 2, Y + 2, W - 4, Math.min(60, H - 4), r); x.fillStyle = hl; x.fill();
  };
  ui.text = function (x, s, X, Y, px, opts) {
    opts = opts || {};
    x.font = ui.font(px, opts.weight); x.fillStyle = opts.color || '#fff';
    x.textAlign = opts.align || 'left'; x.textBaseline = opts.base || 'middle';
    if (opts.maxW) {
      var str = String(s);
      while (str.length > 1 && x.measureText(str).width > opts.maxW) str = str.slice(0, -2) + '…';
      x.fillText(str, X, Y);
    } else x.fillText(s, X, Y);
  };
  ui.wrap = function (x, s, X, Y, maxW, px, lh, opts) {
    x.font = ui.font(px, opts && opts.weight); var words = String(s).split(' '), line = '', y = Y;
    x.fillStyle = (opts && opts.color) || 'rgba(255,255,255,0.85)'; x.textAlign = 'left'; x.textBaseline = 'top';
    for (var i = 0; i < words.length; i++) {
      var t = line ? line + ' ' + words[i] : words[i];
      if (x.measureText(t).width > maxW && line) { x.fillText(line, X, y); line = words[i]; y += lh; }
      else line = t;
      if (words[i].indexOf('\n') >= 0) {}
    }
    if (line) x.fillText(line, X, y);
    return y + lh;
  };

  // ------------------------------------------------------------ ícones (bg+fg do usuário)
  ui.icons = {};
  ui.loadIcon = function (name) {
    if (ui.icons[name]) return ui.icons[name];
    var c = document.createElement('canvas'); c.width = c.height = 160;
    var ic = ui.icons[name] = { canvas: c, ready: false };
    var bg = new Image(), fg = new Image(), n = 0;
    function done() {
      if (++n < 2) return;
      var x = c.getContext('2d');
      x.save(); x.beginPath(); x.arc(80, 80, 78, 0, Math.PI * 2); x.clip(); // visionOS: ícones circulares
      x.drawImage(bg, 0, 0, 160, 160);
      x.drawImage(fg, 8, 8, 144, 144);
      x.restore();
      x.beginPath(); x.arc(80, 80, 77, 0, Math.PI * 2); x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,0.35)'; x.stroke();
      ic.ready = true; ui.markAllDirty();
    }
    bg.onload = fg.onload = done; bg.onerror = fg.onerror = done;
    bg.src = 'assets/icons/' + name + '_bg.png'; fg.src = 'assets/icons/' + name + '_fg.png';
    return ic;
  };
  // ícone gerado (para apps/jogos sem PNG): gradiente + emoji/glyph
  var genCache = {};
  ui.genIcon = function (key, c1, c2, glyph) {
    if (genCache[key]) return genCache[key];
    var c = document.createElement('canvas'); c.width = c.height = 160; var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 160, 160); g.addColorStop(0, c1); g.addColorStop(1, c2 || c1);
    x.beginPath(); x.arc(80, 80, 78, 0, Math.PI * 2); x.fillStyle = g; x.fill();
    x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,0.35)'; x.stroke();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = ui.font(glyph && glyph.length > 2 ? 44 : 74, 800);
    x.fillText(glyph || '?', 80, 86);
    return (genCache[key] = { canvas: c, ready: true });
  };
  ui.drawIcon = function (x, ic, X, Y, S) { if (ic && ic.canvas) x.drawImage(ic.canvas, X, Y, S, S); };

  // ------------------------------------------------------------ Panel
  function Panel(opts) {
    this.w = opts.w || 1; this.h = opts.h || 0.6; this.res = opts.res || 640;
    this.cw = Math.round(this.w * this.res); this.ch = Math.round(this.h * this.res);
    this.canvas = document.createElement('canvas'); this.canvas.width = this.cw; this.canvas.height = this.ch;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    this.mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(this.w, this.h),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: false }));
    this.mesh.renderOrder = opts.renderOrder || 5;
    this.mesh.userData.panel = this;
    this.render = opts.render; this.items = []; this.dirty = true; this.hover = null;
    this.state = opts.state || {}; this.onSwipe = opts.onSwipe; this.onTick = opts.onTick;
    this.alwaysOnTop = !!opts.onTop;
    if (opts.onTop) { this.mesh.material.depthTest = false; this.mesh.renderOrder = 50; }
    this.enabled = true;
    ui.panels.push(this);
  }
  Panel.prototype.redraw = function () {
    var x = this.ctx, P = this;
    x.clearRect(0, 0, this.cw, this.ch);
    this.items = [];
    if (this.render) this.render(x, this);
    this.tex.needsUpdate = true; this.dirty = false;
  };
  // registra área clicável; desenha botão padrão se label definido
  Panel.prototype.button = function (id, X, Y, W, H, label, onClick, opts) {
    opts = opts || {};
    var x = this.ctx, hov = this.hover === id, on = !!opts.active;
    if (opts.style !== 'none') {
      ui.roundRect(x, X, Y, W, H, opts.r !== undefined ? opts.r : H / 2);
      x.fillStyle = opts.fill || (on ? 'rgba(255,255,255,0.92)' : hov ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.10)');
      if (opts.fill && hov) x.fillStyle = opts.fillHover || opts.fill;
      x.fill();
      if (hov) { x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,0.55)'; x.stroke(); }
    }
    if (opts.icon) {
      var s = opts.iconSize || H * 0.7;
      ui.drawIcon(x, opts.icon, X + (label ? 14 : (W - s) / 2), Y + (H - s) / 2, s);
    }
    if (label !== undefined && label !== null && label !== '') {
      var px = opts.px || Math.round(H * 0.42);
      ui.text(x, label, opts.align === 'left' ? X + (opts.icon ? H : 22) : X + W / 2, Y + H / 2 + 1, px,
        { align: opts.align === 'left' ? 'left' : 'center', color: on ? '#111' : (opts.color || '#fff'), weight: opts.weight || 600, maxW: W - 20 });
    }
    this.items.push({ id: id, x: X, y: Y, w: W, h: H, onClick: onClick, onDrag: opts.onDrag, onHold: opts.onHold });
  };
  Panel.prototype.area = function (id, X, Y, W, H, onClick, onDrag) { this.items.push({ id: id, x: X, y: Y, w: W, h: H, onClick: onClick, onDrag: onDrag }); };
  Panel.prototype.hit = function (px, py) {
    for (var i = this.items.length - 1; i >= 0; i--) {
      var it = this.items[i];
      if (px >= it.x && px <= it.x + it.w && py >= it.y && py <= it.y + it.h) return it;
    }
    return null;
  };
  Panel.prototype.show = function (parent) { if (parent) parent.add(this.mesh); this.mesh.visible = true; this.enabled = true; };
  Panel.prototype.hide = function () { this.mesh.visible = false; };
  Panel.prototype.dispose = function () {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.tex.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose();
    var i = ui.panels.indexOf(this); if (i >= 0) ui.panels.splice(i, 1);
  };
  Panel.prototype.update = function () { this.dirty = true; };
  ui.Panel = Panel;
  ui.markAllDirty = function () { for (var i = 0; i < ui.panels.length; i++) ui.panels[i].dirty = true; };

  function visibleInScene(o) {
    while (o) { if (!o.visible) return false; if (o === R.scene) return true; o = o.parent; }
    return false;
  }

  // ------------------------------------------------------------ update: hover/click
  var meshes = [], hitsTmp = [];
  ui.init = function () { ui.toastRoot = new THREE.Group(); R.scene.add(ui.toastRoot); };
  ui.update = function (dt) {
    meshes.length = 0;
    for (var i = 0; i < ui.panels.length; i++) {
      var P = ui.panels[i];
      if (P.onTick) P.onTick(dt, P);
      if (P.enabled && visibleInScene(P.mesh)) { meshes.push(P.mesh); if (P.dirty) P.redraw(); }
    }
    var pts = R.input.pointers, hovered = {};
    for (var k = 0; k < pts.length; k++) {
      var p = pts[k];
      if (p.dragging) { // arrastando um controle (slider/janela)
        var dh = rayPanel(p, p.dragging.panel, true);
        if (dh && p.dragging.item.onDrag) p.dragging.item.onDrag(dh.px, dh.py, p, dh);
        else if (p.dragging.item.onDrag) p.dragging.item.onDrag(null, null, p, null);
        if (!p.down) p.dragging = null;
        p.consumed = true; p.hitUI = true;
        continue;
      }
      if (!meshes.length) continue;
      hitsTmp.length = 0;
      var hits = p.ray.intersectObjects(meshes, false, hitsTmp);
      if (!hits.length) continue;
      var h = hits[0], P2 = h.object.userData.panel;
      var px = h.uv.x * P2.cw, py = (1 - h.uv.y) * P2.ch;
      R.input.setLaser(p, h.distance, h.point);
      p.hitUI = true;
      var it = P2.hit(px, py);
      if (it) hovered[P2.mesh.id] = { P: P2, id: it.id };
      if (p.pressed) {
        p.consumed = true;
        if (it) {
          R.sfx.play('click');
          if (it.onDrag) { p.dragging = { panel: P2, item: it }; it.onDrag(px, py, p, h, true); }
          if (it.onClick) it.onClick(px - it.x, py - it.y, p);
          P2.dirty = true;
        }
      }
      if (p.down) p.consumed = true;
      if (R.input.pad.swipe && P2.onSwipe) { P2.onSwipe(R.input.pad.swipe); P2.dirty = true; }
    }
    for (var j = 0; j < ui.panels.length; j++) {
      var Q = ui.panels[j], hv = hovered[Q.mesh.id], nh = hv ? hv.id : null;
      if (Q.hover !== nh) { if (nh) R.sfx.play('tick'); Q.hover = nh; Q.dirty = true; }
    }
    // toasts
    for (var t = ui.toasts.length - 1; t >= 0; t--) {
      var to = ui.toasts[t]; to.life -= dt;
      to.mesh.material.opacity = Math.min(1, to.life * 2);
      if (to.life <= 0) { ui.toastRoot.remove(to.mesh); to.mesh.material.map.dispose(); to.mesh.material.dispose(); ui.toasts.splice(t, 1); }
    }
    if (ui.toasts.length) {
      var hp = R.camera.getWorldPosition(new THREE.Vector3()), yaw = R.headYaw();
      for (var u = 0; u < ui.toasts.length; u++) {
        var m = ui.toasts[u].mesh;
        m.position.set(hp.x - Math.sin(yaw) * 1.6, hp.y + 0.42 - u * 0.16, hp.z - Math.cos(yaw) * 1.6);
        m.rotation.set(0, yaw, 0);
      }
    }
  };
  var plane = new THREE.Plane(), tmpN = new THREE.Vector3(), tmpP = new THREE.Vector3();
  function rayPanel(p, P, extend) {
    var hits = p.ray.intersectObject(P.mesh, false);
    if (hits.length) { var h = hits[0]; R.input.setLaser(p, h.distance, h.point); return { px: h.uv.x * P.cw, py: (1 - h.uv.y) * P.ch, point: h.point }; }
    if (!extend) return null;
    // fora do painel: projeta no plano infinito
    P.mesh.updateMatrixWorld();
    tmpN.set(0, 0, 1).transformDirection(P.mesh.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(tmpN, P.mesh.getWorldPosition(tmpP));
    var pt = p.ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!pt) return null;
    var loc = P.mesh.worldToLocal(pt.clone());
    return { px: (loc.x / P.w + 0.5) * P.cw, py: (0.5 - loc.y / P.h) * P.ch, point: pt };
  }

  ui.toast = function (msg, secs) {
    var words = String(msg).split(' '), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) { if ((cur + ' ' + words[i]).length > 44 && cur) { lines.push(cur); cur = words[i]; } else cur = cur ? cur + ' ' + words[i] : words[i]; }
    if (cur) lines.push(cur);
    var m = R.models.text(lines.join('\n'), 0.07 * lines.length + 0.015, { size: 40, bg: 'rgba(30,32,44,0.88)', color: '#fff' });
    m.material.depthTest = false; m.renderOrder = 60;
    ui.toastRoot.add(m);
    ui.toasts.unshift({ mesh: m, life: secs || 2.5 });
    if (ui.toasts.length > 3) { var o = ui.toasts.pop(); ui.toastRoot.remove(o.mesh); }
  };

  // coloca objeto à frente da cabeça (yaw atual)
  ui.placeInFront = function (obj, dist, yOff, yawOff) {
    var hp = R.camera.getWorldPosition(new THREE.Vector3()), yaw = R.headYaw() + (yawOff || 0);
    obj.position.set(hp.x - Math.sin(yaw) * dist, hp.y + (yOff || 0), hp.z - Math.cos(yaw) * dist);
    obj.rotation.set(0, yaw, 0);
  };

  // ------------------------------------------------------------ teclado virtual
  var ROWS = [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '/'], ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '-', ':']];
  ui.keyboard = function (opts) {
    var st = { shift: false };
    var P = new Panel({
      w: 1.1, h: 0.42, res: 600,
      render: function (x, P) {
        ui.glass(x, 0, 0, P.cw, P.ch, 36);
        var kw = 54, kh = 46, gap = 6, top = 14;
        for (var r = 0; r < ROWS.length; r++) {
          var row = ROWS[r], ox = (P.cw - row.length * (kw + gap)) / 2;
          for (var c = 0; c < row.length; c++) (function (ch, X, Y) {
            var lab = st.shift ? ch.toUpperCase() : ch;
            P.button('k' + ch, X, Y, kw, kh, lab, function () { opts.onKey(lab); }, { r: 12, px: 24 });
          })(row[c], ox + c * (kw + gap), top + r * (kh + gap));
        }
        var y = top + 4 * (kh + gap);
        P.button('shift', 18, y, 90, kh, '⇧', function () { st.shift = !st.shift; P.dirty = true; }, { r: 12, active: st.shift });
        P.button('space', 116, y, 250, kh, 'espaço', function () { opts.onKey(' '); }, { r: 12, px: 22 });
        P.button('com', 374, y, 80, kh, '.com', function () { opts.onKey('.com'); }, { r: 12, px: 20 });
        P.button('bk', 462, y, 70, kh, '⌫', function () { opts.onKey('\b'); }, { r: 12 });
        P.button('ok', 540, y - 52 * 0, 0, 0, '', null, { style: 'none' });
        P.button('enter', P.cw - 140, y, 122, kh, 'OK', function () { opts.onKey('\n'); }, { r: 12, fill: '#2f7bf6', fillHover: '#4b8ff8' });
      }
    });
    return P;
  };
})();
