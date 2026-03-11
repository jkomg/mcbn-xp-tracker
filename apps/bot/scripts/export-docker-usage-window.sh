#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${1:-lasombra-bot}"
OUT_DIR="${2:-$(pwd)/.run/docker-audit}"
SINCE_INPUT="${3:-}"
UNTIL_INPUT="${4:-}"

iso_now_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

iso_days_ago_utc() {
  local days="$1"
  if date -u -v-"${days}"d +"%Y-%m-%dT%H:%M:%SZ" >/dev/null 2>&1; then
    date -u -v-"${days}"d +"%Y-%m-%dT%H:%M:%SZ"
    return
  fi
  date -u -d "${days} days ago" +"%Y-%m-%dT%H:%M:%SZ"
}

SINCE="${SINCE_INPUT:-$(iso_days_ago_utc 30)}"
UNTIL="${UNTIL_INPUT:-$(iso_now_utc)}"

mkdir -p "$OUT_DIR"

RAW_LOG="$OUT_DIR/${CONTAINER_NAME}-raw.log"
PAYLOAD_LOG="$OUT_DIR/${CONTAINER_NAME}-payload.log"
JSON_LOG="$OUT_DIR/${CONTAINER_NAME}-json.log"
EVENT_COUNTS="$OUT_DIR/${CONTAINER_NAME}-event-counts.txt"
COMMAND_COUNTS="$OUT_DIR/${CONTAINER_NAME}-command-counts.txt"
DAILY_COUNTS="$OUT_DIR/${CONTAINER_NAME}-daily-counts.txt"
SUMMARY="$OUT_DIR/${CONTAINER_NAME}-summary.txt"

echo "Exporting logs for container: $CONTAINER_NAME"
echo "Window: $SINCE -> $UNTIL"

docker logs "$CONTAINER_NAME" \
  --since "$SINCE" \
  --until "$UNTIL" \
  --timestamps \
  >"$RAW_LOG" 2>&1

# Strip Docker timestamp prefix to isolate app payload.
awk '{ sub(/^[^ ]+ /, ""); print }' "$RAW_LOG" >"$PAYLOAD_LOG"

# Keep only JSON app log lines.
grep -E '^\{"ts":"' "$PAYLOAD_LOG" >"$JSON_LOG" || true

if command -v jq >/dev/null 2>&1; then
  jq -r '.event // empty' "$JSON_LOG" | sort | uniq -c | sort -nr >"$EVENT_COUNTS" || true
  jq -r 'select(.event=="command_execute_start") | (.commandName // "unknown")' "$JSON_LOG" \
    | sort | uniq -c | sort -nr >"$COMMAND_COUNTS" || true
  jq -r '.ts[0:10]' "$JSON_LOG" | sort | uniq -c >"$DAILY_COUNTS" || true
else
  grep -o '"event":"[^"]*"' "$JSON_LOG" | sort | uniq -c | sort -nr >"$EVENT_COUNTS" || true
  grep -o '"commandName":"[^"]*"' "$JSON_LOG" | sort | uniq -c | sort -nr >"$COMMAND_COUNTS" || true
  cut -c 8-17 "$JSON_LOG" | sort | uniq -c >"$DAILY_COUNTS" || true
fi

{
  echo "container=$CONTAINER_NAME"
  echo "since=$SINCE"
  echo "until=$UNTIL"
  echo "raw_lines=$(wc -l <"$RAW_LOG" | tr -d ' ')"
  echo "json_lines=$(wc -l <"$JSON_LOG" | tr -d ' ')"
  echo "event_count_rows=$(wc -l <"$EVENT_COUNTS" | tr -d ' ')"
  echo "command_count_rows=$(wc -l <"$COMMAND_COUNTS" | tr -d ' ')"
  echo "daily_count_rows=$(wc -l <"$DAILY_COUNTS" | tr -d ' ')"
} >"$SUMMARY"

echo "Export complete:"
echo "  $SUMMARY"
echo "  $EVENT_COUNTS"
echo "  $COMMAND_COUNTS"
echo "  $DAILY_COUNTS"
