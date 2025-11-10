#!/usr/bin/env bash
# Fetch logs from both Render backend (via CLI) and GitHub Actions (via gh CLI)
# Non-interactive, batched, throttled, optional error filtering, and auto-opens in Cursor
#
# Usage:
#   ./render-and-gh-logs.sh [total_lines] [--errors-only] [--run <run_id>]
# Examples:
#   ./render-and-gh-logs.sh 600
#   ./render-and-gh-logs.sh 600 --errors-only
#   ./render-and-gh-logs.sh 600 --run 123456789
#   ./render-and-gh-logs.sh 600 --errors-only --run 123456789

set -e

SERVICE_ID="srv-d21imrnfte5s73flfq00"
TOTAL_LINES=${1:-300}
FILTER_ERRORS=false
RUN_ID=""
LOG_DIR="$(pwd)/logs-latest"
RENDER_LOG_FILE="$LOG_DIR/backend-logs.txt"
GH_LOG_FILE="$LOG_DIR/github-build.log"
COMBINED_LOG_FILE="$LOG_DIR/combined-logs.txt"
FILTERED_FILE="$LOG_DIR/combined-logs-errors.txt"

mkdir -p "$LOG_DIR"

# --- Parse arguments ---
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --errors-only)
      FILTER_ERRORS=true
      shift
      ;;
    --run)
      RUN_ID="$2"
      shift 2
      ;;
    *)
      echo "⚠️ Unknown option: $1"
      shift
      ;;
  esac
done

MAX_BATCH=100
PAUSE_EVERY=5   # after every 5 batches, pause briefly

echo "🔍 Fetching logs..."
> "$RENDER_LOG_FILE"

# --- Verify dependencies ---
for cmd in render gh jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "❌ Missing dependency: $cmd"
    echo "Please install it: https://render.com/docs/cli | https://cli.github.com/ | brew install jq"
    exit 1
  fi
done

# --- Verify authentication ---
if ! render services &>/dev/null; then
  echo "❌ Render CLI not authenticated. Run 'render login'."
  exit 1
fi
if ! gh auth status &>/dev/null; then
  echo "❌ GitHub CLI not authenticated. Run 'gh auth login'."
  exit 1
fi

# --- Fetch Render logs ---
echo "🟣 Fetching last $TOTAL_LINES lines from Render backend..."
REMAINING=$TOTAL_LINES
COUNT=0
while [ $REMAINING -gt 0 ]; do
  BATCH=$(( REMAINING > MAX_BATCH ? MAX_BATCH : REMAINING ))
  echo "  • Fetching next $BATCH logs..."
  render logs --resources "$SERVICE_ID" \
    --limit "$BATCH" \
    --direction backward \
    --output text \
    --confirm \
    > >(tee -a "$RENDER_LOG_FILE") 2>/dev/null || true

  REMAINING=$(( REMAINING - BATCH ))
  COUNT=$(( COUNT + 1 ))

  if (( COUNT % PAUSE_EVERY == 0 )); then
    echo "  ⏸️  Pausing briefly to avoid API errors..."
    sleep 2
  else
    sleep 0.2
  fi
done

# --- Fetch GitHub Actions logs ---
echo "🟢 Fetching GitHub Actions logs..."
if [ -n "$RUN_ID" ]; then
  echo "  • Using specified run ID: $RUN_ID"
else
  RUN_ID=$(gh run list --limit 1 --json databaseId -q '.[0].databaseId' || true)
  if [ -z "$RUN_ID" ]; then
    echo "⚠️ No recent GitHub Actions runs found."
  else
    echo "  • Latest run ID detected: $RUN_ID"
  fi
fi

if [ -n "$RUN_ID" ]; then
  gh run view "$RUN_ID" --log > "$GH_LOG_FILE" || echo "⚠️ Could not fetch logs for run $RUN_ID."
else
  echo "(No GitHub logs found.)" > "$GH_LOG_FILE"
fi

# --- Combine both logs ---
echo "🧩 Combining logs..."
{
  echo "=========================="
  echo "=== RENDER BACKEND LOGS ==="
  echo "=========================="
  cat "$RENDER_LOG_FILE"
  echo ""
  echo "=========================="
  echo "=== GITHUB ACTIONS LOGS ==="
  echo "=========================="
  [ -s "$GH_LOG_FILE" ] && cat "$GH_LOG_FILE" || echo "(No GitHub logs found)"
} > "$COMBINED_LOG_FILE"

# --- Optional error filter ---
if [ "$FILTER_ERRORS" = true ]; then
  echo "🔎 Filtering for error lines..."
  grep -iE "error|failed|exception|trace|unhandled|panic|stack" "$COMBINED_LOG_FILE" > "$FILTERED_FILE" || true
  if [ ! -s "$FILTERED_FILE" ]; then
    echo "ℹ️ No error lines found. Opening full combined logs instead."
    TARGET_FILE="$COMBINED_LOG_FILE"
  else
    echo "✅ Filtered logs saved to $FILTERED_FILE"
    TARGET_FILE="$FILTERED_FILE"
  fi
else
  TARGET_FILE="$COMBINED_LOG_FILE"
fi

echo "✅ Combined logs saved to $TARGET_FILE"

# --- Open automatically in Cursor ---
if command -v cursor &>/dev/null; then
  echo "🧠 Opening logs in Cursor..."
  cursor "$TARGET_FILE"
else
  echo "⚠️ Cursor CLI not found. Open manually: $TARGET_FILE"
fi
