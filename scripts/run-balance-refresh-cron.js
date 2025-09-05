#!/usr/bin/env node

const { BalanceService } = require('../dist/services/balance-service');
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

async function runBalanceRefreshCron() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🚀 Starting scheduled balance refresh...`);
  
  try {
    // Get all users with access tokens
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const users = await prisma.user.findMany({
      where: {
        accessTokens: {
          some: {}
        },
        isActive: true
      },
      select: {
        id: true,
        email: true,
        accessTokens: {
          select: {
            id: true,
            token: true
          }
        }
      }
    });

    console.log(`[${timestamp}] 👥 Found ${users.length} users with access tokens`);

    let totalRefreshed = 0;
    let totalErrors = 0;

    for (const user of users) {
      try {
        console.log(`[${timestamp}] 🔄 Refreshing balances for user ${user.email} (${user.id})`);
        await BalanceService.refreshAllUserBalances(user.id, plaidClient);
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
    
    await prisma.$disconnect();
  } catch (error) {
    console.error(`[${timestamp}] 💥 Unexpected error in balance refresh cron:`, error);
  }
  
  console.log(`[${timestamp}] 🏁 Balance refresh cron finished\n`);
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
