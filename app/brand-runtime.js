(function () {
  'use strict';

  // Legacy stability shim: keep the standalone app focused on live TV only.
  // This intentionally disables Mom OS/dashboard code while the player is being
  // stabilized. It runs before main.js and waits for KoreaTVPlayer to exist.
  window.SuniTVBrandDiagnostics = { mode: 'legacy-channel-only', loaded: true };

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
  } else {
    setTimeout(boot, 0);
  }
}());
