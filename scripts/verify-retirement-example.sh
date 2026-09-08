#!/usr/bin/env bash
#
# Fail if the committed connected-accounts example is not what the engine
# currently produces.
#
# The /retirement-calculator panel tells visitors its figures are engine
# output, regenerated and never written by hand. Nothing enforced that: a hand
# edit, or a change to the engine or the return dataset, would leave the page
# making a claim that is quietly no longer true.
#
# Generates to a temporary file rather than in place. Regenerating over the
# file under test would repair a hand edit instead of reporting it, which is
# the one failure this check exists to catch.
#
# The generator is deterministic — a pinned as-of date, a checked-in dataset,
# no clock in the output — so a difference here always means the committed file
# is stale, never that time passed. Fix it with
# `npm run build:retirement-example` and commit the result.

set -euo pipefail

GENERATED="frontend/src/lib/retirement-calculator-example.generated.ts"
EXPECTED="$(mktemp -t retirement-example.XXXXXX.ts)"
trap 'rm -f "$EXPECTED"' EXIT

RETIREMENT_EXAMPLE_OUT="$EXPECTED" npm run --silent build:retirement-example > /dev/null

if ! diff -u "$GENERATED" "$EXPECTED" > /dev/null 2>&1; then
  echo "✖ $GENERATED is stale."
  echo
  echo "  It is not what the engine produces now. The landing page presents"
  echo "  that file as the engine's own output, so it has to be regenerated"
  echo "  rather than reconciled by hand:"
  echo
  echo "    npm run build:retirement-example"
  echo
  diff -u "$GENERATED" "$EXPECTED" || true
  exit 1
fi

echo "✓ $GENERATED matches a fresh engine run."
