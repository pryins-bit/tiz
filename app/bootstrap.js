(function () {
  'use strict';

  var BASE = 'https://raw.githubusercontent.com/pryins-bit/tiz/main/app/';
  var MANIFEST_URL = BASE + 'runtime-version.json';
  var PACKAGED_VERSION = '2026.08.17.2';
  var CHECK_BUDGET_MS = 450;
  var CACHE_KEY = 'korea_tv_runtime_cache_v2';
  var CACHE_VERSION_KEY = 'korea_tv_runtime_version_v2';
  var DEFAULT_FILES = ['brand-runtime.js', 'remote-input.js', 'numeric-remote.js', 'avplay-adapter.js', 'main.js', 'style.css'];
  var started = false;

  function safeJson(text, fallback) {
    try { return JSON.parse(text); } catch (e) { return fallback; }
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

  function fetchText(url) {
    return fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now(), {
      cache: 'no-store'
    }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + url);
      return response.text();
    });
  }

  function fetchManifest() {
    return fetchText(MANIFEST_URL).then(function (text) {
      var manifest = safeJson(text, null);
      if (!manifest || !manifest.version) throw new Error('invalid runtime manifest');
      if (!Array.isArray(manifest.files) || !manifest.files.length) manifest.files = DEFAULT_FILES.slice();
      return manifest;
    });
  }

  function fetchBundle(manifest) {
    var files = manifest.files || DEFAULT_FILES;
    var jobs = files.map(function (name) {
      return fetchText(BASE + name).then(function (text) {
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
      try { runBundle(cached); return; } catch (e) {}
    }
    runPackaged();
  }

  function refreshForNextLaunch(manifest) {
    if (!manifest || manifest.version === currentVersion()) return Promise.resolve();
    return fetchBundle(manifest).then(function (bundle) {
      writeCachedBundle(bundle);
    }).catch(function () {});
  }

  var manifestPromise = fetchManifest();
  var budgetPromise = new Promise(function (resolve) {
    setTimeout(function () { resolve({ timeout: true }); }, CHECK_BUDGET_MS);
  });

  Promise.race([
    manifestPromise.then(function (manifest) { return { manifest: manifest }; }),
    budgetPromise
  ]).then(function (winner) {
    if (winner && winner.timeout) {
      // Network did not answer inside the launch budget. Start immediately with
      // the last known-good runtime, then prepare any newer build for next launch.
      runCurrent();
      manifestPromise.then(refreshForNextLaunch).catch(function () {});
      return;
    }

    var manifest = winner.manifest;
    if (!manifest || manifest.version === currentVersion()) {
      runCurrent();
      return;
    }

    // A newer runtime is confirmed. Wait for the small JS/CSS bundle, cache it,
    // then start exactly once with the new code. If download fails, fall back.
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
