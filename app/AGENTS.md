# app/AGENTS.md — V2 TV contract

This file is subordinate to the repository root `AGENTS.md` and adds durable requirements for the installed Korea TV shell.

## V2 visible lineup

- Target device: Samsung KU50UA7050FXKR / Tizen 6.0.
- The finalized V2 visible channel contract is exactly **47 channels** when all 45 approved ordinary channels are present: 45 ordinary playlist channels plus KBS1 and KBS2 special-provider channels.
- `channel-policy.js` is the reviewed TV presentation boundary. Broad discovery/registry data may remain in repository data files, but unapproved entries must not become visible merely because an automated collector rediscovers them.
- Preserve the previously verified 56-channel WGT/release as a rollback baseline; do not rewrite its protected backup/reference state.
- V2 removes additional duplicate affiliates: MBC Chungbuk, MBC Daejeon, MBC Mokpo, SBS CJB, SBS G1, and SBS KBC.
- V2 retains the reduced terrestrial set: MBC Chuncheon + MBC Yeosu, and SBS TV + SBS UBC.
- V2 removes the Christian channels FGTV, GoodTV, and RUTC TV from the approved presentation set. BBS and BTN remain because the owner's current removal decision was specifically for the Christian channels.
- The earlier overseas removals remain excluded: Bloomberg TV+, France 24, Euronews English, FIFA+, TRT World, Newsmax and NTD.
- Do not silently expand the allowlist. Additions/removals require an explicit owner decision and an audit entry in `channel_decision_log.md`.

## KBS1 / KBS2 special provider

- KBS1 and KBS2 must **not** be stored or treated as fixed M3U8 streams.
- KBS1 uses official KBS `channel_code=11`; KBS2 uses `channel_code=12`.
- At playback time fetch `https://cfpwwwapi.kbs.co.kr/api/v1/landing/live/channel_code/<code>` and read `channel_item[0].service_url`.
- The returned `service_url` is ephemeral runtime data. Never persist it in `korea.m3u`, `approved_channels.json`, source registries, logs, or documentation as a stable stream.
- Pass the transient service URL to Samsung AVPlay. If API resolution or AVPlay fails, the official KBS ON AIR page may be used as fallback.
- Do not use third-party KBS relays/proxies or revive the rejected fixed `gscdn` candidates without a new explicit owner decision.
- `channel-policy.js` must load before `kbs-provider.js`, and `kbs-provider.js` must load before `bootstrap.js`.
- Standalone WGT packaging must include both `channel-policy.js` and `kbs-provider.js`.

## Release boundary

- V2 contains **no RF tuner / TVWindow functionality**. Do not add `rf-tuner.js`, an RF tile, `tv.window` privilege, or Broadcast/tuneDirect code to this release.
- RF functionality remains separate from the 47-channel V2 release.
