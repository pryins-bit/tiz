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

  function fireArrowUp() {
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', keyCode: 38, which: 38, bubbles: true }));
    } catch (e) {
      var evt = document.createEvent('Event');
      evt.initEvent('keydown', true, true);
      evt.key = 'ArrowUp';
      evt.keyCode = 38;
      evt.which = 38;
      document.dispatchEvent(evt);
    }
  }

  function fireArrowDown() {
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, which: 40, bubbles: true }));
    } catch (e) {
      var evt = document.createEvent('Event');
      evt.initEvent('keydown', true, true);
      evt.key = 'ArrowDown';
      evt.keyCode = 40;
      evt.which = 40;
      document.dispatchEvent(evt);
    }
  }

  function commit() {
    clearTimeout(timer);
    timer = null;
    var target = Number(buffer || 0);
    buffer = '';
    ensureOverlay().style.display = 'none';
    var info = currentInfo();
    if (!info || !target || target > info.total || target === info.current) return;

    var forward = (target - info.current + info.total) % info.total;
    var backward = (info.current - target + info.total) % info.total;
    var useForward = forward <= backward;
    var count = useForward ? forward : backward;
    for (var i = 0; i < count; i += 1) {
      if (useForward) fireArrowUp(); else fireArrowDown();
    }
  }

  document.addEventListener('keydown', function (event) {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (panelsOpen()) return;

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
