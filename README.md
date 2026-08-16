# tiz — one-click Korea TV for TizenBrew

This repository is both a **TizenBrew application module** and the source of its Korean TV playlist.

## Recommended path: TizenBrew module

In the actual TizenBrew app, use **Add GitHub** and add:

`https://github.com/pryins-bit/tiz`

After that, open **Korea TV** from TizenBrew. No QR pairing and no manual M3U URL entry are required. The module always fetches the latest playlist from:

`https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u`

The player starts the first available channel automatically, supports remote channel switching, and skips channels that fail during the current session.

This module path is distinct from the separate **TizenBrew Installer** screen that shows `Update TizenBrew`, `Install from USB`, and `Install from GitHub`.

## Standalone WGT / TizenBrew Installer

The target TV is Samsung `KU50UA7050FXKR` on Tizen 6.0. TizenBrew Installer only performs its local package re-sign flow on Tizen 7 or newer, so a raw ZIP renamed to `.wgt` is not sufficient on this TV and fails with certificate errors such as `118, -12`.

`.github/workflows/build-standalone.yml` packages `KoreaTV.wgt` with Tizen Studio and verifies that both `author-signature.xml` and `signature1.xml` are present before publication. The rolling GitHub Release remains tagged `standalone-latest`.

In TizenBrew Installer, **Install from GitHub** should use:

`pryins-bit/tiz`

The CI signing path follows the old-Tizen Tizen packaging model: an author signature plus the Tizen Studio public distributor signer. The CI-generated author key is currently ephemeral, so a future standalone binary update may require uninstall/reinstall unless a persistent author key is later configured as an encrypted repository secret. Never commit a signing private key.

## Samsung remote-control handling

The standalone WGT and the TizenBrew module have different key-registration paths. `package.json.keys` covers the TizenBrew module loader, while the standalone WGT must grant the `tv.inputdevice` privilege and register device-dependent keys at runtime.

`app/remote-input.js` now registers:

- digits `0` through `9`
- `ChannelUp` / `ChannelDown`
- red / green / yellow / blue
- play / pause / play-pause / stop

Volume, Home, and Power are intentionally **not** registered by Korea TV, so Samsung's normal platform behavior remains intact. Arrow, Enter, and Back are mandatory Tizen keys and do not need explicit registration; old-Tizen arrow events are normalized when firmware supplies only the numeric keyCode.

Numeric channel entry also works when the startup Korea TV Home panel is open. The previous helper discarded all numeric input whenever a panel was visible, which made the feature appear dead immediately after launch.

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

- Up / Right / Channel +: next channel
- Down / Left / Channel -: previous channel
- Number keys: tune by playlist channel number
- Enter: show current channel banner / activate focused item
- Red: Korea TV Home
- Green: toggle current-channel favorite
- Yellow: channel search
- Blue: categories
- Play / Pause: media playback control
- Back: close the current panel, then leave the app when no panel remains
- Volume: Samsung system volume behavior; Korea TV does not intercept it

## Verification boundary

Repository CI can verify JSON/JavaScript syntax, the TVInputDevice registration contract, manifest privileges, WGT signature files, and playlist structure. External HLS probes help remove obviously stale entries, but **real-device installation, remote-key delivery, and playback on the target Samsung TV remain the final checks** because device certificate policy, firmware key behavior, network policy, geo restrictions, and Tizen codec behavior can differ.
