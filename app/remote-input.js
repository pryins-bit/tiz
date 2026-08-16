(function () {
  'use strict';

  // Samsung Tizen only delivers device-dependent remote keys to a web app
  // after they have been registered through TVInputDevice. Do not register
  // Volume/Home/Power here: those should keep their platform-default behavior.
  var REQUESTED_KEYS = [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'ChannelUp', 'ChannelDown',
    'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
    'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop'
  ];

  var diagnostics = {
    apiAvailable: false,
    requested: REQUESTED_KEYS.slice(),
    supported: [],
    registered: [],
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
        supportedMap[supported[i].name] = supported[i].code;
        diagnostics.supported.push({ name: supported[i].name, code: supported[i].code });
      }
      names = names.filter(function (name) { return Object.prototype.hasOwnProperty.call(supportedMap, name); });
    } catch (error) {
      // If enumeration fails, try the requested keys individually. This also
      // preserves compatibility with older/quirky firmware implementations.
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

  // Samsung documents Arrow/Enter/Back as mandatory keys, so they do not need
  // registration. Older Tizen web runtimes can still expose only keyCode while
  // event.key is empty. main.js historically relied on event.key for arrows;
  // normalize only that missing-key case and leave genuine events untouched.
  var ARROW_KEYS = {
    37: 'ArrowLeft',
    38: 'ArrowUp',
    39: 'ArrowRight',
    40: 'ArrowDown'
  };

  function makeNormalizedKeyEvent(key, code) {
    var event;
    try {
      event = new KeyboardEvent('keydown', { key: key, keyCode: code, which: code, bubbles: true, cancelable: true });
    } catch (error) {
      event = document.createEvent('Event');
      event.initEvent('keydown', true, true);
      event.key = key;
      event.keyCode = code;
      event.which = code;
    }
    try { event.__koreaTVNormalized = true; } catch (e) {}
    return event;
  }

  document.addEventListener('keydown', function (event) {
    if (event.__koreaTVNormalized) return;
    var code = event.keyCode || event.which;
    var expected = ARROW_KEYS[code];
    if (!expected || event.key === expected) return;

    // Prevent the incomplete original event from reaching main.js, then send a
    // normalized equivalent that the existing navigation logic understands.
    event.preventDefault();
    event.stopImmediatePropagation();
    document.dispatchEvent(makeNormalizedKeyEvent(expected, code));
  }, true);

  registerRemoteKeys();
}());
