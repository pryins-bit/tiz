# Staged TV Upgrade Models — 2026-08-19

## Safety rule

These branches are **GitHub staging only** while the owner is away from the TV.

- Do not merge either model into `main`.
- Do not create or update a GitHub Release.
- Do not dispatch a WGT build/release workflow.
- Do not change the raw `main` runtime/update endpoints.
- Do not install or update the Samsung TV until the owner explicitly requests it in a future session.

The protected pre-change snapshot is `backup/pre-two-models-kbs-rf-20260819` at commit `893d16e0483394773b1de101736a88a7c3e42781`.

## Model 1 — exact channel cleanup + KBS1/KBS2 official provider

Branch: `feature/channel-cleanup-kbs-daegu-20260819`

> The branch name is historical from the first staging attempt. The authoritative implementation is **not KBS Daegu fixed M3U8**.

### Channel cleanup scope

The baseline is the existing broad `main/korea.m3u` lineup. Do **not** collapse it into an arbitrary compact subset. The only explicitly approved audience-fit removals are the seven channels that were identified as positions 56–62 during review:

1. Bloomberg TV+ (`bloombergtv`)
2. France 24 (`france24_en`)
3. euronews english (`euronews_en`)
4. FIFA+ (`fifaplus_en`)
5. TRT World (`trtworld`)
6. Newsmax (`newsmax`)
7. NTD (`ntd`)

Their removal reason is audience fit for the primary viewer, **not** stream failure. `app/channel-policy.js` removes exactly these seven records from the fetched broad playlist before the normal runtime parses it. No other channel is removed by this model without a new explicit owner decision.

### KBS1 / KBS2 architecture

- KBS1 and KBS2 remain outside the fixed M3U stream set.
- `app/kbs-provider.js` injects KBS1/KBS2 into the visible channel list as special channels.
- KBS1 uses official channel code `11`; KBS2 uses `12`.
- On selection, fetch `https://cfpwwwapi.kbs.co.kr/api/v1/landing/live/channel_code/<code>` and read `channel_item[0].service_url` at playback time.
- Pass that transient `service_url` to Samsung AVPlay; never persist it into `korea.m3u`.
- If API resolution or AVPlay fails, the official KBS ON AIR page is the fallback.
- Never substitute an arbitrary third-party KBS relay/proxy for this architecture.

### Before deployment

1. Confirm the visible broad channel list is unchanged except for the seven explicit audience exclusions and the added KBS1/KBS2 special channels.
2. On Samsung `KU50UA7050FXKR` / Tizen 6.0, verify KBS1 and KBS2 both resolve through the official API and play through AVPlay; verify the official-web fallback if needed.
3. Verify normal M3U channels still switch exactly once per remote press.
4. Run repository static/runtime tests and inspect the final CI conclusion.
5. Only then merge/release if explicitly requested.

## Model 2 — Model 1 + RF tuner experiment

Branch: `feature/rf-tuner-experiment-tizen6-20260819`

Purpose:

- Inherit Model 1 exactly: broad baseline, only the seven explicit audience exclusions, and KBS1/KBS2 official dynamic provider.
- Add a standalone-only experimental `tizen.tvwindow` RF/TV-source mode.
- Add `http://tizen.org/privilege/tv.window` to the standalone WGT manifest.
- Provide a TV-home action for entering RF tuner view and a safe Back action to return to IPTV.
- Do **not** use or depend on `webapis.broadcast.tuneDirect()`; direct numeric RF channel tuning is outside the expected consumer Tizen 6.0 public API path.

Real-device verification required:

- Model 1 channel-policy and KBS1/KBS2 behavior.
- `VIDEOSOURCE` exposes a source with `type === "TV"`.
- `tizen.tvwindow.setSource()` accepts that source.
- `tizen.tvwindow.show()` displays the tuner on the target TV.
- Back reliably hides the TV window and resumes IPTV.
- Channel +/- behavior while the TV window is active must be observed on the physical Samsung TV; code inspection cannot prove it.

## Deployment status

**NONE.** No model in this document is authorized for deployment or release until the owner explicitly says so.
