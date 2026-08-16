(function () {
  'use strict';

  var PLAYLIST_URL = 'https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u';
  var MOM_API_URL = 'https://inzopchhmvljprbpvzcs.supabase.co/functions/v1/mom-tv';
  var MOM_TOKEN_KEY = 'mom_tv_token_v1';
  var MOM_DEVICE_KEY = 'mom_tv_device_id_v1';

  var video = document.getElementById('video');
  var statusEl = document.getElementById('status');
  var bannerEl = document.getElementById('banner');
  var nameEl = document.getElementById('channelName');
  var urlEl = document.getElementById('channelUrl');
  var helpEl = document.getElementById('help');

  var momHomeEl = document.getElementById('momHome');
  var momClockEl = document.getElementById('momClock');
  var momStateEl = document.getElementById('momState');
  var momApprovalEl = document.getElementById('momApproval');
  var approvalCodeEl = document.getElementById('approvalCode');
  var momContentEl = document.getElementById('momContent');
  var momItemsEl = document.getElementById('momItems');
  var momStocksEl = document.getElementById('momStocks');

  var channels = [];
  var index = 0;
  var hls = null;
  var bannerTimer = null;
  var failureTimer = null;
  var failedThisRound = {};
  var momOpen = false;
  var momPollTimer = null;
  var momClockTimer = null;

  function showStatus(text) {
    statusEl.textContent = text;
    statusEl.classList.remove('hidden');
  }

  function hideStatus() {
    statusEl.classList.add('hidden');
  }

  function showBanner() {
    if (!channels.length) return;
    var channel = channels[index];
    nameEl.textContent = (index + 1) + ' / ' + channels.length + '  ' + channel.name;
    urlEl.textContent = channel.url;
    bannerEl.classList.remove('hidden');
    helpEl.classList.remove('hidden');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () {
      bannerEl.classList.add('hidden');
      helpEl.classList.add('hidden');
    }, 4500);
  }

  function parseM3U(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var out = [];
    var pending = null;

    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf('#EXTINF:') === 0) {
        var comma = line.lastIndexOf(',');
        pending = {
          name: comma >= 0 ? line.slice(comma + 1).trim() : 'Channel ' + (out.length + 1),
          meta: line
        };
        continue;
      }
      if (line.charAt(0) === '#') continue;
      if (pending && /^https?:\/\//i.test(line)) {
        out.push({ name: pending.name, url: line, meta: pending.meta });
        pending = null;
      }
    }
    return out;
  }

  function destroyPlayer() {
    clearTimeout(failureTimer);
    failureTimer = null;
    if (hls) {
      try { hls.destroy(); } catch (e) {}
      hls = null;
    }
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch (e2) {}
  }

  function markFailedAndAdvance(reason) {
    var current = channels[index];
    if (!current) return;
    failedThisRound[current.url] = true;
    showStatus('재생 실패: ' + current.name + '\n다음 채널로 이동 중…');
    setTimeout(function () { changeChannel(1, true); }, 700);
  }

  function attachCommonEvents() {
    video.onerror = function () {
      markFailedAndAdvance('video-error');
    };
    video.onplaying = function () {
      clearTimeout(failureTimer);
      hideStatus();
      showBanner();
    };
  }

  function playChannel() {
    if (!channels.length) {
      showStatus('재생할 채널이 없습니다.');
      return;
    }

    destroyPlayer();
    attachCommonEvents();

    var channel = channels[index];
    showStatus('재생 중: ' + channel.name);

    failureTimer = setTimeout(function () {
      markFailedAndAdvance('timeout');
    }, 12000);

    var nativeHls = '';
    try { nativeHls = video.canPlayType('application/vnd.apple.mpegurl'); } catch (e) {}

    if (nativeHls) {
      video.src = channel.url;
      var playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () {
          markFailedAndAdvance('native-play-rejected');
        });
      }
      return;
    }

    if (window.Hls && window.Hls.isSupported()) {
      hls = new window.Hls({
        enableWorker: false,
        lowLatencyMode: false,
        backBufferLength: 30
      });
      hls.loadSource(channel.url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
        var p = video.play();
        if (p && typeof p.catch === 'function') {
          p.catch(function () { markFailedAndAdvance('hls-play-rejected'); });
        }
      });
      hls.on(window.Hls.Events.ERROR, function (event, data) {
        if (data && data.fatal) markFailedAndAdvance('hls-fatal');
      });
      return;
    }

    markFailedAndAdvance('no-hls-support');
  }

  function findNextPlayable(start, delta) {
    if (!channels.length) return 0;
    var candidate = start;
    for (var attempts = 0; attempts < channels.length; attempts += 1) {
      candidate = (candidate + delta + channels.length) % channels.length;
      if (!failedThisRound[channels[candidate].url]) return candidate;
    }
    failedThisRound = {};
    return (start + delta + channels.length) % channels.length;
  }

  function changeChannel(delta, automatic) {
    if (!channels.length) return;
    index = findNextPlayable(index, delta);
    if (!automatic) failedThisRound = {};
    playChannel();
  }

  function loadPlaylist() {
    showStatus('최신 채널 목록을 불러오는 중…');
    var url = PLAYLIST_URL + '?t=' + Date.now();
    fetch(url, { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(function (text) {
        channels = parseM3U(text);
        if (!channels.length) throw new Error('채널 0개');
        index = 0;
        failedThisRound = {};
        playChannel();
      })
      .catch(function (error) {
        showStatus('채널 목록을 불러오지 못했습니다.\n' + String(error && error.message ? error.message : error));
      });
  }

  function pad2(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function updateMomClock() {
    var now = new Date();
    var days = ['일', '월', '화', '수', '목', '금', '토'];
    momClockEl.textContent = (now.getMonth() + 1) + '월 ' + now.getDate() + '일 ' + days[now.getDay()] + '요일  ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes());
  }

  function makeDeviceId() {
    var saved = localStorage.getItem(MOM_DEVICE_KEY);
    if (saved) return saved;
    var value = 'samsung-tv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(MOM_DEVICE_KEY, value);
    return value;
  }

  function momToken() {
    return localStorage.getItem(MOM_TOKEN_KEY) || '';
  }

  function momFetch(action, options) {
    options = options || {};
    var headers = options.headers || {};
    var token = momToken();
    if (token) headers['x-tv-token'] = token;
    headers['Content-Type'] = 'application/json';
    options.headers = headers;
    return fetch(MOM_API_URL + '?action=' + encodeURIComponent(action), options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) {
          var error = new Error(body.error || ('HTTP ' + response.status));
          error.status = response.status;
          error.body = body;
          throw error;
        }
        return body;
      });
    });
  }

  function showApproval(code) {
    approvalCodeEl.textContent = code || '------';
    momApprovalEl.classList.remove('hidden');
    momContentEl.classList.add('hidden');
    momStateEl.textContent = '승인 대기 중';
  }

  function escapeText(value) {
    return String(value == null ? '' : value);
  }

  function renderMomData(data) {
    var items = data.items || [];
    var stocks = data.stocks || [];
    momApprovalEl.classList.add('hidden');
    momContentEl.classList.remove('hidden');
    momStateEl.textContent = '승인됨 · 자동 동기화';

    momItemsEl.innerHTML = '';
    if (!items.length) {
      var emptyItem = document.createElement('div');
      emptyItem.className = 'empty-row';
      emptyItem.textContent = '등록된 일정/복약/공지 없음';
      momItemsEl.appendChild(emptyItem);
    } else {
      items.slice(0, 6).forEach(function (item) {
        var card = document.createElement('div');
        card.className = 'mom-card';
        var title = document.createElement('div');
        title.className = 'mom-card-title';
        title.textContent = escapeText(item.title);
        card.appendChild(title);
        if (item.body) {
          var body = document.createElement('div');
          body.className = 'mom-card-body';
          body.textContent = escapeText(item.body);
          card.appendChild(body);
        }
        momItemsEl.appendChild(card);
      });
    }

    momStocksEl.innerHTML = '';
    if (!stocks.length) {
      var emptyStock = document.createElement('div');
      emptyStock.className = 'empty-row';
      emptyStock.textContent = '관심종목 데이터 없음';
      momStocksEl.appendChild(emptyStock);
    } else {
      stocks.slice(0, 8).forEach(function (stock) {
        var row = document.createElement('div');
        row.className = 'stock-row';
        var left = document.createElement('div');
        left.className = 'stock-name';
        left.textContent = escapeText(stock.display_name || stock.symbol);
        var right = document.createElement('div');
        var price = document.createElement('span');
        price.className = 'stock-price';
        price.textContent = stock.price == null ? '-' : Number(stock.price).toLocaleString();
        var change = document.createElement('span');
        change.className = 'stock-change';
        if (stock.change_percent == null) {
          change.textContent = '';
        } else {
          var pct = Number(stock.change_percent);
          change.textContent = (pct > 0 ? '▲ ' : pct < 0 ? '▼ ' : '') + Math.abs(pct).toFixed(2) + '%';
        }
        right.appendChild(price);
        right.appendChild(change);
        row.appendChild(left);
        row.appendChild(right);
        momStocksEl.appendChild(row);
      });
    }
  }

  function registerMomDevice() {
    momStateEl.textContent = 'TV 등록 중…';
    return momFetch('register', {
      method: 'POST',
      body: JSON.stringify({ device_id: makeDeviceId(), device_name: 'Samsung Tizen TV' })
    }).then(function (data) {
      localStorage.setItem(MOM_TOKEN_KEY, data.tv_token);
      showApproval(data.approval_code);
      scheduleMomPoll();
    }).catch(function (error) {
      momStateEl.textContent = '등록 실패: ' + (error.message || 'unknown');
    });
  }

  function checkMomStatus() {
    if (!momToken()) return registerMomDevice();
    momStateEl.textContent = '승인 상태 확인 중…';
    return momFetch('status', { method: 'GET' }).then(function (data) {
      if (data.approved) return loadMomData();
      showApproval(data.approval_code);
    }).catch(function (error) {
      if (error.status === 401) {
        localStorage.removeItem(MOM_TOKEN_KEY);
        return registerMomDevice();
      }
      momStateEl.textContent = '연결 실패: ' + (error.message || 'unknown');
    });
  }

  function loadMomData() {
    return momFetch('data', { method: 'GET' }).then(function (data) {
      renderMomData(data);
    }).catch(function (error) {
      if (error.status === 403 && error.body) {
        showApproval(error.body.approval_code);
        return;
      }
      if (error.status === 401) {
        localStorage.removeItem(MOM_TOKEN_KEY);
        return registerMomDevice();
      }
      momStateEl.textContent = '데이터 실패: ' + (error.message || 'unknown');
    });
  }

  function scheduleMomPoll() {
    clearTimeout(momPollTimer);
    if (!momOpen) return;
    momPollTimer = setTimeout(function () {
      checkMomStatus().then(function () {
        scheduleMomPoll();
      });
    }, 10000);
  }

  function toggleMomHome() {
    momOpen = !momOpen;
    if (!momOpen) {
      momHomeEl.classList.add('hidden');
      clearTimeout(momPollTimer);
      return;
    }

    momHomeEl.classList.remove('hidden');
    updateMomClock();
    clearInterval(momClockTimer);
    momClockTimer = setInterval(updateMomClock, 30000);
    checkMomStatus().then(function () {
      scheduleMomPoll();
    });
  }

  document.addEventListener('keydown', function (event) {
    var code = event.keyCode || event.which;
    var key = event.key || '';

    if (code === 404) {
      event.preventDefault();
      toggleMomHome();
      return;
    }
    if (key === 'ArrowUp' || key === 'ArrowRight' || code === 427) {
      event.preventDefault();
      changeChannel(1, false);
      return;
    }
    if (key === 'ArrowDown' || key === 'ArrowLeft' || code === 428) {
      event.preventDefault();
      changeChannel(-1, false);
      return;
    }
    if (key === 'Enter' || code === 13) {
      showBanner();
      return;
    }
    if (key === 'MediaPlayPause' || code === 10252) {
      if (video.paused) video.play(); else video.pause();
      return;
    }
    if (key === 'MediaPlay' || code === 415) {
      video.play();
      return;
    }
    if (key === 'MediaPause' || code === 19) {
      video.pause();
      return;
    }
    if (code === 10009 || key === 'Back') {
      if (momOpen) {
        toggleMomHome();
        return;
      }
      try {
        if (window.tizen && tizen.application) {
          tizen.application.getCurrentApplication().exit();
        } else {
          history.back();
        }
      } catch (e) {
        history.back();
      }
    }
  });

  window.addEventListener('beforeunload', function () {
    clearTimeout(momPollTimer);
    clearInterval(momClockTimer);
    destroyPlayer();
  });

  loadPlaylist();
})();
