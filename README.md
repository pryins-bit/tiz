# tiz — one-click Korea TV for TizenBrew

This repository is both a **TizenBrew application module** and the source of its automatically refreshed Korean TV playlist.

## One-click TizenBrew setup

In TizenBrew, use **Add GitHub** and add:

`https://github.com/pryins-bit/tiz`

After that, open **Korea TV** from TizenBrew. No QR pairing and no manual M3U URL entry are required. The module always fetches the latest playlist from:

`https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u`

The player starts the first available channel automatically, supports remote channel switching, and skips channels that fail during the current session.

## Why this avoids the old IPTV Player state

The previous `tizenbrew-iptv` module stored its own playlist/pairing state. This repository does not read or reuse that state. It fetches `korea.m3u` fresh on every launch with cache-busting, so stale channels from the removed module are irrelevant to **Korea TV**.

## Playlist updating

GitHub Actions refreshes `korea.m3u` every 6 hours from current public upstream playlists and commits only when generated output changes.

The updater prioritizes Korean terrestrial/public-broadcast related entries such as KBS, MBC, SBS affiliates, EBS, TBC, KNN, KBC, UBC, JTV, CJB, G1, and JIBS, and prefers direct HLS (`.m3u8`) URLs.

This repository does not host, proxy, decrypt, or bypass access controls for video streams. It only uses URLs exposed by public upstream playlists.

## Controls

- Up / Right / Channel +: next channel
- Down / Left / Channel -: previous channel
- Enter: show current channel banner
- Play / Pause: media playback control
- Back: leave the module

## Verification boundary

Repository CI can verify JSON/JavaScript syntax and playlist structure. It cannot prove codec/network compatibility on a specific Samsung TV. Real-device playback must still be confirmed on the TV.
