#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANDIDATES = ROOT / "stream_candidates.json"
APPROVED = ROOT / "approved_channels.json"


def clean_name(name: str) -> str:
    name = re.sub(r"\s*\[(?:Not 24/7|Geo-blocked)\]\s*", " ", name, flags=re.I)
    name = re.sub(r"\s*\(\d{3,4}p\)\s*$", "", name, flags=re.I)
    return re.sub(r"\s+", " ", name).strip()


def key(row: dict) -> str:
    return str(row.get("tvg_id") or clean_name(str(row.get("channel") or "Unknown"))).casefold()


def main() -> int:
    rows = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    approved = []
    seen = set()
    for row in sorted(rows, key=lambda r: clean_name(str(r.get("channel") or "")).casefold()):
        if int(row.get("height") or 0) < 720:
            continue
        k = key(row)
        if k in seen:
            continue
        seen.add(k)
        approved.append({
            "key": k,
            "tvg_id": str(row.get("tvg_id") or ""),
            "channel": clean_name(str(row.get("channel") or "Unknown")),
            "approved_from": str(row.get("canonical_url") or row.get("url") or ""),
        })
    APPROVED.write_text(json.dumps(approved, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"approved={len(approved)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
