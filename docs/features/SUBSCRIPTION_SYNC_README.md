# Subscription Sync Tools

This directory contains tools to automatically detect and fix subscription tier mismatches between Stripe and your database.

## The Problem

When users upgrade/downgrade their subscriptions through the Stripe customer dashboard, Stripe changes the subscription price but doesn't automatically update the custom metadata. This causes a mismatch where:

- **Stripe price**: Updated to reflect the new plan (e.g., Standard → Starter)
- **Stripe metadata**: Still shows the old tier (e.g., `tier: 'standard'`)
- **Database**: Gets confused because webhooks rely on metadata

## The Solution

We've created an automated sync system that:

1. **Detects mismatches** by comparing Stripe prices with metadata
2. **Fixes Stripe metadata** to match the current price
3. **Updates your database** to reflect the correct tier
4. **Logs all changes** for audit purposes

## Available Tools

### 1. Enhanced Sync Script (`enhanced-sync-subscription.js`)

A comprehensive tool with multiple commands:

```bash
# Sync a specific subscription
node scripts/enhanced-sync-subscription.js sync sub_1Rwu9lB0fNhwjxZItgbuqOHs

# Sync all subscriptions for a specific user
node scripts/enhanced-sync-subscription.js sync-user cmeexi8c90002rz314w7gqffh

# Sync all active subscriptions in the system
node scripts/enhanced-sync-subscription.js sync-all

# Check subscription status without syncing
node scripts/enhanced-sync-subscription.js check sub_1Rwu9lB0fNhwjxZItgbuqOHs
```

### 2. Cron Job Script (`run-sync-cron.js`)

A script designed to run periodically to keep all subscriptions in sync:

```bash
# Run immediately
node scripts/run-sync-cron.js

# Set up as a cron job (runs every hour)
0 * * * * cd /path/to/finsight && node scripts/run-sync-cron.js >> /var/log/subscription-sync.log 2>&1

# Set up as a cron job (runs every 6 hours)
0 */6 * * * cd /path/to/finsify && node scripts/run-sync-cron.js >> /var/log/subscription-sync.log 2>&1
```

### 3. Original Sync Script (`sync-subscription.js`)

The original manual sync script for backward compatibility.

## How It Works

1. **Price Mapping**: Maps Stripe price IDs to tiers:
   - `price_1RwVHYB0fNhwjxZIorwBKpVN` → `starter`
   - `price_1RwVJqB0fNhwjxZIV4ORHT6H` → `standard`
   - `price_1RwVKKB0fNhwjxZIT7P4laDk` → `premium`

2. **Mismatch Detection**: Compares the current Stripe price with the metadata tier

3. **Automatic Fix**: If a mismatch is found:
   - Updates Stripe metadata to match the current price
   - Updates the subscription record in your database
   - Updates the user's tier in your database

4. **Logging**: Provides detailed logs of all operations

## Integration Options

### Option 1: Manual Execution
Run the sync tools manually when you notice issues:

```bash
# Quick check of a specific subscription
node scripts/enhanced-sync-subscription.js check sub_1Rwu9lB0fNhwjxZItgbuqOHs

# Fix all subscriptions
node scripts/run-sync-cron.js
```

### Option 2: Scheduled Cron Job
Set up automatic syncing to prevent issues:

```bash
# Add to crontab
crontab -e

# Add this line to run every hour
0 * * * * cd /Users/ethanteng/Projects/finsight && node scripts/run-sync-cron.js >> /var/log/subscription-sync.log 2>&1
```

### Option 3: Webhook Integration
The sync logic is also integrated into webhook handlers to automatically fix issues when they're detected.

## Monitoring

Check the logs to see what's happening:

```bash
# View cron job logs
tail -f /var/log/subscription-sync.log

# Check specific subscription
node scripts/enhanced-sync-subscription.js check sub_1Rwu9lB0fNhwjxZItgbuqOHs
```

## Troubleshooting

### Common Issues

1. **"Stripe API key not found"**: Ensure `STRIPE_SECRET_KEY` is set in your environment
2. **"Subscription not found"**: Check that the subscription ID exists in Stripe
3. **"User not found"**: Verify the user exists in your database

### Debug Mode

All scripts provide detailed logging. Look for:
- `Auto-sync: Starting sync for subscription...`
- `Auto-sync: Price X maps to tier: Y, metadata shows: Z`
- `Auto-sync: Tier mismatch detected. Updating from X to Y`
- `Auto-sync: Successfully synced subscription...`

## Best Practices

1. **Run regularly**: Set up a cron job to run every 1-6 hours
2. **Monitor logs**: Check logs regularly for any sync issues
3. **Test manually**: Use the check command to verify specific subscriptions
4. **Backup first**: Always backup your database before running bulk syncs

## Future Enhancements

- **Email notifications** when mismatches are detected
- **Slack/Discord integration** for real-time alerts
- **Web dashboard** to view sync status and history
- **Automatic retry** for failed sync attempts
