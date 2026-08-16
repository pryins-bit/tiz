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

  function panelsOpen() {
    var ids = ['tvHome', 'browserPanel', 'searchPanel', 'momHome'];
    for (var i = 0; i < ids.length; i += 1) {
      var el = document.getElementById(ids[i]);
      if (el && !el.classList.contains('hidden')) return true;
    }
    return false;
  }

  function currentInfo() {
    var text = String((document.getElementById('channelName') || {}).textContent || '');
    var m = /^\s*(\d+)\s*\/\s*(\d+)/.exec(text);
    return m ? { current: Number(m[1]), total: Number(m[2]) } : null;
  }

  function makeKeyEvent(key, code) {
    var event;
    try {
      event = new KeyboardEvent('keydown', { key: key, keyCode: code, which: code, bubbles: true, cancelable: true });
    } catch (e) {
      event = document.createEvent('Event');
      event.initEvent('keydown', true, true);
      event.key = key;
      event.keyCode = code;
      event.which = code;
    }
    try { event.__koreaTVNumericSynthetic = true; } catch (e2) {}
    return event;
  }

  function fireKey(key, code) {
    document.dispatchEvent(makeKeyEvent(key, code));
  }

  function closePanelsForTuning() {
    // The TV home opens automatically after startup. The old implementation
    // ignored every numeric key while any panel was open, making channel-number
    // entry appear completely broken. Close the current panel through the same
    // public UI/key paths that main.js already uses, keeping its internal state
    // consistent.
    for (var attempts = 0; attempts < 4 && panelsOpen(); attempts += 1) {
      var home = document.getElementById('tvHome');
      if (home && !home.classList.contains('hidden')) {
        var continueButton = home.querySelector('[data-action="continue"]');
        if (continueButton && typeof continueButton.click === 'function') {
          continueButton.click();
          continue;
        }
      }
      fireKey('Back', 10009);
    }
  }

  function fireChannelUp() { fireKey('ChannelUp', 427); }
  function fireChannelDown() { fireKey('ChannelDown', 428); }

  function commit() {
    clearTimeout(timer);
    timer = null;
    var target = Number(buffer || 0);
    buffer = '';
    ensureOverlay().style.display = 'none';
    var info = currentInfo();
    if (!info || !target || target > info.total || target === info.current) return;

    closePanelsForTuning();

    // Channel +/- is handled by main.js using the documented Samsung keyCodes
    // 427/428 even when event.key is absent. Use those codes rather than arrow
    // events so panel focus logic cannot accidentally consume numeric tuning.
    var forward = (target - info.current + info.total) % info.total;
    var backward = (info.current - target + info.total) % info.total;
    var useForward = forward <= backward;
    var count = useForward ? forward : backward;
    for (var i = 0; i < count; i += 1) {
      if (useForward) fireChannelUp(); else fireChannelDown();
    }
  }

  document.addEventListener('keydown', function (event) {
    if (event.__koreaTVNumericSynthetic) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

    var key = event.key || '';
    var code = event.keyCode || event.which;
    var digit = '';
    if (/^[0-9]$/.test(key)) digit = key;
    else if (code >= 48 && code <= 57) digit = String(code - 48);
    else if (code >= 96 && code <= 105) digit = String(code - 96);

    if (digit) {
      event.preventDefault();
      event.stopPropagation();
      buffer = (buffer + digit).slice(-3);
      var el = ensureOverlay();
      el.textContent = 'CH ' + buffer;
      el.style.display = 'block';
      clearTimeout(timer);
      timer = setTimeout(commit, 900);
      return;
    }

    if ((key === 'Enter' || code === 13) && buffer) {
      event.preventDefault();
      event.stopPropagation();
      commit();
    }
  }, true);
}());
