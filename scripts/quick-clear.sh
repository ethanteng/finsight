#!/bin/bash

# ⚡ Quick Clear Localhost Data Script
# Fast version - clears database and cache only

set -e

echo "⚡ Quick localhost data cleanup..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the project root directory"
    exit 1
fi

print_status "Stopping development servers..."
pkill -f "npm run dev" 2>/dev/null || true
sleep 1

print_status "Clearing database..."
npx prisma migrate reset --force > /dev/null 2>&1
print_success "Database reset complete (with migration history preserved)"

print_status "Clearing Next.js cache..."
rm -rf frontend/.next 2>/dev/null || true
print_success "Next.js cache cleared"

print_status "Regenerating Prisma client..."
npx prisma generate > /dev/null 2>&1
print_success "Prisma client regenerated"

print_status "Applying database migrations..."
npx prisma migrate dev --name init_after_reset > /dev/null 2>&1
print_success "Database migrations applied"

echo ""
print_success "Quick cleanup complete! 🚀"
echo ""
echo "Next steps:"
echo "1. Clear browser data (DevTools → Application → Clear Storage)"
echo "2. Run: npm run dev"
echo "3. Test with fresh browser session" 