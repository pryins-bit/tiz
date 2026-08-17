'use strict';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function makeClassList(hidden) {
  const values = new Set(hidden ? ['hidden'] : []);
  return {
    contains(name) { return values.has(name); },
    add(name) { values.add(name); },
    remove(name) { values.delete(name); }
  };
}

function makeElement(hidden) {
  return { classList: makeClassList(hidden) };
}

const elements = {
  tvHome: makeElement(true),
  browserPanel: makeElement(true),
  searchPanel: makeElement(true),
  momHome: makeElement(true)
};

const listeners = {};
const document = {
  addEventListener(type, handler, capture) {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push({ handler, capture: !!capture });
  },
  getElementById(id) {
    if (!elements[id]) elements[id] = makeElement(true);
    return elements[id];
  }
};

function dispatch(type, event) {
  const queue = (listeners[type] || []).slice().sort((a, b) => Number(b.capture) - Number(a.capture));
  event.defaultPrevented = false;
  event.__stopped = false;
  event.preventDefault = function () { this.defaultPrevented = true; };
  event.stopImmediatePropagation = function () { this.__stopped = true; };
  for (const item of queue) {
    item.handler(event);
    if (event.__stopped) break;
  }
  return event;
}

let clock = 1000;
const FakeDate = { now: () => clock };
const batchCalls = [];
const individualCalls = [];
const tvinputdevice = {
  // Deliberately incomplete: the regression was filtering registration to
  // this list, which could drop color buttons on older firmware.
  getSupportedKeys() {
    return [
      { name: 'ChannelUp', code: 427 },
      { name: 'ChannelDown', code: 428 }
    ];
  },
  registerKeyBatch(names, success) {
    batchCalls.push(names.slice());
    if (success) success();
  },
  registerKey(name) {
    individualCalls.push(name);
  }
};

let currentChannel = 3;
const tuned = [];
const windowObject = {
  tizen: { tvinputdevice },
  KoreaTVPlayer: {
    currentNumber() { return currentChannel; },
    channelCount() { return 5; },
    tuneToNumber(number) {
      currentChannel = number;
      tuned.push(number);
      return true;
    }
  }
};

const context = {
  window: windowObject,
  document,
  Date: FakeDate,
  console,
  setTimeout,
  clearTimeout
};
context.global = context;

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'remote-input.js'), 'utf8');
vm.runInNewContext(source, context, { filename: 'remote-input.js' });

assert.strictEqual(batchCalls.length, 1, 'remote keys should register in one batch when supported');
const registered = batchCalls[0];
for (const name of ['ChannelUp', 'ChannelDown', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue']) {
  assert(registered.includes(name), 'batch registration missing ' + name);
}
assert.strictEqual(individualCalls.length, 0, 'individual fallback should not run after batch success');

const remote = windowObject.KoreaTVRemote;
assert(remote, 'KoreaTVRemote API was not installed');
assert.strictEqual(remote.getName({ key: 'XF86Red', keyCode: 0 }), 'ColorF0Red');
assert.strictEqual(remote.getName({ keyIdentifier: 'XF86Green', keyCode: 0 }), 'ColorF1Green');
assert.strictEqual(remote.getName({ key: 'PageUp', keyCode: 33 }), 'ChannelUp');
assert.strictEqual(remote.getName({ key: 'PageDown', keyCode: 34 }), 'ChannelDown');
assert.strictEqual(remote.getName({ key: 'XF86RaiseChannel', keyCode: 0 }), 'ChannelUp');
assert.strictEqual(remote.getName({ key: 'XF86LowerChannel', keyCode: 0 }), 'ChannelDown');
assert.notStrictEqual(remote.getName({ keyCode: 447 }), 'ColorF0Red', 'volume-up code must never masquerade as red');
assert.notStrictEqual(remote.getName({ keyCode: 448 }), 'ColorF1Green', 'volume-down code must never masquerade as green');
assert.notStrictEqual(remote.getName({ keyCode: 449 }), 'ColorF2Yellow', 'mute code must never masquerade as yellow');

// Owner contract: UP/+ increases the visible channel number. A single physical
// up press can surface as PageUp followed by ArrowUp; it must still be 3 -> 4,
// never 3 -> 5.
dispatch('keydown', { key: 'PageUp', keyCode: 33, repeat: false });
assert.strictEqual(currentChannel, 4, 'channel-up should increase exactly one channel');
assert.deepStrictEqual(tuned, [4]);
clock += 120;
dispatch('keydown', { key: 'ArrowUp', keyCode: 38, repeat: false });
assert.strictEqual(currentChannel, 4, 'same-direction duplicate must be suppressed');
assert.deepStrictEqual(tuned, [4]);

// DOWN/- decreases by exactly one and is a real opposite-direction action.
clock += 100;
dispatch('keydown', { key: 'PageDown', keyCode: 34, repeat: false });
assert.strictEqual(currentChannel, 3, 'channel-down should decrease exactly one channel');
assert.deepStrictEqual(tuned, [4, 3]);

// A firmware repeat event should never trigger another tune.
clock += 1000;
dispatch('keydown', { key: 'ChannelDown', keyCode: 428, repeat: true });
assert.strictEqual(currentChannel, 3);
assert.deepStrictEqual(tuned, [4, 3]);

// D-pad arrows belong to panel focus while a Korea TV panel is visible.
elements.tvHome.classList.remove('hidden');
clock += 1000;
dispatch('keydown', { key: 'ArrowUp', keyCode: 38, repeat: false });
assert.strictEqual(currentChannel, 3, 'panel arrow navigation must not tune channels');
assert.deepStrictEqual(tuned, [4, 3]);

// Channel rocker remains a channel control even if the home panel is visible.
clock += 1000;
dispatch('keydown', { key: 'ChannelUp', keyCode: 427, repeat: false });
assert.strictEqual(currentChannel, 4, 'channel-up should tune 3 -> 4 from an open panel');
assert.deepStrictEqual(tuned, [4, 3, 4]);

assert(windowObject.KoreaTVRemoteDiagnostics.suppressedZaps >= 2, 'duplicate/repeat suppressions should be observable');
assert.strictEqual(windowObject.KoreaTVRemoteDiagnostics.directZaps, 3, 'expected three direct one-step zaps');

console.log('Samsung remote runtime simulation OK');
