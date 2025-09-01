#!/bin/bash

# Fix SnapTrade Table Script
# This script creates the missing snaptrade_users table

echo "🔧 Fixing SnapTrade Table"
echo "========================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ ERROR: Not in project root directory"
    exit 1
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable not set"
    exit 1
fi

echo "✅ DATABASE_URL is configured"

# Run the SQL script
echo "🚀 Creating snaptrade_users table..."
npx prisma db execute --file scripts/create-snaptrade-table.sql

if [ $? -eq 0 ]; then
    echo "✅ Table created successfully"
else
    echo "❌ Failed to create table"
    exit 1
fi

# Verify the table exists
echo "🔍 Verifying table exists..."
npx prisma db execute --stdin <<EOF
SELECT table_name FROM information_schema.tables WHERE table_name = 'snaptrade_users';
EOF

echo "🎉 SnapTrade table fix completed!"
echo ""
echo "The snaptrade_users table should now exist."
echo "Try testing SnapTrade initialization again."
