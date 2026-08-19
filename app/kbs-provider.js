(function () {
  'use strict';

  // KBS1/KBS2 are intentionally NOT fixed M3U8 entries. Their stable identity
  // is the official KBS channel code; the playable service_url is transient and
  // must be resolved again when the channel is selected.
  var KBS_API_BASE = 'https://cfpwwwapi.kbs.co.kr/api/v1/landing/live/channel_code/';
  var CHANNELS = [
    {
      id: 'KBS1.official',
      name: 'KBS1',
      channelCode: '11',
      apiUrl: KBS_API_BASE + '11',
      pageUrl: 'https://onair.kbs.co.kr/index.html?sname=onair&stype=live&ch_code=11&ch_type=globalList'
    },
    {
      id: 'KBS2.official',
      name: 'KBS2',
      channelCode: '12',
      apiUrl: KBS_API_BASE + '12',
      pageUrl: 'https://onair.kbs.co.kr/index.html?sname=onair&stype=live&ch_code=12&ch_type=globalList'
    }
  ];

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  var webFrame = null;
  var generation = 0;
  var installedApi = null;

  function channelByPageUrl(url) {
    for (var i = 0; i < CHANNELS.length; i += 1) {
      if (CHANNELS[i].pageUrl === url) return CHANNELS[i];
    }
    return null;
  }

  function specialM3U() {
    var lines = [];
    CHANNELS.forEach(function (channel) {
      lines.push('#EXTINF:-1 tvg-id="' + channel.id + '" group-title="공중파",' + channel.name + ' (KBS 공식 동적)');
      lines.push(channel.pageUrl);
    });
    return lines.join('\n') + '\n';
  }

  function injectSpecialChannels(text) {
    text = String(text || '').replace(/\r/g, '');
    if (text.indexOf('tvg-id="KBS1.official"') >= 0 || text.indexOf('tvg-id="KBS2.official"') >= 0) return text;
    if (text.indexOf('#EXTM3U') === 0) {
      var rest = text.slice('#EXTM3U'.length).replace(/^\n+/, '');
      return '#EXTM3U\n' + specialM3U() + rest;
    }
    return '#EXTM3U\n' + specialM3U() + text;
  }

  function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return '';
  }

  function isPlaylistRequest(url) {
    return /(?:^|\/)korea\.m3u(?:[?#]|$)/i.test(String(url || ''));
  }

  function clonePlaylistResponse(response, text) {
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      headers: response.headers,
      text: function () { return Promise.resolve(injectSpecialChannels(text)); }
    };
  }

  if (nativeFetch) {
    window.fetch = function (input, init) {
      var url = requestUrl(input);
      if (!isPlaylistRequest(url)) return nativeFetch(input, init);
      return nativeFetch(input, init).then(function (response) {
        return response.text().then(function (text) {
          return clonePlaylistResponse(response, text);
        });
      });
    };
  }

  function serviceUrlFromPayload(data) {
    var item = data && data.channel_item && data.channel_item[0];
    var url = item && item.service_url ? String(item.service_url) : '';
    if (!/^https?:\/\//i.test(url)) return '';
    return url;
  }

  function resolveOfficialStream(channel) {
    if (!nativeFetch) return Promise.reject(new Error('fetch unavailable'));
    return nativeFetch(channel.apiUrl + '?_=' + Date.now(), {
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'Accept': 'application/json' }
    }).then(function (response) {
      if (!response.ok) throw new Error('KBS live API HTTP ' + response.status);
      return response.json();
    }).then(function (data) {
      var serviceUrl = serviceUrlFromPayload(data);
      if (!serviceUrl) throw new Error('KBS live API service_url missing');
      return serviceUrl;
    });
  }

  function removeWebFallback() {
    if (webFrame && webFrame.parentNode) webFrame.parentNode.removeChild(webFrame);
    webFrame = null;
  }

  function showOfficialWeb(channel, callbacks, expectedGeneration) {
    removeWebFallback();
    if (typeof document === 'undefined' || !document.body) {
      if (callbacks && typeof callbacks.onerror === 'function') callbacks.onerror('kbs-web-fallback-unavailable');
      return;
    }
    var frame = document.createElement('iframe');
    webFrame = frame;
    frame.id = 'kbsOfficialOnAirFallback';
    frame.src = channel.pageUrl;
    frame.setAttribute('title', channel.name + ' KBS 공식 온에어');
    frame.setAttribute('tabindex', '-1');
    frame.style.position = 'fixed';
    frame.style.left = '0';
    frame.style.top = '0';
    frame.style.width = '100%';
    frame.style.height = '100%';
    frame.style.border = '0';
    frame.style.background = '#000';
    frame.style.zIndex = '4';
    frame.onload = function () {
      if (expectedGeneration !== generation || webFrame !== frame) return;
      if (callbacks && typeof callbacks.onplaying === 'function') callbacks.onplaying();
    };
    document.body.appendChild(frame);
  }

  function wrapAvPlay(api) {
    if (!api || api.__kbsOfficialProviderWrapped) return api;
    if (typeof api.start !== 'function') return api;

    var originalStart = api.start;
    var originalStop = typeof api.stop === 'function' ? api.stop : null;

    api.start = function (url, callbacks) {
      generation += 1;
      var expectedGeneration = generation;
      removeWebFallback();

      var channel = channelByPageUrl(url);
      if (!channel) return originalStart.call(api, url, callbacks);

      resolveOfficialStream(channel).then(function (serviceUrl) {
        if (expectedGeneration !== generation) return;
        var proxiedCallbacks = callbacks || {};
        var started = originalStart.call(api, serviceUrl, {
          onbuffering: proxiedCallbacks.onbuffering,
          onplaying: proxiedCallbacks.onplaying,
          onerror: function () {
            if (expectedGeneration !== generation) return;
            showOfficialWeb(channel, proxiedCallbacks, expectedGeneration);
          }
        });
        if (!started) showOfficialWeb(channel, proxiedCallbacks, expectedGeneration);
      }).catch(function () {
        if (expectedGeneration !== generation) return;
        showOfficialWeb(channel, callbacks || {}, expectedGeneration);
      });

      return true;
    };

    if (originalStop) {
      api.stop = function () {
        generation += 1;
        removeWebFallback();
        return originalStop.apply(api, arguments);
      };
    }

    api.__kbsOfficialProviderWrapped = true;
    installedApi = api;
    return api;
  }

  function installAvPlayHook() {
    if (window.KoreaTVAVPlay) {
      wrapAvPlay(window.KoreaTVAVPlay);
      return;
    }

    var holder = null;
    try {
      Object.defineProperty(window, 'KoreaTVAVPlay', {
        configurable: true,
        enumerable: true,
        get: function () { return holder; },
        set: function (value) { holder = wrapAvPlay(value); }
      });
    } catch (e) {}
  }

  installAvPlayHook();

  window.KoreaTVKBS = {
    channels: CHANNELS.slice(),
    injectSpecialChannels: injectSpecialChannels,
    resolveOfficialStream: resolveOfficialStream,
    serviceUrlFromPayload: serviceUrlFromPayload,
    hideWebFallback: removeWebFallback,
    installedApi: function () { return installedApi; }
  };
}());
