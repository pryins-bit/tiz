'use strict';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let state = 'NONE';
let listener = null;
const calls = [];
const avplay = {
  getState() { return state; },
  open(url) { calls.push(['open', url]); state = 'IDLE'; },
  setListener(value) { calls.push(['setListener']); listener = value; },
  setDisplayRect(x, y, w, h) { calls.push(['setDisplayRect', x, y, w, h]); },
  setDisplayMethod(mode) { calls.push(['setDisplayMethod', mode]); },
  prepareAsync(success) { calls.push(['prepareAsync']); state = 'READY'; success(); },
  play() { calls.push(['play']); state = 'PLAYING'; },
  pause() { calls.push(['pause']); state = 'PAUSED'; },
  stop() { calls.push(['stop']); state = 'IDLE'; },
  close() { calls.push(['close']); state = 'NONE'; }
};

const windowObject = { webapis: { avplay } };
const context = { window: windowObject, console };
context.global = context;

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'avplay-adapter.js'), 'utf8');
vm.runInNewContext(source, context, { filename: 'avplay-adapter.js' });

const player = windowObject.KoreaTVAVPlay;
assert(player, 'KoreaTVAVPlay API missing');
assert.equal(player.isAvailable(), true);

let played = 0;
let buffering = 0;
let errors = [];
const started = player.start('https://example.test/live.m3u8', {
  onplaying() { played += 1; },
  onbuffering(active) { if (active) buffering += 1; },
  onerror(error) { errors.push(String(error)); }
});
assert.equal(started, true);
assert.equal(played, 1, 'prepareAsync success must lead to one play callback');
assert.equal(player.isActive(), true);
assert.equal(state, 'PLAYING');
assert(calls.some((x) => x[0] === 'open' && x[1].endsWith('.m3u8')));
assert(calls.some((x) => x[0] === 'setListener'));
assert(calls.some((x) => x[0] === 'setDisplayRect' && x[3] === 1920 && x[4] === 1080));
assert(calls.some((x) => x[0] === 'prepareAsync'));
assert(calls.some((x) => x[0] === 'play'));

listener.onbufferingstart();
listener.onbufferingcomplete();
assert.equal(buffering, 1);

assert.equal(player.pause(), true);
assert.equal(state, 'PAUSED');
assert.equal(player.isPaused(), true);
assert.equal(player.resume(), true);
assert.equal(state, 'PLAYING');
assert.equal(player.isPaused(), false);

player.stop();
assert.equal(player.isActive(), false);
assert.equal(state, 'NONE');
assert(calls.some((x) => x[0] === 'stop'));
assert(calls.some((x) => x[0] === 'close'));
assert.deepEqual(errors, []);

console.log('Samsung AVPlay adapter simulation OK');
