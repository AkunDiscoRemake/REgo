/* REgo OS — bootstrap */
(function () {
  'use strict';
  var R = window.REGO;
  try { R.init(); } catch (e) {
    document.getElementById('loading').innerHTML = '<div>Erro ao iniciar: ' + e.message + '</div>';
    throw e;
  }
  document.getElementById('count').textContent = R.gameList.length + ' jogos';
  setTimeout(function () { document.getElementById('loading').classList.add('done'); }, 200);
  var btn = document.getElementById('enter');
  R.xrSupported(function (ok) {
    if (!ok) { btn.textContent = 'VR indisponível — modo 2D'; return; }
    btn.disabled = false; btn.textContent = '🥽 Entrar no VR';
    btn.addEventListener('click', function () {
      btn.classList.remove('pulse');
      R.enterVR().catch(function (e) { R.ui.toast('Falha ao entrar no VR: ' + e.message, 4); });
    });
  });
  // service worker: cache offline => abre instantâneo no Go
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
