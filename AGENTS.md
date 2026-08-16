# AGENTS.md

## Purpose

This repository is the owner's one-click Korean IPTV module for Samsung TizenBrew. Adding `https://github.com/pryins-bit/tiz` through TizenBrew's **Add GitHub** must be sufficient; the user should not have to pair by QR or manually enter an M3U URL after installation.

## Authoritative requirements

- `package.json` + `app/` define the TizenBrew application module named **Korea TV**.
- On launch, Korea TV must fetch `https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u` automatically with cache-busting.
- Do not depend on or reuse `tizenbrew-iptv` pairing/local-storage state. Stale playlists from that module must not affect Korea TV.
- Keep the raw `korea.m3u` URL stable.
- Prioritize Korean terrestrial/public channels and affiliates: KBS, MBC, SBS affiliates, EBS, TBC, KNN, KBC, UBC, JTV, CJB, G1, and JIBS.
- Discovery playlists may be searched for candidates, but do not automatically merge broad public M3U sources into the default playlist. The default playlist should contain only a small curated set with recent independent HLS verification or real-TV confirmation.
- Prefer direct HLS `.m3u8` links. Prefer broadcaster/CDN HTTPS endpoints; retain HTTP/raw-IP direct-HLS only when it is the best recently verified fallback.
- If a stream fails on the target Samsung TV, remove or quarantine it before adding more candidates. Real-TV success has higher priority than list size.
- The player should auto-start, allow remote channel switching, and skip failed channels during the current session.
- Do not host, proxy, decrypt, or bypass access controls for video streams.
- Do not commit credentials, cookies, tokens, private URLs, or service-role secrets.
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
- `korea.m3u`: stable curated playlist consumed by the module.
- `scripts/update_playlist.py`: emits the reviewed curated Korean HLS set and validates direct-HLS structure; broad discovery sources are not auto-merged.
- `.github/workflows/update-playlist.yml`: scheduled/manual playlist regeneration and structure validation.
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

For updater changes:

1. Generate the playlist and verify the first line is `#EXTM3U`.
2. Verify each emitted channel has `#EXTINF` followed by HTTP(S) direct-HLS `.m3u8`.
3. Keep only channels backed by recent independent HLS verification or real-device confirmation; discovery-list presence alone is insufficient.
4. Inspect GitHub Actions conclusion.

## Rollback

Revert the latest module/updater commit or reset to the previous known-good commit. Never alter protected backup branches.
