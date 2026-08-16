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

  // Tizen generations are inconsistent about what field/code they expose.
  // 403-406 are common Samsung TV color codes, while older Samsung examples
  // also expose 447-450. getSupportedKeys() remains authoritative when present.
  var FALLBACK_CODE_TO_NAME = {
    13: 'Enter',
    19: 'MediaPause',
    37: 'ArrowLeft',
    38: 'ArrowUp',
    39: 'ArrowRight',
    40: 'ArrowDown',
    403: 'ColorF0Red',
    404: 'ColorF1Green',
    405: 'ColorF2Yellow',
    406: 'ColorF3Blue',
    415: 'MediaPlay',
    413: 'MediaStop',
    427: 'ChannelUp',
    428: 'ChannelDown',
    447: 'ColorF0Red',
    448: 'ColorF1Green',
    449: 'ColorF2Yellow',
    450: 'ColorF3Blue',
    10009: 'Back',
    10252: 'MediaPlayPause'
  };

  var diagnostics = {
    apiAvailable: false,
    requested: REQUESTED_KEYS.slice(),
    supported: [],
    registered: [],
    codeToName: {},
    nameToCode: {},
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

    var names = REQUESTED_KEYS.slice();
    try {
      var supported = manager.getSupportedKeys();
      var supportedMap = {};
      for (var i = 0; i < supported.length; i += 1) {
        var item = supported[i];
        supportedMap[item.name] = item.code;
        diagnostics.supported.push({ name: item.name, code: item.code });
        rememberCode(item.name, item.code);
      }
      names = names.filter(function (name) { return Object.prototype.hasOwnProperty.call(supportedMap, name); });
    } catch (error) {
      diagnostics.errors.push('getSupportedKeys -> ' + errorText(error));
    }

    if (!names.length) return;
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
    var aliases = {
      Red: 'ColorF0Red', Green: 'ColorF1Green', Yellow: 'ColorF2Yellow', Blue: 'ColorF3Blue',
      ChannelPlus: 'ChannelUp', ChannelMinus: 'ChannelDown',
      MediaPlayPause: 'MediaPlayPause', MediaPlay: 'MediaPlay', MediaPause: 'MediaPause', MediaStop: 'MediaStop',
      Return: 'Back', Escape: 'Back'
    };
    return aliases[value] || value;
  }

  function nameFromEvent(event) {
    if (!event) return '';
    var candidates = [event.key, event.keyIdentifier, event.code];
    for (var i = 0; i < candidates.length; i += 1) {
      var named = normalizeNamedKey(candidates[i]);
      if (named && named !== 'Unidentified') {
        if (named.indexOf('ColorF') === 0 || named.indexOf('Channel') === 0 || named.indexOf('Media') === 0 || named.indexOf('Arrow') === 0 || named === 'Enter' || named === 'Back' || /^[0-9]$/.test(named)) return named;
      }
    }

    var code = Number(event.keyCode || event.which || 0);
    if (code >= 48 && code <= 57) return String(code - 48);
    if (code >= 96 && code <= 105) return String(code - 96);
    return diagnostics.codeToName[String(code)] || FALLBACK_CODE_TO_NAME[code] || '';
  }

  window.KoreaTVRemote = {
    getName: nameFromEvent,
    getCode: function (name) { return diagnostics.nameToCode[name] || null; },
    diagnostics: diagnostics
  };

  registerRemoteKeys();
}());
