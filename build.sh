#!/bin/bash

# Build script with memory optimization for Render deployment

echo "Starting build process..."
echo "Current directory: $(pwd)"
echo "Directory contents:"
ls -la

# Set Node.js memory limits
export NODE_OPTIONS="--max-old-space-size=2048"

# Install dependencies with memory optimization
echo "Installing dependencies..."
npm install --no-optional --production=false

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Run database migrations
echo "Running database migrations..."
npx prisma migrate deploy

# Build TypeScript with memory optimization
echo "Building TypeScript..."
echo "TypeScript version: $(npx tsc --version)"
# Ensure we're in the project root and compile to dist directory
npx tsc --outDir ./dist

echo "Build completed successfully!"
echo "Checking dist directory contents:"
ls -la dist/
echo "Checking if index.js exists in dist:"
ls -la dist/index.js || echo "index.js not found in dist!"
echo "Full path verification:"
echo "Current directory: $(pwd)"
echo "Expected file: $(pwd)/dist/index.js"
if [ -f "$(pwd)/dist/index.js" ]; then
    echo "✅ File exists at expected location"
else
    echo "❌ File not found at expected location"
fi
echo "Build script completed." 