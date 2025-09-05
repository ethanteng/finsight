#!/bin/bash

# Setup daily balance refresh cron job
# This script adds a cron job to refresh account balances daily at 6 AM

echo "🕐 Setting up daily balance refresh cron job..."

# Get the current directory (project root)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_SCRIPT="$PROJECT_DIR/scripts/run-balance-refresh-cron.js"

# Make sure the cron script is executable
chmod +x "$CRON_SCRIPT"

# Create the cron job entry (runs daily at 6 AM)
CRON_ENTRY="0 6 * * * cd $PROJECT_DIR && node $CRON_SCRIPT >> logs/balance-refresh.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "run-balance-refresh-cron.js"; then
    echo "⚠️  Balance refresh cron job already exists"
    echo "Current cron jobs:"
    crontab -l | grep "run-balance-refresh-cron.js"
else
    # Add the cron job
    (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
    echo "✅ Balance refresh cron job added successfully"
    echo "📅 Schedule: Daily at 6:00 AM"
    echo "📝 Logs: logs/balance-refresh.log"
fi

# Create logs directory if it doesn't exist
mkdir -p "$PROJECT_DIR/logs"

echo "🎉 Balance refresh cron job setup complete!"
echo ""
echo "To view current cron jobs: crontab -l"
echo "To remove this cron job: crontab -e (then delete the line)"
echo "To test the script manually: node $CRON_SCRIPT"
