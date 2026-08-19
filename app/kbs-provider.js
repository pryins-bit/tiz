(function () {
  'use strict';

  // KBS1/KBS2 are intentionally NOT fixed M3U8 entries. The provider injects
  // official KBS ON AIR page URLs into the normal channel list and resolves a
  // current HLS URL at playback time. If resolution is not possible on the
  // target Tizen WebView, the official ON AIR page is used as the final fallback.
  var CHANNELS = [
    {
      id: 'KBS1.official',
      name: 'KBS1',
      pageUrl: 'https://onair.kbs.co.kr/index.html?sname=onair&stype=live&ch_code=11&ch_type=globalList'
    },
    {
      id: 'KBS2.official',
      name: 'KBS2',
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
      lines.push('#EXTINF:-1 tvg-id="' + channel.id + '" group-title="공중파",' + channel.name + ' (KBS 공식 ON AIR)');
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

  function unescapePage(text) {
    return String(text || '')
      .replace(/\\u002[fF]/g, '/')
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&');
  }

  function extractM3U8(text) {
    var source = unescapePage(text);
    var absolute = /(https?:\/\/[^"'<>\\\s]+?\.m3u8(?:\?[^"'<>\\\s]*)?)/i.exec(source);
    if (absolute) return absolute[1];
    var protocolRelative = /(\/\/[^"'<>\\\s]+?\.m3u8(?:\?[^"'<>\\\s]*)?)/i.exec(source);
    if (protocolRelative) return 'https:' + protocolRelative[1];
    return '';
  }

  function resolveOfficialStream(channel) {
    if (!nativeFetch) return Promise.reject(new Error('fetch unavailable'));
    return nativeFetch(channel.pageUrl + '&_=' + Date.now(), {
      cache: 'no-store',
      credentials: 'omit'
    }).then(function (response) {
      if (!response.ok) throw new Error('KBS ON AIR HTTP ' + response.status);
      return response.text();
    }).then(function (html) {
      var streamUrl = extractM3U8(html);
      if (!streamUrl) throw new Error('KBS dynamic HLS URL not exposed in page response');
      return streamUrl;
    });
  }

  function removeWebFallback() {
    if (webFrame && webFrame.parentNode) webFrame.parentNode.removeChild(webFrame);
    webFrame = null;
  }

  function showOfficialWeb(channel, callbacks, expectedGeneration) {
    removeWebFallback();
    if (!document || !document.body) {
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

      resolveOfficialStream(channel).then(function (streamUrl) {
        if (expectedGeneration !== generation) return;
        var proxiedCallbacks = callbacks || {};
        var started = originalStart.call(api, streamUrl, {
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

      // main.js expects a synchronous boolean from the AVPlay adapter. KBS
      // resolution is asynchronous, so accepting the request here prevents the
      // normal HTML5 URL path from treating the official page itself as HLS.
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
    extractM3U8: extractM3U8,
    hideWebFallback: removeWebFallback,
    installedApi: function () { return installedApi; }
  };
}());
