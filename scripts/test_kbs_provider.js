'use strict';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const kbs1Page = 'https://onair.kbs.co.kr/index.html?sname=onair&stype=live&ch_code=11&ch_type=globalList';
const calls = [];

function response(text, url = '') {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    url,
    headers: {},
    text() { return Promise.resolve(text); }
  };
}

function nativeFetch(input) {
  const url = typeof input === 'string' ? input : input.url;
  calls.push(['fetch', url]);
  if (url.includes('korea.m3u')) {
    return Promise.resolve(response('#EXTM3U\n#EXTINF:-1 tvg-id="demo" group-title="기타",Demo\nhttps://example.test/demo.m3u8\n', url));
  }
  if (url.startsWith('https://onair.kbs.co.kr/')) {
    return Promise.resolve(response('<script>window.live="https:\\/\\/cdn.kbs.example\\/live\\/master.m3u8?token=abc";</script>', url));
  }
  return Promise.reject(new Error('unexpected fetch ' + url));
}

const documentObject = {
  body: {
    appendChild() {},
    removeChild() {}
  },
  createElement() {
    return {
      style: {},
      setAttribute() {},
      parentNode: null
    };
  }
};

const windowObject = { fetch: nativeFetch };
const context = {
  window: windowObject,
  document: documentObject,
  Promise,
  Date,
  console
};
context.global = context;

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'kbs-provider.js'), 'utf8');
vm.runInNewContext(source, context, { filename: 'kbs-provider.js' });

assert(windowObject.KoreaTVKBS, 'KoreaTVKBS API missing');
assert.equal(windowObject.KoreaTVKBS.channels.length, 2);
assert.equal(windowObject.KoreaTVKBS.channels[0].name, 'KBS1');
assert.equal(windowObject.KoreaTVKBS.channels[1].name, 'KBS2');

const playlistResponse = await windowObject.fetch('https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u');
const playlist = await playlistResponse.text();
assert(playlist.includes('tvg-id="KBS1.official"'));
assert(playlist.includes('tvg-id="KBS2.official"'));
assert(playlist.includes('ch_code=11'));
assert(playlist.includes('ch_code=12'));
assert(!playlist.includes('vthanhtivi'));

assert.equal(
  windowObject.KoreaTVKBS.extractM3U8('x https:\\/\\/cdn.example\\/a.m3u8?x=1 y'),
  'https://cdn.example/a.m3u8?x=1'
);

let startedUrl = '';
windowObject.KoreaTVAVPlay = {
  start(url, callbacks) {
    startedUrl = url;
    calls.push(['start', url]);
    if (callbacks && callbacks.onplaying) callbacks.onplaying();
    return true;
  },
  stop() { calls.push(['stop']); },
  isAvailable() { return true; }
};

let played = 0;
assert.equal(windowObject.KoreaTVAVPlay.start(kbs1Page, { onplaying() { played += 1; } }), true);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(startedUrl, 'https://cdn.kbs.example/live/master.m3u8?token=abc');
assert.equal(played, 1);
assert(calls.some((item) => item[0] === 'fetch' && item[1].startsWith('https://onair.kbs.co.kr/')));

console.log('KBS official dynamic provider simulation OK');
