(function () {
  'use strict';

  // Runtime-level recovery for already-installed WGTs. Older bootstrap shells
  // can update this file, so intercept the one known playlist URL here before
  // main.js starts. If raw.githubusercontent.com hangs on Samsung Tizen, switch
  // to the fixed jsDelivr mirror instead of leaving the app on the loading text.
  var PLAYLIST_RAW = 'https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u';
  var PLAYLIST_CDN = 'https://cdn.jsdelivr.net/gh/pryins-bit/tiz@main/korea.m3u';
  var PLAYLIST_TIMEOUT_MS = 1600;
  var PLAYLIST_CDN_TIMEOUT_MS = 2800;

  function installPlaylistFetchGuard() {
    if (typeof window.fetch !== 'function' || window.__koreaTvPlaylistFetchGuard) return;
    window.__koreaTvPlaylistFetchGuard = true;
    var nativeFetch = window.fetch.bind(window);

    function timedFetch(url, options, timeoutMs) {
      return new Promise(function (resolve, reject) {
        var settled = false;
        var timer = setTimeout(function () {
          if (settled) return;
          settled = true;
          reject(new Error('playlist fetch timeout'));
        }, timeoutMs);
        nativeFetch(url, options).then(function (response) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (!response || !response.ok) {
            reject(new Error('playlist HTTP ' + (response ? response.status : 'unknown')));
            return;
          }
          resolve(response);
        }).catch(function (error) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        });
      });
    }

    window.fetch = function (input, options) {
      var url = typeof input === 'string' ? input : String(input && input.url || '');
      if (url.indexOf(PLAYLIST_RAW) !== 0) return nativeFetch(input, options);

      var cleanOptions = options || {};
      return timedFetch(input, cleanOptions, PLAYLIST_TIMEOUT_MS).catch(function () {
        var mirror = PLAYLIST_CDN + '?t=' + Date.now();
        return timedFetch(mirror, { cache: 'no-store' }, PLAYLIST_CDN_TIMEOUT_MS);
      });
    };

    window.KoreaTVPlaylistFetchGuard = {
      raw: PLAYLIST_RAW,
      fallback: PLAYLIST_CDN,
      timeoutMs: PLAYLIST_TIMEOUT_MS
    };
  }

  installPlaylistFetchGuard();

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
