(function () {
  'use strict';

  // V2 keeps the immutable Update 1 snapshot as the transport source, but
  // narrows presentation to the 45 owner-approved ordinary channels and injects
  // KBS1/KBS2 as dynamic official-provider identities. This also updates already
  // installed bootstrap shells without requiring a WGT reinstall.
  var PLAYLIST_REQUEST_PREFIX = 'https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u';
  var UPDATE1_SNAPSHOT_SHA = '6980522daa03f157393b597bb7cecf0c732f7b48';
  var PLAYLIST_CDN_URL = 'https://cdn.jsdelivr.net/gh/pryins-bit/tiz@' + UPDATE1_SNAPSHOT_SHA + '/korea.m3u';
  var PLAYLIST_RAW_FALLBACK = 'https://raw.githubusercontent.com/pryins-bit/tiz/' + UPDATE1_SNAPSHOT_SHA + '/korea.m3u';
  var KBS1_PAGE = 'https://onair.kbs.co.kr/index.html?sname=onair&stype=live&ch_code=11&ch_type=globalList';
  var KBS2_PAGE = 'https://onair.kbs.co.kr/index.html?sname=onair&stype=live&ch_code=12&ch_type=globalList';
  var ALLOWED_TVG_IDS = [
    'HLANDTV.kr@SD', 'HLATDTV.kr@SD', 'OBSGyeonginTV.kr', 'SBSTV.kr', 'HLDPDTV.kr@SD',
    'KBSWorld.kr@SD', 'ArirangUN.kr@SD', 'KCTV.kr@SD', 'NBS.kr@SD', 'NHTV.kr@SD',
    'KTV.kr@SD', 'NationalAssemblyTV.kr@SD', 'TBSTV.kr@SD', 'GugakTV.kr@SD',
    'GSMyShop.kr@SD', 'GSShop.kr@SD', 'HyundaiHomeShopping.kr@SD', 'LotteHomeShopping.kr@SD',
    'ShinsegaeTVShopping.kr@SD', 'ShoppingNT.kr@SD', 'WShopping.kr@SD', 'LotteOneTV.kr@SD',
    'BBSTV.kr@SD', 'BTNTV.kr@SD', '1c4de0451ea0c534', '406f02c36fb0bbf1',
    'af16af24e5f20960', '9ef68bf1f70e70cc', '05f68da886351d47', 'eaa3ed55fee9d4f4',
    '27ac5c3d7a0804bd', '73e33b20d6e24a46', '481692dcd69648d3', 'a72fdf2094abe782',
    '4cdb7f1638ed16ed', '992b6985e7bd5b52', '77318ecb610c4d51', '278c76a81570bb46',
    'b913a82ad1339712', '9cfd89b909b48a6c', 'a204567db85d2bc8', 'e3a3870360bb68d5',
    '5ce3daa40449da98', '1909781e5872797b', 'TVChosun2.kr@SD'
  ];
  var allowed = {};
  ALLOWED_TVG_IDS.forEach(function (id) { allowed[String(id).toLowerCase()] = true; });

  var nativeFetch = window.fetch;

  function playlistAttr(meta, name) {
    var match = new RegExp(name + '="([^"]*)"', 'i').exec(meta || '');
    return match ? match[1] : '';
  }

  function prepareV2Playlist(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var output = [
      '#EXTM3U',
      '#EXTINF:-1 tvg-id="KBS1.official" group-title="공중파",KBS1 (KBS 공식 동적)',
      KBS1_PAGE,
      '#EXTINF:-1 tvg-id="KBS2.official" group-title="공중파",KBS2 (KBS 공식 동적)',
      KBS2_PAGE
    ];
    var seen = {};

    for (var i = 0; i < lines.length; i += 1) {
      var line = String(lines[i] || '').trim();
      if (line.indexOf('#EXTINF:') !== 0) continue;
      var id = playlistAttr(line, 'tvg-id');
      var key = id.toLowerCase();
      var media = i + 1 < lines.length ? String(lines[i + 1] || '').trim() : '';
      if (!allowed[key] || seen[key] || !/^https?:\/\//i.test(media)) continue;
      seen[key] = true;
      output.push(line);
      output.push(media);
      i += 1;
    }

    return output.join('\n') + '\n';
  }

  function playlistResponse(response, text) {
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      headers: response.headers,
      text: function () { return Promise.resolve(text); }
    };
  }

  function fetchPreparedPlaylist(url, init) {
    return nativeFetch.call(window, url, init).then(function (response) {
      if (!response || !response.ok) throw new Error('playlist HTTP ' + (response ? response.status : 'unknown'));
      return response.text().then(function (text) {
        return playlistResponse(response, prepareV2Playlist(text));
      });
    });
  }

  if (typeof nativeFetch === 'function') {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url ? String(input.url) : '');
      if (url.indexOf(PLAYLIST_REQUEST_PREFIX) === 0) {
        var nextInit = {};
        var sourceInit = init || {};
        Object.keys(sourceInit).forEach(function (key) { nextInit[key] = sourceInit[key]; });
        nextInit.cache = 'default';
        return fetchPreparedPlaylist(PLAYLIST_CDN_URL, nextInit).catch(function () {
          return fetchPreparedPlaylist(PLAYLIST_RAW_FALLBACK, nextInit);
        });
      }
      return nativeFetch.call(window, input, init);
    };
  }

  // KBS1/KBS2 are not fixed M3U8 entries. The stable playlist URL is only an
  // identity. Resolve the transient service_url from the official KBS API every
  // time the user selects KBS1 or KBS2.
  var KBS_API_BASE = 'https://cfpwwwapi.kbs.co.kr/api/v1/landing/live/channel_code/';

  function kbsChannelCode(url) {
    var text = String(url || '');
    if (text.indexOf('https://onair.kbs.co.kr/') !== 0) return '';
    var match = /[?&]ch_code=(11|12)(?:&|$)/.exec(text);
    return match ? match[1] : '';
  }

  function resolveKbsStream(channelCode) {
    if (typeof nativeFetch !== 'function') return Promise.reject(new Error('fetch unavailable'));
    return nativeFetch.call(window, KBS_API_BASE + channelCode + '?_=' + Date.now(), {
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'Accept': 'application/json' }
    }).then(function (response) {
      if (!response || !response.ok) {
        throw new Error('KBS live API HTTP ' + (response ? response.status : 'unknown'));
      }
      return response.json();
    }).then(function (data) {
      var item = data && data.channel_item && data.channel_item[0];
      var serviceUrl = item && item.service_url ? String(item.service_url) : '';
      if (!/^https?:\/\//i.test(serviceUrl)) throw new Error('KBS live API service_url missing');
      return serviceUrl;
    });
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

    var kbsCode = kbsChannelCode(url);
    if (kbsCode) {
      var requestToken = generation;
      diagnostics.url = String(url);
      diagnostics.lastError = '';
      diagnostics.buffering = true;
      if (callbacks && typeof callbacks.onbuffering === 'function') callbacks.onbuffering(true);
      resolveKbsStream(kbsCode).then(function (serviceUrl) {
        if (requestToken !== generation) return;
        diagnostics.buffering = false;
        if (callbacks && typeof callbacks.onbuffering === 'function') callbacks.onbuffering(false);
        start(serviceUrl, callbacks);
      }).catch(function (error) {
        if (requestToken !== generation) return;
        diagnostics.buffering = false;
        fail(callbacks, requestToken, error);
      });
      return true;
    }

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
