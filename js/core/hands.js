/* REgo OS — mãos realistas (WebXR Input Profiles "generic-hand", MIT) segurando o controle do Go.
 * O modelo usa juntas independentes (estilo hand-tracking), então fazemos a cinemática direta:
 * cada dedo dobra em torno do eixo lateral da mão; o indicador acompanha o gatilho.
 */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE;
  var FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
  var SEG = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];
  var TH = ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'];
  var H = R.hands = { skin: '#d9a383', rollZ: -Math.PI / 2, off: [-0.012, 0.012, -0.035] };

  function Hand(src, left) {
    this.left = left;
    this.root = THREE.SkeletonUtils ? THREE.SkeletonUtils.clone(src) : src.clone(true);
    var j = this.j = {};
    this.root.traverse(function (o) {
      if (o.isBone || (o.name && /wrist|finger|thumb/.test(o.name))) j[o.name] = { o: o, p: o.position.clone(), q: o.quaternion.clone() };
      if (o.isMesh) { o.frustumCulled = false; o.material = new THREE.MeshLambertMaterial({ color: H.skin, skinning: true }); }
    });
    var a = j['index-finger-phalanx-proximal'], b = j['pinky-finger-phalanx-proximal'];
    this.lat = a && b ? b.p.clone().sub(a.p).normalize() : new THREE.Vector3(0, 0, 1);
    this.ok = !!a;
    this.curl = [0, 0, 0, 0]; this.thumb = 0;
  }
  var tq = new THREE.Quaternion(), acc = new THREE.Quaternion(), ax = new THREE.Vector3(), d = new THREE.Vector3();
  function chain(h, names, angles, axis) {
    var P = [], Q = [], i, k;
    for (i = 0; i < names.length; i++) { var jj = h.j[names[i]]; if (!jj) return; P.push(jj.p.clone()); Q.push(jj.q.clone()); }
    acc.identity();
    for (k = 1; k < names.length - 1 && k - 1 < angles.length; k++) {
      ax.copy(axis).applyQuaternion(acc).normalize();
      tq.setFromAxisAngle(ax, angles[k - 1]);
      var pivot = P[k].clone();
      for (i = k; i < names.length; i++) { d.copy(P[i]).sub(pivot).applyQuaternion(tq); P[i].copy(pivot).add(d); Q[i].premultiply(tq); }
      acc.premultiply(tq);
    }
    for (i = 0; i < names.length; i++) { var o = h.j[names[i]].o; o.position.copy(P[i]); o.quaternion.copy(Q[i]); }
  }
  // grip 0..1 (dedos médios), trigger 0..1 (indicador), thumb 0..1
  Hand.prototype.pose = function (grip, trigger, thumb) {
    if (!this.ok) return;
    var s = this.left ? 1 : -1, lat = this.lat;
    for (var f = 0; f < 4; f++) {
      var c = f === 0 ? 0.35 + trigger * 0.65 : grip;
      var names = SEG.map(function (sg) { return FINGERS[f] + '-' + sg; });
      chain(this, names, [s * c * 1.35, s * c * 1.5, s * c * 0.9], lat);
    }
    var tax = new THREE.Vector3().subVectors(this.j['thumb-tip'].p, this.j['thumb-metacarpal'].p).cross(lat).normalize();
    chain(this, TH, [s * (0.85 + thumb * 0.25), s * (0.7 + thumb * 0.3)], tax);
  };
  H.Hand = Hand;

  // monta mão + controle para um ponteiro
  H.attach = function (p, left) {
    var hs = R.assets.models[left ? 'hand_left' : 'hand_right'], cs = R.assets.models.oculus_go;
    if (!hs) return false;
    if (p.handGroup) p.model.remove(p.handGroup);
    var g = new THREE.Group();
    if (cs) { var ctrl = cs.clone(true); ctrl.traverse(function (o) { if (o.isMesh) o.material = new THREE.MeshLambertMaterial({ color: '#2b2d33', map: o.material.map || null }); }); p.ctrlModel = ctrl; g.add(ctrl); }
    var hand = new Hand(hs, left);
    // fingers do modelo apontam para -Y: giramos para segurar o controle apontando para -Z
    var hold = new THREE.Group(); hold.add(hand.root);
    var sg = left ? -1 : 1;
    hold.rotation.set(0, 0, sg * H.rollZ);
    hold.position.set(sg * H.off[0], H.off[1], H.off[2]);
    g.add(hold);
    p.hand = hand; p.handGroup = g; p.model.add(g);
    for (var i = 0; i < p.model.children.length; i++) { var c = p.model.children[i]; if (c !== g && c !== p.arm) c.visible = false; }
    hand.pose(0.85, 0, 0.3);
    return true;
  };
  H.update = function (p) {
    if (!p.hand) return;
    var trig = p.down ? 1 : 0;
    p.trigV = (p.trigV || 0) + (trig - (p.trigV || 0)) * Math.min(1, R.rawDt * 18);
    var pad = R.input.pad.touched ? 1 : 0;
    p.hand.pose(p.holding ? 1 : 0.85, p.trigV, pad);
    if (p.ctrlModel) p.ctrlModel.visible = !p.holding;
  };
})();
