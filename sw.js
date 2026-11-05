/* REgo OS — service worker: cache local => abre instantâneo e funciona offline no Go */
var CACHE = 'rego-v1';
var CORE = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'js/vendor/three.min.js', 'js/vendor/cannon.min.js',
  'js/core/engine.js', 'js/core/models.js', 'js/core/audio.js', 'js/core/ui.js', 'js/core/input.js', 'js/core/physics.js',
  'js/os/kit.js', 'js/os/capture.js', 'js/os/apps.js', 'js/os/os.js', 'js/main.js',
  'js/games/bowling.js', 'js/games/sandbox.js', 'js/games/blocky.js', 'js/games/arcade.js', 'js/games/sports.js',
  'js/games/puzzle.js', 'js/games/music.js', 'js/games/racing.js', 'js/games/relax.js'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
// stale-while-revalidate para arquivos do próprio site
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(e.request).then(function (hit) {
      var net = fetch(e.request).then(function (r) { if (r && r.status === 200) c.put(e.request, r.clone()); return r; }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});
