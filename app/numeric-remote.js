(function () {
  'use strict';

  var buffer = '';
  var timer = null;
  var overlay = null;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'numericChannelOverlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '74px';
    overlay.style.right = '74px';
    overlay.style.zIndex = '80';
    overlay.style.padding = '20px 28px';
    overlay.style.borderRadius = '14px';
    overlay.style.background = 'rgba(0,0,0,.82)';
    overlay.style.color = '#fff';
    overlay.style.fontSize = '54px';
    overlay.style.fontWeight = '700';
    overlay.style.letterSpacing = '4px';
    overlay.style.display = 'none';
    document.body.appendChild(overlay);
    return overlay;
  }

  function getKeyName(event) {
    if (window.KoreaTVRemote && typeof window.KoreaTVRemote.getName === 'function') {
      return window.KoreaTVRemote.getName(event);
    }
    var key = event.key || '';
    var code = Number(event.keyCode || event.which || 0);
    if (/^[0-9]$/.test(key)) return key;
    if (code >= 48 && code <= 57) return String(code - 48);
    if (code >= 96 && code <= 105) return String(code - 96);
    return key;
  }

  function commit() {
    clearTimeout(timer);
    timer = null;
    var target = Number(buffer || 0);
    buffer = '';
    ensureOverlay().style.display = 'none';
    if (!target) return;

    // Do one direct tune. The previous implementation simulated Channel +/- N
    // times in a tight loop, repeatedly destroying the player and generating
    // stale HLS/video errors while it was still switching sources.
    if (window.KoreaTVPlayer && typeof window.KoreaTVPlayer.tuneToNumber === 'function') {
      window.KoreaTVPlayer.tuneToNumber(target);
    }
  }

  document.addEventListener('keydown', function (event) {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

    var keyName = getKeyName(event);
    if (/^[0-9]$/.test(keyName)) {
      event.preventDefault();
      event.stopPropagation();
      buffer = (buffer + keyName).slice(-3);
      var el = ensureOverlay();
      el.textContent = 'CH ' + buffer;
      el.style.display = 'block';
      clearTimeout(timer);
      timer = setTimeout(commit, 800);
      return;
    }

    if (keyName === 'Enter' && buffer) {
      event.preventDefault();
      event.stopPropagation();
      commit();
    }
  }, true);
}());
