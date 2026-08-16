# AGENTS.md

## Purpose

This repository maintains a stable M3U URL for the owner's Samsung TV running TizenBrew IPTV Player. The TV-facing contract is `korea.m3u` on the `main` branch.

## Authoritative requirements

- Keep `https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u` stable so the TV does not need a new QR pairing whenever channel links change.
- Prioritize Korean terrestrial/public channels and affiliates: KBS, MBC, SBS affiliates, EBS, TBC, KNN, KBC, UBC, JTV, CJB, G1, and JIBS.
- Prefer direct HLS `.m3u8` links. Prefer HTTPS over HTTP, but retain HTTP direct-HLS fallbacks when no better upstream entry exists.
- Do not host, proxy, decrypt, or bypass access controls for video streams. This repository only republishes playlist metadata/URLs already exposed by upstream public playlists.
- Do not commit credentials, cookies, tokens, private URLs, or service-role secrets.

## Protected state

- Branches/files explicitly named `backup`, `baseline`, `original`, `verified`, or `do not touch` are protected. Never rewrite or delete them.
- Before substantial or multi-file maintenance, create a backup branch pointing to the exact pre-change commit.
- Preserve prior commits and use small, reversible changes.

## Architecture

- `korea.m3u`: stable TV-facing generated playlist.
- `scripts/update_playlist.py`: fetches upstream Korean playlist data, filters relevant channels, normalizes/deduplicates entries, and writes `korea.m3u`.
- `.github/workflows/update-playlist.yml`: scheduled/manual updater that commits only when generated output changes.
- `README.md`: user-facing setup and verification notes.

## Upstream

Primary upstream: `https://raw.githubusercontent.com/iptv-org/iptv/master/streams/kr.m3u`.

The upstream project changes independently. A recent upstream commit does not prove an individual channel stream works on the owner's TV.

## Validation

For any updater change:

1. Run `python scripts/update_playlist.py --input <fixture-or-url> --output <tempfile>` where practical.
2. Verify first line is `#EXTM3U`.
3. Verify every emitted channel has an `#EXTINF` line followed by an HTTP(S) `.m3u8` URL.
4. Verify duplicate `(name, URL)` entries are removed.
5. Inspect GitHub Actions conclusion after merge/deployment.
6. Report TV playback separately as real-device verification; CI success is not Samsung/Tizen playback confirmation.

## Rollback

Revert the latest playlist/updater commit or reset `main` to the previous known-good commit. Do not alter protected backup branches.
