#!/bin/bash

# 🧹 Clear Localhost Data Script
# This script clears all persisted data for fresh testing

set -e  # Exit on any error

echo "🧹 Starting localhost data cleanup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

print_status "Stopping development servers..."
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "ts-node" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
sleep 2

print_status "Clearing database..."
if command -v npx &> /dev/null; then
    npx prisma db push --force-reset > /dev/null 2>&1
    print_success "Database reset complete"
else
    print_error "npx not found. Please install Node.js and npm"
    exit 1
fi

print_status "Clearing Next.js cache..."
rm -rf frontend/.next 2>/dev/null || true
print_success "Next.js cache cleared"

print_status "Clearing Node modules cache..."
rm -rf node_modules frontend/node_modules 2>/dev/null || true
print_success "Node modules cache cleared"

print_status "Reinstalling dependencies..."
npm install > /dev/null 2>&1
print_success "Dependencies reinstalled"

print_status "Regenerating Prisma client..."
npx prisma generate > /dev/null 2>&1
print_success "Prisma client regenerated"

# Create a script to check database state
cat > check-db-clean.js << 'EOF'
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDatabaseClean() {
  try {
    const users = await prisma.user.findMany();
    const accounts = await prisma.account.findMany();
    const transactions = await prisma.transaction.findMany();
    const accessTokens = await prisma.accessToken.findMany();
    const conversations = await prisma.conversation.findMany();
    const demoSessions = await prisma.demoSession.findMany();
    const demoConversations = await prisma.demoConversation.findMany();
    
    const totalRecords = users.length + accounts.length + transactions.length + 
                        accessTokens.length + conversations.length + 
                        demoSessions.length + demoConversations.length;
    
    if (totalRecords === 0) {
      console.log('✅ Database is clean - all user data cleared');
      process.exit(0);
    } else {
      console.log('⚠️  Database still has data - reset may have failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error checking database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabaseClean();
EOF

print_status "Verifying database is clean..."
if node check-db-clean.js; then
    print_success "Database verification passed"
else
    print_warning "Database verification failed - some data may remain"
fi

# Clean up the verification script
rm -f check-db-clean.js

echo ""
echo "🎉 Localhost cleanup complete!"
echo ""
echo "📋 Manual steps you may need to do:"
echo "   1. Clear browser data for localhost:3001:"
echo "      - Open Chrome DevTools (F12)"
echo "      - Go to Application tab"
echo "      - Clear Local Storage, Session Storage, Cookies"
echo ""
echo "   2. Start the development servers:"
echo "      npm run dev"
echo ""
echo "   3. Test with a fresh browser session"
echo ""
print_success "Ready for fresh testing! 🚀" 