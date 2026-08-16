(function () {
  'use strict';

  // Samsung-native playback adapter for live HLS. The lifecycle follows
  // SamsungDForum/PlayerAVPlay and Samsung's AVPlay documentation:
  // open -> listener/display -> prepareAsync -> play.
  //
  // Mom OS uses the same player, not a second decoder. This mirrors the
  // practical idea used by TizenTube's PiP feature: keep one stream playing
  // while changing its display rectangle and showing application UI beside it.

  var FULL_RECT = { x: 0, y: 0, width: 1920, height: 1080 };
  var MOM_PIP_RECT = { x: 0, y: 0, width: 1240, height: 1080 };
  var WEATHER_REFRESH_MS = 10 * 60 * 1000;
  var MARKET_REFRESH_MS = 5 * 60 * 1000;
  var WEATHER_URL = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=37.5172,35.8482' +
    '&longitude=127.0473,128.5771' +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=Asia%2FSeoul,Asia%2FSeoul' +
    '&forecast_days=2';
  var MARKET_URL = 'https://raw.githubusercontent.com/pryins-bit/tiz/main/market.json';

  var WEATHER_LOCATIONS = [
    { name: '서울 강남', sub: '강남구' },
    { name: '대구 대명동', sub: '남구 · 대명동' }
  ];

  var generation = 0;
  var active = false;
  var paused = false;
  var currentUrl = '';
  var currentRect = FULL_RECT;
  var weatherLastLoadedAt = 0;
  var weatherLoading = false;
  var weatherTimer = null;
  var marketLastLoadedAt = 0;
  var marketLoading = false;
  var marketPayload = null;
  var marketTimer = null;
  var marketRenderTimer = null;

  var diagnostics = {
    available: false,
    active: false,
    state: 'NONE',
    url: '',
    lastError: '',
    buffering: false,
    starts: 0,
    stops: 0,
    displayRect: FULL_RECT,
    momPip: false,
    weatherLastLoadedAt: 0,
    weatherLastError: '',
    marketLastLoadedAt: 0,
    marketLastError: ''
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

  function setObjectRect(rect) {
    if (typeof document === 'undefined') return;
    var objectEl = document.getElementById('av-player');
    if (!objectEl) return;
    objectEl.style.left = (rect.x / 19.2) + '%';
    objectEl.style.top = (rect.y / 10.8) + '%';
    objectEl.style.width = (rect.width / 19.2) + '%';
    objectEl.style.height = (rect.height / 10.8) + '%';
    objectEl.style.right = 'auto';
    objectEl.style.bottom = 'auto';
  }

  function setDisplayRect(x, y, width, height) {
    var rect = {
      x: Math.max(0, Math.round(Number(x) || 0)),
      y: Math.max(0, Math.round(Number(y) || 0)),
      width: Math.max(1, Math.round(Number(width) || 1)),
      height: Math.max(1, Math.round(Number(height) || 1))
    };
    currentRect = rect;
    diagnostics.displayRect = rect;
    setObjectRect(rect);

    var av = manager();
    if (!av) return false;
    try {
      var state = av.getState();
      if (state === 'IDLE' || state === 'READY' || state === 'PLAYING' || state === 'PAUSED') {
        av.setDisplayRect(rect.x, rect.y, rect.width, rect.height);
        return true;
      }
    } catch (e) {
      diagnostics.lastError = String(e && (e.message || e.name) || e);
    }
    return false;
  }

  function setFullscreen() {
    diagnostics.momPip = false;
    return setDisplayRect(FULL_RECT.x, FULL_RECT.y, FULL_RECT.width, FULL_RECT.height);
  }

  function setMomPip() {
    diagnostics.momPip = true;
    return setDisplayRect(MOM_PIP_RECT.x, MOM_PIP_RECT.y, MOM_PIP_RECT.width, MOM_PIP_RECT.height);
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
    diagnostics.momPip = false;
    currentRect = FULL_RECT;
    diagnostics.displayRect = FULL_RECT;
    setObjectRect(FULL_RECT);
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
      setDisplayRect(FULL_RECT.x, FULL_RECT.y, FULL_RECT.width, FULL_RECT.height);
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

  function weatherText(code) {
    code = Number(code);
    if (code === 0) return '맑음';
    if (code === 1 || code === 2) return '대체로 맑음';
    if (code === 3) return '흐림';
    if (code === 45 || code === 48) return '안개';
    if (code >= 51 && code <= 57) return '이슬비';
    if (code >= 61 && code <= 67) return '비';
    if (code >= 71 && code <= 77) return '눈';
    if (code >= 80 && code <= 82) return '소나기';
    if (code >= 85 && code <= 86) return '눈 소나기';
    if (code >= 95) return '뇌우';
    return '날씨';
  }

  function weatherIcon(code) {
    code = Number(code);
    if (code === 0) return '☀';
    if (code <= 2) return '🌤';
    if (code === 3) return '☁';
    if (code === 45 || code === 48) return '🌫';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '🌧';
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return '🌨';
    if (code >= 95) return '⛈';
    return '🌡';
  }

  function ensureWeatherPanel() {
    if (typeof document === 'undefined') return null;
    var home = document.getElementById('momHome');
    if (!home) return null;
    var existing = document.getElementById('momWeatherPanel');
    if (existing) return existing;

    var panel = document.createElement('section');
    panel.id = 'momWeatherPanel';
    panel.className = 'mom-weather-panel';
    panel.innerHTML = '' +
      '<div class="mom-weather-title"><span>날씨</span><small id="momWeatherUpdated">불러오는 중…</small></div>' +
      '<div id="momWeatherGrid" class="mom-weather-grid">' +
        '<div class="mom-weather-card loading">서울 강남 날씨 불러오는 중…</div>' +
        '<div class="mom-weather-card loading">대구 대명동 날씨 불러오는 중…</div>' +
      '</div>';

    var actions = home.querySelector('.mom-actions');
    if (actions && actions.parentNode) actions.parentNode.insertBefore(panel, actions.nextSibling);
    else home.appendChild(panel);
    return panel;
  }

  function renderWeatherPayload(payload) {
    var panel = ensureWeatherPanel();
    if (!panel) return;
    var grid = document.getElementById('momWeatherGrid');
    var updated = document.getElementById('momWeatherUpdated');
    if (!grid) return;

    var list = Array.isArray(payload) ? payload : [payload];
    grid.innerHTML = '';
    for (var i = 0; i < WEATHER_LOCATIONS.length; i += 1) {
      var location = WEATHER_LOCATIONS[i];
      var data = list[i] || {};
      var current = data.current || {};
      var daily = data.daily || {};
      var high = daily.temperature_2m_max && daily.temperature_2m_max[0];
      var low = daily.temperature_2m_min && daily.temperature_2m_min[0];
      var rainChance = daily.precipitation_probability_max && daily.precipitation_probability_max[0];
      var tomorrowHigh = daily.temperature_2m_max && daily.temperature_2m_max[1];
      var tomorrowLow = daily.temperature_2m_min && daily.temperature_2m_min[1];

      var card = document.createElement('div');
      card.className = 'mom-weather-card';
      card.innerHTML = '' +
        '<div class="weather-place"><b>' + location.name + '</b><small>' + location.sub + '</small></div>' +
        '<div class="weather-main"><span class="weather-icon">' + weatherIcon(current.weather_code) + '</span>' +
          '<strong>' + (current.temperature_2m == null ? '-' : Math.round(Number(current.temperature_2m))) + '°</strong>' +
          '<span>' + weatherText(current.weather_code) + '</span></div>' +
        '<div class="weather-meta">체감 ' + (current.apparent_temperature == null ? '-' : Math.round(Number(current.apparent_temperature)) + '°') +
          ' · 습도 ' + (current.relative_humidity_2m == null ? '-' : Math.round(Number(current.relative_humidity_2m)) + '%') + '</div>' +
        '<div class="weather-meta">오늘 ' + (high == null ? '-' : Math.round(Number(high)) + '°') + ' / ' + (low == null ? '-' : Math.round(Number(low)) + '°') +
          ' · 비 ' + (rainChance == null ? '-' : Math.round(Number(rainChance)) + '%') + '</div>' +
        '<div class="weather-tomorrow">내일 ' + (tomorrowHigh == null ? '-' : Math.round(Number(tomorrowHigh)) + '°') + ' / ' + (tomorrowLow == null ? '-' : Math.round(Number(tomorrowLow)) + '°') + '</div>';
      grid.appendChild(card);
    }

    if (updated) {
      var now = new Date();
      var hh = now.getHours() < 10 ? '0' + now.getHours() : String(now.getHours());
      var mm = now.getMinutes() < 10 ? '0' + now.getMinutes() : String(now.getMinutes());
      updated.textContent = hh + ':' + mm + ' 갱신';
    }
  }

  function renderWeatherError() {
    var panel = ensureWeatherPanel();
    if (!panel) return;
    var grid = document.getElementById('momWeatherGrid');
    var updated = document.getElementById('momWeatherUpdated');
    if (grid) grid.innerHTML = '<div class="mom-weather-card weather-error">날씨 연결 실패</div><div class="mom-weather-card weather-error">잠시 뒤 자동 재시도</div>';
    if (updated) updated.textContent = '연결 실패';
  }

  function loadWeather(force) {
    if (typeof fetch !== 'function' || weatherLoading) return;
    var now = Date.now();
    if (!force && weatherLastLoadedAt && now - weatherLastLoadedAt < WEATHER_REFRESH_MS) return;
    weatherLoading = true;
    ensureWeatherPanel();
    fetch(WEATHER_URL, { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('weather HTTP ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        weatherLastLoadedAt = Date.now();
        diagnostics.weatherLastLoadedAt = weatherLastLoadedAt;
        diagnostics.weatherLastError = '';
        renderWeatherPayload(payload);
      })
      .catch(function (error) {
        diagnostics.weatherLastError = String(error && (error.message || error.name) || error);
        renderWeatherError();
      })
      .then(function () { weatherLoading = false; });
  }

  function renderMarketPayload(payload) {
    marketPayload = payload || marketPayload;
    if (!marketPayload || typeof document === 'undefined') return;
    var host = document.getElementById('momStocks');
    if (!host) return;
    var stocks = marketPayload.stocks || [];
    host.innerHTML = '';
    if (!stocks.length) {
      host.innerHTML = '<div class="empty-row">시세 데이터 없음</div>';
      return;
    }
    stocks.slice(0, 8).forEach(function (stock) {
      var row = document.createElement('div');
      row.className = 'stock-row';
      var left = document.createElement('div');
      left.className = 'stock-name';
      left.textContent = String(stock.name || stock.symbol || '');
      var right = document.createElement('div');
      var price = document.createElement('span');
      price.className = 'stock-price';
      price.textContent = stock.price == null ? '갱신 대기' : Math.round(Number(stock.price)).toLocaleString() + '원';
      var change = document.createElement('span');
      change.className = 'stock-change';
      if (stock.change_percent != null) {
        var pct = Number(stock.change_percent);
        change.textContent = (pct > 0 ? ' ▲ ' : pct < 0 ? ' ▼ ' : ' ') + Math.abs(pct).toFixed(2) + '%';
      }
      right.appendChild(price);
      right.appendChild(change);
      row.appendChild(left);
      row.appendChild(right);
      host.appendChild(row);
    });
  }

  function loadMarket(force) {
    if (typeof fetch !== 'function' || marketLoading) return;
    var now = Date.now();
    if (!force && marketPayload && now - marketLastLoadedAt < MARKET_REFRESH_MS) {
      renderMarketPayload(marketPayload);
      return;
    }
    marketLoading = true;
    fetch(MARKET_URL + '?t=' + now, { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('market HTTP ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        marketPayload = payload;
        marketLastLoadedAt = Date.now();
        diagnostics.marketLastLoadedAt = marketLastLoadedAt;
        diagnostics.marketLastError = '';
        renderMarketPayload(payload);
      })
      .catch(function (error) {
        diagnostics.marketLastError = String(error && (error.message || error.name) || error);
        if (marketPayload) renderMarketPayload(marketPayload);
      })
      .then(function () { marketLoading = false; });
  }

  function setHtmlVideoPip(enabled) {
    if (typeof document === 'undefined') return;
    var video = document.getElementById('video');
    if (!video) return;
    if (enabled) {
      video.classList.add('mom-html5-pip');
      try {
        var p = video.play();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } catch (e) {}
    } else {
      video.classList.remove('mom-html5-pip');
    }
  }

  function applyMomLayout(visible) {
    if (typeof document === 'undefined') return;
    var home = document.getElementById('momHome');
    if (!home) return;

    if (visible && active) {
      home.classList.add('pip-active');
      if (paused) resume();
      setMomPip();
      setHtmlVideoPip(false);
      return;
    }

    var video = document.getElementById('video');
    var html5HasSource = !!(video && (video.currentSrc || video.getAttribute('src')));
    if (visible && !active && html5HasSource) {
      home.classList.add('pip-active');
      setHtmlVideoPip(true);
      return;
    }

    home.classList.remove('pip-active');
    setHtmlVideoPip(false);
    if (active) setFullscreen();
  }

  function installMomEnhancements() {
    if (typeof document === 'undefined') return;
    var home = document.getElementById('momHome');
    if (!home) return;
    ensureWeatherPanel();
    loadWeather(true);
    loadMarket(true);

    function sync() {
      var visible = !home.classList.contains('hidden');
      applyMomLayout(visible);
      if (visible) {
        loadWeather(false);
        loadMarket(false);
        clearTimeout(marketRenderTimer);
        marketRenderTimer = setTimeout(function () {
          if (!home.classList.contains('hidden')) {
            if (marketPayload) renderMarketPayload(marketPayload);
            else loadMarket(true);
          }
        }, 1200);
      }
    }

    if (typeof MutationObserver !== 'undefined') {
      var observer = new MutationObserver(sync);
      observer.observe(home, { attributes: true, attributeFilter: ['class'] });
    }
    sync();
    clearInterval(weatherTimer);
    weatherTimer = setInterval(function () {
      if (!home.classList.contains('hidden')) loadWeather(false);
    }, WEATHER_REFRESH_MS);
    clearInterval(marketTimer);
    marketTimer = setInterval(function () {
      if (!home.classList.contains('hidden')) loadMarket(false);
    }, MARKET_REFRESH_MS);
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
    setDisplayRect: setDisplayRect,
    setFullscreen: setFullscreen,
    setMomPip: setMomPip,
    diagnostics: diagnostics,
    state: refreshState
  };

  refreshState();

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installMomEnhancements);
    else setTimeout(installMomEnhancements, 0);
  }
}());
