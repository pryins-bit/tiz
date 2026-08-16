#!/usr/bin/env bash
set -u
mkdir -p stream-check
printf '# Korea TV stream check\n\n| Channel | Result | HTTP | ffprobe |\n|---|---|---:|---|\n' > stream-check/report.md
jq -c '.[]' stream_candidates.json | while read -r row; do
  name=$(jq -r '.channel' <<<"$row")
  url=$(jq -r '.url' <<<"$row")
  http=$(curl -L --connect-timeout 5 --max-time 12 -A 'Mozilla/5.0 Korea-TV-Validator' -sS -o stream-check/manifest.tmp -w '%{http_code}' "$url" 2>/dev/null || true)
  result=dead
  probe='-'
  if [[ "$http" == "200" ]] && grep -q '^#EXTM3U' stream-check/manifest.tmp 2>/dev/null; then
    result=manifest-ok
    if timeout 15 ffprobe -v error -rw_timeout 8000000 -show_entries stream=codec_name,width,height -of compact=p=0:nk=1 "$url" > stream-check/probe.tmp 2>/dev/null; then
      probe=$(tr '\n' ';' < stream-check/probe.tmp | head -c 160)
      [[ -n "$probe" ]] && result=live
    fi
  elif [[ "$http" == "401" || "$http" == "403" || "$http" == "451" ]]; then
    result=geo-or-access
  fi
  printf '| %s | **%s** | %s | %s |\n' "$name" "$result" "$http" "$probe" >> stream-check/report.md
  printf '%s\t%s\t%s\n' "$result" "$http" "$name"
done
cat stream-check/report.md
