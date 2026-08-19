'use strict';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const calls = [];
let tunedNumber = 0;
const note = { textContent: '' };
const rfButton = {
  getAttribute(name) { return name === 'data-action' ? 'rf-tv' : null; },
  querySelector(selector) { return selector === 'small' ? note : null; },
  parentNode: null
};
const toast = {
  textContent: '',
  classList: { add() {}, remove() {} }
};
const video = {
  pause() { calls.push(['video.pause']); },
  removeAttribute(name) { calls.push(['video.removeAttribute', name]); },
  load() { calls.push(['video.load']); }
};

const listeners = {};
const documentObject = {
  querySelector(selector) { return selector === '[data-action="rf-tv"]' ? rfButton : null; },
  getElementById(id) {
    if (id === 'toast') return toast;
    if (id === 'video') return video;
    return null;
  },
  addEventListener(type, fn) { listeners[type] = fn; }
};
rfButton.parentNode = documentObject;

const tvSource = { type: 'TV', number: 1, signal: true };
const tizenObject = {
  systeminfo: {
    getPropertyValue(name, success) {
      calls.push(['systeminfo', name]);
      success({ connected: [tvSource], disconnected: [] });
    }
  },
  tvwindow: {
    setSource(source, success, _failure, type) {
      calls.push(['setSource', source.type, type]);
      success(source, type);
    },
    show(success, _failure, rectangle, type, zPosition) {
      calls.push(['show', rectangle.join(','), type, zPosition]);
      success(rectangle, type);
    },
    hide(success, _failure, type) {
      calls.push(['hide', type]);
      success();
    },
    getVideoResolution() {
      return { width: 3840, height: 2160, frequency: 60, aspectRatio: 'ASPECT_RATIO_16x9' };
    }
  }
};

const windowObject = {
  tizen: tizenObject,
  KoreaTVAVPlay: { stop() { calls.push(['avplay.stop']); } },
  KoreaTVPlayer: {
    currentNumber() { return 5; },
    tuneToNumber(number) { tunedNumber = number; calls.push(['tuneToNumber', number]); return true; }
  }
};

const context = {
  window: windowObject,
  tizen: tizenObject,
  document: documentObject,
  console,
  setTimeout(fn) { fn(); return 1; }
};
context.global = context;

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'rf-tuner.js'), 'utf8');
vm.runInNewContext(source, context, { filename: 'rf-tuner.js' });

const rf = windowObject.KoreaTVRFTuner;
assert(rf, 'KoreaTVRFTuner API missing');
assert.equal(rf.isAvailable(), true);

rf.enter();
assert.equal(rf.isActive(), true, 'RF mode should become active after TVWindow show');
assert(calls.some((x) => x[0] === 'systeminfo' && x[1] === 'VIDEOSOURCE'));
assert(calls.some((x) => x[0] === 'setSource' && x[1] === 'TV' && x[2] === 'MAIN'));
assert(calls.some((x) => x[0] === 'show' && x[2] === 'MAIN' && x[3] === 'FRONT'));
assert(calls.some((x) => x[0] === 'avplay.stop'));
assert.deepEqual(rf.diagnostics().resolution, {
  width: 3840,
  height: 2160,
  frequency: 60,
  aspectRatio: 'ASPECT_RATIO_16x9'
});

rf.exit();
assert.equal(rf.isActive(), false, 'RF mode should be inactive after hide');
assert(calls.some((x) => x[0] === 'hide' && x[1] === 'MAIN'));
assert.equal(tunedNumber, 5, 'IPTV should resume the previously selected channel');

console.log('Tizen TVWindow RF bridge simulation OK');
