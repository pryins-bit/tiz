(function () {
  'use strict';

  // Samsung delivers device-dependent buttons only after TVInputDevice
  // registration. Keep Volume/Home/Power platform-owned so normal TV controls
  // remain available even if Korea TV has a bug.
  var REQUESTED_KEYS = [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'ChannelUp', 'ChannelDown', 'ChannelList', 'PreviousChannel',
    'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
    'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop',
    'Info'
  ];

  // Samsung's documented key family. Keep 447-449 platform-owned volume keys;
  // they must never be mistaken for color shortcuts.
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
    457: 'Info',
    10009: 'Back',
    10073: 'ChannelList',
    10190: 'PreviousChannel',
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
    XF86Info: 'Info',
    XF86Back: 'Back',
    Backspace: 'Back',
    Return: 'Back',
    Escape: 'Back'
  };

  // Some Samsung remotes emit two different-looking keydown events for one
  // physical rocker press. The remote gateway owns full-screen zapping and
  // suppresses same-direction duplicates before they reach the player.
  var CHANNEL_DUPLICATE_GUARD_MS = 700;
  var lastZapDirection = 0;
  var lastZapAt = 0;
  var rescueGeneration = 0;
  var debugBadge = null;

  var diagnostics = {
    apiAvailable: false,
    requested: REQUESTED_KEYS.slice(),
    supported: [],
    registered: [],
    codeToName: {},
    nameToCode: {},
    lastEvents: [],
    listenerTargets: [],
    suppressedZaps: 0,
    directZaps: 0,
    directRedPlays: 0,
    directRescuePlays: 0,
    rescueRetries: 0,
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

  function registerOne(manager, name) {
    try {
      manager.registerKey(name);
      rememberRegistered([name]);
      return true;
    } catch (error) {
      diagnostics.errors.push(name + ' -> ' + errorText(error));
      return false;
    }
  }

  function registerIndividually(manager, names) {
    names.forEach(function (name) { registerOne(manager, name); });
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

    // Discover the model-specific code when possible. Do not use this as an
    // allow-list because older televisions can enumerate fewer keys than they
    // are still able to register.
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

    // The physical-TV failure is specifically the rescue/color path. Register
    // Red individually first, matching Samsung's documented example. If that
    // direct registration fails, leave Red in the batch so it gets a second
    // registration path rather than silently losing the key.
    var redDirect = registerOne(manager, 'ColorF0Red');
    var names = REQUESTED_KEYS.filter(function (name) {
      return !(redDirect && name === 'ColorF0Red');
    });

    try {
      if (typeof manager.getKey === 'function') {
        var redKey = manager.getKey('ColorF0Red');
        if (redKey && redKey.code != null) rememberCode('ColorF0Red', redKey.code);
      }
    } catch (error2) {
      diagnostics.errors.push('getKey ColorF0Red -> ' + errorText(error2));
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
      } catch (error3) {
        diagnostics.errors.push('registerKeyBatch throw -> ' + errorText(error3));
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

    var byCode = diagnostics.codeToName[String(code)] || FALLBACK_CODE_TO_NAME[code];
    if (byCode) return normalizeNamedKey(byCode);

    var candidates = [event.key, event.keyIdentifier, event.code];
    for (var i = 0; i < candidates.length; i += 1) {
      var named = normalizeNamedKey(candidates[i]);
      if (!named || named === 'Unidentified') continue;
      if (named.indexOf('ColorF') === 0 || named.indexOf('Channel') === 0 || named.indexOf('Media') === 0 || named.indexOf('Arrow') === 0 || named === 'Enter' || named === 'Back' || named === 'Info' || /^[0-9]$/.test(named)) return named;
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

  // Channel-number semantics for this app are explicit: moving the rocker UP
  // increases the visible channel number (3 -> 4); moving DOWN decreases it.
  function zapDirection(name) {
    if (name === 'ChannelUp') return 1;
    if (name === 'ChannelDown') return -1;
    if (panelsOpen()) return 0;
    if (name === 'ArrowUp' || name === 'ArrowRight') return 1;
    if (name === 'ArrowDown' || name === 'ArrowLeft') return -1;
    return 0;
  }

  function playerCanTune() {
    var player = window.KoreaTVPlayer;
    return !!(player && typeof player.currentNumber === 'function' && typeof player.channelCount === 'function' && typeof player.tuneToNumber === 'function');
  }

  function forceCurrentChannel() {
    if (!playerCanTune()) return false;
    var player = window.KoreaTVPlayer;
    var current = Number(player.currentNumber());
    var total = Number(player.channelCount());
    if (!current || !total) return false;
    return player.tuneToNumber(current) !== false;
  }

  function forceCurrentChannelEventually(isRed) {
    rescueGeneration += 1;
    var generation = rescueGeneration;
    var tries = 0;

    function attempt() {
      if (generation !== rescueGeneration) return;
      tries += 1;
      if (forceCurrentChannel()) {
        diagnostics.directRescuePlays += 1;
        if (isRed) diagnostics.directRedPlays += 1;
        updateDebugBadge(isRed ? 'RED → TV' : 'RESCUE → TV', 0);
        return;
      }
      if (tries < 24) {
        diagnostics.rescueRetries += 1;
        setTimeout(attempt, 250);
      } else {
        updateDebugBadge('TV 준비 실패', 0);
      }
    }

    attempt();
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

  function ensureDebugBadge() {
    if (debugBadge || !document || !document.createElement || !document.body) return debugBadge;
    try {
      debugBadge = document.createElement('div');
      debugBadge.id = 'koreaTvRemoteDebug';
      debugBadge.textContent = 'RKEY2 READY';
      debugBadge.style.position = 'fixed';
      debugBadge.style.left = '14px';
      debugBadge.style.bottom = '12px';
      debugBadge.style.zIndex = '9999';
      debugBadge.style.padding = '5px 8px';
      debugBadge.style.borderRadius = '6px';
      debugBadge.style.background = 'rgba(0,0,0,.72)';
      debugBadge.style.border = '1px solid rgba(255,255,255,.28)';
      debugBadge.style.color = '#fff';
      debugBadge.style.fontSize = '14px';
      debugBadge.style.fontFamily = 'Arial,sans-serif';
      debugBadge.style.pointerEvents = 'none';
      document.body.appendChild(debugBadge);
    } catch (e) {
      debugBadge = null;
    }
    return debugBadge;
  }

  function updateDebugBadge(name, code) {
    var badge = ensureDebugBadge();
    if (!badge) return;
    badge.textContent = 'RKEY2 ' + String(name || '?') + (code ? ' / ' + code : '');
  }

  function isRescueKey(name) {
    if (name === 'ColorF0Red' || name === 'ChannelList' || name === 'PreviousChannel' || name === 'Info') return true;
    return panelsOpen() && (name === 'MediaPlay' || name === 'MediaPlayPause');
  }

  function handleRemoteKey(event) {
    if (!event || event.__koreaTvRemoteGatewaySeen) return;
    try { event.__koreaTvRemoteGatewaySeen = true; } catch (e) {}

    var name = nameFromEvent(event);
    var code = Number(event.keyCode || event.which || 0);
    rememberEvent(event, name);
    updateDebugBadge(name, code);

    // Rescue controls are capture-owned. Red is the primary requested key;
    // Channel List / Previous / Info and Play while a panel is open are backup
    // exits for remotes/firmware that never deliver a physical Red key event.
    if (isRescueKey(name)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      forceCurrentChannelEventually(name === 'ColorF0Red');
      return;
    }

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
  }

  function attachListener(target, label) {
    if (!target || typeof target.addEventListener !== 'function') return;
    try {
      target.addEventListener('keydown', handleRemoteKey, true);
      diagnostics.listenerTargets.push(label);
    } catch (error) {
      diagnostics.errors.push('listener ' + label + ' -> ' + errorText(error));
    }
  }

  function installListeners() {
    // Samsung documentation demonstrates body keydown. Keep document/window as
    // redundant capture points; a per-event marker prevents double handling.
    attachListener(window, 'window');
    attachListener(document, 'document');
    if (document.body) attachListener(document.body, 'body');
    else if (document.addEventListener) {
      document.addEventListener('DOMContentLoaded', function () {
        attachListener(document.body, 'body');
        ensureDebugBadge();
      }, false);
    }
    ensureDebugBadge();
  }

  window.KoreaTVRemote = {
    getName: nameFromEvent,
    getCode: function (name) { return diagnostics.nameToCode[name] || null; },
    forceCurrentChannel: function () { forceCurrentChannelEventually(false); },
    diagnostics: diagnostics
  };

  registerRemoteKeys();
  installListeners();
}());
