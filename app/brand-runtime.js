(function () {
  'use strict';

  // Legacy stability shim: keep the standalone app focused on live TV only.
  // This intentionally disables Mom OS/dashboard code while the player is being
  // stabilized. It runs before main.js and waits for KoreaTVPlayer to exist.
  window.SuniTVBrandDiagnostics = { mode: 'legacy-channel-only', loaded: true, playbackLayer: 'H6' };

  function installPlaybackLayer() {
    if (document.getElementById('suniPlaybackLayerFix')) return;
    var style = document.createElement('style');
    style.id = 'suniPlaybackLayerFix';
    style.type = 'text/css';
    style.textContent = '' +
      '#av-player{position:fixed!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;width:100%!important;height:100%!important;z-index:0!important;background:#000!important;}' +
      '#video{position:fixed!important;left:0!important;top:0!important;width:100%!important;height:100%!important;z-index:1!important;}' +
      '#video.avplay-active{visibility:hidden!important;background:transparent!important;}' +
      'body::after{content:"H6 AVPLAY"!important;}';
    (document.head || document.documentElement).appendChild(style);

    var diag = document.getElementById('avplayDiag');
    if (!diag) {
      diag = document.createElement('div');
      diag.id = 'avplayDiag';
      diag.style.cssText = 'position:fixed;left:12px;bottom:8px;z-index:98;padding:4px 7px;border-radius:5px;background:rgba(0,0,0,.55);color:#fff;font:12px Arial,sans-serif;opacity:.72;pointer-events:none;';
      diag.textContent = 'H6 · AV 확인 중';
      document.body.appendChild(diag);
    }

    function updateDiag() {
      var av = window.KoreaTVAVPlay;
      var d = window.KoreaTVAVPlayDiagnostics || (av && av.diagnostics) || {};
      var player = window.KoreaTVPlayer;
      var state = d.state || 'NONE';
      try { if (av && typeof av.state === 'function') state = av.state() || state; } catch (e) {}
      var available = !!(av && typeof av.isAvailable === 'function' && av.isAvailable());
      var active = !!(av && typeof av.isActive === 'function' && av.isActive());
      var channel = 0;
      try { if (player && typeof player.currentNumber === 'function') channel = Number(player.currentNumber()) || 0; } catch (e2) {}
      var error = String(d.lastError || '');
      if (error.length > 42) error = error.slice(0, 42);
      diag.textContent = 'H6 · AV:' + (available ? state : 'UNAVAILABLE') + (active ? ' PLAY' : '') + ' · CH:' + channel + (error ? ' · ' + error : '');
    }
    updateDiag();
    setInterval(updateDiag, 500);
  }

  function hidePanels() {
    ['momHome', 'tvHome', 'browserPanel', 'searchPanel'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.classList.contains('hidden')) el.classList.add('hidden');
    });
    var dim = document.getElementById('dim');
    if (dim) dim.classList.add('hidden');
  }

  function forceLive() {
    hidePanels();
    var player = window.KoreaTVPlayer;
    if (!player || typeof player.tuneToNumber !== 'function' || typeof player.currentNumber !== 'function' || typeof player.channelCount !== 'function') return false;
    var total = Number(player.channelCount());
    var current = Number(player.currentNumber());
    if (!total) return false;
    if (!current || current < 1 || current > total) current = 1;
    try { return player.tuneToNumber(current) !== false; } catch (e) { return false; }
  }

  var tries = 0;
  function boot() {
    tries += 1;
    if (forceLive()) {
      // Old stable runtime used to open a home overlay shortly after playlist
      // load. Re-assert live mode after that window as a one-time safety net.
      setTimeout(forceLive, 1300);
      setTimeout(forceLive, 2600);
      return;
    }
    if (tries < 40) setTimeout(boot, 250);
  }

  function start() {
    installPlaybackLayer();
    setTimeout(boot, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
