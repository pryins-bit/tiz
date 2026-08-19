# Staged TV Upgrade Models — 2026-08-19

## Safety rule

These branches are **GitHub staging only** while the owner is away from the TV.

- Do not merge either model into `main`.
- Do not create or update a GitHub Release.
- Do not dispatch a WGT build/release workflow.
- Do not change the raw `main` runtime/update endpoints.
- Do not install or update the Samsung TV until the owner explicitly requests it in a future session.

The protected pre-change snapshot is `backup/pre-two-models-kbs-rf-20260819` at commit `893d16e0483394773b1de101736a88a7c3e42781`.

## Model 1 — channel cleanup + KBS1/KBS2 official provider

Branch: `feature/channel-cleanup-kbs-daegu-20260819`

> The branch name is historical from the first staging attempt. The authoritative implementation is **not KBS Daegu fixed M3U8**.

Purpose:

- Keep a compact Korean/family-oriented M3U snapshot rather than the broad discovery-derived lineup.
- Keep KBS1 and KBS2 outside the fixed M3U stream set.
- `app/kbs-provider.js` injects KBS1/KBS2 into the visible channel list using the KBS official ON AIR routes (`ch_code=11` / `12`).
- When one is selected, resolve the current playback HLS URL from the official ON AIR response at playback time.
- If dynamic resolution or AVPlay fails, use the official KBS ON AIR web player as the fallback.
- Never persist the ephemeral KBS HLS result into `korea.m3u` and never use an arbitrary third-party KBS relay/proxy.
- Keep the existing IPTV player, remote semantics and normal M3U channel behavior unchanged.

Before deployment:

1. On Samsung `KU50UA7050FXKR` / Tizen 6.0, verify KBS1 and KBS2 both appear at the front of the channel list.
2. Verify the dynamic official-provider path starts video; if extraction is unavailable, verify the official-web fallback is usable.
3. Verify normal M3U channels still switch exactly once per remote press.
4. Run repository static/runtime tests and inspect the final CI conclusion.
5. Only then merge/release if explicitly requested.

## Model 2 — Model 1 + RF tuner experiment

Branch: `feature/rf-tuner-experiment-tizen6-20260819`

Purpose:

- Inherit the corrected Model 1 architecture, including KBS1/KBS2 official dynamic provider.
- Add a standalone-only experimental `tizen.tvwindow` RF/TV-source mode.
- Add `http://tizen.org/privilege/tv.window` to the standalone WGT manifest.
- Provide a TV-home action for entering RF tuner view and a safe Back action to return to IPTV.
- Do **not** use or depend on `webapis.broadcast.tuneDirect()`; direct numeric RF channel tuning is outside the expected consumer Tizen 6.0 public API path.

Real-device verification required:

- KBS1/KBS2 official provider behavior from Model 1.
- `VIDEOSOURCE` exposes a source with `type === "TV"`.
- `tizen.tvwindow.setSource()` accepts that source.
- `tizen.tvwindow.show()` displays the tuner on the target TV.
- Back reliably hides the TV window and resumes IPTV.
- Channel +/- behavior while the TV window is active must be observed on the physical Samsung TV; code inspection cannot prove it.

## Deployment status

**NONE.** No model in this document is authorized for deployment or release until the owner explicitly says so.
