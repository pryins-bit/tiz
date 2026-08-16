#!/usr/bin/env python3
"""Promote the reviewed 720p+ Korean stream candidates into korea.m3u.

stream_candidates.json is produced by the separate collector/validator. This
script does not discover new streams; it only converts the already filtered,
deduplicated candidate snapshot into the stable playlist consumed by Korea TV.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def is_direct_hls(url: str) -> bool:
    return url.split("?", 1)[0].lower().endswith(".m3u8") and url.startswith(("http://", "https://"))


def clean_name(name: str) -> str:
    name = re.sub(r"\s*\[(?:Not 24/7|Geo-blocked)\]\s*", " ", name, flags=re.I)
    return re.sub(r"\s+", " ", name).strip()


def channel_key(row: dict) -> str:
    tvg_id = str(row.get("tvg_id") or "").strip()
    if tvg_id:
        return tvg_id.casefold()
    name = clean_name(str(row.get("channel") or "Unknown"))
    name = re.sub(r"\s*\(\d{3,4}p\)\s*$", "", name, flags=re.I)
    return name.casefold()


def rank(row: dict) -> tuple[int, int, int, str]:
    url = str(row.get("url") or "")
    host = re.sub(r"^https?://", "", url, flags=re.I).split("/", 1)[0].split(":", 1)[0]
    raw_ip = 1 if re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", host) else 0
    https_penalty = 0 if url.startswith("https://") else 1
    live_penalty = 0 if row.get("status") == "live-hd" else 1
    return (-int(row.get("height") or 0), live_penalty, https_penalty + raw_ip, url)


def generate(rows: list[dict]) -> str:
    eligible = [
        r for r in rows
        if int(r.get("height") or 0) >= 720
        and r.get("status") in ("live-hd", "manifest-hd")
        and is_direct_hls(str(r.get("url") or ""))
    ]

    # One best stream per logical channel. URL-level dedupe has already happened
    # in the collector, but repeat it here defensively.
    best_by_channel: dict[str, dict] = {}
    for row in eligible:
        key = channel_key(row)
        current = best_by_channel.get(key)
        if current is None or rank(row) < rank(current):
            best_by_channel[key] = row

    selected = sorted(best_by_channel.values(), key=lambda r: clean_name(str(r.get("channel") or "")).casefold())
    output = ["#EXTM3U"]
    seen_urls: set[str] = set()
    for row in selected:
        url = str(row["url"])
        canonical = str(row.get("canonical_url") or url)
        if canonical in seen_urls:
            continue
        seen_urls.add(canonical)
        name = clean_name(str(row.get("channel") or "Unknown"))
        name = re.sub(r"\s*\(\d{3,4}p\)\s*$", "", name, flags=re.I)
        height = int(row.get("height") or 0)
        tvg_id = str(row.get("tvg_id") or "")
        output.append(f'#EXTINF:-1 tvg-id="{tvg_id}" group-title="한국 720p+",{name} ({height}p)')
        output.append(url)

    return "\n".join(output) + "\n"


def validate(text: str) -> None:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines or lines[0] != "#EXTM3U":
        raise ValueError("playlist must start with #EXTM3U")
    if len(lines) < 3:
        raise ValueError("playlist has no channel entries")
    urls: set[str] = set()
    for i, line in enumerate(lines[1:], start=1):
        if not line.startswith("#EXTINF:"):
            continue
        if i + 1 >= len(lines):
            raise ValueError("dangling #EXTINF without URL")
        url = lines[i + 1]
        if not is_direct_hls(url):
            raise ValueError(f"invalid HLS URL after EXTINF: {url}")
        if url in urls:
            raise ValueError(f"duplicate URL in promoted playlist: {url}")
        urls.add(url)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="stream_candidates.json")
    parser.add_argument("--output", default="korea.m3u")
    args = parser.parse_args()

    rows = json.loads(Path(args.input).read_text(encoding="utf-8"))
    playlist = generate(rows)
    validate(playlist)
    Path(args.output).write_text(playlist, encoding="utf-8", newline="\n")
    count = sum(1 for line in playlist.splitlines() if line.startswith("#EXTINF:"))
    print(f"promoted {count} unique 720p+ channels to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
