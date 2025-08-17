# Enhanced Webhook Handlers - Automatic Tier Synchronization

## Overview

The webhook handlers have been enhanced to automatically detect and fix subscription tier mismatches in real-time. This eliminates the need for cron jobs and ensures that subscription tiers are always in sync between Stripe and your database.

## How It Works

### 1. **Automatic Detection**
When any subscription-related webhook fires, the system automatically:
- Retrieves the current Stripe subscription to check the actual price
- Compares the price with the metadata tier
- Detects any mismatches between price and tier

### 2. **Real-Time Fixing**
If a mismatch is detected, the system automatically:
- Updates Stripe metadata to match the current price
- Updates the subscription record in your database
- Updates the user's tier in your database
- Logs all changes for audit purposes

### 3. **Comprehensive Coverage**
The auto-sync is triggered by multiple webhook events:
- `customer.subscription.created` - New subscriptions
- `customer.subscription.updated` - Plan changes, upgrades, downgrades
- `invoice.payment_succeeded` - Renewals, payments
- `customer.subscription.paused` - Paused subscriptions
- `customer.subscription.trial_will_end` - Trial endings

## Webhook Event Flow

### Subscription Created
```
1. Webhook received: customer.subscription.created
2. Auto-sync tier based on current Stripe price
3. Create subscription record with correct tier
4. Update user tier and status
```

### Subscription Updated (Plan Change)
```
1. Webhook received: customer.subscription.updated
2. Auto-sync tier based on current Stripe price
3. Update subscription record with correct tier
4. Update user tier if changed
```

### Payment Succeeded
```
1. Webhook received: invoice.payment_succeeded
2. Auto-sync tier to ensure correctness after payment
3. Update subscription status to active
4. Update user subscription status
```

## Price to Tier Mapping

The system automatically maps Stripe price IDs to tiers:

| Price ID | Tier |
|-----------|------|
| `price_1RwVHYB0fNhwjxZIorwBKpVN` | `starter` |
| `price_1RwVJqB0fNhwjxZIV4ORHT6H` | `standard` |
| `price_1RwVKKB0fNhwjxZIT7P4laDk` | `premium` |

## Benefits

### ✅ **Real-Time Sync**
- No more waiting for cron jobs
- Tier mismatches are fixed immediately when webhooks fire
- Users see correct tier information instantly

### ✅ **Automatic Recovery**
- Handles cases where Stripe metadata gets out of sync
- Automatically corrects tier mismatches
- No manual intervention required

### ✅ **Comprehensive Coverage**
- Covers all major subscription lifecycle events
- Handles edge cases like paused subscriptions and trial endings
- Ensures consistency across all subscription states

### ✅ **Audit Trail**
- All sync operations are logged
- Easy to track when and why tiers were updated
- Full transparency into the sync process

## Example Scenarios

### Scenario 1: User Downgrades via Stripe Dashboard
```
1. User changes plan from Premium to Standard in Stripe
2. Stripe updates price but not metadata
3. Webhook fires: customer.subscription.updated
4. Auto-sync detects price change (Standard price)
5. Updates metadata from 'premium' to 'standard'
6. Updates database to reflect correct tier
7. User immediately sees correct tier in your app
```

### Scenario 2: Subscription Renewal
```
1. Monthly subscription renews
2. Webhook fires: invoice.payment_succeeded
3. Auto-sync verifies tier is still correct
4. Updates subscription status to active
5. Ensures tier consistency after renewal
```

### Scenario 3: Trial Ending
```
1. Trial period ends
2. Webhook fires: customer.subscription.trial_will_end
3. Auto-sync verifies tier before trial ends
4. Ensures correct tier is set for paid period
```

## Implementation Details

### Auto-Sync Method
```typescript
private async autoSyncSubscriptionTier(subscriptionId: string, metadataTier: string): Promise<void>
```

### Key Features
- **Smart Detection**: Compares Stripe price with metadata tier
- **Database Fallback**: If metadata is 'unknown', checks database for current tier
- **Safe Updates**: Only updates when there's an actual mismatch
- **Error Handling**: Gracefully handles API failures without breaking webhooks

### Logging
All auto-sync operations are logged with detailed information:
```
Auto-sync: Price price_1RwVHYB0fNhwjxZIorwBKpVN maps to tier: starter, metadata shows: standard
Auto-sync: fixing mismatch from standard to starter
Auto-sync: Successfully synced subscription sub_1Rwu9lB0fNhwjxZItgbuqOHs to tier starter
```

## Testing

### Test the Auto-Sync
```bash
# Test webhook auto-sync functionality
node scripts/test-webhook-auto-sync.js

# Test specific subscription sync
node scripts/enhanced-sync-subscription.js check sub_1Rwu9lB0fNhwjxZItgbuqOHs
```

### Manual Testing
1. Change a subscription plan in Stripe dashboard
2. Watch the webhook logs for auto-sync activity
3. Verify the tier is automatically corrected
4. Check that the user sees the correct tier immediately

## Monitoring

### Webhook Logs
Monitor your webhook logs for auto-sync activity:
```bash
# Watch webhook logs in real-time
tail -f /var/log/your-app.log | grep "Auto-sync"
```

### Key Log Messages
- `Auto-sync: Starting sync for subscription...`
- `Auto-sync: Tier mismatch detected...`
- `Auto-sync: Successfully synced subscription...`
- `Auto-sync: Tier already in sync...`

## Fallback Options

While the webhook auto-sync handles most cases automatically, you still have manual options:

### Manual Sync (if needed)
```bash
# Sync all subscriptions
node scripts/run-sync-cron.js

# Sync specific subscription
node scripts/enhanced-sync-subscription.js sync sub_1Rwu9lB0fNhwjxZItgbuqOHs
```

### Cron Job (optional backup)
```bash
# Run every 6 hours as a backup
0 */6 * * * cd /path/to/finsight && node scripts/run-sync-cron.js
```

## Best Practices

1. **Monitor Webhook Logs**: Watch for auto-sync activity and any errors
2. **Test Plan Changes**: Verify auto-sync works when testing subscription changes
3. **Keep Price IDs Updated**: Ensure the price-to-tier mapping stays current
4. **Backup Strategy**: Use manual sync tools as a backup for edge cases

## Troubleshooting

### Common Issues

1. **"Stripe API key not found"**: Check environment variables
2. **"Subscription not found"**: Verify subscription exists in Stripe
3. **"Auto-sync failed"**: Check Stripe API limits and connectivity

### Debug Mode
Enable detailed logging to see exactly what's happening:
```typescript
// The auto-sync method provides comprehensive logging
console.log(`Auto-sync: Price ${currentPrice} maps to tier: ${correctTier}`);
console.log(`Auto-sync: ${action} from ${currentMetadataTier} to ${correctTier}`);
```

## Future Enhancements

- **Email Notifications**: Alert admins when tier mismatches are detected
- **Slack Integration**: Real-time notifications for sync operations
- **Metrics Dashboard**: Track sync success rates and performance
- **Retry Logic**: Automatic retry for failed sync attempts

## Conclusion

With enhanced webhook handlers, your subscription system now automatically maintains tier consistency in real-time. Users will always see the correct tier information, and you'll have full visibility into the sync process through comprehensive logging.

No more manual cron jobs needed for basic tier synchronization - it all happens automatically when webhooks fire! 🎉
