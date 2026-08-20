'use strict';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

function loadScript(file, context) {
  const source = fs.readFileSync(path.join(root, 'app', file), 'utf8');
  vm.runInNewContext(source, context, { filename: file });
}

const baseWindow = { fetch: null };
const policyContext = {
  window: baseWindow,
  Promise,
  console
};
policyContext.global = policyContext;
loadScript('channel-policy.js', policyContext);

const policy = baseWindow.KoreaTVChannelPolicy;
assert(policy, 'KoreaTVChannelPolicy missing');
assert.equal(policy.allowedTvgIds.length, 45, 'V2 ordinary allowlist must contain exactly 45 IDs');
assert.equal(new Set(policy.allowedTvgIds.map((x) => x.toLowerCase())).size, 45, 'allowlist IDs must be unique');

const removed = [
  'HLAQDTV.kr@SD',
  'HLAODTV.kr@SD', 'HLCQDTV.kr@SD', 'HLAMDTV.kr@SD',
  'HLDRDTV.kr@SD', 'HLCGDTV.kr@SD', 'HLDHDTV.kr@SD',
  'FGTV.kr@SD', 'GoodTV.kr@SD', 'RUTCTV.kr@SD',
  'bloombergtv', 'france24_en', 'euronews_en', 'fifaplus_en', 'trtworld', 'newsmax', 'ntd'
].map((x) => x.toLowerCase());
const allowedLower = policy.allowedTvgIds.map((x) => x.toLowerCase());
for (const id of removed) {
  assert(!allowedLower.includes(id), `removed V2 channel leaked into allowlist: ${id}`);
}

for (const retained of ['HLANDTV.kr@SD', 'HLATDTV.kr@SD', 'SBSTV.kr', 'HLDPDTV.kr@SD', 'BBSTV.kr@SD', 'BTNTV.kr@SD']) {
  assert(allowedLower.includes(retained.toLowerCase()), `required V2 retained channel missing: ${retained}`);
}

const rawPlaylist = fs.readFileSync(path.join(root, 'korea.m3u'), 'utf8');
const filtered = policy.filterPlaylist(rawPlaylist);
const normalCount = (filtered.match(/^#EXTINF:/gm) || []).length;
assert.equal(normalCount, 45, `current korea.m3u must supply all 45 V2 ordinary channels; got ${normalCount}`);

const kbsWindow = { fetch: null };
const kbsContext = {
  window: kbsWindow,
  document: { body: null },
  Promise,
  Date,
  console
};
kbsContext.global = kbsContext;
loadScript('kbs-provider.js', kbsContext);

const kbs = kbsWindow.KoreaTVKBS;
assert(kbs, 'KoreaTVKBS missing');
assert.equal(kbs.channels.length, 2);
assert.equal(kbs.channels[0].channelCode, '11');
assert.equal(kbs.channels[1].channelCode, '12');
assert(kbs.channels[0].apiUrl.endsWith('/11'));
assert(kbs.channels[1].apiUrl.endsWith('/12'));
assert.equal(
  kbs.serviceUrlFromPayload({ channel_item: [{ service_url: 'https://example.kbs.test/live.m3u8?token=x' }] }),
  'https://example.kbs.test/live.m3u8?token=x'
);
assert.equal(kbs.serviceUrlFromPayload({ channel_item: [] }), '');
assert.equal(kbs.serviceUrlFromPayload({ channel_item: [{ service_url: 'javascript:bad' }] }), '');

const visible = kbs.injectSpecialChannels(filtered);
const visibleCount = (visible.match(/^#EXTINF:/gm) || []).length;
assert.equal(visibleCount, 47, `V2 visible lineup must contain exactly 47 channels; got ${visibleCount}`);
assert(visible.includes('tvg-id="KBS1.official"'));
assert(visible.includes('tvg-id="KBS2.official"'));
assert(!visible.includes('tvg-id="FGTV.kr@SD"'));
assert(!visible.includes('tvg-id="RUTCTV.kr@SD"'));
assert(!visible.includes('tvg-id="HLAODTV.kr@SD"'));
assert(!visible.includes('tvg-id="HLDRDTV.kr@SD"'));

console.log(`V2 contract OK: ${normalCount} ordinary + 2 KBS = ${visibleCount}`);
