(function () {
  'use strict';

  // Samsung delivers device-dependent buttons only after TVInputDevice
  // registration. Keep Volume/Home/Power platform-owned so normal TV controls
  // remain available even if Korea TV has a bug.
  var REQUESTED_KEYS = [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'ChannelUp', 'ChannelDown',
    'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
    'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop'
  ];

  // Samsung's own Tizen TV VOD reference app accepts both the documented
  // ChannelUp/ChannelDown codes and browser-style PageUp/PageDown variants.
  // Keep the documented color family at 403-406; 447-449 are volume codes on
  // Samsung Tizen and must never be treated as colors.
  var FALLBACK_CODE_TO_NAME = {
    13: 'Enter',
    19: 'MediaPause',
    33: 'ChannelUp',
    34: 'ChannelDown',
    37: 'ArrowLeft',
    38: 'ArrowUp',
    39: 'ArrowRight',
    40: 'ArrowDown',
    403: 'ColorF0Red',
    404: 'ColorF1Green',
    405: 'ColorF2Yellow',
    406: 'ColorF3Blue',
    413: 'MediaStop',
    415: 'MediaPlay',
    427: 'ChannelUp',
    428: 'ChannelDown',
    10009: 'Back',
    10252: 'MediaPlayPause'
  };

  var NAMED_ALIASES = {
    Red: 'ColorF0Red',
    Green: 'ColorF1Green',
    Yellow: 'ColorF2Yellow',
    Blue: 'ColorF3Blue',
    XF86Red: 'ColorF0Red',
    XF86Green: 'ColorF1Green',
    XF86Yellow: 'ColorF2Yellow',
    XF86Blue: 'ColorF3Blue',
    ChannelPlus: 'ChannelUp',
    ChannelMinus: 'ChannelDown',
    PageUp: 'ChannelUp',
    PageDown: 'ChannelDown',
    XF86RaiseChannel: 'ChannelUp',
    XF86LowerChannel: 'ChannelDown',
    XF86PlayBack: 'MediaPlayPause',
    XF86AudioPlay: 'MediaPlayPause',
    XF86AudioPause: 'MediaPause',
    XF86AudioStop: 'MediaStop',
    XF86Back: 'Back',
    Backspace: 'Back',
    Return: 'Back',
    Escape: 'Back'
  };

  // A few Samsung remotes emit two different-looking keydown events for one
  // physical rocker press (for example ChannelDown followed by ArrowDown or
  // PageDown). Main.js cannot safely distinguish those after the fact, so the
  // remote gateway owns full-screen zapping and suppresses same-direction
  // duplicates before they reach the player.
  var CHANNEL_DUPLICATE_GUARD_MS = 700;
  var lastZapDirection = 0;
  var lastZapAt = 0;

  var diagnostics = {
    apiAvailable: false,
    requested: REQUESTED_KEYS.slice(),
    supported: [],
    registered: [],
    codeToName: {},
    nameToCode: {},
    lastEvents: [],
    suppressedZaps: 0,
    directZaps: 0,
    errors: []
  };
  window.KoreaTVRemoteDiagnostics = diagnostics;

  function errorText(error) {
    if (!error) return 'unknown error';
    return String(error.name || '') + (error.message ? ': ' + error.message : '');
  }

  function rememberRegistered(names) {
    names.forEach(function (name) {
      if (diagnostics.registered.indexOf(name) < 0) diagnostics.registered.push(name);
    });
  }

  function rememberCode(name, code) {
    if (!name || code == null) return;
    diagnostics.codeToName[String(code)] = name;
    diagnostics.nameToCode[name] = Number(code);
  }

  Object.keys(FALLBACK_CODE_TO_NAME).forEach(function (code) {
    if (!diagnostics.codeToName[String(code)]) diagnostics.codeToName[String(code)] = FALLBACK_CODE_TO_NAME[code];
  });

  function registerIndividually(manager, names) {
    names.forEach(function (name) {
      try {
        manager.registerKey(name);
        rememberRegistered([name]);
      } catch (error) {
        diagnostics.errors.push(name + ' -> ' + errorText(error));
      }
    });
  }

  function registerRemoteKeys() {
    var manager;
    try {
      if (!window.tizen || !window.tizen.tvinputdevice) return;
      manager = window.tizen.tvinputdevice;
      diagnostics.apiAvailable = true;
    } catch (error) {
      diagnostics.errors.push('TVInputDevice unavailable -> ' + errorText(error));
      return;
    }

    // getSupportedKeys() is useful for discovering model-specific numeric
    // codes, but it is not an allow-list for registration. Samsung's reference
    // implementation registers the semantic names directly. Some older TVs
    // return incomplete enumeration results while registerKey still works.
    var names = REQUESTED_KEYS.slice();
    try {
      var supported = manager.getSupportedKeys();
      for (var i = 0; i < supported.length; i += 1) {
        var item = supported[i];
        diagnostics.supported.push({ name: item.name, code: item.code });
        rememberCode(item.name, item.code);
      }
    } catch (error) {
      diagnostics.errors.push('getSupportedKeys -> ' + errorText(error));
    }

    if (typeof manager.registerKeyBatch === 'function') {
      try {
        manager.registerKeyBatch(
          names,
          function () { rememberRegistered(names); },
          function (error) {
            diagnostics.errors.push('registerKeyBatch -> ' + errorText(error));
            registerIndividually(manager, names);
          }
        );
        return;
      } catch (error) {
        diagnostics.errors.push('registerKeyBatch throw -> ' + errorText(error));
      }
    }
    registerIndividually(manager, names);
  }

  function normalizeNamedKey(value) {
    value = String(value || '');
    if (!value || value === 'Unidentified') return '';
    if (/^[0-9]$/.test(value)) return value;
    return NAMED_ALIASES[value] || value;
  }

  function nameFromEvent(event) {
    if (!event) return '';

    var code = Number(event.keyCode || event.which || 0);
    if (code >= 48 && code <= 57) return String(code - 48);
    if (code >= 96 && code <= 105) return String(code - 96);

    // Prefer the model-specific keyCode map once available. This mirrors the
    // Samsung reference pattern and avoids browser key-string differences.
    var byCode = diagnostics.codeToName[String(code)] || FALLBACK_CODE_TO_NAME[code];
    if (byCode) return normalizeNamedKey(byCode);

    var candidates = [event.key, event.keyIdentifier, event.code];
    for (var i = 0; i < candidates.length; i += 1) {
      var named = normalizeNamedKey(candidates[i]);
      if (!named || named === 'Unidentified') continue;
      if (named.indexOf('ColorF') === 0 || named.indexOf('Channel') === 0 || named.indexOf('Media') === 0 || named.indexOf('Arrow') === 0 || named === 'Enter' || named === 'Back' || /^[0-9]$/.test(named)) return named;
    }
    return '';
  }

  function panelsOpen() {
    var ids = ['tvHome', 'browserPanel', 'searchPanel', 'momHome'];
    for (var i = 0; i < ids.length; i += 1) {
      var el = document.getElementById(ids[i]);
      if (el && !el.classList.contains('hidden')) return true;
    }
    return false;
  }

  function zapDirection(name) {
    if (name === 'ChannelUp') return -1;
    if (name === 'ChannelDown') return 1;
    if (panelsOpen()) return 0;
    if (name === 'ArrowUp' || name === 'ArrowLeft') return -1;
    if (name === 'ArrowDown' || name === 'ArrowRight') return 1;
    return 0;
  }

  function playerCanTune() {
    var player = window.KoreaTVPlayer;
    return !!(player && typeof player.currentNumber === 'function' && typeof player.channelCount === 'function' && typeof player.tuneToNumber === 'function');
  }

  function tuneOneStep(direction) {
    var player = window.KoreaTVPlayer;
    var current = Number(player.currentNumber());
    var total = Number(player.channelCount());
    if (!current || !total) return false;
    var target = ((current - 1 + direction + total) % total) + 1;
    return player.tuneToNumber(target) !== false;
  }

  function rememberEvent(event, name) {
    diagnostics.lastEvents.unshift({
      name: name,
      key: String(event && event.key || ''),
      keyIdentifier: String(event && event.keyIdentifier || ''),
      code: Number(event && (event.keyCode || event.which) || 0),
      repeat: !!(event && event.repeat),
      at: Date.now()
    });
    diagnostics.lastEvents = diagnostics.lastEvents.slice(0, 12);
  }

  window.KoreaTVRemote = {
    getName: nameFromEvent,
    getCode: function (name) { return diagnostics.nameToCode[name] || null; },
    diagnostics: diagnostics
  };

  document.addEventListener('keydown', function (event) {
    var name = nameFromEvent(event);
    rememberEvent(event, name);
    var direction = zapDirection(name);
    if (!direction || !playerCanTune()) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.repeat) {
      diagnostics.suppressedZaps += 1;
      return;
    }

    var now = Date.now();
    if (direction === lastZapDirection && now - lastZapAt < CHANNEL_DUPLICATE_GUARD_MS) {
      diagnostics.suppressedZaps += 1;
      return;
    }

    lastZapDirection = direction;
    lastZapAt = now;
    if (tuneOneStep(direction)) diagnostics.directZaps += 1;
  }, true);

  registerRemoteKeys();
}());
