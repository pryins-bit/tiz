#!/usr/bin/env python3
"""Generate the curated Korea TV playlist used by the TizenBrew module.

The default playlist is intentionally conservative: only channels with a recent
independent HLS probe or equivalent recent verification are emitted. Discovery
sources such as iptv-org/Free-TV remain useful for finding candidates, but are
not merged automatically because stale public M3U entries can re-introduce dead
or proxy streams.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Channel:
    tvg_id: str
    name: str
    quality: str
    url: str


# Reviewed 2026-08-16. Keep this list small and evidence-driven.
# If a stream fails on the real Samsung TV, remove/quarantine it before adding
# more candidates. Prefer broadcaster/CDN URLs; raw IP is retained only where
# it is the most recently independently verified direct HLS endpoint.
CURATED_CHANNELS = [
    Channel(
        "KTV.kr",
        "KTV 국민방송",
        "1080p",
        "https://hlive.ktv.go.kr/live/klive_h.stream/playlist.m3u8",
    ),
    Channel(
        "GugakTV.kr",
        "국악방송 GugakTV",
        "1080p",
        "https://mgugaklive.nowcdn.co.kr/gugakvideo/gugakvideo.stream/playlist.m3u8",
    ),
    Channel(
        "MBCGyeongnamTV.kr",
        "MBC 경남",
        "1080p",
        "https://624a79c87201d.streamlock.net/MBCTV/TV1.stream/playlist.m3u8",
    ),
    Channel(
        "KBC.kr",
        "KBC 광주방송 (SBS)",
        "1080p",
        "http://119.200.131.11:1935/KBCTV/tv/playlist.m3u8",
    ),
    Channel(
        "HLCQDTV.kr",
        "대전 MBC",
        "720p",
        "https://ns1.tjmbc.co.kr/live/myStream.sdp/playlist.m3u8",
    ),
    Channel(
        "HLCTDTV.kr",
        "대구 MBC",
        "480p",
        "https://5ee1ec6f32118.streamlock.net/live/livetv/playlist.m3u8",
    ),
    Channel(
        "HLKUDTV.kr",
        "부산 MBC",
        "360p",
        "https://stream.bsmbc.com/livetv/BusanMBC_TV_onairstream/playlist.m3u8",
    ),
    Channel(
        "EBS1TV.kr",
        "EBS 1",
        "400p",
        "http://ebsonair.ebs.co.kr/groundwavefamilypc/familypc1m/playlist.m3u8",
    ),
]


def is_direct_hls(url: str) -> bool:
    return url.split("?", 1)[0].lower().endswith(".m3u8") and url.startswith(("http://", "https://"))


def generate(channels: list[Channel]) -> str:
    output = ["#EXTM3U"]
    seen_urls: set[str] = set()
    for channel in channels:
        if channel.url in seen_urls:
            continue
        if not is_direct_hls(channel.url):
            raise ValueError(f"not a direct HLS URL: {channel.url}")
        seen_urls.add(channel.url)
        output.append(
            f'#EXTINF:-1 tvg-id="{channel.tvg_id}" group-title="검증 채널",'
            f'{channel.name} ({channel.quality})'
        )
        output.append(channel.url)
    return "\n".join(output) + "\n"


def validate(text: str) -> None:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines or lines[0] != "#EXTM3U":
        raise ValueError("playlist must start with #EXTM3U")
    if len(lines) < 3:
        raise ValueError("playlist has no channel entries")

    for index, line in enumerate(lines[1:], start=1):
        if line.startswith("#EXTINF:"):
            if index + 1 >= len(lines):
                raise ValueError("dangling #EXTINF without URL")
            url = lines[index + 1]
            if not is_direct_hls(url):
                raise ValueError(f"invalid HLS URL after EXTINF: {url}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="korea.m3u", help="Output playlist path")
    args = parser.parse_args()

    playlist = generate(CURATED_CHANNELS)
    validate(playlist)
    Path(args.output).write_text(playlist, encoding="utf-8", newline="\n")

    channel_count = sum(1 for line in playlist.splitlines() if line.startswith("#EXTINF:"))
    print(f"wrote {channel_count} curated channels to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
