(function () {
  'use strict';

  var BRAND_URL = 'https://raw.githubusercontent.com/pryins-bit/tiz/main/brand.json';
  var MOM_API_URL = 'https://inzopchhmvljprbpvzcs.supabase.co/functions/v1/mom-tv';
  var MOM_TOKEN_KEY = 'mom_tv_token_v1';
  var MOM_REFRESH_MS = 10000;
  var MOM_FAST_RETRY_MS = 900;
  var DEFAULT_NAME = '수니TV';
  var DEFAULT_ICON = 'icon.png';
  var DEFAULT_TICKER = '오늘도 식사 잘 챙기시고, 편안한 하루 보내세요.';
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
  var activationTimer = null;
  var activationAttempts = 0;
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
    lastMomError: '',
    authState: 'starting',
    activationAttempts: 0
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
      '.mom-fallback-grid{margin-top:18px;display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:14px}' +
      '.mom-fallback-card{min-height:94px;padding:17px 20px;box-sizing:border-box;border:1px solid rgba(255,255,255,.10);border-radius:16px;background:rgba(255,255,255,.055)}' +
      '.mom-fallback-label{font-size:15px;font-weight:800;letter-spacing:1px;opacity:.55}' +
      '.mom-fallback-value{margin-top:8px;font-size:22px;font-weight:750;line-height:1.25}' +
      '.mom-ticker{position:absolute;left:64px;right:64px;bottom:22px;height:48px;overflow:hidden;border:1px solid rgba(255,255,255,.13);border-radius:12px;background:rgba(5,9,15,.94);display:flex;align-items:center;z-index:4}' +
      '.mom-ticker-badge{flex:0 0 auto;height:100%;display:flex;align-items:center;padding:0 17px;font-size:17px;font-weight:900;background:rgba(255,255,255,.12);letter-spacing:.5px}' +
      '.mom-ticker-window{min-width:0;flex:1;overflow:hidden;white-space:nowrap}' +
      '.mom-ticker-track{display:inline-block;min-width:100%;padding-left:100%;font-size:20px;font-weight:700;line-height:48px;white-space:nowrap;animation:suniMomTicker 24s linear infinite;will-change:transform}' +
      '@keyframes suniMomTicker{0%{transform:translateX(0)}100%{transform:translateX(-100%)}}' +
      '.mom-home.pip-active .mom-daily-quote{margin-top:10px;padding:10px 12px 11px;border-radius:12px}' +
      '.mom-home.pip-active .mom-daily-quote-label{font-size:12px}' +
      '.mom-home.pip-active .mom-daily-quote-text{margin-top:4px;font-size:18px;line-height:1.28}' +
      '.mom-home.pip-active .mom-daily-quote-by{margin-top:4px;font-size:11px}' +
      '.mom-home.pip-active .mom-fallback-grid{margin-top:9px;grid-template-columns:1fr;gap:8px}' +
      '.mom-home.pip-active .mom-fallback-card{min-height:0;padding:10px 12px;border-radius:11px}' +
      '.mom-home.pip-active .mom-fallback-label{font-size:11px}' +
      '.mom-home.pip-active .mom-fallback-value{margin-top:4px;font-size:15px}' +
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

  function friendlyDate() {
    var now = new Date();
    var days = ['일', '월', '화', '수', '목', '금', '토'];
    return (now.getMonth() + 1) + '월 ' + now.getDate() + '일 ' + days[now.getDay()] + '요일';
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

  function staticNode(tag, className, text) {
    var node = document.createElement(tag);
    node.className = className || '';
    if (text != null) node.textContent = String(text);
    return node;
  }

  function ensureFallbackGrid(mom, content) {
    var grid = document.getElementById('momFallbackGrid');
    if (grid) return grid;
    grid = staticNode('div', 'mom-fallback-grid');
    grid.id = 'momFallbackGrid';

    var dateCard = staticNode('div', 'mom-fallback-card');
    dateCard.appendChild(staticNode('div', 'mom-fallback-label', '오늘'));
    var dateValue = staticNode('div', 'mom-fallback-value', friendlyDate());
    dateValue.id = 'momFallbackDate';
    dateCard.appendChild(dateValue);

    var tvCard = staticNode('div', 'mom-fallback-card');
    tvCard.appendChild(staticNode('div', 'mom-fallback-label', 'TV'));
    tvCard.appendChild(staticNode('div', 'mom-fallback-value', 'TV 보기 버튼으로 바로 시청'));

    var stateCard = staticNode('div', 'mom-fallback-card');
    stateCard.appendChild(staticNode('div', 'mom-fallback-label', '연결 상태'));
    var stateValue = staticNode('div', 'mom-fallback-value', '엄마 홈 연결 중…');
    stateValue.id = 'momFallbackState';
    stateCard.appendChild(stateValue);

    grid.appendChild(dateCard);
    grid.appendChild(tvCard);
    grid.appendChild(stateCard);
    if (content && content.parentNode) content.parentNode.insertBefore(grid, content);
    else mom.appendChild(grid);
    return grid;
  }

  function ensureMomExtrasUi() {
    ensureStyle();
    var mom = document.getElementById('momHome');
    var content = document.getElementById('momContent');
    if (!mom || !content) return null;

    var quote = document.getElementById('momDailyQuote');
    if (!quote) {
      quote = staticNode('div', 'mom-daily-quote hidden');
      quote.id = 'momDailyQuote';
      var qLabel = staticNode('div', 'mom-daily-quote-label');
      qLabel.id = 'momDailyQuoteLabel';
      var qText = staticNode('div', 'mom-daily-quote-text');
      qText.id = 'momDailyQuoteText';
      var qBy = staticNode('div', 'mom-daily-quote-by hidden');
      qBy.id = 'momDailyQuoteBy';
      quote.appendChild(qLabel);
      quote.appendChild(qText);
      quote.appendChild(qBy);
      content.parentNode.insertBefore(quote, content);
    }

    var ticker = document.getElementById('momTicker');
    if (!ticker) {
      ticker = staticNode('div', 'mom-ticker hidden');
      ticker.id = 'momTicker';
      var badge = staticNode('div', 'mom-ticker-badge', '메시지');
      var windowEl = staticNode('div', 'mom-ticker-window');
      var track = staticNode('div', 'mom-ticker-track');
      track.id = 'momTickerTrack';
      windowEl.appendChild(track);
      ticker.appendChild(badge);
      ticker.appendChild(windowEl);
      mom.appendChild(ticker);
    }

    var fallbackGrid = ensureFallbackGrid(mom, content);
    return {
      mom: mom,
      content: content,
      approval: document.getElementById('momApproval'),
      approvalCode: document.getElementById('approvalCode'),
      state: document.getElementById('momState'),
      items: document.getElementById('momItems'),
      stocks: document.getElementById('momStocks'),
      quote: quote,
      ticker: ticker,
      fallbackGrid: fallbackGrid
    };
  }

  function setFallbackState(text) {
    var el = document.getElementById('momFallbackState');
    if (el) el.textContent = String(text || '');
    var date = document.getElementById('momFallbackDate');
    if (date) date.textContent = friendlyDate();
  }

  function showFallbackHome(stateText) {
    var ui = ensureMomExtrasUi();
    if (!ui || ui.mom.classList.contains('hidden')) return;
    var quote = fallbackQuote();
    document.getElementById('momDailyQuoteLabel').textContent = quote.title;
    document.getElementById('momDailyQuoteText').textContent = quote.text;
    var by = document.getElementById('momDailyQuoteBy');
    by.textContent = '';
    by.classList.add('hidden');
    ui.quote.classList.remove('hidden');
    ui.mom.classList.add('mom-extras-active');
    if (ui.fallbackGrid) ui.fallbackGrid.classList.remove('hidden');
    setFallbackState(stateText || '엄마 홈 연결 중…');
    var track = document.getElementById('momTickerTrack');
    if (track) track.textContent = DEFAULT_TICKER + '      ·      ' + DEFAULT_TICKER;
    ui.ticker.classList.remove('hidden');
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
    if (ui.mom.classList.contains('hidden')) {
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

  function renderItems(items, host) {
    if (!host) return;
    host.innerHTML = '';
    items = Array.isArray(items) ? items : [];
    if (!items.length) {
      host.appendChild(staticNode('div', 'empty-row', '등록된 일정/공지 없음'));
      return;
    }
    items.slice(0, 6).forEach(function (item) {
      var card = staticNode('div', 'mom-card');
      card.appendChild(staticNode('div', 'mom-card-title', String(item && item.title || '')));
      if (item && item.body) card.appendChild(staticNode('div', 'mom-card-body', String(item.body)));
      host.appendChild(card);
    });
  }

  function renderStocks(stocks, host) {
    if (!host) return;
    host.innerHTML = '';
    stocks = Array.isArray(stocks) ? stocks : [];
    if (!stocks.length) {
      host.appendChild(staticNode('div', 'empty-row', '관심 시세 불러오는 중…'));
      return;
    }
    stocks.slice(0, 8).forEach(function (stock) {
      var row = staticNode('div', 'stock-row');
      row.appendChild(staticNode('div', 'stock-name', String(stock.display_name || stock.symbol || '')));
      var right = staticNode('div', '');
      var price = staticNode('span', 'stock-price', stock.price == null ? '-' : Number(stock.price).toLocaleString());
      var change = staticNode('span', 'stock-change');
      if (stock.change_percent != null) {
        var pct = Number(stock.change_percent);
        change.textContent = (pct > 0 ? ' ▲ ' : pct < 0 ? ' ▼ ' : ' ') + Math.abs(pct).toFixed(2) + '%';
      }
      right.appendChild(price);
      right.appendChild(change);
      row.appendChild(right);
      host.appendChild(row);
    });
  }

  function renderPrivateData(data) {
    var ui = ensureMomExtrasUi();
    if (!ui) return;
    diagnostics.authState = 'approved';
    if (ui.state) ui.state.textContent = '승인됨 · 자동 동기화';
    if (ui.approval) ui.approval.classList.add('hidden');
    if (ui.content) ui.content.classList.remove('hidden');
    if (ui.fallbackGrid) ui.fallbackGrid.classList.add('hidden');
    renderItems(data && data.items, ui.items);
    renderStocks(data && data.stocks, ui.stocks);
    renderMomExtras(data || {});
  }

  function showApproval(code) {
    var ui = ensureMomExtrasUi();
    if (!ui) return;
    diagnostics.authState = 'approval';
    if (ui.state) ui.state.textContent = '승인 대기 중';
    if (ui.approvalCode) ui.approvalCode.textContent = code || '------';
    if (ui.approval) ui.approval.classList.remove('hidden');
    if (ui.content) ui.content.classList.add('hidden');
    if (ui.fallbackGrid) ui.fallbackGrid.classList.remove('hidden');
    showFallbackHome(code ? '승인번호 ' + code : 'TV 승인 대기 중');
  }

  function momToken() {
    try { return localStorage.getItem(MOM_TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function loadMomExtras() {
    var ui = ensureMomExtrasUi();
    if (!ui || ui.mom.classList.contains('hidden')) return Promise.resolve(null);

    showFallbackHome('엄마 홈 연결 확인 중…');
    var token = momToken();
    if (!token || typeof fetch !== 'function') {
      diagnostics.authState = 'waiting-token';
      if (ui.state) ui.state.textContent = 'TV 인증 준비 중…';
      setFallbackState('TV 인증 준비 중…');
      return Promise.resolve(null);
    }

    diagnostics.authState = 'loading';
    if (ui.state) ui.state.textContent = '엄마 홈 동기화 중…';
    return fetch(cacheBust(MOM_API_URL + '?action=data'), {
      method: 'GET',
      cache: 'no-store',
      headers: { 'x-tv-token': token, 'Content-Type': 'application/json' }
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) {
          var error = new Error(body.error || ('mom HTTP ' + response.status));
          error.status = response.status;
          error.body = body;
          throw error;
        }
        return body;
      });
    }).then(function (data) {
      renderPrivateData(data || {});
      diagnostics.lastMomError = '';
      return data;
    }).catch(function (error) {
      diagnostics.lastMomError = String(error && (error.message || error.name) || error);
      if (error && error.status === 403) {
        showApproval(error.body && error.body.approval_code);
      } else if (error && error.status === 401) {
        diagnostics.authState = 'renewing';
        if (ui.state) ui.state.textContent = 'TV 인증 갱신 중…';
        setFallbackState('TV 인증 갱신 중…');
      } else {
        diagnostics.authState = 'error';
        if (ui.state) ui.state.textContent = '연결 재시도 중…';
        setFallbackState('연결 재시도 중…');
      }
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
    var fast = diagnostics.authState === 'waiting-token' || diagnostics.authState === 'renewing' || diagnostics.authState === 'starting';
    momTimer = setTimeout(function () {
      loadMomExtras().then(scheduleMomRefresh);
    }, fast ? MOM_FAST_RETRY_MS : MOM_REFRESH_MS);
  }

  function runtimeActivated() {
    var state = document.getElementById('momState');
    if (!state) return false;
    var text = String(state.textContent || '');
    return text.indexOf('R6') < 0 && text.indexOf('로컬 홈 준비 완료') < 0;
  }

  function activateMomRuntime() {
    if (runtimeActivated()) return;
    if (activationAttempts >= 40) return;
    activationAttempts += 1;
    diagnostics.activationAttempts = activationAttempts;
    var button = document.querySelector('[data-action="mom"]');
    if (button && typeof button.click === 'function') {
      try { button.click(); } catch (e) {}
    }
    if (runtimeActivated()) return;
    clearTimeout(activationTimer);
    activationTimer = setTimeout(activateMomRuntime, 250);
  }

  function syncMomVisibility() {
    var ui = ensureMomExtrasUi();
    if (!ui) return;
    if (ui.mom.classList.contains('hidden')) {
      clearMomTimer();
      return;
    }
    showFallbackHome('엄마 홈 연결 확인 중…');
    activateMomRuntime();
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
        lastError: diagnostics.lastMomError,
        authState: diagnostics.authState,
        activationAttempts: diagnostics.activationAttempts
      };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
}());
