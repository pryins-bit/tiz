# tiz — one-click Korea TV for TizenBrew

This repository is both a **TizenBrew application module** and the source of its Korean TV playlist.

## One-click TizenBrew setup

In TizenBrew, use **Add GitHub** and add:

`https://github.com/pryins-bit/tiz`

After that, open **Korea TV** from TizenBrew. No QR pairing and no manual M3U URL entry are required. The module always fetches the latest playlist from:

`https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u`

The player starts the first available channel automatically, supports remote channel switching, and skips channels that fail during the current session.

## Mom TV Home overlay

Press the **green remote button** while Korea TV is running to open the optional Mom TV Home overlay.

On the first use, the TV registers itself with the private Supabase backend and displays a six-digit approval code. Until that device is approved, no private dashboard data are returned. After approval, the TV stores only its device token in local storage and reconnects automatically.

Private items such as medication, appointments, family notices and stock quotes are not stored in this public repository. The public module contains only the client UI and the public Edge Function endpoint. Supabase service-role credentials remain server-side.

## Why this avoids the old IPTV Player state

The previous `tizenbrew-iptv` module stored its own playlist/pairing state. This repository does not read or reuse that state. It fetches `korea.m3u` fresh on every launch with cache-busting, so stale channels from the removed module are irrelevant to **Korea TV**.

## Playlist policy

`korea.m3u` is now intentionally conservative. Public discovery lists such as iptv-org, Free-TV and other GitHub M3U repositories are used to find candidates, but they are **not merged automatically** because stale proxy/IP entries can re-introduce dead channels.

Only a small curated set with recent independent HLS verification is emitted by default. If a channel fails on the real Samsung TV, it should be removed/quarantined first and re-added only after a fresh verification. Prefer broadcaster/CDN HTTPS endpoints; HTTP or raw-IP direct HLS is retained only when it is the best recently verified fallback.

The scheduled workflow regenerates the curated playlist and validates its structure, so the stable raw URL does not change.

This repository does not host, proxy, decrypt, or bypass access controls for video streams.

## Controls

- Up / Right / Channel +: next channel
- Down / Left / Channel -: previous channel
- Enter: show current channel banner
- Green: toggle Mom TV Home overlay
- Play / Pause: media playback control
- Back: close Mom TV Home first, then leave the module

## Verification boundary

Repository CI can verify JSON/JavaScript syntax and playlist structure. External HLS probes help remove obviously stale entries, but **real-device playback on the target Samsung TV remains the final check** because network policy, geo restrictions and Tizen codec behavior can differ.
