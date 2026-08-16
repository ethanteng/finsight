#!/bin/bash

# 🔒 Test CI/CD Security Testing Locally
# This script simulates the CI/CD security testing environment

set -e

echo "🔒 Testing CI/CD Security Testing Locally"
echo "=========================================="

# Set CI environment variables
export CI=true
export GITHUB_ACTIONS=true
export NODE_ENV=test

echo "✅ CI Environment Variables Set:"
echo "   CI: $CI"
echo "   GITHUB_ACTIONS: $GITHUB_ACTIONS"
echo "   NODE_ENV: $NODE_ENV"

LOG_DIR="$(mktemp -d)"
trap 'rm -rf "$LOG_DIR"' EXIT

# Counts are read back out of jest's own summary rather than written here by hand.
# The previous hard-coded "15/15 / 8/8 / 23/23" had drifted from the real suite
# sizes and would have kept reporting success at the wrong numbers as suites grew.
summarize() {
    local line
    # Note the pipeline is not the function's exit status: with `set -e` a grep
    # miss must not abort the script, so the empty case is handled explicitly.
    line=$(grep -E '^Tests:' "$1" | tail -1 | sed 's/^Tests:[[:space:]]*//')
    echo "${line:-no summary emitted}"
}

# Run one security suite, capturing output so a failure can be replayed verbatim.
run_suite() {
    local label="$1" script="$2" log="$LOG_DIR/${2//:/-}.log"

    echo ""
    echo "🔍 Testing $label..."
    if ! npm run "$script" > "$log" 2>&1; then
        echo "❌ $label Failed"
        echo "Output follows:"
        cat "$log"
        exit 1
    fi
    echo "✅ $label Passed — $(summarize "$log")"
}

run_suite "Real Security Tests" "test:real-security"
run_suite "Core Security Tests" "test:security"

echo ""
echo "🎉 All CI/CD Security Tests Passed Locally!"
echo "🚀 Ready for GitHub Actions deployment"
echo ""
echo "📋 Test Summary:"
echo "   ✅ Real Security Tests: $(summarize "$LOG_DIR/test-real-security.log")"
echo "   ✅ Core Security Tests: $(summarize "$LOG_DIR/test-security.log")"
echo "   🛡️ Security Status: All critical aspects validated"
