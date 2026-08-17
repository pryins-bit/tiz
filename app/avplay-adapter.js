(function () {
  'use strict';

  // Playlist transport guard: the PR #27 main.js deliberately cache-busts the
  // raw GitHub URL on every launch (`?t=...` + no-store). On TV this can hit
  // raw.githubusercontent.com rate limiting (HTTP 429). Rewrite only that one
  // playlist request to jsDelivr's GitHub CDN, without touching the runtime
  // updater or any channel stream URL. If the CDN fails, retry the stable raw
  // URL once without the cache-busting query string.
  var PLAYLIST_RAW_PREFIX = 'https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u';
  var PLAYLIST_CDN_URL = 'https://cdn.jsdelivr.net/gh/pryins-bit/tiz@main/korea.m3u';
  var nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url ? String(input.url) : '');
      if (url.indexOf(PLAYLIST_RAW_PREFIX) === 0) {
        var nextInit = {};
        var sourceInit = init || {};
        Object.keys(sourceInit).forEach(function (key) { nextInit[key] = sourceInit[key]; });
        nextInit.cache = 'default';
        return nativeFetch.call(window, PLAYLIST_CDN_URL, nextInit)
          .then(function (response) {
            if (response && response.ok) return response;
            return nativeFetch.call(window, PLAYLIST_RAW_PREFIX, nextInit);
          })
          .catch(function () {
            return nativeFetch.call(window, PLAYLIST_RAW_PREFIX, nextInit);
          });
      }
      return nativeFetch.call(window, input, init);
    };
  }

  // Samsung-native playback adapter for live HLS. The lifecycle follows
  // SamsungDForum/PlayerAVPlay (MIT-style license) and current Samsung AVPlay
  // documentation: open -> setListener/display -> prepareAsync -> play.
  // AVPlay is preferred on Samsung TVs because it uses the TV multimedia
  // pipeline directly; HTML5 video/hls.js remains the fallback in main.js.

  var generation = 0;
  var active = false;
  var paused = false;
  var currentUrl = '';
  var diagnostics = {
    available: false,
    active: false,
    state: 'NONE',
    url: '',
    lastError: '',
    buffering: false,
    starts: 0,
    stops: 0
  };

  window.KoreaTVAVPlayDiagnostics = diagnostics;

  function manager() {
    try {
      if (window.webapis && window.webapis.avplay) return window.webapis.avplay;
    } catch (e) {}
    return null;
  }

  function refreshState() {
    var av = manager();
    diagnostics.available = !!av;
    if (!av) {
      diagnostics.state = 'NONE';
      return 'NONE';
    }
    try {
      diagnostics.state = av.getState();
    } catch (e) {
      diagnostics.state = active ? 'UNKNOWN' : 'NONE';
    }
    return diagnostics.state;
  }

  function safeCall(fn) {
    try { return fn(); } catch (e) { return null; }
  }

  function stopInternal(invalidate) {
    if (invalidate !== false) generation += 1;
    var av = manager();
    if (av) {
      safeCall(function () { av.stop(); });
      safeCall(function () { av.close(); });
    }
    active = false;
    paused = false;
    currentUrl = '';
    diagnostics.active = false;
    diagnostics.url = '';
    diagnostics.buffering = false;
    diagnostics.stops += 1;
    refreshState();
  }

  function fail(callbacks, token, error) {
    if (token !== generation) return;
    var text = String(error && (error.message || error.name) || error || 'AVPlay error');
    diagnostics.lastError = text;
    diagnostics.buffering = false;
    if (callbacks && typeof callbacks.onerror === 'function') callbacks.onerror(text);
  }

  function start(url, callbacks) {
    var av = manager();
    diagnostics.available = !!av;
    if (!av || !url) return false;

    stopInternal(false);
    generation += 1;
    var token = generation;
    currentUrl = String(url);
    diagnostics.url = currentUrl;
    diagnostics.lastError = '';
    diagnostics.starts += 1;

    var listener = {
      onbufferingstart: function () {
        if (token !== generation) return;
        diagnostics.buffering = true;
        if (callbacks && typeof callbacks.onbuffering === 'function') callbacks.onbuffering(true);
      },
      onbufferingprogress: function () {},
      onbufferingcomplete: function () {
        if (token !== generation) return;
        diagnostics.buffering = false;
        if (callbacks && typeof callbacks.onbuffering === 'function') callbacks.onbuffering(false);
      },
      oncurrentplaytime: function () {},
      onstreamcompleted: function () {
        fail(callbacks, token, 'stream-completed');
      },
      onevent: function () {},
      onerror: function (errorType) {
        fail(callbacks, token, errorType || 'avplay-error');
      },
      onerrormsg: function (errorType, errorMsg) {
        fail(callbacks, token, String(errorType || '') + (errorMsg ? ': ' + errorMsg : ''));
      }
    };

    try {
      av.open(currentUrl);
      av.setListener(listener);
      av.setDisplayRect(0, 0, 1920, 1080);
      try { av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (e1) {}
      av.prepareAsync(
        function () {
          if (token !== generation) return;
          try {
            av.play();
            active = true;
            paused = false;
            diagnostics.active = true;
            diagnostics.buffering = false;
            refreshState();
            if (callbacks && typeof callbacks.onplaying === 'function') callbacks.onplaying();
          } catch (error) {
            fail(callbacks, token, error);
          }
        },
        function (error) { fail(callbacks, token, error); }
      );
      refreshState();
      return true;
    } catch (error) {
      fail(callbacks, token, error);
      stopInternal(false);
      return false;
    }
  }

  function pause() {
    var av = manager();
    if (!av || !active) return false;
    try {
      var state = av.getState();
      if (state === 'PLAYING') av.pause();
      paused = true;
      refreshState();
      return true;
    } catch (e) {
      diagnostics.lastError = String(e && (e.message || e.name) || e);
      return false;
    }
  }

  function resume() {
    var av = manager();
    if (!av || !active) return false;
    try {
      var state = av.getState();
      if (state === 'PAUSED' || state === 'READY') av.play();
      paused = false;
      refreshState();
      return true;
    } catch (e) {
      diagnostics.lastError = String(e && (e.message || e.name) || e);
      return false;
    }
  }

  function toggle() {
    if (!active) return false;
    return paused ? resume() : pause();
  }

  window.KoreaTVAVPlay = {
    isAvailable: function () { return !!manager(); },
    isActive: function () { return active; },
    isPaused: function () { return paused; },
    start: start,
    stop: function () { stopInternal(true); },
    pause: pause,
    resume: resume,
    toggle: toggle,
    diagnostics: diagnostics,
    state: refreshState
  };

  refreshState();
}());