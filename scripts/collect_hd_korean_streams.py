#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import json
import os
import re
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES_FILE = ROOT / "stream_sources.json"
REGISTRY_FILE = ROOT / "stream_registry.json"
CANDIDATES_FILE = ROOT / "stream_candidates.json"
HISTORY_FILE = ROOT / "stream_history.jsonl"
REPORT_FILE = ROOT / "stream-check" / "report.md"
USER_AGENT = "Mozilla/5.0 Korea-TV-HD-Collector/1.0"
TIMEOUT = 20


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso_now() -> str:
    return now_utc().replace(microsecond=0).isoformat().replace("+00:00", "Z")


def request_text(url: str, headers: dict[str, str] | None = None, timeout: int = TIMEOUT) -> tuple[int, str]:
    h = {"User-Agent": USER_AGENT}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return int(getattr(r, "status", 200)), r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        return e.code, body
    except Exception:
        return 0, ""


def source_is_fresh(source: dict) -> tuple[bool, str | None]:
    repo = source["repo"]
    path = urllib.parse.quote(source["path"], safe="/")
    api = f"https://api.github.com/repos/{repo}/commits?path={path}&per_page=1"
    headers = {"Accept": "application/vnd.github+json"}
    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    code, body = request_text(api, headers=headers)
    if code != 200:
        return False, None
    try:
        rows = json.loads(body)
        stamp = rows[0]["commit"]["committer"]["date"]
        changed = dt.datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        age = (now_utc() - changed).days
        return age <= int(source.get("max_age_days", 365)), stamp
    except Exception:
        return False, None


def parse_m3u(text: str, source: dict) -> list[dict]:
    out: list[dict] = []
    pending = None
    for raw in text.replace("\r", "").split("\n"):
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#EXTINF:"):
            pending = line
            continue
        if line.startswith("#"):
            continue
        if not pending or not line.startswith(("http://", "https://")):
            continue
        clean = line.split("?", 1)[0].lower()
        if not clean.endswith(".m3u8"):
            pending = None
            continue
        name = pending.rsplit(",", 1)[-1].strip() or "Unknown"
        tvg = re.search(r'tvg-id="([^"]+)"', pending)
        out.append({
            "channel": name,
            "tvg_id": tvg.group(1) if tvg else "",
            "url": line,
            "source": source["id"],
            "source_repo": source["repo"],
            "source_path": source["path"],
            "source_extinf": pending,
        })
        pending = None
    return out


def canonical_url(url: str) -> str:
    p = urllib.parse.urlsplit(url.strip())
    host = (p.hostname or "").lower()
    port = p.port
    netloc = host
    if port and not ((p.scheme == "http" and port == 80) or (p.scheme == "https" and port == 443)):
        netloc = f"{host}:{port}"
    path = re.sub(r"/{2,}", "/", p.path or "/")
    # Query strings can be required tokens, so keep them. Remove only fragments.
    return urllib.parse.urlunsplit((p.scheme.lower(), netloc, path, p.query, ""))


def parse_master_resolution(manifest: str) -> tuple[int, int] | None:
    best = (0, 0)
    for m in re.finditer(r"RESOLUTION=(\d+)x(\d+)", manifest, flags=re.I):
        w, h = int(m.group(1)), int(m.group(2))
        if h > best[1] or (h == best[1] and w > best[0]):
            best = (w, h)
    return best if best != (0, 0) else None


def ffprobe_resolution(url: str) -> tuple[int, int, str] | None:
    cmd = [
        "ffprobe", "-v", "error", "-rw_timeout", "12000000",
        "-analyzeduration", "5000000", "-probesize", "5000000",
        "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height",
        "-of", "json", url,
    ]
    try:
        cp = subprocess.run(cmd, capture_output=True, text=True, timeout=TIMEOUT)
        if cp.returncode != 0:
            return None
        payload = json.loads(cp.stdout or "{}")
        streams = payload.get("streams") or []
        if not streams:
            return None
        s = streams[0]
        w, h = int(s.get("width") or 0), int(s.get("height") or 0)
        if not w or not h:
            return None
        return w, h, str(s.get("codec_name") or "")
    except Exception:
        return None


def load_old_registry() -> dict[str, dict]:
    try:
        rows = json.loads(REGISTRY_FILE.read_text(encoding="utf-8"))
        return {r["canonical_url"]: r for r in rows if r.get("canonical_url")}
    except Exception:
        return {}


