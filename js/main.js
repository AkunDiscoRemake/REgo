/* Wpollo VR — bootstrap (Oculus Go / WebXR). Única tela 2D: a entrada. */
(function () {
  'use strict';
  var R = window.REGO;
  try { R.init(); } catch (e) {
    document.getElementById('loading').innerHTML = '<div>Erro ao iniciar: ' + e.message + '</div>';
    throw e;
  }
  var $ = function (id) { return document.getElementById(id); };
  $('count').textContent = R.gameList.length + ' jogos';
  setTimeout(function () { $('loading').classList.add('done'); }, 200);
  function started() { document.body.classList.add('started'); }

  var btn = $('enter');
  R.xrSupported(function (ok) {
    if (!ok) { btn.textContent = 'WebXR indisponível aqui'; return; }
    btn.disabled = false; btn.textContent = '🥽 Entrar no VR';
    btn.addEventListener('click', function () {
      R.enterVR().then(started).catch(function (e) { R.ui.toast('Falha ao entrar no VR: ' + e.message, 4); });
    });
  });
  $('go2d').addEventListener('click', function () { R.sfx.resume(); started(); });
  R.onEnterXR = started;

  // service worker: abre instantâneo e funciona offline no Go
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
    var had = !!navigator.serviceWorker.controller, reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (had && !reloaded && !document.body.classList.contains('started')) { reloaded = true; location.reload(); }
    });
  }
})();
