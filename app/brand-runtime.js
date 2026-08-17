(function () {
  'use strict';

  var BRAND_URL = 'https://raw.githubusercontent.com/pryins-bit/tiz/main/brand.json';
  var MOM_API_URL = 'https://inzopchhmvljprbpvzcs.supabase.co/functions/v1/mom-tv';
  var MOM_TOKEN_KEY = 'mom_tv_token_v1';
  var MOM_REFRESH_MS = 10000;
  var DEFAULT_NAME = '수니TV';
  var DEFAULT_ICON = 'icon.png';
  var DEFAULT_QUOTES = [
    '오늘은 오늘의 속도로 가도 괜찮아요.',
    '식사 잘 챙기고, 몸이 보내는 신호를 천천히 살펴보세요.',
    '작은 좋은 일이 하나만 있어도 충분히 괜찮은 하루예요.',
    '서두르지 않아도 괜찮아요. 하나씩 하면 됩니다.',
    '오늘도 편안한 순간이 자주 찾아오기를 바라요.',
    '잘 쉬는 것도 오늘 해야 할 중요한 일 중 하나예요.',
    '지금까지 해온 것만으로도 오늘을 시작할 힘은 충분해요.'
  ];
  var momTimer = null;
  var momObserver = null;
  var diagnostics = {
    loaded: false,
    source: 'packaged',
    name: DEFAULT_NAME,
    iconUrl: DEFAULT_ICON,
    version: '',
    lastError: '',
    momLoaded: false,
    quoteSource: 'fallback',
    tickerCount: 0,
    lastMomError: ''
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
      '.mom-home.pip-active .mom-title{gap:9px}' +
      '.mom-daily-quote{margin-top:18px;padding:18px 24px 20px;border:1px solid rgba(255,255,255,.13);border-radius:18px;background:linear-gradient(105deg,rgba(255,255,255,.11),rgba(255,255,255,.055));box-shadow:0 8px 26px rgba(0,0,0,.18)}' +
      '.mom-daily-quote-label{font-size:16px;font-weight:800;letter-spacing:1.5px;opacity:.62}' +
      '.mom-daily-quote-text{margin-top:7px;font-size:29px;font-weight:750;line-height:1.35;word-break:keep-all}' +
      '.mom-daily-quote-by{margin-top:7px;font-size:16px;opacity:.55}' +
      '.mom-home.mom-extras-active .mom-content{margin-top:18px;height:calc(100% - 330px)}' +
      '.mom-ticker{position:absolute;left:64px;right:64px;bottom:22px;height:48px;overflow:hidden;border:1px solid rgba(255,255,255,.13);border-radius:12px;background:rgba(5,9,15,.94);display:flex;align-items:center;z-index:4}' +
      '.mom-ticker-badge{flex:0 0 auto;height:100%;display:flex;align-items:center;padding:0 17px;font-size:17px;font-weight:900;background:rgba(255,255,255,.12);letter-spacing:.5px}' +
      '.mom-ticker-window{min-width:0;flex:1;overflow:hidden;white-space:nowrap}' +
      '.mom-ticker-track{display:inline-block;min-width:100%;padding-left:100%;font-size:20px;font-weight:700;line-height:48px;white-space:nowrap;animation:suniMomTicker 24s linear infinite;will-change:transform}' +
      '@keyframes suniMomTicker{0%{transform:translateX(0)}100%{transform:translateX(-100%)}}' +
      '.mom-home.pip-active .mom-daily-quote{margin-top:10px;padding:10px 12px 11px;border-radius:12px}' +
      '.mom-home.pip-active .mom-daily-quote-label{font-size:12px}' +
      '.mom-home.pip-active .mom-daily-quote-text{margin-top:4px;font-size:18px;line-height:1.28}' +
      '.mom-home.pip-active .mom-daily-quote-by{margin-top:4px;font-size:11px}' +
      '.mom-home.pip-active.mom-extras-active .mom-content{margin-top:9px!important;max-height:300px!important}' +
      '.mom-home.pip-active .mom-ticker{left:28px;right:28px;bottom:14px;height:38px;border-radius:9px}' +
      '.mom-home.pip-active .mom-ticker-badge{padding:0 10px;font-size:12px}' +
      '.mom-home.pip-active .mom-ticker-track{font-size:13px;line-height:38px;animation-duration:20s}'
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

  function localDateKey() {
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth() + 1;
    var d = now.getDate();
    return String(y) + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  function stringHash(value) {
    var text = String(value || '');
    var hash = 0;
    for (var i = 0; i < text.length; i += 1) hash = ((hash * 31) + text.charCodeAt(i)) >>> 0;
    return hash;
  }

  function fallbackQuote() {
    var at = stringHash(localDateKey()) % DEFAULT_QUOTES.length;
    return { title: '오늘의 한마디', text: DEFAULT_QUOTES[at], attribution: '', source: 'fallback' };
  }

  function ensureMomExtrasUi() {
    ensureStyle();
    var mom = document.getElementById('momHome');
    var content = document.getElementById('momContent');
    if (!mom || !content) return null;

    var quote = document.getElementById('momDailyQuote');
    if (!quote) {
      quote = document.createElement('div');
      quote.id = 'momDailyQuote';
      quote.className = 'mom-daily-quote hidden';
      var qLabel = document.createElement('div');
      qLabel.id = 'momDailyQuoteLabel';
      qLabel.className = 'mom-daily-quote-label';
      var qText = document.createElement('div');
      qText.id = 'momDailyQuoteText';
      qText.className = 'mom-daily-quote-text';
      var qBy = document.createElement('div');
      qBy.id = 'momDailyQuoteBy';
      qBy.className = 'mom-daily-quote-by hidden';
      quote.appendChild(qLabel);
      quote.appendChild(qText);
      quote.appendChild(qBy);
      content.parentNode.insertBefore(quote, content);
    }

    var ticker = document.getElementById('momTicker');
    if (!ticker) {
      ticker = document.createElement('div');
      ticker.id = 'momTicker';
      ticker.className = 'mom-ticker hidden';
      var badge = document.createElement('div');
      badge.className = 'mom-ticker-badge';
      badge.textContent = '메시지';
      var windowEl = document.createElement('div');
      windowEl.className = 'mom-ticker-window';
      var track = document.createElement('div');
      track.id = 'momTickerTrack';
      track.className = 'mom-ticker-track';
      windowEl.appendChild(track);
      ticker.appendChild(badge);
      ticker.appendChild(windowEl);
      mom.appendChild(ticker);
    }

    return { mom: mom, content: content, quote: quote, ticker: ticker };
  }

  function isMomApprovedVisible(ui) {
    if (!ui || ui.mom.classList.contains('hidden')) return false;
    return !ui.content.classList.contains('hidden');
  }

  function normalizedQuote(payload) {
    var quote = payload && payload.quote;
    if (!quote || !quote.text) return fallbackQuote();
    return {
      title: String(quote.title || '오늘의 한마디'),
      text: String(quote.text || ''),
      attribution: String(quote.attribution || ''),
      source: 'supabase'
    };
  }

  function normalizedTicker(payload) {
    var list = payload && payload.ticker;
    if (!Array.isArray(list)) return [];
    return list.map(function (item) {
      if (typeof item === 'string') return item;
      if (!item) return '';
      return String(item.text || item.body || item.title || '');
    }).filter(function (text) { return !!text; }).slice(0, 8);
  }

  function renderMomExtras(data) {
    var ui = ensureMomExtrasUi();
    if (!ui) return;
    if (!isMomApprovedVisible(ui)) {
      ui.quote.classList.add('hidden');
      ui.ticker.classList.add('hidden');
      ui.mom.classList.remove('mom-extras-active');
      return;
    }

    var payload = data && data.mom_message ? data.mom_message : {};
    var quote = normalizedQuote(payload);
    var ticker = normalizedTicker(payload);
    document.getElementById('momDailyQuoteLabel').textContent = quote.title;
    document.getElementById('momDailyQuoteText').textContent = quote.text;
    var by = document.getElementById('momDailyQuoteBy');
    if (quote.attribution) {
      by.textContent = quote.attribution;
      by.classList.remove('hidden');
    } else {
      by.textContent = '';
      by.classList.add('hidden');
    }
    ui.quote.classList.remove('hidden');
    ui.mom.classList.add('mom-extras-active');

    if (ticker.length) {
      var repeated = ticker.join('   ✦   ');
      document.getElementById('momTickerTrack').textContent = repeated + '      ·      ' + repeated;
      ui.ticker.classList.remove('hidden');
    } else {
      document.getElementById('momTickerTrack').textContent = '';
      ui.ticker.classList.add('hidden');
    }

    diagnostics.momLoaded = true;
    diagnostics.quoteSource = quote.source;
    diagnostics.tickerCount = ticker.length;
    diagnostics.lastMomError = '';
  }

  function momToken() {
    try { return localStorage.getItem(MOM_TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function loadMomExtras() {
    var ui = ensureMomExtrasUi();
    if (!ui || ui.mom.classList.contains('hidden')) return Promise.resolve(null);
    var token = momToken();
    if (!token || typeof fetch !== 'function') {
      if (isMomApprovedVisible(ui)) renderMomExtras({ mom_message: { quote: fallbackQuote(), ticker: [] } });
      return Promise.resolve(null);
    }
    return fetch(cacheBust(MOM_API_URL + '?action=data'), {
      method: 'GET',
      cache: 'no-store',
      headers: { 'x-tv-token': token, 'Content-Type': 'application/json' }
    }).then(function (response) {
      if (!response.ok) throw new Error('mom HTTP ' + response.status);
      return response.json();
    }).then(function (data) {
      renderMomExtras(data || {});
      return data;
    }).catch(function (error) {
      diagnostics.lastMomError = String(error && (error.message || error.name) || error);
      if (isMomApprovedVisible(ui)) renderMomExtras({ mom_message: { quote: fallbackQuote(), ticker: [] } });
      return null;
    });
  }

  function clearMomTimer() {
    if (momTimer) clearTimeout(momTimer);
    momTimer = null;
  }

  function scheduleMomRefresh() {
    clearMomTimer();
    var ui = ensureMomExtrasUi();
    if (!ui || ui.mom.classList.contains('hidden')) return;
    momTimer = setTimeout(function () {
      loadMomExtras().then(scheduleMomRefresh);
    }, MOM_REFRESH_MS);
  }

  function syncMomVisibility() {
    var ui = ensureMomExtrasUi();
    if (!ui) return;
    if (ui.mom.classList.contains('hidden')) {
      clearMomTimer();
      return;
    }
    loadMomExtras().then(scheduleMomRefresh);
  }

  function installMomWatcher() {
    var ui = ensureMomExtrasUi();
    if (!ui) {
      setTimeout(installMomWatcher, 200);
      return;
    }
    if (momObserver || typeof MutationObserver === 'undefined') {
      syncMomVisibility();
      return;
    }
    momObserver = new MutationObserver(function () { syncMomVisibility(); });
    momObserver.observe(ui.mom, { attributes: true, attributeFilter: ['class'] });
    momObserver.observe(ui.content, { attributes: true, attributeFilter: ['class'] });
    syncMomVisibility();
  }

  function load() {
    apply({ name: DEFAULT_NAME, icon_url: DEFAULT_ICON, version: 'packaged' });
    installMomWatcher();
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

  window.SuniTVMomExtras = {
    load: loadMomExtras,
    apply: renderMomExtras,
    fallbackQuote: fallbackQuote,
    getState: function () {
      return {
        loaded: diagnostics.momLoaded,
        quoteSource: diagnostics.quoteSource,
        tickerCount: diagnostics.tickerCount,
        lastError: diagnostics.lastMomError
      };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
}());
