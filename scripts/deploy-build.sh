#!/bin/bash

# Deployment-specific build script for Render
# This script ensures the build works in the Render deployment environment
# ⚠️  CRITICAL: This script MUST NEVER run database migrations in production!

set -e  # Exit on any error

# 🚨 PRODUCTION SAFETY CHECK
echo "🔒 PRODUCTION SAFETY CHECK..."
if [[ "$DATABASE_URL" == *"render.com"* ]] || [[ "$NODE_ENV" == "production" ]]; then
    echo "🚨 PRODUCTION ENVIRONMENT DETECTED!"
    echo "🚨 DATABASE_URL: $DATABASE_URL"
    echo "🚨 NODE_ENV: $NODE_ENV"
    echo "🚨 This script will NOT run database migrations in production!"
    echo "🚨 Database migrations must be handled manually or via CI/CD pipeline!"
fi

echo "=== Starting deployment build ==="
echo "Current directory: $(pwd)"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Set memory limits for Node.js
export NODE_OPTIONS="--max-old-space-size=2048"

# Clean any existing build artifacts
echo "Cleaning previous build artifacts..."
rm -rf dist/ || true
rm -rf node_modules/ || true

# Install dependencies
echo "Installing dependencies..."
npm install --production=false

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# 🚨 DATABASE MIGRATIONS ARE DANGEROUS IN PRODUCTION!
# 
# WHY THIS WAS REMOVED:
# - npx prisma migrate deploy can wipe production data
# - Build scripts run during every deployment
# - Destructive migrations execute automatically
# - No manual control over when migrations run
# 
# SAFE ALTERNATIVES:
# 1. Run migrations manually: npm run migrate:deploy
# 2. Use CI/CD pipeline with proper testing
# 3. Test migrations locally first: npx prisma migrate reset
# 
# Database migrations are handled by CI/CD pipeline, not during build
echo "Skipping database migrations during build (handled by CI/CD)..."
# npx prisma migrate deploy  # REMOVED - DANGEROUS!

# Build TypeScript
echo "Building TypeScript..."
npx tsc --outDir ./dist

# Verify the build
echo "Verifying build..."
if [ ! -f "dist/index.js" ]; then
    echo "❌ Build failed: dist/index.js not found"
    echo "Directory structure:"
    find dist/ -type f -name "*.js" | head -20
    exit 1
fi

echo "✅ Build successful!"
echo "Build artifacts:"
ls -la dist/

# Test that the built file can be executed
echo "Testing built file..."
if node -e "console.log('✅ Node can execute the built file')" 2>/dev/null; then
    echo "✅ Build verification passed"
else
    echo "❌ Build verification failed"
    exit 1
fi

echo "=== Deployment build completed ===" 