def main() -> int:
    checked_at = iso_now()
    sources = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
    raw_candidates: list[dict] = []
    source_log: list[dict] = []

    for source in sources:
        fresh, last_changed = source_is_fresh(source)
        source_log.append({"id": source["id"], "fresh": fresh, "last_changed": last_changed})
        if not fresh:
            continue
        code, text = request_text(source["url"])
        if code != 200 or "#EXTM3U" not in text[:2048]:
            continue
        raw_candidates.extend(parse_m3u(text, source))

    # Exact stream de-duplication. Preserve all discovery sources for provenance.
    merged: dict[str, dict] = {}
    for row in raw_candidates:
        key = canonical_url(row["url"])
        if key not in merged:
            merged[key] = {
                "canonical_url": key,
                "url": row["url"],
                "channel": row["channel"],
                "tvg_id": row["tvg_id"],
                "sources": [],
            }
        src = {"id": row["source"], "repo": row["source_repo"], "path": row["source_path"]}
        if src not in merged[key]["sources"]:
            merged[key]["sources"].append(src)

    old = load_old_registry()
    registry: list[dict] = []
    hd_live: list[dict] = []
    changes: list[dict] = []

    for key in sorted(merged):
        row = merged[key]
        code, manifest = request_text(row["url"], timeout=12)
        status = "dead"
        width = height = 0
        codec = ""
        if code in (401, 403, 451):
            status = "geo-or-access"
        elif code == 200 and manifest.lstrip().startswith("#EXTM3U"):
            status = "manifest-ok"
            probe = ffprobe_resolution(row["url"])
            if probe:
                width, height, codec = probe
                status = "live-hd" if height >= 720 else "live-below-720p"
            else:
                master = parse_master_resolution(manifest)
                if master:
                    width, height = master
                    status = "manifest-hd" if height >= 720 else "manifest-below-720p"

        previous = old.get(key, {})
        first_seen = previous.get("first_seen") or checked_at
        current = {
            **row,
            "http": code,
            "status": status,
            "width": width,
            "height": height,
            "codec": codec,
            "first_seen": first_seen,
            "last_checked": checked_at,
        }
        registry.append(current)

        # Final collection: only Korean-source candidates with observed >=720p.
        if status in ("live-hd", "manifest-hd") and height >= 720:
            hd_live.append(current)

        signature = (previous.get("status"), previous.get("width"), previous.get("height"))
        new_signature = (status, width, height)
        if previous and signature != new_signature:
            changes.append({
                "checked_at": checked_at,
                "canonical_url": key,
                "channel": row["channel"],
                "from": {"status": signature[0], "width": signature[1], "height": signature[2]},
                "to": {"status": status, "width": width, "height": height},
            })
        elif not previous:
            changes.append({
                "checked_at": checked_at,
                "canonical_url": key,
                "channel": row["channel"],
                "from": None,
                "to": {"status": status, "width": width, "height": height},
            })

    # Stable order and one URL only once. Different URLs for the same channel remain as fallbacks.
    hd_live.sort(key=lambda r: (r["channel"].casefold(), r["canonical_url"]))
    REGISTRY_FILE.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    CANDIDATES_FILE.write_text(json.dumps(hd_live, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if changes:
        with HISTORY_FILE.open("a", encoding="utf-8") as f:
            for change in changes:
                f.write(json.dumps(change, ensure_ascii=False) + "\n")

    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Korea 720p+ stream check",
        "",
        f"Checked: {checked_at}",
        f"Unique URLs after dedupe: {len(registry)}",
        f"Collected 720p+: {len(hd_live)}",
        "",
        "| Channel | Status | HTTP | Resolution | Sources |",
        "|---|---|---:|---:|---|",
    ]
    for r in registry:
        res = f"{r['width']}x{r['height']}" if r["height"] else "-"
        srcs = ", ".join(s["id"] for s in r["sources"])
        lines.append(f"| {r['channel']} | {r['status']} | {r['http']} | {res} | {srcs} |")
    lines += ["", "## Source freshness", "", "| Source | Fresh <=365d | Last file change |", "|---|---|---|"]
    for s in source_log:
        lines.append(f"| {s['id']} | {'yes' if s['fresh'] else 'no'} | {s['last_changed'] or '-'} |")
    REPORT_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"deduped={len(registry)} hd720plus={len(hd_live)} changes={len(changes)}")
    for r in hd_live:
        print(f"HD\t{r['height']}p\t{r['channel']}\t{r['url']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
