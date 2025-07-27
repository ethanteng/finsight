import { PrismaClient } from '@prisma/client';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const prisma = new PrismaClient();

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

interface SyncResult {
  success: boolean;
  accountsSynced?: number;
  transactionsSynced?: number;
  error?: string;
  timestamp: Date;
}

export async function syncAllAccounts(): Promise<SyncResult> {
  const startTime = new Date();
  
  try {
    // Get all access tokens from the database
    const accessTokens = await prisma.accessToken.findMany({
      select: { token: true }
    });

    if (accessTokens.length === 0) {
      return {
        success: true,
        accountsSynced: 0,
        transactionsSynced: 0,
        timestamp: startTime
      };
    }

    let totalAccountsSynced = 0;
    let totalTransactionsSynced = 0;

    for (const { token } of accessTokens) {
      try {
        // Sync accounts for this access token
        const accountsResponse = await plaidClient.accountsGet({
          access_token: token,
        });

        const accounts = accountsResponse.data.accounts;
        let accountCount = 0;

        for (const account of accounts) {
          await prisma.account.upsert({
            where: { plaidAccountId: account.account_id },
            update: {
              name: account.name,
              mask: account.mask,
              type: account.type,
              subtype: account.subtype,
              currentBalance: account.balances.current,
              availableBalance: account.balances.available,
              currency: account.balances.iso_currency_code,
              lastSynced: new Date(),
            },
            create: {
              plaidAccountId: account.account_id,
              name: account.name,
              mask: account.mask,
              type: account.type,
              subtype: account.subtype,
              currentBalance: account.balances.current,
              availableBalance: account.balances.available,
              currency: account.balances.iso_currency_code,
              lastSynced: new Date(),
            },
          });
          accountCount++;
        }
        totalAccountsSynced += accountCount;

        // Sync transactions for this access token
        const transactionsResponse = await plaidClient.transactionsGet({
          access_token: token,
          start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 30 days
          end_date: new Date().toISOString().split('T')[0],
        });

        const transactions = transactionsResponse.data.transactions;
        let transactionCount = 0;

        for (const transaction of transactions) {
          // Find the account for this transaction
          const account = await prisma.account.findUnique({
            where: { plaidAccountId: transaction.account_id },
          });

          if (account) {
            await prisma.transaction.upsert({
              where: { plaidTransactionId: transaction.transaction_id },
              update: {
                amount: transaction.amount,
                date: new Date(transaction.date),
                name: transaction.name,
                category: transaction.category?.join(', ') || '',
                pending: transaction.pending,
                accountId: account.id,
                lastSynced: new Date(),
              },
              create: {
                plaidTransactionId: transaction.transaction_id,
                amount: transaction.amount,
                date: new Date(transaction.date),
                name: transaction.name,
                category: transaction.category?.join(', ') || '',
                pending: transaction.pending,
                accountId: account.id,
                lastSynced: new Date(),
              },
            });
            transactionCount++;
          }
        }
        totalTransactionsSynced += transactionCount;

      } catch (error) {
        console.error(`Error syncing for access token: ${error}`);
        // Continue with other access tokens even if one fails
      }
    }

    // Update the global sync timestamp
    await prisma.syncStatus.upsert({
      where: { id: '1' },
      update: {
        lastSync: startTime,
        accountsSynced: totalAccountsSynced,
        transactionsSynced: totalTransactionsSynced,
      },
      create: {
        id: '1',
        lastSync: startTime,
        accountsSynced: totalAccountsSynced,
        transactionsSynced: totalTransactionsSynced,
      },
    });

    return {
      success: true,
      accountsSynced: totalAccountsSynced,
      transactionsSynced: totalTransactionsSynced,
      timestamp: startTime,
    };

  } catch (error) {
    console.error('Error in syncAllAccounts:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: startTime,
    };
  }
}

export async function getLastSyncInfo() {
  try {
    const syncStatus = await prisma.syncStatus.findUnique({
      where: { id: '1' },
    });
    
    return syncStatus;
  } catch (error) {
    console.error('Error getting sync status:', error);
    return null;
  }
} 