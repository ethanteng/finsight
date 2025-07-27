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

    // First, collect all unique accounts and transactions across all tokens
    const allAccounts = new Map(); // account_id -> account data
    const allTransactions = new Map(); // transaction_id -> transaction data
    
    console.log(`Processing ${accessTokens.length} access tokens...`);

    for (const { token } of accessTokens) {
      try {
        // Get accounts for this token
        const accountsResponse = await plaidClient.accountsGet({
          access_token: token,
        });

        // Collect unique accounts (deduplicate by name + type + subtype like in /plaid/all-accounts)
        console.log(`Token ${token.substring(0, 8)}... accounts:`, accountsResponse.data.accounts.map(a => a.name));
        for (const account of accountsResponse.data.accounts) {
          const accountKey = `${account.name}-${account.type}-${account.subtype}`;
          if (!allAccounts.has(accountKey)) {
            allAccounts.set(accountKey, account);
          }
        }

        // Get transactions for this token
        const transactionsResponse = await plaidClient.transactionsGet({
          access_token: token,
          start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 30 days
          end_date: new Date().toISOString().split('T')[0],
        });

        // Collect unique transactions (deduplicate by name + amount + date like accounts)
        for (const transaction of transactionsResponse.data.transactions) {
          const transactionKey = `${transaction.name}-${transaction.amount}-${transaction.date}`;
          if (!allTransactions.has(transactionKey)) {
            allTransactions.set(transactionKey, transaction);
          }
        }

      } catch (error) {
        console.error(`Error collecting data for token: ${error}`);
        // Continue with other tokens even if one fails
      }
    }

    // Now sync the unique accounts
    console.log(`Found ${allAccounts.size} unique accounts across all tokens`);
    let totalAccountsSynced = 0;
    for (const [accountKey, account] of allAccounts) {
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
      totalAccountsSynced++;
    }
    
    console.log(`Synced ${totalAccountsSynced} unique accounts`);

    // Now sync the unique transactions
    console.log(`Found ${allTransactions.size} unique transactions across all tokens`);
    let totalTransactionsSynced = 0;
    for (const [transactionKey, transaction] of allTransactions) {
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
        totalTransactionsSynced++;
      }
    }
    
    console.log(`Synced ${totalTransactionsSynced} unique transactions`);

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