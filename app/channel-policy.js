(function () {
  'use strict';

  // Explicit owner decision from 2026-08-19: remove only these seven foreign
  // channels from the TV lineup because they are a poor audience fit. This is
  // not a stream-health blacklist and must not expand without a new decision.
  var EXCLUDED_TVG_IDS = {
    'bloombergtv': true,
    'france24_en': true,
    'euronews_en': true,
    'fifaplus_en': true,
    'trtworld': true,
    'newsmax': true,
    'ntd': true
  };

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  function parseAttr(meta, name) {
    var match = new RegExp(name + '="([^"]*)"', 'i').exec(meta || '');
    return match ? match[1] : '';
  }

  function shouldExclude(extinf) {
    var id = parseAttr(extinf, 'tvg-id').toLowerCase();
    return !!EXCLUDED_TVG_IDS[id];
  }

  function filterPlaylist(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var output = [];
    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i];
      if (line.indexOf('#EXTINF:') === 0 && shouldExclude(line)) {
        // Drop the metadata line plus its following media URL. Preserve any
        // unrelated comments/records and never classify the stream as failed.
        if (i + 1 < lines.length && /^https?:\/\//i.test(lines[i + 1].trim())) i += 1;
        continue;
      }
      output.push(line);
    }
    return output.join('\n');
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
      text: function () { return Promise.resolve(filterPlaylist(text)); }
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

  window.KoreaTVChannelPolicy = {
    excludedTvgIds: Object.keys(EXCLUDED_TVG_IDS),
    filterPlaylist: filterPlaylist,
    shouldExclude: shouldExclude
  };
}());
