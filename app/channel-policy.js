(function () {
  'use strict';

  // V2 finalized lineup: 45 ordinary playlist channels + KBS1/KBS2
  // special-provider channels = 47 visible channels total.
  // Broad discovery/registry data stay available for audit and future review,
  // but only this owner-approved presentation set is visible on the TV.
  var ALLOWED_TVG_IDS = [
    'HLANDTV.kr@SD',
    'HLATDTV.kr@SD',
    'OBSGyeonginTV.kr',
    'SBSTV.kr',
    'HLDPDTV.kr@SD',
    'KBSWorld.kr@SD',
    'ArirangUN.kr@SD',
    'KCTV.kr@SD',
    'NBS.kr@SD',
    'NHTV.kr@SD',
    'KTV.kr@SD',
    'NationalAssemblyTV.kr@SD',
    'TBSTV.kr@SD',
    'GugakTV.kr@SD',
    'GSMyShop.kr@SD',
    'GSShop.kr@SD',
    'HyundaiHomeShopping.kr@SD',
    'LotteHomeShopping.kr@SD',
    'ShinsegaeTVShopping.kr@SD',
    'ShoppingNT.kr@SD',
    'WShopping.kr@SD',
    'LotteOneTV.kr@SD',
    'BBSTV.kr@SD',
    'BTNTV.kr@SD',
    '1c4de0451ea0c534',
    '406f02c36fb0bbf1',
    'af16af24e5f20960',
    '9ef68bf1f70e70cc',
    '05f68da886351d47',
    'eaa3ed55fee9d4f4',
    '27ac5c3d7a0804bd',
    '73e33b20d6e24a46',
    '481692dcd69648d3',
    'a72fdf2094abe782',
    '4cdb7f1638ed16ed',
    '992b6985e7bd5b52',
    '77318ecb610c4d51',
    '278c76a81570bb46',
    'b913a82ad1339712',
    '9cfd89b909b48a6c',
    'a204567db85d2bc8',
    'e3a3870360bb68d5',
    '5ce3daa40449da98',
    '1909781e5872797b',
    'TVChosun2.kr@SD'
  ];

  var allowed = {};
  for (var i = 0; i < ALLOWED_TVG_IDS.length; i += 1) {
    allowed[String(ALLOWED_TVG_IDS[i]).toLowerCase()] = true;
  }

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  function parseAttr(meta, name) {
    var match = new RegExp(name + '="([^"]*)"', 'i').exec(meta || '');
    return match ? match[1] : '';
  }

  function isAllowed(extinf) {
    return !!allowed[parseAttr(extinf, 'tvg-id').toLowerCase()];
  }

  function filterPlaylist(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var output = ['#EXTM3U'];
    var seen = {};

    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i];
      if (line.indexOf('#EXTINF:') !== 0) continue;

      var id = parseAttr(line, 'tvg-id');
      var key = id.toLowerCase();
      var media = i + 1 < lines.length ? String(lines[i + 1] || '').trim() : '';
      if (!allowed[key] || seen[key] || !/^https?:\/\//i.test(media)) continue;

      seen[key] = true;
      output.push(line);
      output.push(media);
      i += 1;
    }

    return output.join('\n') + '\n';
  }

  function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return '';
  }

  function isPlaylistRequest(url) {
    return /(?:^|\/)korea\.m3u(?:[?#]|$)/i.test(String(url || ''));
  }

  function cloneResponse(response, text) {
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
          return cloneResponse(response, text);
        });
      });
    };
  }

  window.KoreaTVChannelPolicy = {
    allowedTvgIds: ALLOWED_TVG_IDS.slice(),
    filterPlaylist: filterPlaylist,
    isAllowed: isAllowed,
    expectedNormalCount: 45,
    expectedVisibleCount: 47
  };
}());
