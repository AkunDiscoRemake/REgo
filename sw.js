/* Wpollo VR — service worker.
 * Código (html/js/css/json) = REDE PRIMEIRO: nunca mistura versão nova com motor antigo em cache.
 * Assets pesados e imutáveis (modelos, texturas, céus, wasm, onnx) = CACHE PRIMEIRO: abre instantâneo/offline.
 */
var CACHE = 'wpollo-v4';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
function isHeavy(p) { return /\/assets\/|\.wasm$|\.onnx$|\.glb$|\/vendor\//.test(p); }
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || e.request.headers.has('range')) return;
  if (isHeavy(u.pathname)) {
    e.respondWith(caches.open(CACHE).then(function (c) { return c.match(e.request).then(function (hit) { return hit || fetch(e.request).then(function (r) { if (r.status === 200) c.put(e.request, r.clone()); return r; }); }); }));
  } else {
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(function (r) { if (r.status === 200) { var cl = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, cl); }); } return r; })
      .catch(function () { return caches.match(e.request); }));
  }
});
