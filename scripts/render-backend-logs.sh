#!/usr/bin/env bash
# Fetch latest logs for Finsight backend using Render CLI
# Automatically batches requests, throttles to avoid API 500s, and opens in Cursor
# Usage:
#   ./render-backend-logs.sh [total_lines] [--errors-only]
# Example:
#   ./render-backend-logs.sh 600
#   ./render-backend-logs.sh 600 --errors-only

set -e

SERVICE_ID="srv-d21imrnfte5s73flfq00"
TOTAL_LINES=${1:-300}
FILTER_ERRORS=false
LOG_FILE="$(pwd)/backend-logs.txt"
FILTERED_FILE="$(pwd)/backend-logs-errors.txt"

# Optional second arg
if [[ "$2" == "--errors-only" ]]; then
  FILTER_ERRORS=true
fi

MAX_BATCH=100
PAUSE_EVERY=5   # after every 5 batches, pause briefly

echo "🔍 Fetching last $TOTAL_LINES lines of logs from Render backend service..."
> "$LOG_FILE"

# Verify CLI presence
if ! command -v render &>/dev/null; then
  echo "❌ Render CLI not found. Install it from https://render.com/docs/cli"
  exit 1
fi

# Verify authentication
if ! render services &>/dev/null; then
  echo "❌ Render CLI not authenticated. Run 'render login' first."
  exit 1
fi

# --- Main loop ---
REMAINING=$TOTAL_LINES
COUNT=0
while [ $REMAINING -gt 0 ]; do
  BATCH=$(( REMAINING > MAX_BATCH ? MAX_BATCH : REMAINING ))
  echo "  • Fetching next $BATCH logs..."
  render logs --resources "$SERVICE_ID" --limit "$BATCH" --output text --confirm >> "$LOG_FILE" || true
  REMAINING=$(( REMAINING - BATCH ))
  COUNT=$(( COUNT + 1 ))

  if (( COUNT % PAUSE_EVERY == 0 )); then
    echo "  ⏸️ Pausing briefly to avoid API errors..."
    sleep 2
  else
    sleep 0.2
  fi
done

# --- Filter for errors if requested ---
if [ "$FILTER_ERRORS" = true ]; then
  echo "🔎 Filtering for error lines..."
  grep -iE "error|failed|exception|trace|unhandled|panic|stack" "$LOG_FILE" > "$FILTERED_FILE" || true
  echo "✅ Filtered logs saved to $FILTERED_FILE"
  TARGET_FILE="$FILTERED_FILE"
else
  TARGET_FILE="$LOG_FILE"
fi

echo "✅ Logs saved to $TARGET_FILE"

# --- Open automatically in Cursor ---
if command -v cursor &>/dev/null; then
  echo "🧠 Opening logs in Cursor..."
  cursor "$TARGET_FILE"
else
  echo "⚠️ Cursor CLI not found. Open manually: $TARGET_FILE"
fi