#!/usr/bin/env bash
set -euo pipefail

# Fail the build if any build/pre-deploy script tries to run migrations
grep -RniE "prisma\s+migrate\s+deploy" \
  build.sh deploy-build.sh package.json scripts/ 2>/dev/null && {
  echo "❌ prisma migrate deploy found in a build/predeploy path."
  echo "This is dangerous and can cause production data loss."
  echo "Remove migration commands from build scripts and handle them via CI/CD instead."
  exit 1
} || echo "✅ No migrate calls in build/predeploy scripts."
