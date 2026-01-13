#!/usr/bin/env bash
set -euo pipefail

# Database Startup Script
# This script starts the local PostgreSQL database with proper user setup

echo "🐳 Starting Local PostgreSQL Database"
echo "====================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ ERROR: Docker is not running"
    echo "   Please start Docker Desktop and try again"
    exit 1
fi

# Start the database container
echo "📦 Starting PostgreSQL container..."
docker-compose up -d db

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 5

# Check if database is healthy
echo "🔍 Checking database health..."
if docker-compose exec db pg_isready -U postgres -d postgres; then
    echo "✅ Database is ready!"
else
    echo "❌ Database is not ready. Checking logs..."
    docker-compose logs db
    exit 1
fi

# Test connection to the finsight database
echo "🔌 Testing connection to finsight database..."
if docker-compose exec db psql -U postgres -d finsight -c "SELECT 1;" > /dev/null 2>&1; then
    echo "✅ Connection to finsight database successful!"
else
    echo "⚠️  finsight database not found, but postgres database is accessible"
    echo "   This is normal for first-time setup"
fi

echo ""
echo "🎉 Database is ready for development!"
echo ""
echo "📋 Connection Details:"
echo "   Host: localhost"
echo "   Port: 5433"
echo "   Database: finsight"
echo "   User: postgres"
echo "   Password: postgres"
echo "   Connection String: postgresql://postgres:postgres@localhost:5433/finsight"
echo ""
echo "💡 Next steps:"
echo "   - Run database migrations: npx prisma db push"
echo "   - Or reset database: ./scripts/quick-clear.sh"
echo "   - Or sync with production: ./scripts/dev-reset.sh"
echo ""
echo "🔧 Database Management:"
echo "   - View logs: docker-compose logs db"
echo "   - Stop database: docker-compose down"
echo "   - Restart database: docker-compose restart db"
