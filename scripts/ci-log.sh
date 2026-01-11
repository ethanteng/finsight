#!/usr/bin/env bash
set -euo pipefail

RUN_ID="${1:-}"
OUT="${2:-.cursor/ci-log.txt}"

if [[ -z "$RUN_ID" ]]; then
  echo "Usage: $0 <RUN_ID> [output_file]"
  echo "Tip: gh run list -L 20"
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
gh run view "$RUN_ID" --log-failed > "$OUT"
echo "Wrote $OUT"
