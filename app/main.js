(function () {
  'use strict';

  var PLAYLIST_URL = 'https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u';
  var MOM_API_URL = 'https://inzopchhmvljprbpvzcs.supabase.co/functions/v1/mom-tv';
  var MOM_TOKEN_KEY = 'mom_tv_token_v1';
  var MOM_DEVICE_KEY = 'mom_tv_device_id_v1';
  var FAVORITES_KEY = 'korea_tv_favorites_v1';
  var RECENTS_KEY = 'korea_tv_recents_v1';
  var FAILURES_KEY = 'korea_tv_failures_v1';
  var LAST_CHANNEL_KEY = 'korea_tv_last_channel_v1';

  var video = document.getElementById('video');
  var statusEl = document.getElementById('status');
  var bannerEl = document.getElementById('banner');
  var nameEl = document.getElementById('channelName');
  var metaEl = document.getElementById('channelMeta');
  var helpEl = document.getElementById('help');
  var toastEl = document.getElementById('toast');
  var dimEl = document.getElementById('dim');

  var tvHomeEl = document.getElementById('tvHome');
  var homeClockEl = document.getElementById('homeClock');
  var homeNowNameEl = document.getElementById('homeNowName');
  var homeChannelListEl = document.getElementById('homeChannelList');
  var homeListTitleEl = document.getElementById('homeListTitle');
  var favCountEl = document.getElementById('favCount');
  var healthTextEl = document.getElementById('healthText');

  var browserPanelEl = document.getElementById('browserPanel');
  var browserTitleEl = document.getElementById('browserTitle');
  var browserSubtitleEl = document.getElementById('browserSubtitle');
  var categoryTabsEl = document.getElementById('categoryTabs');
  var browserListEl = document.getElementById('browserList');

  var searchPanelEl = document.getElementById('searchPanel');
  var searchInputEl = document.getElementById('searchInput');
  var searchResultsEl = document.getElementById('searchResults');

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
  var toastTimer = null;
  var failedThisRound = {};
  var favorites = readJson(FAVORITES_KEY, []);
  var recents = readJson(RECENTS_KEY, []);
  var failures = readJson(FAILURES_KEY, {});
  var homeOpen = false;
  var browserOpen = false;
  var searchOpen = false;
  var momOpen = false;
  var momPollTimer = null;
  var momClockTimer = null;
  var homeClockTimer = null;

  function readJson(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function channelKey(channel) {
    return String(channel && (channel.tvgId || channel.name || channel.url) || '').toLowerCase();
  }

  function parseAttr(meta, name) {
    var match = new RegExp(name + '="([^"]*)"', 'i').exec(meta || '');
    return match ? match[1] : '';
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
        var name = comma >= 0 ? line.slice(comma + 1).trim() : 'Channel ' + (out.length + 1);
        pending = {
          name: name,
          meta: line,
          group: parseAttr(line, 'group-title') || '기타',
          tvgId: parseAttr(line, 'tvg-id')
        };
        continue;
      }
      if (line.charAt(0) === '#') continue;
      if (pending && /^https?:\/\//i.test(line)) {
        pending.url = line;
        pending.key = channelKey(pending);
        out.push(pending);
        pending = null;
      }
    }
    return out;
  }

  function currentChannel() { return channels[index] || null; }

  function showStatus(text) {
    statusEl.textContent = text;
    statusEl.classList.remove('hidden');
  }

  function hideStatus() { statusEl.classList.add('hidden'); }

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.add('hidden'); }, 2200);
  }

  function showBanner() {
    var channel = currentChannel();
    if (!channel) return;
    nameEl.textContent = (index + 1) + ' / ' + channels.length + '  ' + channel.name;
    metaEl.textContent = channel.group + (isFavorite(channel) ? ' · ★ 즐겨찾기' : '') + ' · ' + channel.url;
    bannerEl.classList.remove('hidden');
    helpEl.classList.remove('hidden');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () {
      bannerEl.classList.add('hidden');
      helpEl.classList.add('hidden');
    }, 4500);
  }

  function isFavorite(channel) {
    var key = channelKey(channel);
    return favorites.indexOf(key) >= 0;
  }

  function toggleFavorite(channel) {
    if (!channel) return;
    var key = channelKey(channel);
    var at = favorites.indexOf(key);
    if (at >= 0) {
      favorites.splice(at, 1);
      toast('즐겨찾기에서 제거');
    } else {
      favorites.unshift(key);
      toast('★ 즐겨찾기에 추가');
    }
    saveJson(FAVORITES_KEY, favorites.slice(0, 100));
    renderHome();
    showBanner();
  }

  function addRecent(channel) {
    if (!channel) return;
    var key = channelKey(channel);
    recents = recents.filter(function (x) { return x !== key; });
    recents.unshift(key);
    recents = recents.slice(0, 30);
    saveJson(RECENTS_KEY, recents);
    try { localStorage.setItem(LAST_CHANNEL_KEY, key); } catch (e) {}
  }

  function failureInfo(channel) {
    return failures[channel && channel.url] || null;
  }

  function isAutoSkipped(channel) {
    var info = failureInfo(channel);
    if (!info) return false;
    if (info.blocked) return true;
    return info.count >= 3 && Date.now() - Number(info.last || 0) < 24 * 60 * 60 * 1000;
  }

  function recordFailure(channel, manual) {
    if (!channel) return;
    var item = failures[channel.url] || { count: 0, last: 0, blocked: false };
    item.count = manual ? Math.max(99, Number(item.count || 0) + 1) : Number(item.count || 0) + 1;
    item.last = Date.now();
    if (manual) item.blocked = true;
    failures[channel.url] = item;
    saveJson(FAILURES_KEY, failures);
    updateHealth();
  }

  function updateHealth() {
    var blocked = 0;
    var recentFails = 0;
    Object.keys(failures).forEach(function (url) {
      var info = failures[url] || {};
      if (info.blocked) blocked += 1;
      else if (Date.now() - Number(info.last || 0) < 24 * 60 * 60 * 1000) recentFails += 1;
    });
    healthTextEl.textContent = blocked ? blocked + '개 수동 제외 · ' + recentFails + '개 최근 실패' : (recentFails ? recentFails + '개 최근 실패' : '실패 기록 없음');
  }

  function destroyPlayer() {
    clearTimeout(failureTimer);
    failureTimer = null;
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e2) {}
  }

  function markFailedAndAdvance(reason) {
    var channel = currentChannel();
    if (!channel || failedThisRound[channel.url]) return;
    failedThisRound[channel.url] = true;
    recordFailure(channel, false);
    showStatus('재생 실패: ' + channel.name + '\n다음 채널로 이동 중…');
    setTimeout(function () { changeChannel(1, true); }, 650);
  }

  function attachCommonEvents() {
    video.onerror = function () { markFailedAndAdvance('video-error'); };
    video.onplaying = function () {
      clearTimeout(failureTimer);
      hideStatus();
      addRecent(currentChannel());
      renderHome();
      showBanner();
    };
  }

  function playChannel() {
    if (!channels.length) { showStatus('재생할 채널이 없습니다.'); return; }
    var channel = currentChannel();
    if (isAutoSkipped(channel)) { changeChannel(1, true); return; }

    destroyPlayer();
    attachCommonEvents();
    showStatus('재생 중: ' + channel.name);
    homeNowNameEl.textContent = channel.name;
    failureTimer = setTimeout(function () { markFailedAndAdvance('timeout'); }, 12000);

    var nativeHls = '';
    try { nativeHls = video.canPlayType('application/vnd.apple.mpegurl'); } catch (e) {}
    if (nativeHls) {
      video.src = channel.url;
      var nativePlay = video.play();
      if (nativePlay && typeof nativePlay.catch === 'function') nativePlay.catch(function () { markFailedAndAdvance('native-play-rejected'); });
      return;
    }

    if (window.Hls && window.Hls.isSupported()) {
      hls = new window.Hls({ enableWorker: false, lowLatencyMode: false, backBufferLength: 30 });
      hls.loadSource(channel.url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
        var p = video.play();
        if (p && typeof p.catch === 'function') p.catch(function () { markFailedAndAdvance('hls-play-rejected'); });
      });
      hls.on(window.Hls.Events.ERROR, function (event, data) { if (data && data.fatal) markFailedAndAdvance('hls-fatal'); });
      return;
    }
    markFailedAndAdvance('no-hls-support');
  }

  function findNextPlayable(start, delta) {
    if (!channels.length) return 0;
    var candidate = start;
    for (var attempts = 0; attempts < channels.length; attempts += 1) {
      candidate = (candidate + delta + channels.length) % channels.length;
      if (!failedThisRound[channels[candidate].url] && !isAutoSkipped(channels[candidate])) return candidate;
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

  function tuneToKey(key) {
    for (var i = 0; i < channels.length; i += 1) {
      if (channelKey(channels[i]) === key) {
        index = i;
        closeAllPanels();
        playChannel();
        return true;
      }
    }
    return false;
  }

  function loadPlaylist() {
    showStatus('최신 채널 목록을 불러오는 중…');
    fetch(PLAYLIST_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (response) { if (!response.ok) throw new Error('HTTP ' + response.status); return response.text(); })
      .then(function (text) {
        channels = parseM3U(text);
        if (!channels.length) throw new Error('채널 0개');
        var last = '';
        try { last = localStorage.getItem(LAST_CHANNEL_KEY) || ''; } catch (e) {}
        for (var i = 0; i < channels.length; i += 1) if (channelKey(channels[i]) === last) { index = i; break; }
        failedThisRound = {};
        updateHealth();
        renderHome();
        playChannel();
        setTimeout(openHome, 900);
      })
      .catch(function (error) { showStatus('채널 목록을 불러오지 못했습니다.\n' + String(error && error.message ? error.message : error)); });
  }

  function formatClock() {
    var now = new Date();
    var days = ['일','월','화','수','목','금','토'];
    var hh = now.getHours() < 10 ? '0' + now.getHours() : now.getHours();
    var mm = now.getMinutes() < 10 ? '0' + now.getMinutes() : now.getMinutes();
    return (now.getMonth() + 1) + '월 ' + now.getDate() + '일 ' + days[now.getDay()] + '요일  ' + hh + ':' + mm;
  }

  function updateHomeClock() { homeClockEl.textContent = formatClock(); }
  function updateMomClock() { momClockEl.textContent = formatClock(); }

  function channelByKey(key) {
    for (var i = 0; i < channels.length; i += 1) if (channelKey(channels[i]) === key) return channels[i];
    return null;
  }

  function makeChannelCard(channel) {
    var button = document.createElement('button');
    button.className = 'channel-card focusable';
    button.setAttribute('data-channel-key', channelKey(channel));
    var n = document.createElement('div'); n.className = 'card-name'; n.textContent = channel.name;
    var m = document.createElement('div'); m.className = 'card-meta'; m.textContent = (isFavorite(channel) ? '★ · ' : '') + channel.group;
    button.appendChild(n); button.appendChild(m);
    return button;
  }

  function renderHome() {
    if (!channels.length) return;
    var channel = currentChannel();
    homeNowNameEl.textContent = channel ? channel.name : '';
    favCountEl.textContent = favorites.length + '개';
    updateHealth();
    homeChannelListEl.innerHTML = '';
    var keys = favorites.concat(recents.filter(function (k) { return favorites.indexOf(k) < 0; })).slice(0, 6);
    homeListTitleEl.textContent = favorites.length ? '즐겨찾기 / 최근 채널' : '최근 채널';
    var added = 0;
    keys.forEach(function (key) {
      var item = channelByKey(key);
      if (item) { homeChannelListEl.appendChild(makeChannelCard(item)); added += 1; }
    });
    if (!added) {
      var empty = document.createElement('div'); empty.className = 'empty-home'; empty.textContent = '채널을 시청하거나 초록 버튼으로 즐겨찾기를 추가하세요.'; homeChannelListEl.appendChild(empty);
    }
  }

  function openHome() {
    closeBrowser(); closeSearch(); closeMom();
    homeOpen = true;
    tvHomeEl.classList.remove('hidden');
    dimEl.classList.add('hidden');
    updateHomeClock();
    clearInterval(homeClockTimer);
    homeClockTimer = setInterval(updateHomeClock, 30000);
    renderHome();
    setTimeout(function () { focusFirst(tvHomeEl); }, 20);
  }

  function closeHome() { homeOpen = false; tvHomeEl.classList.add('hidden'); clearInterval(homeClockTimer); }

  function uniqueGroups() {
    var preferred = ['공중파','드라마·영화','케이블·일반','뉴스·경제','쇼핑','종교'];
    var found = {};
    channels.forEach(function (c) { found[c.group] = true; });
    var result = preferred.filter(function (g) { return found[g]; });
    Object.keys(found).forEach(function (g) { if (result.indexOf(g) < 0) result.push(g); });
    return result;
  }

  function renderBrowserRows(list) {
    browserListEl.innerHTML = '';
    if (!list.length) { var empty = document.createElement('div'); empty.className = 'empty-home'; empty.textContent = '표시할 채널이 없습니다.'; browserListEl.appendChild(empty); return; }
    list.forEach(function (channel) {
      var row = document.createElement('button');
      row.className = 'browser-row focusable';
      row.setAttribute('data-channel-key', channelKey(channel));
      var a = document.createElement('span'); a.className = 'browser-index'; a.textContent = String(channels.indexOf(channel) + 1);
      var b = document.createElement('span'); b.className = 'browser-name'; b.textContent = (isFavorite(channel) ? '★ ' : '') + channel.name;
      var c = document.createElement('span'); c.className = 'browser-group'; c.textContent = channel.group;
      row.appendChild(a); row.appendChild(b); row.appendChild(c); browserListEl.appendChild(row);
    });
  }

  function openBrowser(mode, value) {
    closeHome(); closeSearch(); closeMom();
    browserOpen = true;
    browserPanelEl.classList.remove('hidden'); dimEl.classList.remove('hidden');
    categoryTabsEl.innerHTML = '';
    var list = channels.slice();
    if (mode === 'favorites') { browserTitleEl.textContent = '즐겨찾기'; browserSubtitleEl.textContent = favorites.length + '개 채널'; list = favorites.map(channelByKey).filter(Boolean); }
    else if (mode === 'recent') { browserTitleEl.textContent = '최근 채널'; browserSubtitleEl.textContent = '최근 시청 순서'; list = recents.map(channelByKey).filter(Boolean); }
    else if (mode === 'failed') { browserTitleEl.textContent = '채널 상태'; browserSubtitleEl.textContent = '최근 실패/수동 제외 채널'; list = channels.filter(function (c) { return !!failureInfo(c); }); }
    else {
      browserTitleEl.textContent = '카테고리'; browserSubtitleEl.textContent = '좌우로 분류 이동 · 확인으로 재생';
      var groups = uniqueGroups();
      groups.forEach(function (group) {
        var tab = document.createElement('button'); tab.className = 'category-tab focusable' + (group === value ? ' active' : ''); tab.textContent = group; tab.setAttribute('data-group', group); categoryTabsEl.appendChild(tab);
      });
      var selected = value || groups[0];
      list = channels.filter(function (c) { return c.group === selected; });
    }
    renderBrowserRows(list);
    setTimeout(function () { focusFirst(browserPanelEl); }, 20);
  }

  function closeBrowser() { browserOpen = false; browserPanelEl.classList.add('hidden'); if (!searchOpen && !momOpen) dimEl.classList.add('hidden'); }

  function renderSearchResults() {
    var q = String(searchInputEl.value || '').trim().toLowerCase();
    var list = q ? channels.filter(function (c) { return (c.name + ' ' + c.group + ' ' + c.tvgId).toLowerCase().indexOf(q) >= 0; }).slice(0, 12) : recents.map(channelByKey).filter(Boolean).slice(0, 8);
    searchResultsEl.innerHTML = '';
    list.forEach(function (channel) {
      var row = document.createElement('button'); row.className = 'browser-row focusable'; row.setAttribute('data-channel-key', channelKey(channel));
      row.innerHTML = '<span class="browser-index">' + (channels.indexOf(channel) + 1) + '</span><span class="browser-name"></span><span class="browser-group"></span>';
      row.children[1].textContent = (isFavorite(channel) ? '★ ' : '') + channel.name;
      row.children[2].textContent = channel.group;
      searchResultsEl.appendChild(row);
    });
  }

  function openSearch() {
    closeHome(); closeBrowser(); closeMom();
    searchOpen = true; searchPanelEl.classList.remove('hidden'); dimEl.classList.remove('hidden');
    searchInputEl.value = ''; renderSearchResults();
    setTimeout(function () { searchInputEl.focus(); }, 30);
  }

  function closeSearch() { searchOpen = false; searchPanelEl.classList.add('hidden'); if (!browserOpen && !momOpen) dimEl.classList.add('hidden'); try { searchInputEl.blur(); } catch (e) {} }
  searchInputEl.addEventListener('input', renderSearchResults);

  function manualReportCurrent() {
    var channel = currentChannel();
    if (!channel) return;
    recordFailure(channel, true);
    toast('현재 채널을 자동 건너뛰도록 기억했습니다.');
    closeAllPanels();
    changeChannel(1, true);
  }

  function resetFailure(channel) {
    if (!channel) return;
    delete failures[channel.url]; saveJson(FAILURES_KEY, failures); updateHealth(); toast('실패 기록을 초기화했습니다.');
  }

  function closeAllPanels() { closeHome(); closeBrowser(); closeSearch(); closeMom(); dimEl.classList.add('hidden'); }

  function focusFirst(root) {
    var target = root.querySelector('.focusable:not(.hidden)');
    if (target) try { target.focus(); } catch (e) {}
  }

  function visibleFocusables() {
    return Array.prototype.slice.call(document.querySelectorAll('.focusable')).filter(function (el) {
      return el.offsetParent !== null && !el.disabled;
    });
  }

  function moveFocus(delta) {
    var list = visibleFocusables();
    if (!list.length) return;
    var at = list.indexOf(document.activeElement);
    if (at < 0) at = 0; else at = (at + delta + list.length) % list.length;
    list[at].focus();
    try { list[at].scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
  }

  document.addEventListener('click', function (event) {
    var node = event.target;
    while (node && node !== document && !node.getAttribute('data-action') && !node.getAttribute('data-channel-key') && !node.getAttribute('data-group')) node = node.parentNode;
    if (!node || node === document) return;
    var channelKeyValue = node.getAttribute('data-channel-key');
    if (channelKeyValue) { tuneToKey(channelKeyValue); return; }
    var group = node.getAttribute('data-group');
    if (group) { openBrowser('categories', group); return; }
    var action = node.getAttribute('data-action');
    if (action === 'continue') closeAllPanels();
    else if (action === 'favorites') openBrowser('favorites');
    else if (action === 'recent') openBrowser('recent');
    else if (action === 'categories') openBrowser('categories');
    else if (action === 'search') openSearch();
    else if (action === 'mom') openMom();
    else if (action === 'health') openBrowser('failed');
    else if (action === 'report') manualReportCurrent();
    else if (action === 'close-browser') { closeBrowser(); openHome(); }
  });

  function momToken() { try { return localStorage.getItem(MOM_TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function makeDeviceId() {
    var saved = '';
    try { saved = localStorage.getItem(MOM_DEVICE_KEY) || ''; } catch (e) {}
    if (saved) return saved;
    var value = 'samsung-tv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(MOM_DEVICE_KEY, value); } catch (e2) {}
    return value;
  }
  function momFetch(action, options) {
    options = options || {}; var headers = options.headers || {}; var token = momToken();
    if (token) headers['x-tv-token'] = token;
    headers['Content-Type'] = 'application/json'; options.headers = headers;
    return fetch(MOM_API_URL + '?action=' + encodeURIComponent(action), options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) { var error = new Error(body.error || ('HTTP ' + response.status)); error.status = response.status; error.body = body; throw error; }
        return body;
      });
    });
  }
  function showApproval(code) { approvalCodeEl.textContent = code || '------'; momApprovalEl.classList.remove('hidden'); momContentEl.classList.add('hidden'); momStateEl.textContent = '승인 대기 중'; }
  function renderMomData(data) {
    var items = data.items || [], stocks = data.stocks || [];
    momApprovalEl.classList.add('hidden'); momContentEl.classList.remove('hidden'); momStateEl.textContent = '승인됨 · 자동 동기화';
    momItemsEl.innerHTML = '';
    if (!items.length) momItemsEl.innerHTML = '<div class="empty-row">등록된 일정/복약/공지 없음</div>';
    items.slice(0,6).forEach(function (item) { var card = document.createElement('div'); card.className='mom-card'; var t=document.createElement('div'); t.className='mom-card-title'; t.textContent=String(item.title||''); card.appendChild(t); if(item.body){var b=document.createElement('div');b.className='mom-card-body';b.textContent=String(item.body);card.appendChild(b);} momItemsEl.appendChild(card); });
    momStocksEl.innerHTML = '';
    if (!stocks.length) momStocksEl.innerHTML = '<div class="empty-row">관심종목 데이터 없음</div>';
    stocks.slice(0,8).forEach(function (stock) { var row=document.createElement('div');row.className='stock-row';var left=document.createElement('div');left.className='stock-name';left.textContent=String(stock.display_name||stock.symbol||'');var right=document.createElement('div');var price=document.createElement('span');price.className='stock-price';price.textContent=stock.price==null?'-':Number(stock.price).toLocaleString();var change=document.createElement('span');change.className='stock-change';if(stock.change_percent!=null){var pct=Number(stock.change_percent);change.textContent=(pct>0?'▲ ':pct<0?'▼ ':'')+Math.abs(pct).toFixed(2)+'%';}right.appendChild(price);right.appendChild(change);row.appendChild(left);row.appendChild(right);momStocksEl.appendChild(row); });
  }
  function registerMomDevice() {
    momStateEl.textContent='TV 등록 중…';
    return momFetch('register',{method:'POST',body:JSON.stringify({device_id:makeDeviceId(),device_name:'Samsung Tizen TV'})}).then(function(data){try{localStorage.setItem(MOM_TOKEN_KEY,data.tv_token);}catch(e){}showApproval(data.approval_code);scheduleMomPoll();}).catch(function(error){momStateEl.textContent='등록 실패: '+(error.message||'unknown');});
  }
  function checkMomStatus() {
    if(!momToken()) return registerMomDevice();
    momStateEl.textContent='승인 상태 확인 중…';
    return momFetch('status',{method:'GET'}).then(function(data){if(data.approved)return loadMomData();showApproval(data.approval_code);}).catch(function(error){if(error.status===401){try{localStorage.removeItem(MOM_TOKEN_KEY);}catch(e){}return registerMomDevice();}momStateEl.textContent='연결 실패: '+(error.message||'unknown');});
  }
  function loadMomData() {
    return momFetch('data',{method:'GET'}).then(renderMomData).catch(function(error){if(error.status===403&&error.body){showApproval(error.body.approval_code);return;}if(error.status===401){try{localStorage.removeItem(MOM_TOKEN_KEY);}catch(e){}return registerMomDevice();}momStateEl.textContent='데이터 실패: '+(error.message||'unknown');});
  }
  function scheduleMomPoll() { clearTimeout(momPollTimer); if(!momOpen)return; momPollTimer=setTimeout(function(){checkMomStatus().then(scheduleMomPoll);},10000); }
  function openMom() { closeHome();closeBrowser();closeSearch();momOpen=true;momHomeEl.classList.remove('hidden');dimEl.classList.remove('hidden');updateMomClock();clearInterval(momClockTimer);momClockTimer=setInterval(updateMomClock,30000);checkMomStatus().then(scheduleMomPoll); }
  function closeMom() { momOpen=false;momHomeEl.classList.add('hidden');clearTimeout(momPollTimer);clearInterval(momClockTimer);if(!browserOpen&&!searchOpen)dimEl.classList.add('hidden'); }

  document.addEventListener('keydown', function (event) {
    var code = event.keyCode || event.which;
    var key = event.key || '';
    var typing = document.activeElement === searchInputEl;

    if (code === 403) { event.preventDefault(); homeOpen ? closeHome() : openHome(); return; }
    if (code === 404) { event.preventDefault(); toggleFavorite(currentChannel()); return; }
    if (code === 405) { event.preventDefault(); openSearch(); return; }
    if (code === 406) { event.preventDefault(); openBrowser('categories'); return; }

    if (key === 'Escape' || code === 10009 || key === 'Back') {
      if (searchOpen) { event.preventDefault(); closeSearch(); openHome(); return; }
      if (browserOpen) { event.preventDefault(); closeBrowser(); openHome(); return; }
      if (momOpen) { event.preventDefault(); closeMom(); openHome(); return; }
      if (homeOpen) { event.preventDefault(); closeHome(); return; }
      try { if (window.tizen && tizen.application) tizen.application.getCurrentApplication().exit(); else history.back(); } catch (e) { history.back(); }
      return;
    }

    if (typing) {
      if (key === 'ArrowDown') { event.preventDefault(); var first = searchResultsEl.querySelector('.focusable'); if (first) first.focus(); }
      return;
    }

    if (homeOpen || browserOpen || searchOpen) {
      if (key === 'ArrowRight') { event.preventDefault(); moveFocus(1); return; }
      if (key === 'ArrowLeft') { event.preventDefault(); moveFocus(-1); return; }
      if (key === 'ArrowDown') { event.preventDefault(); moveFocus(homeOpen ? 4 : 1); return; }
      if (key === 'ArrowUp') { event.preventDefault(); moveFocus(homeOpen ? -4 : -1); return; }
      if (key === 'Enter' || code === 13) { var active=document.activeElement; if(active&&typeof active.click==='function'){event.preventDefault();active.click();return;} }
    }

    if (key === 'ArrowUp' || key === 'ArrowRight' || code === 427) { event.preventDefault(); changeChannel(1,false); return; }
    if (key === 'ArrowDown' || key === 'ArrowLeft' || code === 428) { event.preventDefault(); changeChannel(-1,false); return; }
    if (key === 'Enter' || code === 13) { showBanner(); return; }
    if (key === 'MediaPlayPause' || code === 10252) { if(video.paused)video.play();else video.pause(); return; }
    if (key === 'MediaPlay' || code === 415) { video.play(); return; }
    if (key === 'MediaPause' || code === 19) { video.pause(); }
  });

  loadPlaylist();
}());
