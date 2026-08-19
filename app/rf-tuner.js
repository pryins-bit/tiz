(function () {
  'use strict';

  var active = false;
  var returning = false;
  var lastChannelNumber = 0;
  var lastResolution = null;
  var lastSource = null;

  function errorText(error) {
    if (!error) return 'unknown error';
    return String(error.name || error.message || error);
  }

  function showToast(text) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    setTimeout(function () { el.classList.add('hidden'); }, 3200);
  }

  function setButtonNote(text) {
    var button = document.querySelector('[data-action="rf-tv"]');
    if (!button) return;
    var note = button.querySelector('small');
    if (note) note.textContent = text;
  }

  function rfApiAvailable() {
    return !!(window.tizen && tizen.tvwindow && tizen.systeminfo);
  }

  function snapshotCurrentChannel() {
    try {
      if (window.KoreaTVPlayer && typeof window.KoreaTVPlayer.currentNumber === 'function') {
        lastChannelNumber = Number(window.KoreaTVPlayer.currentNumber()) || 0;
      }
    } catch (e) {}
  }

  function stopIptvPlane() {
    try {
      if (window.KoreaTVAVPlay && typeof window.KoreaTVAVPlay.stop === 'function') {
        window.KoreaTVAVPlay.stop();
      }
    } catch (e0) {}

    var video = document.getElementById('video');
    if (!video) return;
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch (e1) {}
  }

  function resumeIptv() {
    returning = false;
    try {
      if (lastChannelNumber > 0 && window.KoreaTVPlayer && typeof window.KoreaTVPlayer.tuneToNumber === 'function') {
        window.KoreaTVPlayer.tuneToNumber(lastChannelNumber);
      }
    } catch (e) {
      showToast('IPTV 복귀 실패: ' + errorText(e));
    }
  }

  function allVideoSources(info) {
    var list = [];
    if (info && Array.isArray(info.connected)) list = list.concat(info.connected);
    if (info && Array.isArray(info.disconnected)) list = list.concat(info.disconnected);
    return list;
  }

  function findTvSource(success, failure) {
    try {
      tizen.systeminfo.getPropertyValue('VIDEOSOURCE', function (info) {
        var sources = allVideoSources(info);
        var tv = null;
        for (var i = 0; i < sources.length; i += 1) {
          if (sources[i] && sources[i].type === 'TV') {
            tv = sources[i];
            break;
          }
        }
        if (!tv) {
          failure(new Error('VIDEOSOURCE에 TV 입력이 없습니다'));
          return;
        }
        success(tv);
      }, failure);
    } catch (error) {
      failure(error);
    }
  }

  function rememberDiagnostics(source) {
    lastSource = source || null;
    try {
      var res = tizen.tvwindow.getVideoResolution('MAIN');
      if (res) {
        lastResolution = {
          width: Number(res.width || 0),
          height: Number(res.height || 0),
          frequency: Number(res.frequency || 0),
          aspectRatio: String(res.aspectRatio || '')
        };
      }
    } catch (e) {}
  }

  function failEnter(error) {
    active = false;
    returning = true;
    setButtonNote('RF 실패 · IPTV 유지');
    showToast('RF 튜너 실패: ' + errorText(error));
    resumeIptv();
  }

  function showWindow(source) {
    try {
      tizen.tvwindow.show(function () {
        active = true;
        rememberDiagnostics(source);
        setButtonNote('RF 튜너 사용 중 · 뒤로가기로 복귀');
      }, failEnter, ['0', '0', '100%', '100%'], 'MAIN', 'FRONT');
    } catch (error) {
      failEnter(error);
    }
  }

  function enter() {
    if (active || returning) return;
    if (!rfApiAvailable()) {
      setButtonNote('TVWindow API/권한 없음');
      showToast('이 실행 경로에서는 RF 튜너 API를 사용할 수 없습니다.');
      return;
    }

    snapshotCurrentChannel();
    stopIptvPlane();
    setButtonNote('RF TV 입력 찾는 중…');

    findTvSource(function (source) {
      try {
        tizen.tvwindow.setSource(source, function (selected) {
          showWindow(selected || source);
        }, failEnter, 'MAIN');
      } catch (error) {
        failEnter(error);
      }
    }, failEnter);
  }

  function exit() {
    if (!active || returning) return;
    returning = true;
    try {
      tizen.tvwindow.hide(function () {
        active = false;
        var suffix = '';
        if (lastResolution && lastResolution.width && lastResolution.height) {
          suffix = ' · RF ' + lastResolution.width + '×' + lastResolution.height;
        }
        setButtonNote('안테나/RF 방송 실험');
        resumeIptv();
        showToast('인터넷 TV로 복귀' + suffix);
      }, function (error) {
        returning = false;
        showToast('RF 화면 종료 실패: ' + errorText(error));
      }, 'MAIN');
    } catch (error) {
      returning = false;
      showToast('RF 화면 종료 실패: ' + errorText(error));
    }
  }

  function actionNode(target) {
    var node = target;
    while (node && node !== document) {
      if (node.getAttribute && node.getAttribute('data-action')) return node;
      node = node.parentNode;
    }
    return null;
  }

  document.addEventListener('click', function (event) {
    var node = actionNode(event.target);
    if (!node || node.getAttribute('data-action') !== 'rf-tv') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    enter();
  }, true);

  document.addEventListener('keydown', function (event) {
    if (!active) return;
    var code = Number(event.keyCode || event.which || 0);
    var key = event.key || event.keyIdentifier || '';
    if (key === 'Back' || code === 10009 || key === 'Escape' || code === 27) {
      event.preventDefault();
      event.stopImmediatePropagation();
      exit();
    }
  }, true);

  window.KoreaTVRFTuner = {
    isAvailable: rfApiAvailable,
    enter: enter,
    exit: exit,
    isActive: function () { return active; },
    diagnostics: function () {
      return {
        active: active,
        source: lastSource,
        resolution: lastResolution,
        lastChannelNumber: lastChannelNumber
      };
    }
  };

  if (!rfApiAvailable()) setButtonNote('standalone WGT에서 실험');
}());
