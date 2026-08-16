# tiz — TizenBrew Korea IPTV playlist

This repository publishes a stable M3U playlist URL for a Samsung TV running TizenBrew IPTV Player.

## TV playlist URL

Use this URL in the TizenBrew IPTV QR setup page:

`https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u`

The URL stays constant while `korea.m3u` is refreshed automatically.

## What is included

The updater pulls the current South Korea playlist from `iptv-org/iptv`, keeps Korean terrestrial/public-broadcast related entries (KBS, MBC, SBS affiliates, EBS, TBC, KNN, KBC, UBC, JTV, CJB, G1, JIBS), and prefers direct HTTPS HLS (`.m3u8`) streams for Tizen compatibility.

This repository does not host or proxy video streams. It only stores playlist metadata and links published by upstream sources.

## Updating

GitHub Actions runs every 6 hours and can also be started manually from the Actions tab. The updater rewrites `korea.m3u` only when the generated content changes.

## Verification boundary

The workflow can verify playlist syntax and HTTP/HLS reachability from GitHub-hosted runners. That does **not** prove playback on a specific Samsung TV. Final compatibility still requires testing in TizenBrew IPTV Player on the actual TV.
