#!/usr/bin/env node

const { TransactionSyncService } = require('../dist/services/transaction-sync-service');
require('dotenv').config({ path: '.env.local' });

async function refreshTransactions() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🚀 Starting scheduled transaction sync...`);
  
  try {
    const result = await TransactionSyncService.syncAllActiveTokens();
    
    if (result.success) {
      console.log(`[${timestamp}] ✅ Transaction sync completed successfully`);
      console.log(`[${timestamp}] 📊 Total tokens: ${result.totalTokens}`);
      console.log(`[${timestamp}] ✅ Successful: ${result.successful}`);
      console.log(`[${timestamp}] ❌ Failed: ${result.failed}`);
      
      // Log summary statistics
      let totalAdded = 0;
      let totalModified = 0;
      let totalRemoved = 0;
      
      result.results.forEach((r) => {
        totalAdded += r.result.added;
        totalModified += r.result.modified;
        totalRemoved += r.result.removed;
      });
      
      console.log(`[${timestamp}] 📈 Summary: ${totalAdded} added, ${totalModified} modified, ${totalRemoved} removed`);
      
      if (result.failed > 0) {
        console.log(`[${timestamp}] ⚠️  Some tokens failed to sync:`);
        result.results
          .filter((r) => !r.result.success)
          .forEach((r) => {
            console.log(`[${timestamp}]   - Token ${r.tokenId.substring(0, 8)}...: ${r.result.error}`);
          });
      }
    } else {
      console.log(`[${timestamp}] ❌ Transaction sync completed with errors`);
      console.log(`[${timestamp}] 📊 Total tokens: ${result.totalTokens}`);
      console.log(`[${timestamp}] ✅ Successful: ${result.successful}`);
      console.log(`[${timestamp}] ❌ Failed: ${result.failed}`);
    }
  } catch (error) {
    console.error(`[${timestamp}] 💥 Unexpected error in transaction sync:`, error);
    process.exit(1);
  }
  
  console.log(`[${timestamp}] 🏁 Transaction sync finished\n`);
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

