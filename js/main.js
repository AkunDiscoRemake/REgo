/* Wpollo VR — bootstrap e tela inicial (única UI 2D: entrada e configuração do VR Box) */
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

  var btn = $('enter'), isPhone = R.vrbox.isPhone(), apk = R.vrbox.isApk();
  R.xrSupported(function (ok) {
    if (!ok) { btn.textContent = 'VR (WebXR) indisponível aqui'; if (isPhone || apk) btn.style.display = 'none'; return; }
    btn.disabled = false; btn.textContent = '🥽 Entrar no VR';
    btn.addEventListener('click', function () {
      R.enterVR().then(started).catch(function (e) { R.ui.toast('Falha ao entrar no VR: ' + e.message, 4); });
    });
  });
  $('go2d').addEventListener('click', function () { R.sfx.resume(); started(); });
  R.onEnterXR = started;

  // ------------------------------------------------------------ VR Box: formulário de configuração
  var form = $('boxcfg'), splash = $('splash');
  function showBox() { splash.hidden = true; form.hidden = false; fill(); }
  $('openbox').addEventListener('click', showBox);
  $('backsplash').addEventListener('click', function () { form.hidden = true; splash.hidden = false; });
  if (apk || (isPhone && !/Pacific/.test(navigator.userAgent))) { $('openbox').textContent = '📱 Configurar VR Box'; if (apk) showBox(); }
  var VB = R.vrbox.cfg, HT = R.handtrack.cfg;
  var MAP = { track: [VB, 'track'], distortion: [VB, 'distortion', 'bool'], ipd: [VB, 'ipd', 'num'], fov: [VB, 'fov', 'num'], predictMs: [VB, 'predictMs', 'num'], scale: [VB, 'scale', 'num'],
    engine: [HT, 'engine'], async: [HT, 'async', 'bool'], filter: [HT, 'filter'], minCutoff: [HT, 'minCutoff', 'num'], beta: [HT, 'beta', 'num'], kalmanQ: [HT, 'kalmanQ', 'num'],
    predictMs_h: [HT, 'predictMs', 'num'], camRes: [HT, 'camRes'], detEvery: [HT, 'detEvery', 'num'], maxHands: [HT, 'maxHands', 'num'], camFov: [HT, 'camFov', 'num'] };
  function fill() {
    Object.keys(MAP).forEach(function (n) {
      var el = form.elements[n], m = MAP[n], v = m[0][m[1]]; if (!el) return;
      el.value = m[2] === 'bool' ? (v ? '1' : '0') : String(v);
      var out = el.parentNode.querySelector('output'); if (out) { out.textContent = el.value; el.oninput = function () { out.textContent = el.value; }; }
    });
    form.elements.handStyle.value = R.settings.handStyle === 'fofinho' ? 'fofinho' : 'classico';
    form.elements.htOn.value = R.store.get('htOn', true) ? '1' : '0';
    var info = $('npuinfo');
    info.textContent = ('ml' in navigator ? 'WebNN detectado: a NPU pode ser usada. ' : 'Este navegador não expõe WebNN: a opção NPU cai automaticamente para GPU ou CPU. ') +
      (navigator.gpu ? 'WebGPU disponível.' : 'Sem WebGPU: GPU cai para CPU.') + ' Modelos: RTMDet-nano + RTMPose-m (OpenMMLab, Apache-2.0).';
    R.vrbox.arSupported(function (ok) { var o = form.elements.track.querySelector('option[value="6dof"]'); o.disabled = !ok; if (!ok) { o.textContent = '6DoF — ARCore (indisponível neste navegador)'; if (form.elements.track.value === '6dof') form.elements.track.value = '3dof'; } });
  }
  $('startbox').addEventListener('click', function () {
    Object.keys(MAP).forEach(function (n) { var el = form.elements[n], m = MAP[n]; if (!el) return; m[0][m[1]] = m[2] === 'bool' ? el.value === '1' : m[2] === 'num' ? parseFloat(el.value) : el.value; });
    R.settings.handStyle = form.elements.handStyle.value; R.saveSettings();
    var htOn = form.elements.htOn.value === '1'; R.store.set('htOn', htOn);
    R.handtrack.save(); R.handtrack.applyStyle();
    var mr = form.elements.mr.value === '1';
    started();
    R.vrbox.start().then(function () {
      R.input.refresh();
      if (htOn) R.handtrack.start();
      if (mr) R.vrbox.togglePassthrough();
      setTimeout(function () { R.recenter(); }, 600);
    });
  });
  // service worker: cache offline => abre instantâneo
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !apk) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
