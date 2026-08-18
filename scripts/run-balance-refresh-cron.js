#!/usr/bin/env node

const { BalanceService } = require('../dist/services/balance-service');
const { FinancialRevisionService } = require('../dist/services/financial-revision-service');
const {
  acquireScheduledRefreshLease,
  completeScheduledRefreshLease,
  failScheduledRefreshLease,
} = require('../dist/market-news/refresh-lease');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
require('dotenv').config({ path: '.env.local' });

// Initialize Plaid client
const plaidMode = process.env.PLAID_MODE || 'sandbox';
const useSandbox = plaidMode === 'sandbox';

const getPlaidCredentials = () => {
  if (plaidMode === 'production') {
    return {
      clientId: process.env.PLAID_CLIENT_ID_PROD || process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET_PROD || process.env.PLAID_SECRET,
      env: process.env.PLAID_ENV_PROD || 'production'
    };
  } else {
    return {
      clientId: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      env: 'sandbox'
    };
  }
};

const credentials = getPlaidCredentials();
const configuration = new Configuration({
  basePath: useSandbox ? PlaidEnvironments.sandbox : PlaidEnvironments[credentials.env],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': credentials.clientId,
      'PLAID-SECRET': credentials.secret,
    },
  },
});

const plaidClient = new PlaidApi(configuration);
const FINANCIAL_REFRESH_JOB = 'financial-data-refresh';
const FINANCIAL_REFRESH_LEASE_MS = 6 * 60 * 60 * 1000;

async function runBalanceRefreshCron() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🚀 Starting scheduled balance refresh...`);
  const lease = await acquireScheduledRefreshLease({
    name: FINANCIAL_REFRESH_JOB,
    minimumIntervalMs: 0,
    leaseDurationMs: FINANCIAL_REFRESH_LEASE_MS,
    force: true,
  });
  if (!lease.acquired) {
    console.log(`[${timestamp}] ℹ️ Balance refresh skipped: ${lease.reason}`);
    return { skipped: true, reason: lease.reason };
  }

  let prisma;
  try {
    // Get all users with access tokens
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
    
    const users = await prisma.user.findMany({
      where: {
        accessTokens: {
          some: { isActive: true, supersededAt: null }
        },
        isActive: true
      },
      select: {
        id: true,
        email: true,
      }
    });

    console.log(`[${timestamp}] 👥 Found ${users.length} users with access tokens`);

    let totalRefreshed = 0;
    let totalErrors = 0;

    for (const user of users) {
      try {
        console.log(`[${timestamp}] 🔄 Refreshing balances for user ${user.email} (${user.id})`);
        const refresh = await BalanceService.refreshAllUserBalances(user.id, plaidClient);
        if (refresh.failed > 0) {
          throw new Error(
            `${refresh.failed}/${refresh.totalTokens} Plaid connection(s) failed: ${refresh.errors.map(item => item.error).join('; ')}`
          );
        }
        // Account rows are not the user-facing contract. Rebuild the canonical
        // snapshot immediately so the refreshed balances reach the UI and LLM.
        await FinancialRevisionService.recompute(user.id, {
          categorize: false,
          history: { kind: 'daily', reason: 'balance-refresh' },
        });
        totalRefreshed++;
        console.log(`[${timestamp}] ✅ Successfully refreshed balances for user ${user.email}`);
      } catch (error) {
        totalErrors++;
        console.error(`[${timestamp}] ❌ Error refreshing balances for user ${user.email}:`, error.message);
      }
    }

    // Get cache stats
    const cacheStats = await BalanceService.getCacheStats();
    
    console.log(`[${timestamp}] ✅ Balance refresh cron completed`);
    console.log(`[${timestamp}] 📊 Successfully refreshed: ${totalRefreshed} users`);
    console.log(`[${timestamp}] ❌ Errors: ${totalErrors} users`);
    console.log(`[${timestamp}] 💾 Cache stats: ${cacheStats.size} entries`);
    
    if (totalErrors > 0) {
      throw new Error(`Balance refresh failed for ${totalErrors}/${users.length} user(s)`);
    }

    await completeScheduledRefreshLease(FINANCIAL_REFRESH_JOB, lease.ownerId);
    return { skipped: false, totalRefreshed, totalErrors };
  } catch (error) {
    console.error(`[${timestamp}] 💥 Unexpected error in balance refresh cron:`, error);
    await failScheduledRefreshLease(FINANCIAL_REFRESH_JOB, lease.ownerId, error).catch((leaseError) => {
      console.error('Failed to record balance refresh failure:', leaseError);
    });
    throw error;
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}

// If run directly, execute immediately
if (require.main === module) {
  console.log('🕐 Balance Refresh Cron Job');
  console.log('==========================\n');
  
  runBalanceRefreshCron().then(() => {
    console.log('🎉 Balance refresh cron job completed');
    process.exit(0);
  }).catch((error) => {
    console.error('💀 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runBalanceRefreshCron };
