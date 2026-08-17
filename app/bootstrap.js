(function () {
  'use strict';

  var RAW_BASE = 'https://raw.githubusercontent.com/pryins-bit/tiz/main/app/';
  var CDN_BASE = 'https://cdn.jsdelivr.net/gh/pryins-bit/tiz@main/app/';
  var RESCUE_BASE = 'https://inzopchhmvljprbpvzcs.supabase.co/functions/v1/tv-runtime?path=';
  var PLAYLIST_RAW = 'https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u';
  var PLAYLIST_CDN = 'https://cdn.jsdelivr.net/gh/pryins-bit/tiz@main/korea.m3u';
  var PLAYLIST_RESCUE = RESCUE_BASE + encodeURIComponent('korea.m3u');
  var PLAYLIST_LOCAL = 'korea.m3u';
  var PACKAGED_VERSION = '2026.08.17.5';
  var CHECK_BUDGET_MS = 450;
  var NETWORK_REQUEST_TIMEOUT_MS = 3500;
  var PLAYLIST_FALLBACK_TIMEOUT_MS = 1800;
  var LOCAL_PLAYLIST_TIMEOUT_MS = 1200;
  // R5 intentionally starts a fresh cache namespace. A previously cached
  // runtime can contain the pre-rescue startup path and must not outrank the
  // packaged R5 runtime after the shell itself has been replaced.
  var CACHE_KEY = 'korea_tv_runtime_cache_v3';
  var CACHE_VERSION_KEY = 'korea_tv_runtime_version_v3';
  var DEFAULT_FILES = ['brand-runtime.js', 'remote-input.js', 'numeric-remote.js', 'avplay-adapter.js', 'main.js', 'style.css'];
  var started = false;
  var nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;

  var diagnostics = {
    shellBuild: window.KoreaTVShellBuild || PACKAGED_VERSION,
    runtimeSource: 'packaged',
    playlistSource: '',
    lastNetworkError: '',
    rescueEnabled: true
  };
  window.KoreaTVBootstrapDiagnostics = diagnostics;

  function safeJson(text, fallback) {
    try { return JSON.parse(text); } catch (e) { return fallback; }
  }

  function cacheBust(url) {
    return String(url || '') + (String(url || '').indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
  }

  function rescuePath(path) {
    return RESCUE_BASE + encodeURIComponent('app/' + path);
  }

  function hasRequiredFiles(files) {
    if (!files) return false;
    for (var i = 0; i < DEFAULT_FILES.length; i += 1) {
      if (!files[DEFAULT_FILES[i]]) return false;
    }
    return true;
  }

  function readCachedBundle() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = safeJson(raw, null);
      if (!parsed || !parsed.version || !hasRequiredFiles(parsed.files)) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function writeCachedBundle(bundle) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(bundle));
      localStorage.setItem(CACHE_VERSION_KEY, bundle.version);
    } catch (e) {}
  }

  function currentVersion() {
    var cached = readCachedBundle();
    return cached && cached.version ? cached.version : PACKAGED_VERSION;
  }

  function timedFetch(url, options, timeoutMs) {
    if (!nativeFetch) return Promise.reject(new Error('fetch unavailable'));
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error('network timeout: ' + url));
      }, timeoutMs);
      nativeFetch(url, options || {}).then(function (response) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(response);
      }, function (error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function firstOk(urls, options, timeoutMs, sourceNames) {
    return new Promise(function (resolve, reject) {
      var remaining = urls.length;
      var settled = false;
      var lastError = null;

      function failed(error) {
        lastError = error || lastError;
        remaining -= 1;
        if (!settled && remaining <= 0) {
          settled = true;
          reject(lastError || new Error('all network sources failed'));
        }
      }

      urls.forEach(function (url, index) {
        timedFetch(cacheBust(url), options, timeoutMs).then(function (response) {
          if (settled) return;
          if (!response || !response.ok) {
            failed(new Error('HTTP ' + (response ? response.status : 0) + ' ' + url));
            return;
          }
          settled = true;
          if (sourceNames && sourceNames[index]) diagnostics.runtimeSource = sourceNames[index];
          resolve(response);
        }).catch(failed);
      });
    });
  }

  function playlistSourceName(response) {
    var url = String(response && response.url || '');
    if (url.indexOf('supabase.co') >= 0) return 'supabase-rescue';
    if (url.indexOf('jsdelivr.net') >= 0) return 'jsdelivr';
    if (url.indexOf('korea.m3u') >= 0 && url.indexOf('http') !== 0) return 'packaged-shell-race';
    return 'github-raw';
  }

  function installPlaylistFetchFallback() {
    if (!nativeFetch) return;
    window.fetch = function (url, options) {
      var target = String(url || '');
      var isPlaylist = target.indexOf(PLAYLIST_RAW) === 0 || target.indexOf(PLAYLIST_CDN) === 0 || target.indexOf(PLAYLIST_RESCUE) === 0;
      if (!isPlaylist) return nativeFetch(url, options);

      return firstOk(
        [PLAYLIST_RAW, PLAYLIST_CDN, PLAYLIST_RESCUE],
        options || { cache: 'no-store' },
        PLAYLIST_FALLBACK_TIMEOUT_MS,
        null
      ).then(function (response) {
        diagnostics.playlistSource = playlistSourceName(response);
        diagnostics.lastNetworkError = '';
        return response;
      }).catch(function (remoteError) {
        diagnostics.lastNetworkError = String(remoteError && (remoteError.message || remoteError.name) || remoteError);
        return timedFetch(PLAYLIST_LOCAL, options || {}, LOCAL_PLAYLIST_TIMEOUT_MS).then(function (response) {
          if (!response || !response.ok) throw new Error('packaged playlist unavailable');
          diagnostics.playlistSource = 'packaged';
          return response;
        });
      });
    };
  }

  function fetchTextPath(path) {
    return firstOk(
      [RAW_BASE + path, CDN_BASE + path, rescuePath(path)],
      { cache: 'no-store' },
      NETWORK_REQUEST_TIMEOUT_MS,
      ['github-raw', 'jsdelivr', 'supabase-rescue']
    ).then(function (response) {
      diagnostics.lastNetworkError = '';
      return response.text();
    }).catch(function (error) {
      diagnostics.lastNetworkError = String(error && (error.message || error.name) || error);
      throw error;
    });
  }

  function fetchManifest() {
    return fetchTextPath('runtime-version.json').then(function (text) {
      var manifest = safeJson(text, null);
      if (!manifest || !manifest.version) throw new Error('invalid runtime manifest');
      if (!Array.isArray(manifest.files) || !manifest.files.length) manifest.files = DEFAULT_FILES.slice();
      return manifest;
    });
  }

  function fetchBundle(manifest) {
    var files = manifest.files || DEFAULT_FILES;
    var jobs = files.map(function (name) {
      return fetchTextPath(name).then(function (text) {
        if (!text || text.length < 20) throw new Error('empty runtime file: ' + name);
        return { name: name, text: text };
      });
    });
    return Promise.all(jobs).then(function (items) {
      var map = {};
      items.forEach(function (item) { map[item.name] = item.text; });
      DEFAULT_FILES.forEach(function (name) {
        if (!map[name]) throw new Error('runtime missing required file: ' + name);
      });
      return { version: manifest.version, files: map, savedAt: Date.now() };
    });
  }

  function injectStyle(css) {
    var old = document.getElementById('koreaTvRuntimeStyle');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var style = document.createElement('style');
    style.id = 'koreaTvRuntimeStyle';
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function injectScript(name, code) {
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.setAttribute('data-runtime-file', name);
    script.text = code + '\n//# sourceURL=' + name;
    document.head.appendChild(script);
  }

  function runBundle(bundle) {
    if (started) return;
    started = true;
    try {
      injectStyle(bundle.files['style.css']);
      injectScript('brand-runtime.js', bundle.files['brand-runtime.js']);
      injectScript('remote-input.js', bundle.files['remote-input.js']);
      injectScript('numeric-remote.js', bundle.files['numeric-remote.js']);
      injectScript('avplay-adapter.js', bundle.files['avplay-adapter.js']);
      injectScript('main.js', bundle.files['main.js']);
    } catch (error) {
      started = false;
      throw error;
    }
  }

  function runPackaged() {
    if (started) return;
    started = true;
    diagnostics.runtimeSource = 'packaged';
    var names = ['brand-runtime.js', 'remote-input.js', 'numeric-remote.js', 'avplay-adapter.js', 'main.js'];
    names.forEach(function (name) {
      var script = document.createElement('script');
      script.src = name;
      script.async = false;
      document.head.appendChild(script);
    });
  }

  function runCurrent() {
    var cached = readCachedBundle();
    if (cached && cached.files) {
      try {
        diagnostics.runtimeSource = 'cache';
        runBundle(cached);
        return;
      } catch (e) {}
    }
    runPackaged();
  }

  function refreshForNextLaunch(manifest) {
    if (!manifest || manifest.version === currentVersion()) return Promise.resolve();
    return fetchBundle(manifest).then(function (bundle) {
      writeCachedBundle(bundle);
    }).catch(function () {});
  }

  installPlaylistFetchFallback();

  var manifestPromise = fetchManifest();
  var budgetPromise = new Promise(function (resolve) {
    setTimeout(function () { resolve({ timeout: true }); }, CHECK_BUDGET_MS);
  });

  Promise.race([
    manifestPromise.then(function (manifest) { return { manifest: manifest }; }),
    budgetPromise
  ]).then(function (winner) {
    if (winner && winner.timeout) {
      runCurrent();
      manifestPromise.then(refreshForNextLaunch).catch(function () {});
      return;
    }

    var manifest = winner.manifest;
    if (!manifest || manifest.version === currentVersion()) {
      runCurrent();
      return;
    }

    fetchBundle(manifest).then(function (bundle) {
      writeCachedBundle(bundle);
      runBundle(bundle);
    }).catch(function () {
      runCurrent();
    });
  }).catch(function () {
    runCurrent();
  });
}());
