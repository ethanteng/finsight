#!/bin/bash

echo "=== Deployment Verification Script ==="
echo "Current directory: $(pwd)"
echo "Directory contents:"
ls -la

echo ""
echo "=== Checking for dist directory ==="
if [ -d "dist" ]; then
    echo "✅ dist directory exists"
    echo "dist contents:"
    ls -la dist/
    
    echo ""
    echo "=== Checking for index.js in dist ==="
    if [ -f "dist/index.js" ]; then
        echo "✅ dist/index.js exists"
        echo "File size: $(ls -lh dist/index.js | awk '{print $5}')"
    else
        echo "❌ dist/index.js not found"
    fi
else
    echo "❌ dist directory not found"
fi

echo ""
echo "=== Checking package.json scripts ==="
echo "Start script:"
grep '"start"' package.json

echo ""
echo "=== Testing start command ==="
echo "Attempting to run: node dist/index.js"
if node dist/index.js --help 2>/dev/null; then
    echo "✅ Node can execute the file"
else
    echo "❌ Node cannot execute the file"
fi

echo ""
echo "=== Environment variables ==="
echo "NODE_ENV: $NODE_ENV"
echo "DATABASE_URL: ${DATABASE_URL:0:20}..." # Only show first 20 chars for security 