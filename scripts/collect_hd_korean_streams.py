#!/usr/bin/env python3
from __future__ import annotations

import concurrent.futures
import datetime as dt
import json
import os
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES_FILE = ROOT / "stream_sources.json"
REGISTRY_FILE = ROOT / "stream_registry.json"
CANDIDATES_FILE = ROOT / "stream_candidates.json"
HISTORY_FILE = ROOT / "stream_history.jsonl"
REPORT_FILE = ROOT / "stream-check" / "report.md"
USER_AGENT = "Mozilla/5.0 Korea-TV-HD-Collector/1.3-fast"
HTTP_TIMEOUT = float(os.getenv("STREAM_HTTP_TIMEOUT", "4"))
PROBE_TIMEOUT = float(os.getenv("STREAM_PROBE_TIMEOUT", "6"))
WORKERS = int(os.getenv("STREAM_WORKERS", "16"))


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso_now() -> str:
    return now_utc().replace(microsecond=0).isoformat().replace("+00:00", "Z")


def request_text(url: str, headers: dict[str, str] | None = None, timeout: float = HTTP_TIMEOUT) -> tuple[int, str]:
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
    return urllib.parse.urlunsplit((p.scheme.lower(), netloc, path, p.query, ""))


def channel_key(row: dict) -> str:
    tvg = (row.get("tvg_id") or "").strip().lower()
    if tvg:
        return tvg
    name = row.get("channel", "").lower()
    name = re.sub(r"\([^)]*(?:\d{3,4}p|not 24/7|geo-blocked)[^)]*\)", "", name, flags=re.I)
    name = re.sub(r"\[[^]]*\]", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def is_tv_channel(row: dict) -> bool:
    text = f"{row.get('channel','')} {row.get('tvg_id','')}".lower()
    return "radio" not in text


def parse_master_resolution(manifest: str) -> tuple[int, int] | None:
    best = (0, 0)
    for m in re.finditer(r"RESOLUTION=(\d+)x(\d+)", manifest, flags=re.I):
        w, h = int(m.group(1)), int(m.group(2))
        if h > best[1] or (h == best[1] and w > best[0]):
            best = (w, h)
    return best if best != (0, 0) else None


def fast_decode_probe(url: str) -> tuple[bool, int, int, str]:
    """Decode the first video frame only; this verifies that media data is actually playable."""
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "info",
        "-rw_timeout", "3000000",
        "-analyzeduration", "1000000", "-probesize", "1000000",
        "-i", url,
        "-map", "0:v:0", "-frames:v", "1",
        "-f", "null", "-",
    ]
    try:
        cp = subprocess.run(cmd, capture_output=True, text=True, timeout=PROBE_TIMEOUT)
        stderr = cp.stderr or ""
        frames = [int(x) for x in re.findall(r"frame=\s*(\d+)", stderr)]
        decoded = cp.returncode == 0 and bool(frames) and max(frames) >= 1

        width = height = 0
        # Prefer dimensions from the selected video stream / output description.
        dims = re.findall(r"Video:.*?(\d{2,5})x(\d{2,5})(?:\D|$)", stderr)
        if dims:
            width, height = map(int, dims[-1])

        codec = ""
        codec_match = re.search(r"Video:\s*([^,\s]+)", stderr)
        if codec_match:
            codec = codec_match.group(1)
        return decoded, width, height, codec
    except Exception:
        return False, 0, 0, ""


def validate_one(row: dict) -> dict:
    code, manifest = request_text(row["url"])
    status = "dead"
    width = height = 0
    codec = ""

    if code in (401, 403, 451):
        status = "geo-or-access"
    elif code == 200 and manifest.lstrip().startswith("#EXTM3U"):
        master = parse_master_resolution(manifest)
        if master:
            width, height = master
            # No need to touch media segments when the manifest itself is below the 720p policy.
            if height < 720:
                status = "manifest-below-720p"
                return {**row, "http": code, "status": status, "width": width, "height": height, "codec": codec}

        decoded, probe_w, probe_h, codec = fast_decode_probe(row["url"])
        if probe_w and probe_h:
            width, height = probe_w, probe_h

        if decoded:
            if height >= 720:
                status = "live-hd"
            elif height > 0:
                status = "live-below-720p"
            else:
                status = "live-resolution-unknown"
        else:
            status = "segment-fail"

    return {**row, "http": code, "status": status, "width": width, "height": height, "codec": codec}


