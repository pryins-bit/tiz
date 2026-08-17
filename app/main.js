(function () {
  'use strict';

  // Player core rebuilt around sanwhere/sky-iptv-tizen's Samsung AVPlay pattern.
  // Korea TV keeps its own reviewed channel source and existing bootstrap updater.
  var PLAYLIST_URL = 'https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u';
  var BUFFER_SEC = 3;
  var PREPARE_TIMEOUT_MS = 10000;
  var ZAP_DEBOUNCE_MS = 260;
  var playbackGeneration = 0;
  var prepareTimer = 0;
  var zapAt = 0;
  var osdTimer = 0;
  var channels = [];
  var currentIndex = 0;
  var failed = {};
  var playing = false;
  var engine = 'detecting';

  var avObject = document.getElementById('av-player');
  var video = document.getElementById('html5-player');
  var loading = document.getElementById('loading');
  var statusEl = document.getElementById('status');
  var osd = document.getElementById('osd');
  var osdNumber = document.getElementById('osdNumber');
  var osdName = document.getElementById('osdName');
  var osdMeta = document.getElementById('osdMeta');
  var errorToast = document.getElementById('errorToast');
  var diagnostic = document.getElementById('diagnostic');

  function hasAVPlay() {
    try {
      return !!(window.webapis && window.webapis.avplay);
    } catch (e) {
      return false;
    }
  }

  function av() {
    return window.webapis.avplay;
  }

  function samePlayback(generation) {
    return generation === playbackGeneration;
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || '';
  }

  function setDiagnostic(text) {
    if (diagnostic) diagnostic.textContent = text || '';
  }

  function showError(text) {
    if (!errorToast) return;
    errorToast.textContent = text;
    errorToast.classList.remove('hidden');
    clearTimeout(showError._timer);
    showError._timer = setTimeout(function () {
      errorToast.classList.add('hidden');
    }, 4500);
  }

  function currentChannel() {
    return channels[currentIndex] || null;
  }

  function showOSD(channel, sticky) {
    if (!channel || !osd) return;
    if (osdNumber) osdNumber.textContent = String(currentIndex + 1);
    if (osdName) osdName.textContent = channel.name || ('채널 ' + (currentIndex + 1));
    if (osdMeta) {
      var group = channel.group ? ' · ' + channel.group : '';
      osdMeta.textContent = 'CH ' + (currentIndex + 1) + ' / ' + channels.length + group;
    }
    osd.classList.remove('hidden');
    clearTimeout(osdTimer);
    if (!sticky) {
      osdTimer = setTimeout(function () { osd.classList.add('hidden'); }, 4200);
    }
  }

  function hideLoading() {
    if (loading) loading.classList.add('hidden');
  }

  function clearPrepareTimer() {
    if (prepareTimer) clearTimeout(prepareTimer);
    prepareTimer = 0;
  }

  function clearVideoHandlers() {
    if (!video) return;
    video.onplaying = null;
    video.onwaiting = null;
    video.onerror = null;
    video.onloadedmetadata = null;
  }

  function closeEngine() {
    clearPrepareTimer();
    playing = false;
    if (hasAVPlay()) {
      try { av().stop(); } catch (e1) {}
      try { av().close(); } catch (e2) {}
    }
    if (video) {
      clearVideoHandlers();
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch (e3) {}
      video.style.display = 'none';
    }
  }

  function errorText(error) {
    if (!error) return 'unknown';
    return String(error.name || error.message || error);
  }

  function markPlaying(generation) {
    if (!samePlayback(generation)) return;
    playing = true;
    hideLoading();
    setStatus('재생 중');
    setDiagnostic('SKY CORE · AVPLAY:PLAYING');
    showOSD(currentChannel(), false);
  }

  function failPlayback(generation, message) {
    if (!samePlayback(generation)) return;
    clearPrepareTimer();
    var ch = currentChannel();
    failed[currentIndex] = true;
    setStatus('재생 실패 · 다음 채널 시도');
    setDiagnostic('SKY CORE · AVPLAY:ERROR · ' + message);
    showError((ch ? ch.name + ' · ' : '') + message);
    setTimeout(function () {
      if (!samePlayback(generation) || !channels.length) return;
      requestChannelChange(1, null, true);
    }, 700);
  }

  function startAVPlay(url, generation) {
    engine = 'avplay';
    if (video) video.style.display = 'none';
    if (avObject) avObject.style.display = 'block';
    setDiagnostic('SKY CORE · AVPLAY:OPENING');

    var settled = false;
    function settleError(message) {
      if (settled || !samePlayback(generation)) return;
      settled = true;
      failPlayback(generation, message);
    }

    try {
      try { av().stop(); } catch (e0) {}
      try { av().close(); } catch (e1) {}

      av().open(url);
      av().setDisplayRect(0, 0, 1920, 1080);

      try {
        av().setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', BUFFER_SEC);
        av().setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', BUFFER_SEC);
      } catch (e2) {}

      try {
        av().setStreamingProperty('USER_AGENT', 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36');
      } catch (e3) {}

      if (/\.m3u8(?:[?#]|$)/i.test(url)) {
        try { av().setStreamingProperty('ADAPTIVE_INFO', 'BITRATES=|STARTBITRATE=LOWEST'); } catch (e4) {}
      }

      av().setListener({
        onbufferingstart: function () {
          if (!samePlayback(generation)) return;
          setStatus('버퍼링…');
          setDiagnostic('SKY CORE · AVPLAY:BUFFERING');
        },
        onbufferingprogress: function (percent) {
          if (!samePlayback(generation)) return;
          setStatus('버퍼링 ' + percent + '%');
        },
        onbufferingcomplete: function () {
          if (!samePlayback(generation)) return;
          setStatus('재생 준비 완료');
        },
        oncurrentplaytime: function () {
          if (!playing) markPlaying(generation);
        },
        onstreamcompleted: function () {
          settleError('stream ended');
        },
        onevent: function (type, data) {
          if (!samePlayback(generation)) return;
          if (type === 'PLAYER_MSG_HTTP_ERROR_CODE') setDiagnostic('SKY CORE · HTTP:' + String(data || ''));
        },
        onerror: function (error) {
          settleError(errorText(error));
        },
        onerrormsg: function (error, message) {
          settleError(errorText(error) + (message ? ' · ' + String(message) : ''));
        }
      });

      clearPrepareTimer();
      prepareTimer = setTimeout(function () {
        settleError('prepare timeout');
      }, PREPARE_TIMEOUT_MS);

      setStatus('채널 준비 중…');
      av().prepareAsync(function () {
        if (settled || !samePlayback(generation)) return;
        clearPrepareTimer();
        try {
          av().setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
        } catch (e5) {}
        try {
          av().play();
          settled = true;
          markPlaying(generation);
        } catch (e6) {
          settleError(errorText(e6));
        }
      }, function (error) {
        settleError(errorText(error));
      });
    } catch (error) {
      settleError(errorText(error));
    }
  }

  function startHTML5(url, generation) {
    engine = 'html5';
    if (avObject) avObject.style.display = 'none';
    if (!video) return failPlayback(generation, 'HTML5 video unavailable');
    video.style.display = 'block';
    setDiagnostic('SKY CORE · HTML5 FALLBACK');
    clearVideoHandlers();
    video.onplaying = function () { markPlaying(generation); };
    video.onwaiting = function () { if (samePlayback(generation)) setStatus('버퍼링…'); };
    video.onerror = function () { failPlayback(generation, 'video error'); };
    video.src = url;
    try {
      var promise = video.play();
      if (promise && promise.catch) promise.catch(function () {});
    } catch (e) {
      failPlayback(generation, errorText(e));
    }
  }

  function playChannel(force) {
    if (!channels.length) return false;
    var channel = currentChannel();
    if (!channel) return false;

    if (!force && failed[currentIndex]) return requestChannelChange(1, null, true);

    playbackGeneration += 1;
    var generation = playbackGeneration;
    closeEngine();
    showOSD(channel, true);
    setStatus('연결 중…');
    try { localStorage.setItem('korea_tv_sky_last_index', String(currentIndex)); } catch (e) {}

    if (hasAVPlay()) startAVPlay(channel.url, generation);
    else startHTML5(channel.url, generation);
    return true;
  }

  function wrapIndex(index) {
    if (!channels.length) return 0;
    return (index % channels.length + channels.length) % channels.length;
  }

  function requestChannelChange(delta, event, fromFailure) {
    if (!channels.length) return false;
    if (event) {
      event.preventDefault();
      if (event.repeat) return false;
    }
    var now = Date.now();
    if (!fromFailure && now - zapAt < ZAP_DEBOUNCE_MS) return false;
    zapAt = now;

    var attempts = 0;
    var next = currentIndex;
    do {
      next = wrapIndex(next + delta);
      attempts += 1;
      if (!failed[next] || attempts >= channels.length) break;
    } while (attempts < channels.length);

    currentIndex = next;
    return playChannel(true);
  }

  function tuneToNumber(number) {
    number = Number(number);
    if (!number || number < 1 || number > channels.length) {
      showError('없는 채널 번호: ' + number);
      return false;
    }
    currentIndex = number - 1;
    delete failed[currentIndex];
    playChannel(true);
    return true;
  }

  function currentNumber() {
    return channels.length ? currentIndex + 1 : 0;
  }

  function channelCount() {
    return channels.length;
  }

  function pausePlayback() {
    if (!playing) return;
    if (hasAVPlay()) {
      try { av().pause(); setStatus('일시정지'); } catch (e) {}
    } else if (video) {
      try { video.pause(); setStatus('일시정지'); } catch (e2) {}
    }
  }

  function resumePlayback() {
    if (hasAVPlay()) {
      try { av().play(); setStatus('재생 중'); } catch (e) {}
    } else if (video) {
      try { video.play(); setStatus('재생 중'); } catch (e2) {}
    }
  }

  function exitApp() {
    closeEngine();
    try {
      if (window.history && window.history.length > 1) {
        window.history.back();
        return;
      }
    } catch (e0) {}
    try {
      if (window.tizen && tizen.application) {
        tizen.application.getCurrentApplication().exit();
        return;
      }
    } catch (e1) {}
    try { window.close(); } catch (e2) {}
  }

  function keyName(event) {
    if (window.KoreaTVRemote && typeof window.KoreaTVRemote.getName === 'function') {
      return window.KoreaTVRemote.getName(event);
    }
    var code = Number(event.keyCode || event.which || 0);
    if (code === 38) return 'ArrowUp';
    if (code === 40) return 'ArrowDown';
    if (code === 37) return 'ArrowLeft';
    if (code === 39) return 'ArrowRight';
    if (code === 13) return 'Enter';
    if (code === 10009 || code === 27) return 'Back';
    if (code === 427 || code === 33) return 'ChannelUp';
    if (code === 428 || code === 34) return 'ChannelDown';
    return String(event.key || '');
  }

  function onKey(event) {
    var key = keyName(event);

    // The capture-phase remote gateway owns physical Channel +/- when available.
    // This remains as a fallback for environments where only main.js sees the key.
    if (key === 'ArrowUp' || key === 'ChannelUp') return requestChannelChange(1, event);
    if (key === 'ArrowDown' || key === 'ChannelDown') return requestChannelChange(-1, event);
    if (key === 'ArrowRight') return requestChannelChange(1, event);
    if (key === 'ArrowLeft') return requestChannelChange(-1, event);

    if (key === 'Enter' || key === 'Info') {
      event.preventDefault();
      showOSD(currentChannel(), false);
      return;
    }
    if (key === 'Back') {
      event.preventDefault();
      exitApp();
      return;
    }
    if (key === 'MediaPlay' || key === 'MediaPlayPause') {
      event.preventDefault();
      resumePlayback();
      return;
    }
    if (key === 'MediaPause') {
      event.preventDefault();
      pausePlayback();
      return;
    }
    if (key === 'MediaStop') {
      event.preventDefault();
      closeEngine();
      setStatus('정지');
      return;
    }

    if (key === 'ColorF0Red') {
      event.preventDefault();
      showOSD(currentChannel(), false);
      return;
    }
    if (key === 'ColorF1Green') {
      event.preventDefault();
      setStatus('채널 ' + currentNumber() + ' · 재생 엔진 ' + engine);
      return;
    }
    if (key === 'ColorF2Yellow') {
      event.preventDefault();
      showError('↑/CH+ 다음 · ↓/CH- 이전 · 숫자키 직접 이동');
      return;
    }
    if (key === 'ColorF3Blue') {
      event.preventDefault();
      var d = window.KoreaTVRemoteDiagnostics;
      setDiagnostic('SKY CORE · ' + engine.toUpperCase() + ' · REMOTE:' + (d && d.apiAvailable ? 'READY' : 'BASIC'));
    }
  }

  function attr(line, name) {
    var re = new RegExp('(?:^|\\s)' + name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '="([^"]*)"', 'i');
    var match = re.exec(line);
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
        var name = comma >= 0 ? line.slice(comma + 1).trim() : '';
        pending = {
          name: name || attr(line, 'tvg-name') || ('채널 ' + (out.length + 1)),
          group: attr(line, 'group-title'),
          logo: attr(line, 'tvg-logo')
        };
        continue;
      }
      if (line.charAt(0) === '#') continue;
      if (!/^https?:\/\//i.test(line)) continue;
      var channel = pending || { name: '채널 ' + (out.length + 1), group: '', logo: '' };
      channel.url = line;
      channel.number = out.length + 1;
      out.push(channel);
      pending = null;
    }
    return out;
  }

  function loadPlaylist() {
    setStatus('내 채널 목록 불러오는 중…');
    setDiagnostic('SKY CORE · PLAYLIST');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', PLAYLIST_URL + '?t=' + Date.now(), true);
    xhr.timeout = 30000;
    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 400) {
        setStatus('채널 목록 HTTP ' + xhr.status);
        return;
      }
      channels = parseM3U(xhr.responseText);
      if (!channels.length) {
        setStatus('채널이 없습니다');
        return;
      }
      try {
        var saved = Number(localStorage.getItem('korea_tv_sky_last_index'));
        if (saved >= 0 && saved < channels.length) currentIndex = saved;
      } catch (e) {}
      setStatus(channels.length + '개 채널 · 자동 재생');
      playChannel(true);
    };
    xhr.onerror = function () { setStatus('채널 목록 네트워크 오류'); };
    xhr.ontimeout = function () { setStatus('채널 목록 시간 초과'); };
    try { xhr.send(); } catch (e) { setStatus('채널 목록 요청 실패'); }
  }

  window.KoreaTVPlayer = {
    currentNumber: currentNumber,
    channelCount: channelCount,
    tuneToNumber: tuneToNumber,
    playChannel: playChannel,
    requestChannelChange: requestChannelChange,
    engine: function () { return engine; },
    channels: function () { return channels.slice(); }
  };

  document.addEventListener('keydown', onKey, false);
  window.addEventListener('beforeunload', closeEngine);
  loadPlaylist();
}());
