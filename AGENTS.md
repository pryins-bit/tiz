# AGENTS.md

## Purpose

This repository is the owner's one-click Korean IPTV module for Samsung TizenBrew. Adding `https://github.com/pryins-bit/tiz` through TizenBrew's **Add GitHub** must be sufficient; the user should not have to pair by QR or manually enter an M3U URL after installation.

## Authoritative requirements

- `package.json` + `app/` define the TizenBrew application module named **Korea TV**.
- On launch, Korea TV must fetch `https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u` automatically with cache-busting.
- Do not depend on or reuse `tizenbrew-iptv` pairing/local-storage state. Stale playlists from that module must not affect Korea TV.
- Keep the raw `korea.m3u` URL stable.
- Prioritize Korean terrestrial/public channels and affiliates: KBS, MBC, SBS affiliates, EBS, TBC, KNN, KBC, UBC, JTV, CJB, G1, and JIBS.
- Discovery playlists may be searched for candidates, but only source files with a GitHub file update within the last 365 days are eligible for automated collection.
- Automated collection must keep only Korean HLS streams with observed resolution of at least 720p. Lower-resolution streams remain only in the registry/history as excluded records, not in `stream_candidates.json`.
- Deduplicate exact streams by canonicalized URL. If the same URL appears in multiple source lists, keep one stream record and merge its source provenance. Different URLs for the same channel may remain as fallbacks.
- Persist latest validation state in `stream_registry.json` and append status/resolution changes to `stream_history.jsonl` so dead/recovered/quality changes are auditable.
- Discovery playlists must never be copied wholesale into `korea.m3u`. Promotion to the TV playlist remains a separate reviewed step represented by `approved_channels.json`.
- `korea.m3u` may contain only approved channels that are still currently present in `stream_candidates.json` at 720p or higher. Newly discovered channels are not auto-promoted merely because validation succeeds.
- For an approved channel with multiple live URLs, select one best current URL by observed resolution, live probe confidence, HTTPS preference, and non-raw-IP preference.
- Samsung TV Plus is not a discovery source for this repository because the target device already provides it. When reviewing LG Channels Korea for promotion, exclude confirmed Samsung TV Plus overlaps and record the exclusions in `lg_promotion_exclusions.json`.
- Prefer direct HLS `.m3u8` links. Prefer broadcaster/CDN HTTPS endpoints; retain HTTP/raw-IP direct-HLS only when it is the best recently verified fallback.
- If a stream fails on the target Samsung TV, remove or quarantine it before adding more candidates. Real-TV success has higher priority than list size.
- The player should auto-start, allow remote channel switching, and skip failed channels during the current session.
- Do not host, proxy, decrypt, or bypass access controls for video streams.
- Do not commit credentials, cookies, tokens, private URLs, or service-role secrets. Reviewed approvals should store channel identities/source metadata rather than copying credential-bearing discovery URLs.
- Mom TV Home may use a public Edge Function endpoint, but all private dashboard data and privileged Supabase credentials must remain server-side.
- A TV must be approved before private Mom TV Home data are returned. The public client may persist only a device-scoped token, never a Supabase service-role/secret key.

## Protected state

- Branches/files explicitly named `backup`, `baseline`, `original`, `verified`, or `do not touch` are protected. Never rewrite or delete them.
- Before substantial or multi-file maintenance, create a backup branch pointing to the exact pre-change commit.
- Preserve prior commits and use small, reversible changes.

## Architecture

- `package.json`: TizenBrew application-module manifest.
- `app/index.html`: TV player shell and optional Mom TV Home overlay shell.
- `app/main.js`: fresh playlist fetch, M3U parsing, native-HLS/hls.js playback, remote controls, failed-channel skip, and device-approved Mom TV Home client.
- `app/style.css`: 1920x1080 TV/player/overlay UI.
- `korea.m3u`: stable approved 720p+ playlist consumed by the module.
- `stream_sources.json`: recent GitHub Korean IPTV discovery sources and freshness limits, including the recent LG Channels Korea mirror used only as a discovery source.
- `scripts/collect_hd_korean_streams.py`: source freshness check, M3U parsing, URL dedupe, HLS/ffprobe validation, 720p filtering and registry/history generation.
- `stream_candidates.json`: only currently observed 720p-or-higher Korean HLS candidates, deduplicated by canonical URL and logical channel.
- `approved_channels.json`: reviewed channel identities allowed to appear in `korea.m3u`; LG approvals may contain identity/source metadata without copying credential-bearing discovery URLs.
- `lg_promotion_exclusions.json`: audit record for LG Korea candidates intentionally not promoted because they overlap Samsung TV Plus or an already approved Korea TV channel.
- `scripts/approve_current_candidates.py`: one-shot helper that snapshots the current 720p+ candidate set into `approved_channels.json`; do not rerun automatically once the approval file exists.
- `stream_registry.json`: latest result for every unique discovered URL, including failures and sub-720p results.
- `stream_history.jsonl`: append-only status/resolution-change log.
- `.github/workflows/check-streams.yml`: scheduled/manual collection and validation; refreshes the playlist only from the already approved set.
- `scripts/update_playlist.py`: selects the best current 720p+ URL for each approved channel, removes source-local display numbering, assigns the requested category order, and emits `korea.m3u`.
- `.github/workflows/update-playlist.yml`: scheduled/manual approved-playlist regeneration and structure validation.
- `.github/workflows/validate-module.yml`: static module validation.
- `THIRD_PARTY_NOTICES.md`: third-party licenses/references.
- Supabase backend: private tables for approved TV devices, dashboard items and stock quotes, exposed only through the custom-token-validated `mom-tv` Edge Function.

## Validation

For module changes:

1. Parse `package.json` as JSON.
2. Run `node --check app/main.js`.
3. Verify `packageType=app`, `appName`, and `appPath` point to a real file.
4. Verify `PLAYLIST_URL` still targets the stable raw `main/korea.m3u` URL.
5. Inspect GitHub Actions conclusion after merge.
6. Report TV playback separately; CI success is not Samsung/Tizen real-device confirmation.
7. Verify no Supabase service-role/secret key or personal dashboard data are committed.

For stream collection/updater changes:

1. Reject source files whose latest GitHub path commit is older than 365 days.
2. Canonicalize and deduplicate URLs before probing.
3. Require a valid HLS manifest and observed video resolution >=720p for `stream_candidates.json`.
4. Keep excluded/dead/geo-ambiguous results in `stream_registry.json` rather than silently forgetting them.
5. Record status or resolution transitions in `stream_history.jsonl`.
6. Require membership in `approved_channels.json` before emitting a channel into `korea.m3u`.
7. For LG Korea promotion, verify `lg_promotion_exclusions.json` covers the reviewed Samsung TV Plus/current-playlist overlaps and that excluded identities do not enter `approved_channels.json`.
8. Inspect GitHub Actions conclusion and report the exact candidate and promoted counts.

## Rollback

Revert the latest module/updater commit or reset to the previous known-good commit. Never alter protected backup branches.
