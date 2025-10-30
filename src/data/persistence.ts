import { getPrismaClient } from '../prisma-client';

const prisma = getPrismaClient();

/**
 * Persist Plaid transactions to database
 * Handles deduplication using plaidTransactionId
 */
export async function persistTransactionsToDb(
  userId: string,
  transactions: any[],
  accounts: any[]
): Promise<void> {
  try {
    console.log(`Persistence: Starting to persist ${transactions.length} transactions for user ${userId}`);
    
    // Create a map of Plaid account IDs to database account IDs
    const accountMap = new Map<string, string>();
    
    // First ensure all accounts exist in the database
    for (const account of accounts) {
      // ✅ CRITICAL: Always use account_id (Plaid ID), NEVER use id (database ID)
      // Using account.id causes chaining where each sync creates a duplicate with the previous DB ID
      const plaidAccountId = account.account_id || account.plaidAccountId;
      
      // Upsert account
      const dbAccount = await prisma.account.upsert({
        where: { plaidAccountId },
        create: {
          plaidAccountId,
          name: account.name,
          type: account.type,
          subtype: account.subtype || null,
          mask: account.mask || null,
          officialName: account.official_name || account.officialName || null,
          currentBalance: account.balance?.current || account.currentBalance || 0,
          availableBalance: account.balance?.available || account.availableBalance || null,
          currency: account.balance?.iso_currency_code || account.currency || 'USD',
          institution: account.institution || null,
          limit: account.balance?.limit || account.limit || null,
          userId,
          lastSynced: new Date(),
        },
        update: {
          name: account.name,
          type: account.type,
          subtype: account.subtype || null,
          currentBalance: account.balance?.current || account.currentBalance || 0,
          availableBalance: account.balance?.available || account.availableBalance || null,
          limit: account.balance?.limit || account.limit || null,
          lastSynced: new Date(),
        },
      });
      
      accountMap.set(plaidAccountId, dbAccount.id);
    }
    
    console.log(`Persistence: Created/updated ${accountMap.size} accounts`);
    
    // Now persist transactions
    let persistedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const transaction of transactions) {
      try {
        const plaidTransactionId = transaction.id || transaction.transaction_id;
        const plaidAccountId = transaction.account_id;
        
        // Get the database account ID
        const dbAccountId = accountMap.get(plaidAccountId);
        
        if (!dbAccountId) {
          console.warn(`Persistence: Could not find account ID for transaction ${plaidTransactionId}, skipping`);
          skippedCount++;
          continue;
        }
        
        // Prepare category as string (join array if needed)
        let categoryStr = null;
        if (transaction.category) {
          if (Array.isArray(transaction.category)) {
            categoryStr = transaction.category.filter((c: any) => c && c.trim()).join(', ');
          } else if (typeof transaction.category === 'string') {
            categoryStr = transaction.category;
          }
        }
        
        // Check if transaction already exists
        const existing = await prisma.transaction.findUnique({
          where: { plaidTransactionId },
        });
        
        if (existing) {
          // Update existing transaction
          await prisma.transaction.update({
            where: { plaidTransactionId },
            data: {
              amount: transaction.amount,
              date: new Date(transaction.date),
              name: transaction.name,
              category: categoryStr,
              pending: transaction.pending || false,
              currency: transaction.iso_currency_code || transaction.currency || 'USD',
              merchantName: transaction.merchant_name || transaction.merchantName || null,
              paymentChannel: transaction.payment_channel || transaction.paymentChannel || null,
              enriched_data: transaction.enriched_data || null,
              lastSynced: new Date(),
            },
          });
          updatedCount++;
        } else {
          // Create new transaction
          await prisma.transaction.create({
            data: {
              plaidTransactionId,
              accountId: dbAccountId,
              amount: transaction.amount,
              date: new Date(transaction.date),
              name: transaction.name,
              category: categoryStr,
              pending: transaction.pending || false,
              currency: transaction.iso_currency_code || transaction.currency || 'USD',
              merchantName: transaction.merchant_name || transaction.merchantName || null,
              paymentChannel: transaction.payment_channel || transaction.paymentChannel || null,
              authorizedDate: transaction.authorized_date ? new Date(transaction.authorized_date) : null,
              categoryId: transaction.category_id || null,
              location: transaction.location ? JSON.stringify(transaction.location) : null,
              originalDescription: transaction.original_description || null,
              enriched_data: transaction.enriched_data || null,
              lastSynced: new Date(),
            },
          });
          persistedCount++;
        }
      } catch (error) {
        console.error(`Persistence: Error persisting transaction ${transaction.id}:`, error);
        skippedCount++;
      }
    }
    
    console.log(`Persistence: Completed - ${persistedCount} created, ${updatedCount} updated, ${skippedCount} skipped`);
  } catch (error) {
    console.error('Persistence: Error persisting transactions:', error);
    throw error;
  }
}

/**
 * Persist SnapTrade activities to database
 * Handles deduplication using activityId
 */
export async function persistSnapTradeActivitiesToDb(
  userId: string,
  activities: any[]
): Promise<void> {
  try {
    console.log(`Persistence: Starting to persist ${activities.length} SnapTrade activities for user ${userId}`);
    
    // Get the SnapTrade user record
    const snapTradeUser = await prisma.snapTradeUser.findUnique({
      where: { userId },
    });
    
    if (!snapTradeUser) {
      console.warn(`Persistence: No SnapTrade user found for userId ${userId}`);
      return;
    }
    
    let persistedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const activity of activities) {
      try {
        // Generate a unique activity ID (SnapTrade activities might not have a stable ID)
        const activityId = activity.id || 
                          `${activity.symbol?.symbol?.symbol || 'unknown'}_${activity.trade_date || activity.settlement_date}_${activity.type}_${activity.units}`;
        
        // Check if activity already exists
        const existing = await prisma.snapTradeActivity.findUnique({
          where: { activityId },
        });
        
        const activityData = {
          snapTradeUserId: snapTradeUser.id,
          accountId: activity.account?.id || null,
          amount: activity.amount || null,
          currency: activity.currency || null,
          description: activity.description || null,
          fee: activity.fee || null,
          fxRate: activity.fx_rate || null,
          institution: activity.institution || activity.account?.institution || null,
          price: activity.price || null,
          settlementDate: activity.settlement_date ? new Date(activity.settlement_date) : null,
          symbol: activity.symbol?.symbol?.symbol || null,
          tradeDate: activity.trade_date ? new Date(activity.trade_date) : null,
          type: activity.type || null,
          units: activity.units || null,
          rawData: activity,
        };
        
        if (existing) {
          // Update existing activity
          await prisma.snapTradeActivity.update({
            where: { activityId },
            data: activityData,
          });
          updatedCount++;
        } else {
          // Create new activity
          await prisma.snapTradeActivity.create({
            data: {
              activityId,
              ...activityData,
            },
          });
          persistedCount++;
        }
      } catch (error) {
        console.error(`Persistence: Error persisting activity:`, error);
        skippedCount++;
      }
    }
    
    console.log(`Persistence: Completed - ${persistedCount} created, ${updatedCount} updated, ${skippedCount} skipped`);
  } catch (error) {
    console.error('Persistence: Error persisting SnapTrade activities:', error);
    throw error;
  }
}

