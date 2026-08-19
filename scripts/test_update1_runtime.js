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
assert.equal(policy.allowedTvgIds.length, 54, 'Update 1 ordinary allowlist must contain exactly 54 IDs');
assert.equal(new Set(policy.allowedTvgIds.map((x) => x.toLowerCase())).size, 54, 'allowlist IDs must be unique');
assert(!policy.allowedTvgIds.includes('HLAQDTV.kr@SD'), 'MBC Gangwon must be omitted from Update 1');
for (const removed of ['bloombergtv', 'france24_en', 'euronews_en', 'fifaplus_en', 'trtworld', 'newsmax', 'ntd']) {
  assert(!policy.allowedTvgIds.map((x) => x.toLowerCase()).includes(removed), `removed audience channel leaked into allowlist: ${removed}`);
}

const rawPlaylist = fs.readFileSync(path.join(root, 'korea.m3u'), 'utf8');
const filtered = policy.filterPlaylist(rawPlaylist);
const normalCount = (filtered.match(/^#EXTINF:/gm) || []).length;
assert.equal(normalCount, 54, `current korea.m3u must supply all 54 Update 1 ordinary channels; got ${normalCount}`);

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
assert.equal(visibleCount, 56, `Update 1 visible lineup must contain exactly 56 channels; got ${visibleCount}`);
assert(visible.includes('tvg-id="KBS1.official"'));
assert(visible.includes('tvg-id="KBS2.official"'));
assert(!visible.includes('tvg-id="bloombergtv"'));
assert(!visible.includes('tvg-id="HLAQDTV.kr@SD"'));

console.log(`Update 1 contract OK: ${normalCount} ordinary + 2 KBS = ${visibleCount}`);
