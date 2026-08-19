# Staged TV Upgrade Models — 2026-08-19

## Safety rule

These branches are **GitHub staging only** while the owner is away from the TV.

- Do not merge either model into `main`.
- Do not create or update a GitHub Release.
- Do not dispatch a WGT build/release workflow.
- Do not change the raw `main` runtime/update endpoints.
- Do not install or update the Samsung TV until the owner explicitly requests it in a future session.

The protected pre-change snapshot is `backup/pre-two-models-kbs-rf-20260819` at commit `893d16e0483394773b1de101736a88a7c3e42781`.

## Model 1 — channel cleanup + KBS Daegu

Branch: `feature/channel-cleanup-kbs-daegu-20260819`

Purpose:

- Keep a compact Korean/family-oriented channel snapshot rather than the broad discovery-derived lineup.
- Add KBS1 Daegu as the first channel using the `30_11` regional channel candidate.
- Keep the current player, AVPlay, UI, remote-control and Tizen privileges unchanged.

Before deployment:

1. Re-test the exact KBS Daegu URL on Samsung `KU50UA7050FXKR` / Tizen 6.0.
2. Run repository static/runtime tests.
3. Confirm the final curated channel list with the owner.
4. Only then merge/release if explicitly requested.

## Model 2 — Model 1 + RF tuner experiment

Planned branch: `feature/rf-tuner-experiment-tizen6-20260819`

Purpose:

- Inherit Model 1 exactly.
- Add a standalone-only experimental `tizen.tvwindow` RF/TV-source mode.
- Add `http://tizen.org/privilege/tv.window` to the standalone WGT manifest.
- Provide a TV-home action for entering RF tuner view and a safe Back action to return to IPTV.
- Do **not** use or depend on `webapis.broadcast.tuneDirect()`; direct numeric RF channel tuning is outside the expected consumer Tizen 6.0 public API path.

Real-device verification required:

- `VIDEOSOURCE` exposes a source with `type === "TV"`.
- `tizen.tvwindow.setSource()` accepts that source.
- `tizen.tvwindow.show()` displays the tuner on the target TV.
- Back reliably hides the TV window and resumes IPTV.
- Channel +/- behavior while the TV window is active must be observed on the physical Samsung TV; code inspection cannot prove it.

## Deployment status

**NONE.** No model in this document is authorized for deployment or release until the owner explicitly says so.
