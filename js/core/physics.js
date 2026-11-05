/* REgo OS — física (cannon.js 0.6.2, MIT) com passo fixo e sono de corpos */
(function () {
  'use strict';
  var R = window.REGO, THREE = window.THREE, C = window.CANNON;

  function Phys(root, opts) {
    opts = opts || {};
    var w = this.world = new C.World();
    w.gravity.set(0, opts.gravity !== undefined ? opts.gravity : -9.82, 0);
    w.broadphase = new C.SAPBroadphase(w);
    w.allowSleep = true;
    w.solver.iterations = opts.iterations || 8;
    w.defaultContactMaterial.friction = opts.friction !== undefined ? opts.friction : 0.35;
    w.defaultContactMaterial.restitution = opts.restitution !== undefined ? opts.restitution : 0.25;
    this.root = root; this.links = []; this.acc = 0; this.step = 1 / 72; this.baseG = w.gravity.y;
    if (opts.floor !== false) {
      var floor = new C.Body({ mass: 0 }); floor.addShape(new C.Plane());
      floor.quaternion.setFromAxisAngle(new C.Vec3(1, 0, 0), -Math.PI / 2);
      w.addBody(floor); this.floor = floor;
    }
  }
  Phys.prototype.link = function (mesh, body) {
    body.sleepSpeedLimit = 0.15; body.sleepTimeLimit = 0.6;
    this.world.addBody(body); if (mesh && !mesh.parent) this.root.add(mesh);
    var l = { mesh: mesh, body: body }; this.links.push(l); body.userData = { mesh: mesh };
    if (mesh) { mesh.userData.body = body; body.position.set(mesh.position.x, mesh.position.y, mesh.position.z); body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w); }
    return body;
  };
  Phys.prototype.box = function (mesh, w, h, d, mass, opts) {
    var b = new C.Body({ mass: mass, linearDamping: 0.05, angularDamping: 0.1 });
    b.addShape(new C.Box(new C.Vec3(w / 2, h / 2, d / 2)));
    if (opts && opts.material) b.material = opts.material;
    return this.link(mesh, b);
  };
  Phys.prototype.sphere = function (mesh, r, mass) {
    var b = new C.Body({ mass: mass, linearDamping: 0.05, angularDamping: 0.15 }); b.addShape(new C.Sphere(r));
    return this.link(mesh, b);
  };
  Phys.prototype.cylinder = function (mesh, r, h, mass, segs) {
    var b = new C.Body({ mass: mass, angularDamping: 0.1 });
    var cy = new C.Cylinder(r, r, h, segs || 8);
    // cannon cria cilindro no eixo Z: gira p/ Y
    var q = new C.Quaternion(); q.setFromAxisAngle(new C.Vec3(1, 0, 0), -Math.PI / 2);
    b.addShape(cy, new C.Vec3(0, 0, 0), q);
    return this.link(mesh, b);
  };
  Phys.prototype.remove = function (body) {
    for (var i = 0; i < this.links.length; i++) if (this.links[i].body === body) {
      var l = this.links[i]; if (l.mesh && l.mesh.parent) l.mesh.parent.remove(l.mesh);
      this.links.splice(i, 1); break;
    }
    this.world.remove(body);
  };
  Phys.prototype.update = function (dt) {
    this.acc += dt; var n = 0;
    while (this.acc >= this.step && n < 3) { this.world.step(this.step); this.acc -= this.step; n++; }
    if (n === 3) this.acc = 0;
    for (var i = 0; i < this.links.length; i++) {
      var l = this.links[i]; if (!l.mesh || l.body.sleepState === 2) continue;
      l.mesh.position.set(l.body.position.x, l.body.position.y, l.body.position.z);
      l.mesh.quaternion.set(l.body.quaternion.x, l.body.quaternion.y, l.body.quaternion.z, l.body.quaternion.w);
    }
  };
  Phys.prototype.setGravityScale = function (s) { this.world.gravity.y = this.baseG * s; for (var i = 0; i < this.links.length; i++) this.links[i].body.wakeUp(); };
  Phys.prototype.bodyOf = function (obj) { while (obj) { if (obj.userData && obj.userData.body) return obj.userData.body; obj = obj.parent; } return null; };
  R.Phys = Phys;
  R.v3 = function (v) { return new C.Vec3(v.x, v.y, v.z); };
})();
