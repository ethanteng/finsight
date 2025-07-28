#!/bin/bash

# Build script with memory optimization for Render deployment

echo "Starting build process..."

# Set Node.js memory limits
export NODE_OPTIONS="--max-old-space-size=2048"

# Install dependencies with memory optimization
echo "Installing dependencies..."
npm install --no-optional --production=false

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Build TypeScript with memory optimization
echo "Building TypeScript..."
npx tsc --noEmit
npx tsc --outDir dist

echo "Build completed successfully!" 