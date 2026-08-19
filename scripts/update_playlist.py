#!/usr/bin/env python3
"""Promote approved 720p+ Korean stream candidates into korea.m3u.

stream_candidates.json is refreshed automatically by the collector. The separate
approved_channels.json snapshot is the promotion boundary: newly discovered
channels are not exposed on the TV until explicitly approved.

KBS1/KBS2 are special providers, not fixed M3U8 streams. Their playlist entries
carry stable official KBS ON AIR identity URLs; the Samsung runtime resolves the
transient `service_url` from the official KBS live API at playback time.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


SPECIAL_CHANNELS = [
    {
        "tvg_id": "KBS1.official",
        "channel": "KBS1",
        "group": "공중파",
        "url": "https://onair.kbs.co.kr/index.html?sname=onair&stype=live&ch_code=11&ch_type=globalList",
    },
    {
        "tvg_id": "KBS2.official",
        "channel": "KBS2",
        "group": "공중파",
        "url": "https://onair.kbs.co.kr/index.html?sname=onair&stype=live&ch_code=12&ch_type=globalList",
    },
]
SPECIAL_URLS = {row["url"] for row in SPECIAL_CHANNELS}


def is_direct_hls(url: str) -> bool:
    return url.split("?", 1)[0].lower().endswith(".m3u8") and url.startswith(("http://", "https://"))


def is_playlist_target(url: str) -> bool:
    return is_direct_hls(url) or url in SPECIAL_URLS


def clean_name(name: str) -> str:
    name = re.sub(r"\s*\[(?:Not 24/7|Geo-blocked)\]\s*", " ", name, flags=re.I)
    name = re.sub(r"\s*\(\d{3,4}p\)\s*$", "", name, flags=re.I)
    return re.sub(r"\s+", " ", name).strip()


def channel_key(row: dict) -> str:
    tvg_id = str(row.get("tvg_id") or "").strip()
    return (tvg_id or clean_name(str(row.get("channel") or "Unknown"))).casefold()


def rank(row: dict) -> tuple[int, int, int, int, str]:
    url = str(row.get("url") or "")
    host = re.sub(r"^https?://", "", url, flags=re.I).split("/", 1)[0].split(":", 1)[0]
    raw_ip = 1 if re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", host) else 0
    https_penalty = 0 if url.startswith("https://") else 1
    live_penalty = 0 if row.get("status") == "live-hd" else 1
    return (-int(row.get("height") or 0), live_penalty, https_penalty, raw_ip, url)


CATEGORY_ORDER = {
    "공중파": 0,
    "쇼핑": 1,
    "드라마·영화": 2,
    "케이블·일반": 3,
    "뉴스·경제": 4,
    "종교": 5,
}


def category_for(row: dict) -> str:
    name = clean_name(str(row.get("channel") or ""))
    tvg = str(row.get("tvg_id") or "")
    hay = f"{name} {tvg}".casefold()

    # Last by explicit user preference.
    religious = (
        "bbs buddhist", "btn", "fgtv", "goodtv", "rutc", "c3tv",
        "불교", "기독", "기독교", "천주교", "원음", "cpbc", "cbs",
    )
    if any(k in hay for k in religious):
        return "종교"

    shopping = (
        "shopping", "shop", "home shopping", "homeshopping", "my shop",
        "롯데", "현대홈", "신세계", "w shopping", "shopping nt",
    )
    if any(k in hay for k in shopping):
        return "쇼핑"

    # Terrestrial networks and local terrestrial affiliates first.
    terrestrial = (
        "kbs1", "kbs2", "sbs tv", "sbs cjb", "sbs g1", "sbs kbc", "sbs ubc",
        "mbc ", "mbcchuncheon", "mbcchungbuk", "mbcdaejeon", "mbcgangwon",
        "mbcmokpo", "mbcyeosu", "obs tv", "obsgyeongin",
        "ebs1", "ebs2", "tbc", "knn", "jtv", "jibs",
    )
    if any(k in hay for k in terrestrial):
        return "공중파"

    news_finance = (
        "news", "뉴스", "ytn", "yonhap", "연합뉴스", "한국경제", "hankyung",
        "매일경제", "mk ", "mtn", "머니투데이", "경제tv", "economy",
        "tbs seoul", "national assembly", "국회", "ktv", "korea tv",
    )
    if any(k in hay for k in news_finance):
        return "뉴스·경제"

    drama_movie = (
        "drama", "movie", "cinema", "film", "드라마", "영화", "kbs world",
        "jtbc2", "jtbc4", "ocn", "catch on",
    )
    if any(k in hay for k in drama_movie):
        return "드라마·영화"

    return "케이블·일반"


def channel_sort_key(row: dict) -> tuple[int, str]:
    category = category_for(row)
    return (CATEGORY_ORDER[category], clean_name(str(row.get("channel") or "")).casefold())


def generate(rows: list[dict], approved_keys: set[str]) -> str:
    eligible = [
        r for r in rows
        if channel_key(r) in approved_keys
        and int(r.get("height") or 0) >= 720
        and r.get("status") in ("live-hd", "manifest-hd")
        and is_direct_hls(str(r.get("url") or ""))
    ]

    best_by_channel: dict[str, dict] = {}
    for row in eligible:
        key = channel_key(row)
        current = best_by_channel.get(key)
        if current is None or rank(row) < rank(current):
            best_by_channel[key] = row

    selected = sorted(best_by_channel.values(), key=channel_sort_key)
    output = ["#EXTM3U"]

    # KBS1/KBS2 are not approved fixed stream candidates. They are stable
    # identities for the official dynamic runtime provider and always remain at
    # the front of the terrestrial lineup.
    for row in SPECIAL_CHANNELS:
        output.append(
            f'#EXTINF:-1 tvg-id="{row["tvg_id"]}" group-title="{row["group"]}",{row["channel"]} (KBS 공식 동적)'
        )
        output.append(row["url"])

    seen_urls: set[str] = set()
    for row in selected:
        url = str(row["url"])
        canonical = str(row.get("canonical_url") or url)
        if canonical in seen_urls:
            continue
        seen_urls.add(canonical)
        name = clean_name(str(row.get("channel") or "Unknown"))
        height = int(row.get("height") or 0)
        tvg_id = str(row.get("tvg_id") or "")
        group = category_for(row)
        output.append(f'#EXTINF:-1 tvg-id="{tvg_id}" group-title="{group}",{name} ({height}p)')
        output.append(url)

    return "\n".join(output) + "\n"


def validate(text: str) -> None:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines or lines[0] != "#EXTM3U":
        raise ValueError("playlist must start with #EXTM3U")
    if len(lines) < 3:
        raise ValueError("playlist has no promoted channel entries")
    urls: set[str] = set()
    last_category = -1
    for i, line in enumerate(lines[1:], start=1):
        if not line.startswith("#EXTINF:"):
            continue
        if i + 1 >= len(lines):
            raise ValueError("dangling #EXTINF without URL")
        url = lines[i + 1]
        if not is_playlist_target(url):
            raise ValueError(f"invalid playlist URL after EXTINF: {url}")
        if url in urls:
            raise ValueError(f"duplicate URL in promoted playlist: {url}")
        urls.add(url)
        match = re.search(r'group-title="([^"]+)"', line)
        if not match or match.group(1) not in CATEGORY_ORDER:
            raise ValueError(f"invalid category: {line}")
        current_category = CATEGORY_ORDER[match.group(1)]
        if current_category < last_category:
            raise ValueError("playlist category order is invalid")
        last_category = current_category

    if not SPECIAL_URLS.issubset(urls):
        raise ValueError("KBS1/KBS2 dynamic identities missing from playlist")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="stream_candidates.json")
    parser.add_argument("--approved", default="approved_channels.json")
    parser.add_argument("--output", default="korea.m3u")
    args = parser.parse_args()

    rows = json.loads(Path(args.input).read_text(encoding="utf-8"))
    approvals = json.loads(Path(args.approved).read_text(encoding="utf-8"))
    approved_keys = {str(r["key"]).casefold() for r in approvals if r.get("key")}
    playlist = generate(rows, approved_keys)
    validate(playlist)
    Path(args.output).write_text(playlist, encoding="utf-8", newline="\n")
    count = sum(1 for line in playlist.splitlines() if line.startswith("#EXTINF:"))
    print(f"promoted {count} visible channels (including 2 dynamic KBS identities) to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())