/* Wpollo VR — efeitos sonoros sintetizados (zero downloads, zero latência de rede) */
(function () {
  'use strict';
  var R = window.REGO;
  var ctx = null, master = null, muted = false, noiseBuf = null;
  var sfx = R.sfx = {};
  sfx.init = function () {};
  sfx.resume = function () {
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
        var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      sfx.setVolume(R.settings.volume);
    } catch (e) {}
  };
  sfx.setVolume = function (v) { if (master) master.gain.value = muted ? 0 : v; };
  sfx.setMuted = function (m) { muted = m; sfx.setVolume(R.settings.volume); };
  sfx.isMuted = function () { return muted; };

  function tone(f, dur, type, vol, slide, delay) {
    if (!ctx) return;
    var t = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, delay) {
    if (!ctx) return;
    var t = ctx.currentTime + (delay || 0);
    var s = ctx.createBufferSource(); s.buffer = noiseBuf;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
    var g = ctx.createGain(); g.gain.setValueAtTime(vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
  }
  sfx.tone = tone; sfx.noise = noise;
  // oscilador contínuo (teremim etc.)
  sfx.osc = function (type) {
    if (!ctx) return { set: function () {}, stop: function () {} };
    var o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = type || 'sine'; g.gain.value = 0; lfo.frequency.value = 5; lg.gain.value = 0;
    lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(master); o.start(); lfo.start();
    return {
      set: function (f, v, vib) { var t = ctx.currentTime; o.frequency.setTargetAtTime(f, t, 0.02); g.gain.setTargetAtTime(v, t, 0.03); lg.gain.setTargetAtTime(vib || 0, t, 0.05); },
      stop: function () { try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.02); o.stop(ctx.currentTime + 0.2); lfo.stop(ctx.currentTime + 0.2); } catch (e) {} }
    };
  };
  sfx.now = function () { return ctx ? ctx.currentTime : 0; };
  var last = {};
  sfx.play = function (name, p) {
    if (!ctx || muted) return;
    var now = ctx.currentTime; if (last[name] && now - last[name] < 0.025) return; last[name] = now;
    p = p || 1;
    switch (name) {
      case 'tick': tone(1800, 0.03, 'sine', 0.03); break;
      case 'click': tone(900, 0.06, 'triangle', 0.12, 0.6); break;
      case 'pop': tone(500 * p, 0.12, 'sine', 0.3, 2.2); noise(0.05, 0.1, 3000); break;
      case 'hit': noise(0.12, 0.35 * p, 900); tone(140, 0.1, 'square', 0.1, 0.5); break;
      case 'thud': tone(90, 0.18, 'sine', 0.4 * p, 0.5); noise(0.08, 0.15, 400); break;
      case 'coin': tone(988, 0.08, 'square', 0.1); tone(1319, 0.25, 'square', 0.1, 1, 0.08); break;
      case 'shoot': noise(0.15, 0.3, 2500); tone(700, 0.12, 'sawtooth', 0.1, 0.25); break;
      case 'laser': tone(1400, 0.18, 'sawtooth', 0.1, 0.2); break;
      case 'boom': noise(0.7, 0.6, 500); tone(60, 0.6, 'sine', 0.5, 0.4); break;
      case 'whoosh': noise(0.3, 0.2, 1600); break;
      case 'win': [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.25, 'triangle', 0.18, 1, i * 0.1); }); break;
      case 'lose': [400, 330, 262].forEach(function (f, i) { tone(f, 0.3, 'triangle', 0.18, 1, i * 0.15); }); break;
      case 'jump': tone(300, 0.2, 'square', 0.08, 2.4); break;
      case 'slice': noise(0.12, 0.25, 5000); tone(2000, 0.08, 'sine', 0.05, 0.5); break;
      case 'strike': noise(0.9, 0.5, 1800); for (var i = 0; i < 6; i++) tone(200 + Math.random() * 300, 0.15, 'triangle', 0.15, 0.7, i * 0.04); break;
      case 'roll': noise(0.5, 0.12 * p, 300); break;
      case 'error': tone(180, 0.25, 'square', 0.1); break;
      case 'note': tone(p, 0.6, 'triangle', 0.22); tone(p * 2, 0.4, 'sine', 0.05); break;
      case 'drum': noise(0.15, 0.4, p); tone(p / 20, 0.15, 'sine', 0.4, 0.5); break;
      case 'notify': tone(880, 0.12, 'sine', 0.12); tone(1320, 0.2, 'sine', 0.12, 1, 0.1); break;
      case 'splash': noise(0.4, 0.3, 2200); break;
      case 'firework': noise(1.0, 0.4, 900, 0.05); tone(1200, 0.4, 'sine', 0.06, 0.3); break;
    }
  };
})();
