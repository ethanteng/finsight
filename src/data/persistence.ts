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
      // ✅ Ensure plaidAccountId is always set from account_id if not already present
      const plaidAccountId = account.account_id || (account as any).plaidAccountId;
      
      // Skip SnapTrade or non-Plaid accounts to avoid polluting Plaid account table
      if (!plaidAccountId) {
        continue;
      }

      const source = account.source || account.provider;
      if ((typeof plaidAccountId === 'string' && plaidAccountId.startsWith('snaptrade-')) ||
          source === 'snaptrade') {
        continue;
      }

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
          // ✅ CRITICAL: Preserve existing aiCategory and aiCategoryReason if transaction has manual correction
          // Only update these fields if explicitly provided AND not preserving a manual correction
          const updateData: any = {
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
          };
          
          // ✅ CRITICAL: Preserve existing manual corrections
          // When syncing transactions, we always get fresh data from Plaid
          // If a transaction was manually corrected, we want to preserve that correction
          // The aiCategory field will contain the transaction_type (either from manual correction or GPT)
          
          // Check if existing transaction has a manual correction
          const existingIsManualCorrection = existing.aiCategoryReason?.toLowerCase().includes('manually corrected') ||
                                           existing.aiCategoryReason?.toLowerCase().includes('corrected by user');
          
          if (transaction.aiCategory !== undefined) {
            // Transaction data includes aiCategory (from manual correction or categorization)
            // Check if this is a manual correction by checking the reason
            const newIsManualCorrection = transaction.aiCategoryReason?.toLowerCase().includes('manually corrected') ||
                                         transaction.aiCategoryReason?.toLowerCase().includes('corrected by user');
            
            if (existingIsManualCorrection && !newIsManualCorrection) {
              // Existing is manual correction, but new one is not - preserve the manual correction
              updateData.aiCategory = existing.aiCategory;
              updateData.aiCategoryReason = existing.aiCategoryReason;
            } else {
              // New value is provided (either manual correction or new categorization)
              // Update with new value
              updateData.aiCategory = transaction.aiCategory;
              
              // Preserve reason if it's a manual correction, otherwise update it
              if (newIsManualCorrection) {
                // New manual correction - always use it
                updateData.aiCategoryReason = transaction.aiCategoryReason;
              } else if (transaction.aiCategoryReason !== undefined) {
                // New categorization with reason - use it
                updateData.aiCategoryReason = transaction.aiCategoryReason;
              } else if (existingIsManualCorrection) {
                // Existing is manual correction, new has no reason - preserve existing
                updateData.aiCategoryReason = existing.aiCategoryReason;
              }
            }
          } else {
            // No aiCategory in transaction data - preserve existing if it's a manual correction
            if (existingIsManualCorrection && existing.aiCategory) {
              updateData.aiCategory = existing.aiCategory;
              updateData.aiCategoryReason = existing.aiCategoryReason;
            }
          }
          
          // Handle categoryComparedAt separately
          
          if (transaction.categoryComparedAt !== undefined) {
            updateData.categoryComparedAt = transaction.categoryComparedAt ? new Date(transaction.categoryComparedAt) : null;
          }
          
          await prisma.transaction.update({
            where: { plaidTransactionId },
            data: updateData,
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
              // Include transaction_type (stored in aiCategory field) and related fields if present
              aiCategory: transaction.aiCategory || null,
              aiCategoryReason: transaction.aiCategoryReason || null,
              categoryComparedAt: transaction.categoryComparedAt ? new Date(transaction.categoryComparedAt) : null,
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

