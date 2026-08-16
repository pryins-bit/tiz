#!/usr/bin/env python3
"""Generate a Tizen-friendly Korea terrestrial IPTV playlist from public upstream M3U data."""

from __future__ import annotations

import argparse
import re
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path

DEFAULT_UPSTREAMS = [
    "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/kr.m3u",
    "https://raw.githubusercontent.com/hujingguang/ChinaIPTV/main/southKorea.m3u8",
]
USER_AGENT = "Mozilla/5.0 (Tizen-Korea-Playlist-Updater/1.1)"

# Keep this intentionally narrow: terrestrial/public broadcasters and regional affiliates.
KEEP_PATTERNS = [
    r"\bKBS\b",
    r"\bMBC\b",
    r"\bSBS\b",
    r"\bEBS\b",
    r"\bTBC\b",
    r"\bKNN\b",
    r"\bKBC\b",
    r"\bUBC\b",
    r"\bJTV\b",
    r"\bCJB\b",
    r"\bG1\b",
    r"\bJIBS\b",
    r"HLKA-DTV",
    r"HLKB-DTV",
    r"HLKG-DTV",
    r"HLKH-DTV",
    r"HLKI-DTV",
    r"HLQBDTV",
    r"HLCTDTV",
    r"HLKUDTV",
    r"HLDEDTV",
    r"HLDGDTV",
    r"HLDHDTV",
    r"HLDPDTV",
    r"HLDQDTV",
    r"HLDRDTV",
    r"HLCGDTV",
    r"HLKJDTV",
]
KEEP_RE = re.compile("|".join(f"(?:{p})" for p in KEEP_PATTERNS), re.IGNORECASE)


@dataclass(frozen=True)
class Entry:
    extinf: str
    url: str

    @property
    def name(self) -> str:
        return self.extinf.rsplit(",", 1)[-1].strip()

    @property
    def tvg_id(self) -> str:
        match = re.search(r'tvg-id="([^"]+)"', self.extinf)
        return match.group(1) if match else self.name


def read_text(source: str) -> str:
    if source.startswith(("http://", "https://")):
        req = urllib.request.Request(source, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.read().decode("utf-8", errors="replace")
    return Path(source).read_text(encoding="utf-8")


def parse_entries(text: str) -> list[Entry]:
    lines = [line.strip() for line in text.replace("\r\n", "\n").split("\n")]
    entries: list[Entry] = []
    pending_extinf: str | None = None

    for line in lines:
        if not line:
            continue
        if line.startswith("#EXTINF:"):
            pending_extinf = line
            continue
        if line.startswith("#"):
            continue
        if pending_extinf and line.startswith(("http://", "https://")):
            entries.append(Entry(pending_extinf, line))
            pending_extinf = None
    return entries


def is_direct_hls(url: str) -> bool:
    clean = url.split("?", 1)[0].lower()
    return clean.endswith(".m3u8")


def wanted(entry: Entry) -> bool:
    haystack = f"{entry.extinf} {entry.name} {entry.tvg_id}"
    return bool(KEEP_RE.search(haystack)) and is_direct_hls(entry.url)


def rank(entry: Entry) -> tuple[int, str, str]:
    # HTTPS first, then deterministic name/URL ordering.
    https_penalty = 0 if entry.url.startswith("https://") else 1
    return (https_penalty, entry.name.casefold(), entry.url)


def generate(entries: list[Entry]) -> str:
    selected = sorted((e for e in entries if wanted(e)), key=rank)
    seen: set[tuple[str, str]] = set()
    output = ["#EXTM3U"]

    for entry in selected:
        key = (entry.name.casefold(), entry.url)
        if key in seen:
            continue
        seen.add(key)
        output.extend([entry.extinf, entry.url])

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
            if not url.startswith(("http://", "https://")) or not is_direct_hls(url):
                raise ValueError(f"invalid HLS URL after EXTINF: {url}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input",
        action="append",
        dest="inputs",
        help="Upstream M3U URL or local file. Repeat to merge multiple sources.",
    )
    parser.add_argument("--output", default="korea.m3u", help="Output playlist path")
    args = parser.parse_args()

    sources = args.inputs or DEFAULT_UPSTREAMS
    entries: list[Entry] = []
    errors: list[str] = []
    for source in sources:
        try:
            entries.extend(parse_entries(read_text(source)))
        except Exception as exc:
            errors.append(f"{source}: {exc}")

    if not entries:
        raise RuntimeError("all upstreams failed: " + "; ".join(errors))
    for error in errors:
        print(f"WARNING: upstream failed: {error}", file=sys.stderr)

    playlist = generate(entries)
    validate(playlist)
    Path(args.output).write_text(playlist, encoding="utf-8", newline="\n")

    channel_count = sum(1 for line in playlist.splitlines() if line.startswith("#EXTINF:"))
    print(f"wrote {channel_count} channels from {len(sources)} upstream(s) to {args.output}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
