#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

// Resolve dist path - works from both root/scripts/ and src/scripts/ locations
let distPath = path.join(__dirname, '../dist');
if (!fs.existsSync(distPath)) {
  // Try from src/scripts/ location (Render)
  distPath = path.join(__dirname, '../../dist');
}

if (!fs.existsSync(distPath)) {
  console.error(`❌ Error: Could not find dist folder. Tried:`);
  console.error(`   - ${path.join(__dirname, '../dist')}`);
  console.error(`   - ${path.join(__dirname, '../../dist')}`);
  console.error(`   Current directory: ${__dirname}`);
  console.error(`   Please ensure the project has been built (npm run build)`);
  process.exit(1);
}

const { TransactionSyncService } = require(path.join(distPath, 'services/transaction-sync-service'));
const { SummaryCacheService } = require(path.join(distPath, 'services/summary-cache-service'));
require('dotenv').config({ path: '.env.local' });

async function refreshTransactions() {
  const startTime = Date.now();
  const startTimestamp = new Date().toISOString();
  console.log(`[${startTimestamp}] 🚀 Starting scheduled transaction sync...`);
  
  try {
    const result = await TransactionSyncService.syncAllActiveTokens();
    
    if (result.success) {
      const syncTimestamp = new Date().toISOString();
      console.log(`[${syncTimestamp}] ✅ Transaction sync completed successfully`);
      console.log(`[${syncTimestamp}] 📊 Total tokens: ${result.totalTokens}`);
      console.log(`[${syncTimestamp}] ✅ Successful: ${result.successful}`);
      console.log(`[${syncTimestamp}] ❌ Failed: ${result.failed}`);
      
      // Log summary statistics
      let totalAdded = 0;
      let totalModified = 0;
      let totalRemoved = 0;
      
      result.results.forEach((r) => {
        totalAdded += r.result.added;
        totalModified += r.result.modified;
        totalRemoved += r.result.removed;
      });
      
      console.log(`[${syncTimestamp}] 📈 Summary: ${totalAdded} added, ${totalModified} modified, ${totalRemoved} removed`);
      
      if (result.failed > 0) {
        console.log(`[${syncTimestamp}] ⚠️  Some tokens failed to sync:`);
        result.results
          .filter((r) => !r.result.success)
          .forEach((r) => {
            console.log(`[${syncTimestamp}]   - Token ${r.tokenId.substring(0, 8)}...: ${r.result.error}`);
          });
      }
    } else {
      const syncTimestamp = new Date().toISOString();
      console.log(`[${syncTimestamp}] ❌ Transaction sync completed with errors`);
      console.log(`[${syncTimestamp}] 📊 Total tokens: ${result.totalTokens}`);
      console.log(`[${syncTimestamp}] ✅ Successful: ${result.successful}`);
      console.log(`[${syncTimestamp}] ❌ Failed: ${result.failed}`);
    }
  } catch (error) {
    const errorTimestamp = new Date().toISOString();
    console.error(`[${errorTimestamp}] 💥 Unexpected error in transaction sync:`, error);
    process.exit(1);
  }
  
  // After transactions sync, refresh cached summaries for all users
  try {
    const summaryTimestamp = new Date().toISOString();
    console.log(`[${summaryTimestamp}] 🧮 Refreshing cached financial summaries for all users...`);
    const result = await SummaryCacheService.refreshAllUsers();
    const summaryEndTimestamp = new Date().toISOString();
    console.log(`[${summaryEndTimestamp}] ✅ Summary cache refresh completed. Users processed: ${result.usersProcessed}`);
  } catch (error) {
    const errorTimestamp = new Date().toISOString();
    console.error(`[${errorTimestamp}] ⚠️ Summary cache refresh failed:`, error);
    // Do not fail the entire cron; proceed
  }
  
  const endTime = Date.now();
  const endTimestamp = new Date().toISOString();
  const durationMs = endTime - startTime;
  const durationSeconds = Math.round(durationMs / 1000);
  const durationMinutes = Math.floor(durationSeconds / 60);
  const remainingSeconds = durationSeconds % 60;
  
  console.log(`[${endTimestamp}] 🏁 Transaction sync + summary refresh finished`);
  if (durationMinutes > 0) {
    console.log(`[${endTimestamp}] ⏱️  Total duration: ${durationMinutes}m ${remainingSeconds}s (${durationMs}ms)`);
  } else {
    console.log(`[${endTimestamp}] ⏱️  Total duration: ${durationSeconds}s (${durationMs}ms)`);
  }
  console.log(); // Empty line for readability
}

// If run directly, execute immediately
if (require.main === module) {
  console.log('🕐 Transaction Sync Cron Job');
  console.log('=============================\n');
  
  refreshTransactions().then(() => {
    console.log('🎉 Cron job completed');
    process.exit(0);
  }).catch((error) => {
    console.error('💀 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { refreshTransactions };

