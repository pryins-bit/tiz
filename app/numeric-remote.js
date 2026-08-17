(function () {
  'use strict';

  // Runtime-level recovery for already-installed WGTs. This file executes before
  // main.js, so it can keep a slow playlist request from blocking Mom OS startup.
  var PLAYLIST_RAW = 'https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u';
  var PLAYLIST_CDN = 'https://cdn.jsdelivr.net/gh/pryins-bit/tiz@main/korea.m3u';
  var PLAYLIST_RESCUE = 'https://inzopchhmvljprbpvzcs.supabase.co/functions/v1/tv-runtime?path=' + encodeURIComponent('korea.m3u');
  var PLAYLIST_TIMEOUT_MS = 1800;

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

    function firstPlaylist() {
      var urls = [
        PLAYLIST_RAW + '?t=' + Date.now(),
        PLAYLIST_CDN + '?t=' + Date.now(),
        PLAYLIST_RESCUE + '&t=' + Date.now()
      ];
      return new Promise(function (resolve, reject) {
        var remaining = urls.length;
        var done = false;
        var lastError = null;
        urls.forEach(function (url) {
          timedFetch(url, { cache: 'no-store' }, PLAYLIST_TIMEOUT_MS).then(function (response) {
            if (done) return;
            done = true;
            resolve(response);
          }).catch(function (error) {
            lastError = error;
            remaining -= 1;
            if (!done && remaining === 0) reject(lastError || new Error('playlist unavailable'));
          });
        });
      });
    }

    window.fetch = function (input, options) {
      var url = typeof input === 'string' ? input : String(input && input.url || '');
      if (url.indexOf(PLAYLIST_RAW) !== 0 && url.indexOf(PLAYLIST_CDN) !== 0) {
        return nativeFetch(input, options);
      }
      return firstPlaylist();
    };

    window.KoreaTVPlaylistFetchGuard = {
      raw: PLAYLIST_RAW,
      fallback: PLAYLIST_CDN,
      rescue: PLAYLIST_RESCUE,
      timeoutMs: PLAYLIST_TIMEOUT_MS
    };
  }

  // Mom OS must be usable even when every playlist source is slow. main.js has
  // already attached the document click handler while its fetch promise waits,
  // so activating the existing Mom button enters the real openMom() path rather
  // than faking DOM state. Retry briefly only to cover script scheduling order.
  function ensureMomHomeStarts(attempt) {
    setTimeout(function () {
      var mom = document.getElementById('momHome');
      if (mom && !mom.classList.contains('hidden')) return;
      var button = document.querySelector('[data-action="mom"]');
      if (button && typeof button.click === 'function') {
        try { button.click(); } catch (e) {}
      }
      mom = document.getElementById('momHome');
      if ((!mom || mom.classList.contains('hidden')) && attempt < 8) {
        ensureMomHomeStarts(attempt + 1);
      }
    }, attempt === 0 ? 120 : 220);
  }

  installPlaylistFetchGuard();
  ensureMomHomeStarts(0);

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
