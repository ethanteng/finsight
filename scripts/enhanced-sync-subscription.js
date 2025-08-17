const { SubscriptionSyncService } = require('../dist/services/subscription-sync');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  console.log('Enhanced Subscription Sync Tool');
  console.log('==============================\n');

  try {
    switch (command) {
      case 'sync':
        if (!arg) {
          console.error('Usage: node enhanced-sync-subscription.js sync <subscription_id>');
          console.error('Example: node enhanced-sync-subscription.js sync sub_1Rwu9lB0fNhwjxZItgbuqOHs');
          process.exit(1);
        }
        
        console.log(`Syncing subscription: ${arg}`);
        const result = await SubscriptionSyncService.syncSubscription(arg);
        
        if (result.success) {
          console.log('✅ Sync completed successfully');
          console.log(`Message: ${result.message}`);
          if (result.oldTier !== result.newTier) {
            console.log(`Tier changed: ${result.oldTier} → ${result.newTier}`);
          }
        } else {
          console.log('❌ Sync failed');
          console.log(`Error: ${result.message}`);
        }
        break;

      case 'sync-user':
        if (!arg) {
          console.error('Usage: node enhanced-sync-subscription.js sync-user <user_id>');
          console.error('Example: node enhanced-sync-subscription.js sync-user cmeexi8c90002rz314w7gqffh');
          process.exit(1);
        }
        
        console.log(`Syncing all subscriptions for user: ${arg}`);
        const userResult = await SubscriptionSyncService.syncUserSubscriptions(arg);
        
        if (userResult.success) {
          console.log('✅ User sync completed successfully');
          console.log(`Message: ${userResult.message}`);
          console.log(`Synced ${userResult.syncedCount} subscription(s)`);
        } else {
          console.log('❌ User sync failed');
          console.log(`Error: ${userResult.message}`);
        }
        break;

      case 'sync-all':
        console.log('Syncing all active subscriptions in the system...');
        const allResult = await SubscriptionSyncService.syncAllSubscriptions();
        
        if (allResult.success) {
          console.log('✅ All subscriptions sync completed successfully');
          console.log(`Message: ${allResult.message}`);
          console.log(`Synced ${allResult.syncedCount} subscription(s)`);
        } else {
          console.log('❌ All subscriptions sync failed');
          console.log(`Error: ${allResult.message}`);
        }
        break;

      case 'check':
        if (!arg) {
          console.error('Usage: node enhanced-sync-subscription.js check <subscription_id>');
          console.error('Example: node enhanced-sync-subscription.js check sub_1Rwu9lB0fNhwjxZItgbuqOHs');
          process.exit(1);
        }
        
        console.log(`Checking subscription: ${arg}`);
        const checkResult = await SubscriptionSyncService.syncSubscription(arg);
        
        if (checkResult.success) {
          console.log('✅ Subscription check completed');
          console.log(`Current tier: ${checkResult.newTier}`);
          console.log(`Message: ${checkResult.message}`);
        } else {
          console.log('❌ Subscription check failed');
          console.log(`Error: ${checkResult.message}`);
        }
        break;

      default:
        console.log('Available commands:');
        console.log('  sync <subscription_id>     - Sync a specific subscription');
        console.log('  sync-user <user_id>        - Sync all subscriptions for a user');
        console.log('  sync-all                   - Sync all active subscriptions');
        console.log('  check <subscription_id>    - Check subscription status without syncing');
        console.log('');
        console.log('Examples:');
        console.log('  node enhanced-sync-subscription.js sync sub_1Rwu9lB0fNhwjxZItgbuqOHs');
        console.log('  node enhanced-sync-subscription.js sync-user cmeexi8c90002rz314w7gqffh');
        console.log('  node enhanced-sync-subscription.js sync-all');
        console.log('  node enhanced-sync-subscription.js check sub_1Rwu9lB0fNhwjxZItgbuqOHs');
        break;
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

main();
