'use strict';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'channel-policy.js'), 'utf8');
const windowObject = { fetch: null };
const context = { window: windowObject, Promise, console };
context.global = context;
vm.runInNewContext(source, context, { filename: 'channel-policy.js' });

const policy = windowObject.KoreaTVChannelPolicy;
assert(policy, 'KoreaTVChannelPolicy API missing');
assert.equal(policy.excludedTvgIds.length, 7);
assert(policy.excludedTvgIds.includes('bloombergtv'));
assert(policy.excludedTvgIds.includes('france24_en'));
assert(policy.excludedTvgIds.includes('euronews_en'));
assert(policy.excludedTvgIds.includes('fifaplus_en'));
assert(policy.excludedTvgIds.includes('trtworld'));
assert(policy.excludedTvgIds.includes('newsmax'));
assert(policy.excludedTvgIds.includes('ntd'));

const input = `#EXTM3U
#EXTINF:-1 tvg-id="keep1" group-title="공중파",Keep One
https://example.test/keep1.m3u8
#EXTINF:-1 tvg-id="bloombergtv" group-title="뉴스·경제",Bloomberg TV+
https://example.test/bloomberg.m3u8
#EXTINF:-1 tvg-id="france24_en" group-title="뉴스·경제",France 24
https://example.test/france.m3u8
#EXTINF:-1 tvg-id="euronews_en" group-title="뉴스·경제",euronews english
https://example.test/euro.m3u8
#EXTINF:-1 tvg-id="fifaplus_en" group-title="케이블·일반",FIFA+
https://example.test/fifa.m3u8
#EXTINF:-1 tvg-id="trtworld" group-title="뉴스·경제",TRT World
https://example.test/trt.m3u8
#EXTINF:-1 tvg-id="newsmax" group-title="뉴스·경제",Newsmax
https://example.test/newsmax.m3u8
#EXTINF:-1 tvg-id="ntd" group-title="뉴스·경제",NTD
https://example.test/ntd.m3u8
#EXTINF:-1 tvg-id="keep2" group-title="케이블·일반",Keep Two
https://example.test/keep2.m3u8
`;

const output = policy.filterPlaylist(input);
assert(output.includes('keep1'));
assert(output.includes('keep2'));
for (const id of policy.excludedTvgIds) assert(!output.toLowerCase().includes(`tvg-id="${id}"`));
assert(!output.includes('bloomberg.m3u8'));
assert(!output.includes('france.m3u8'));
assert(!output.includes('euro.m3u8'));
assert(!output.includes('fifa.m3u8'));
assert(!output.includes('trt.m3u8'));
assert(!output.includes('newsmax.m3u8'));
assert(!output.includes('ntd.m3u8'));

const kept = (output.match(/^#EXTINF:/gm) || []).length;
assert.equal(kept, 2, 'only the two non-excluded sample channels should remain');

console.log('Explicit audience channel policy simulation OK');
