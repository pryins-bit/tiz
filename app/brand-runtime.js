(function () {
  'use strict';

  var BRAND_URL = 'https://raw.githubusercontent.com/pryins-bit/tiz/main/brand.json';
  var DEFAULT_NAME = '수니TV';
  var DEFAULT_ICON = 'icon.png';
  var diagnostics = {
    loaded: false,
    source: 'packaged',
    name: DEFAULT_NAME,
    iconUrl: DEFAULT_ICON,
    version: '',
    lastError: ''
  };

  window.SuniTVBrandDiagnostics = diagnostics;

  function cacheBust(url) {
    return String(url || '') + (String(url || '').indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      name: String(raw.name || DEFAULT_NAME),
      icon_url: String(raw.icon_url || DEFAULT_ICON),
      version: String(raw.version || '')
    };
  }

  function ensureStyle() {
    if (document.getElementById('runtimeBrandStyle')) return;
    var style = document.createElement('style');
    style.id = 'runtimeBrandStyle';
    style.type = 'text/css';
    style.appendChild(document.createTextNode(
      '.runtime-branded{display:flex;align-items:center;gap:14px}' +
      '.runtime-brand-icon{display:block;object-fit:contain;flex:0 0 auto}' +
      '.home-brand .runtime-brand-icon{width:58px;height:58px;border-radius:13px}' +
      '.home-brand .runtime-brand-label{font-size:54px;font-weight:900;letter-spacing:-2px}' +
      '.mom-title .runtime-brand-icon{width:54px;height:54px;border-radius:12px}' +
      '.mom-title .runtime-brand-label{font:inherit;font-weight:800}' +
      '.mom-home.pip-active .mom-title .runtime-brand-icon{width:36px;height:36px;border-radius:8px}' +
      '.mom-home.pip-active .mom-title{gap:9px}'
    ));
    document.head.appendChild(style);
  }

  function iconNode(brand) {
    var img = document.createElement('img');
    img.className = 'runtime-brand-icon';
    img.alt = brand.name;
    img.setAttribute('aria-hidden', 'true');
    img.src = brand.icon_url.indexOf('http') === 0 ? cacheBust(brand.icon_url) : brand.icon_url;
    img.onerror = function () {
      if (img.getAttribute('data-local-fallback') === '1') return;
      img.setAttribute('data-local-fallback', '1');
      img.src = DEFAULT_ICON;
    };
    return img;
  }

  function labelNode(text) {
    var span = document.createElement('span');
    span.className = 'runtime-brand-label';
    span.textContent = text;
    return span;
  }

  function apply(brand) {
    brand = normalize(brand);
    ensureStyle();
    diagnostics.loaded = true;
    diagnostics.name = brand.name;
    diagnostics.iconUrl = brand.icon_url;
    diagnostics.version = brand.version;
    document.title = brand.name;
    document.documentElement.setAttribute('data-brand-version', brand.version || '');

    var home = document.querySelector('.home-brand');
    if (home) {
      home.innerHTML = '';
      home.appendChild(iconNode(brand));
      home.appendChild(labelNode(brand.name));
      home.classList.add('runtime-branded');
    }

    var mom = document.querySelector('.mom-title');
    if (mom) {
      mom.innerHTML = '';
      mom.appendChild(iconNode(brand));
      mom.appendChild(labelNode(brand.name + ' · 엄마 홈'));
      mom.classList.add('runtime-branded');
    }
  }

  function load() {
    apply({ name: DEFAULT_NAME, icon_url: DEFAULT_ICON, version: 'packaged' });
    if (typeof fetch !== 'function') return Promise.resolve();
    return fetch(cacheBust(BRAND_URL), { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('brand HTTP ' + response.status);
        return response.json();
      })
      .then(function (brand) {
        diagnostics.source = 'github';
        diagnostics.lastError = '';
        apply(brand);
      })
      .catch(function (error) {
        diagnostics.source = 'packaged';
        diagnostics.lastError = String(error && (error.message || error.name) || error);
      });
  }

  window.SuniTVBrand = {
    load: load,
    apply: apply,
    getState: function () {
      return {
        loaded: diagnostics.loaded,
        source: diagnostics.source,
        name: diagnostics.name,
        iconUrl: diagnostics.iconUrl,
        version: diagnostics.version,
        lastError: diagnostics.lastError
      };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
}());
