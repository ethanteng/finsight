const { SubscriptionSyncService } = require('../dist/services/subscription-sync');
require('dotenv').config({ path: '.env.local' });

async function runCronSync() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Starting scheduled subscription sync...`);
  
  try {
    const result = await SubscriptionSyncService.syncAllSubscriptions();
    
    if (result.success) {
      console.log(`[${timestamp}] ✅ Cron sync completed successfully`);
      console.log(`[${timestamp}] Message: ${result.message}`);
      console.log(`[${timestamp}] Synced ${result.syncedCount} subscription(s)`);
    } else {
      console.log(`[${timestamp}] ❌ Cron sync failed`);
      console.log(`[${timestamp}] Error: ${result.message}`);
    }
  } catch (error) {
    console.error(`[${timestamp}] ❌ Unexpected error in cron sync:`, error);
  }
  
  console.log(`[${timestamp}] Cron sync finished\n`);
}

// If run directly, execute immediately
if (require.main === module) {
  runCronSync().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runCronSync };
