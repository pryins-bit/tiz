# app/AGENTS.md — Update 1 TV contract

This file is subordinate to the repository root `AGENTS.md` and adds durable requirements for the installed Korea TV shell.

## Update 1 visible lineup

- Target device: Samsung KU50UA7050FXKR / Tizen 6.0.
- The Update 1 visible channel contract is exactly **56 channels** when all 54 allowed ordinary channels are present in the fetched playlist: 54 ordinary playlist channels plus KBS1 and KBS2 special-provider channels.
- `channel-policy.js` is the reviewed TV presentation boundary. Broad discovery/registry data may remain in repository data files, but unapproved entries must not become visible merely because an automated collector rediscovers them.
- The review decision for former positions 56–62 is removal from TV presentation: Bloomberg TV+, France 24, Euronews English, FIFA+, TRT World, Newsmax and NTD.
- The 1080p MBC trio is reduced from three to two for Update 1. MBC Gangwon (`HLAQDTV.kr@SD`) is omitted; Chuncheon and Yeosu remain. The decision log explains that the final physical-TV weakest station name was not recorded and that Gangwon was chosen conservatively because its candidate is raw-IP HTTP.
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

## Update boundary

- Update 1 contains **no RF tuner / TVWindow functionality**. Do not add `rf-tuner.js`, an RF tile, `tv.window` privilege, or Broadcast/tuneDirect code to this release.
- RF functionality belongs only to the separately staged Update 2 / RF branch.