def load_old_registry() -> dict[str, dict]:
    try:
        rows = json.loads(REGISTRY_FILE.read_text(encoding="utf-8"))
        return {r["canonical_url"]: r for r in rows if r.get("canonical_url")}
    except Exception:
        return {}


def candidate_score(row: dict) -> tuple:
    https_score = 1 if row["url"].startswith("https://") else 0
    host = urllib.parse.urlsplit(row["url"]).hostname or ""
    non_raw_ip = 0 if re.fullmatch(r"\d+\.\d+\.\d+\.\d+", host) else 1
    return (row["height"], row["width"], https_score, non_raw_ip)


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
    rows = [merged[k] for k in sorted(merged)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        validated = list(pool.map(validate_one, rows))

    registry: list[dict] = []
    eligible: list[dict] = []
    changes: list[dict] = []

    for row in validated:
        key = row["canonical_url"]
        previous = old.get(key, {})
        current = {
            **row,
            "first_seen": previous.get("first_seen") or checked_at,
            "last_checked": checked_at,
        }
        registry.append(current)
        if is_tv_channel(row) and row["status"] == "live-hd" and row["height"] >= 720:
            eligible.append(current)

        signature = (previous.get("status"), previous.get("width"), previous.get("height"))
        new_signature = (row["status"], row["width"], row["height"])
        if not previous or signature != new_signature:
            changes.append({
                "checked_at": checked_at,
                "canonical_url": key,
                "channel": row["channel"],
                "from": None if not previous else {"status": signature[0], "width": signature[1], "height": signature[2]},
                "to": {"status": row["status"], "width": row["width"], "height": row["height"]},
            })

    # One visible candidate per logical channel. All alternate URLs remain in registry as fallbacks/history.
    by_channel: dict[str, dict] = {}
    for row in eligible:
        key = channel_key(row)
        if not key:
            continue
        if key not in by_channel or candidate_score(row) > candidate_score(by_channel[key]):
            by_channel[key] = row
    hd_live = sorted(by_channel.values(), key=lambda r: (r["channel"].casefold(), r["canonical_url"]))
    registry.sort(key=lambda r: (r["channel"].casefold(), r["canonical_url"]))

    REGISTRY_FILE.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    CANDIDATES_FILE.write_text(json.dumps(hd_live, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if changes:
        with HISTORY_FILE.open("a", encoding="utf-8") as f:
            for change in changes:
                f.write(json.dumps(change, ensure_ascii=False) + "\n")

    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Korea fast 720p+ stream check", "", f"Checked: {checked_at}",
        f"Unique URLs after URL dedupe: {len(registry)}",
        f"Playable 720p+ TV URLs before channel dedupe: {len(eligible)}",
        f"Collected unique playable 720p+ TV channels: {len(hd_live)}",
        f"Mode: manifest <= {HTTP_TIMEOUT:g}s + first decoded video frame <= {PROBE_TIMEOUT:g}s, workers={WORKERS}", "",
        "| Channel | Status | HTTP | Resolution | Sources |", "|---|---|---:|---:|---|",
    ]
    for r in registry:
        res = f"{r['width']}x{r['height']}" if r["height"] else "-"
        srcs = ", ".join(s["id"] for s in r["sources"])
        lines.append(f"| {r['channel']} | {r['status']} | {r['http']} | {res} | {srcs} |")
    lines += ["", "## Source freshness", "", "| Source | Fresh <=365d | Last file change |", "|---|---|---|"]
    for s in source_log:
        lines.append(f"| {s['id']} | {'yes' if s['fresh'] else 'no'} | {s['last_changed'] or '-'} |")
    REPORT_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"deduped_urls={len(registry)} playable_hd_urls={len(eligible)} unique_playable_hd_channels={len(hd_live)} changes={len(changes)}")
    for r in hd_live:
        print(f"LIVE\t{r['height']}p\t{r['channel']}\t{r['url']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
