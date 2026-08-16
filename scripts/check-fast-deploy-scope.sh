#!/usr/bin/env bash
#
# Decide whether a push is safe for the fast-deploy pipeline.
#
# fast-deploy.yml skips the backend, integration and security suites. GitHub's
# `paths:` filter fires when *any* changed file matches, so a commit touching a
# marketing page AND application/backend code triggers fast-deploy too — and
# because the deploy publishes the whole commit (Vercel builds the checked-out
# tree, the Render hook redeploys the service from branch HEAD), untested code
# would reach production ahead of the full pipeline. Serializing the deploy jobs
# does not help: it orders them, it does not make fast-deploy wait for CI.
#
# So: this guard requires EVERY changed file to be in the marketing allowlist.
# Mixed commits are handed to ci-cd.yml, which runs the full suite before
# deploying. Prints `marketing_only=true|false` to $GITHUB_OUTPUT.
#
# The allowlist is read from fast-deploy.yml's own `paths:` block, so the
# workflow trigger and this guard cannot drift apart.

set -euo pipefail

WORKFLOW="${WORKFLOW_FILE:-.github/workflows/fast-deploy.yml}"
BEFORE="${1:-}"
AFTER="${2:-HEAD}"

emit() {
  echo "marketing_only=$1"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "marketing_only=$1" >> "$GITHUB_OUTPUT"
  fi
}

# Pull the quoted entries out of the `paths:` block: start after the `paths:`
# line, stop at the next key at the same or lower indentation.
mapfile -t PATTERNS < <(
  awk '
    /^[[:space:]]*paths:[[:space:]]*$/ { collecting = 1; next }
    collecting && /^[[:space:]]*-[[:space:]]*/ {
      line = $0
      sub(/^[[:space:]]*-[[:space:]]*/, "", line)
      gsub(/^['"'"'"]|['"'"'"]$/, "", line)
      print line
      next
    }
    collecting && /^[[:space:]]*[^[:space:]-]/ { collecting = 0 }
  ' "$WORKFLOW"
)

if [ "${#PATTERNS[@]}" -eq 0 ]; then
  echo "::error::Could not read the paths allowlist from $WORKFLOW"
  exit 1
fi

# Fail closed: with no usable diff base we cannot prove the change is
# marketing-only, so hand it to the full pipeline.
if [ -z "$BEFORE" ] || [ "$BEFORE" = "0000000000000000000000000000000000000000" ]; then
  echo "No usable diff base (new branch or first push) — deferring to the full pipeline."
  emit false
  exit 0
fi

if ! git cat-file -e "${BEFORE}^{commit}" 2>/dev/null; then
  echo "Diff base $BEFORE is not present in this checkout — deferring to the full pipeline."
  emit false
  exit 0
fi

CHANGED=$(git diff --name-only "$BEFORE" "$AFTER")

if [ -z "$CHANGED" ]; then
  echo "No files changed — nothing to deploy."
  emit false
  exit 0
fi

outside=()
while IFS= read -r file; do
  [ -z "$file" ] && continue
  matched=false
  for pattern in "${PATTERNS[@]}"; do
    # GitHub's `**` matches across directories; bash's `*` in [[ ]] already
    # matches `/`, so trimming the second star gives the same semantics.
    glob="${pattern%\*\*}"
    [ "$glob" != "$pattern" ] && glob="${glob}*"
    # shellcheck disable=SC2053
    if [[ "$file" == $glob ]]; then
      matched=true
      break
    fi
  done
  $matched || outside+=("$file")
done <<< "$CHANGED"

if [ "${#outside[@]}" -gt 0 ]; then
  echo "Not marketing-only. ${#outside[@]} changed file(s) outside the fast-deploy allowlist:"
  printf '  %s\n' "${outside[@]}"
  echo
  echo "ci-cd.yml will run the full suite and deploy this commit. Skipping fast deploy."
  emit false
  exit 0
fi

echo "All $(echo "$CHANGED" | wc -l | tr -d ' ') changed file(s) are inside the marketing allowlist."
emit true
