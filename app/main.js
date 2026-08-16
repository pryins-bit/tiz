(function () {
  'use strict';

  var PLAYLIST_URL = 'https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u';
  var video = document.getElementById('video');
  var statusEl = document.getElementById('status');
  var bannerEl = document.getElementById('banner');
  var nameEl = document.getElementById('channelName');
  var urlEl = document.getElementById('channelUrl');
  var helpEl = document.getElementById('help');

  var channels = [];
  var index = 0;
  var hls = null;
  var bannerTimer = null;
  var failureTimer = null;
  var failedThisRound = {};

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

  document.addEventListener('keydown', function (event) {
    var code = event.keyCode || event.which;
    var key = event.key || '';

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

  window.addEventListener('beforeunload', destroyPlayer);
  loadPlaylist();
})();
