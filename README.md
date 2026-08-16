# tiz — one-click Korea TV for TizenBrew

This repository is both a **TizenBrew application module** and the source of its Korean TV playlist.

## Recommended path: TizenBrew module

In the actual TizenBrew app, use **Add GitHub** and add:

`https://github.com/pryins-bit/tiz`

After that, open **Korea TV** from TizenBrew. No QR pairing and no manual M3U URL entry are required. The module always fetches the latest playlist from:

`https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u`

The player starts the first available channel automatically, supports remote channel switching, and skips channels that fail during the current session.

This module path is distinct from the separate **TizenBrew Installer** screen that shows `Update TizenBrew`, `Install from USB`, and `Install from GitHub`.

## Standalone WGT / one-time bootstrap install

The target TV is Samsung `KU50UA7050FXKR` on Tizen 6.0. TizenBrew Installer only performs its local package re-sign flow on Tizen 7 or newer, so a raw ZIP renamed to `.wgt` is not sufficient on this TV and fails with certificate errors such as `118, -12`.

`.github/workflows/build-standalone.yml` packages a signed `KoreaTV.wgt` bootstrap shell and verifies that both `author-signature.xml` and `signature1.xml` are present before publication. The rolling GitHub Release remains tagged `standalone-latest`.

In TizenBrew Installer, **Install from GitHub** should use:

`pryins-bit/tiz`

The intended operating model is **install the bootstrap shell once, then stop reinstalling for normal fixes**.

On every app launch:

1. `bootstrap.js` checks the fixed GitHub `runtime-version.json` endpoint.
2. The update decision is given a **450 ms budget**.
3. If GitHub answers within that budget and there is no newer runtime, Korea TV starts immediately from the cached or packaged runtime.
4. If a newer runtime is confirmed, the small runtime bundle (`main.js`, `remote-input.js`, `numeric-remote.js`, `style.css`) is downloaded and cached before startup.
5. If GitHub is slow/offline past 450 ms, Korea TV starts immediately from the last known-good cached/packaged runtime, while any newer runtime is prepared in the background for the next launch.

`.github/workflows/stamp-runtime-version.yml` automatically changes the runtime version after player/UI/remote runtime files change on `main`, so future ordinary fixes do not depend on manually editing a version number.

Only changes to the **installed shell itself**—for example `index.html`, `bootstrap.js`, `config.xml`, privileges, signing, or the packaged fallback structure—need another WGT installation. Normal player/UI/remote fixes are delivered from GitHub at launch.

The CI signing path currently uses an ephemeral author certificate. Because normal future fixes no longer replace the WGT binary, this is much less intrusive. If the shell itself must eventually be replaced, uninstall/reinstall can still be required unless a persistent author key is configured as an encrypted repository secret. Never commit a signing private key.

## Samsung remote-control handling

The standalone WGT and the TizenBrew module have different key-registration paths. `package.json.keys` covers the TizenBrew module loader, while the standalone WGT grants the `tv.inputdevice` privilege and registers device-dependent keys at runtime.

`app/remote-input.js` registers digits, ChannelUp/ChannelDown, the four color keys, and media playback keys. It then builds a key-code map from Samsung's `tizen.tvinputdevice.getSupportedKeys()` instead of assuming that every firmware emits the same number. The resolver also accepts named `event.key` / `keyIdentifier` events and both common Samsung color-code families (`403–406` and `447–450`) as fallbacks.

Volume, Home, and Power are intentionally **not** registered by Korea TV, so Samsung's normal platform behavior remains intact.

The player zapping path is generation-guarded: asynchronous errors from the old HLS/video source are ignored after a new channel starts. Physical channel navigation also suppresses key-repeat bursts for a short window, so one remote press cannot destroy/recreate the player several times in succession.

Numeric entry tunes directly to the requested playlist index once. It no longer simulates dozens of intermediate Channel +/- key presses.

The remote normalization strategy follows the same general integration model used by Samsung's public Tizen TV reference applications and mature Tizen IPTV/player projects: register semantic TV keys, obtain device-specific codes when available, and keep fallback codes only as compatibility guards.

## Mom TV Home overlay

Mom TV Home is available from the **엄마 TV 홈** tile on the Korea TV Home screen.

On the first use, the TV registers itself with the private Supabase backend and displays a six-digit approval code. Until that device is approved, no private dashboard data are returned. After approval, the TV stores only its device token in local storage and reconnects automatically.

Private items such as medication, appointments, family notices and stock quotes are not stored in this public repository. The public module contains only the client UI and the public Edge Function endpoint. Supabase service-role credentials remain server-side.

## Why this avoids the old IPTV Player state

The previous `tizenbrew-iptv` module stored its own playlist/pairing state. This repository does not read or reuse that state. It fetches `korea.m3u` fresh on every launch with cache-busting, so stale channels from the removed module are irrelevant to **Korea TV**.

## Playlist policy

`korea.m3u` is intentionally conservative. Public discovery lists such as iptv-org, Free-TV and other GitHub M3U repositories are used to find candidates, but they are **not merged automatically** because stale proxy/IP entries can re-introduce dead channels.

Only a small curated set with recent independent HLS verification is emitted by default. If a channel fails on the real Samsung TV, it should be removed/quarantined first and re-added only after a fresh verification. Prefer broadcaster/CDN HTTPS endpoints; HTTP or raw-IP direct HLS is retained only when it is the best recently verified fallback.

The scheduled workflow regenerates the curated playlist and validates its structure, so the stable raw URL does not change.

This repository does not host, proxy, decrypt, or bypass access controls for video streams.

## Controls

- Up / Channel +: previous channel (lower playlist number)
- Down / Channel -: next channel (higher playlist number)
- Right: next channel
- Left: previous channel
- Number keys: tune directly by playlist channel number
- Enter: show current channel banner / activate focused item
- Red: Korea TV Home
- Green: toggle current-channel favorite
- Yellow: channel search
- Blue: categories
- Play / Pause: media playback control
- Back: close the current panel, then leave the app when no panel remains
- Volume: Samsung system volume behavior; Korea TV does not intercept it

## Verification boundary

Repository CI can verify JSON/JavaScript syntax, the launch-updater contract, TVInputDevice registration, semantic/fallback remote-key mapping, race-safe player lifecycle guards, manifest privileges, WGT signature files, and playlist structure. External HLS probes help remove obviously stale entries, but **real-device launch timing, remote-key delivery, and playback on the target Samsung TV remain the final checks** because firmware/network behavior can differ.
