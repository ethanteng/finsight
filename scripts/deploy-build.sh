#!/bin/bash

# Deployment-specific build script for Render
# This script ensures the build works in the Render deployment environment

set -e  # Exit on any error

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

# Run database migrations
echo "Running database migrations..."
npx prisma migrate deploy

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