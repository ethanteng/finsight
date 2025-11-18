import { PrismaClient } from '@prisma/client';
import { plaidClient } from '../plaid';
import { processTransactionData } from '../plaid';
import { TransactionCategorizationService } from './transaction-categorization-service';

const prisma = new PrismaClient();
const categorizationService = new TransactionCategorizationService();

export interface TransactionSyncResult {
  success: boolean;
  added: number;
  modified: number;
  removed: number;
  cursor: string | null;
  error?: string;
}

export class TransactionSyncService {
  /**
   * Sync transactions for a single access token using Plaid's transactionsSync API
   * Handles cursor management, pagination, and processes added/modified/removed transactions
   */
  static async syncTransactionsForToken(
    accessToken: string,
    cursor?: string | null
  ): Promise<TransactionSyncResult> {
    try {
      // Retrieve stored cursor from database if not provided
      if (!cursor) {
        const tokenRecord = await prisma.accessToken.findUnique({
          where: { token: accessToken },
          select: { transactionSyncCursor: true },
        });
        cursor = tokenRecord?.transactionSyncCursor || undefined;
      }

      const added: any[] = [];
      const modified: any[] = [];
      const removed: any[] = [];
      let currentCursor: string | null = cursor || null;
      let hasMore = true;
      let syncError: string | undefined;

      // Paginate through all changes
      while (hasMore) {
        try {
          const syncResp = await plaidClient.transactionsSync({
            access_token: accessToken,
            cursor: currentCursor || undefined,
          });

          added.push(...syncResp.data.added);
          modified.push(...syncResp.data.modified);
          removed.push(...syncResp.data.removed);
          currentCursor = syncResp.data.next_cursor;
          hasMore = syncResp.data.has_more;
        } catch (error: any) {
          // Handle specific Plaid errors
          const errorCode = error?.response?.data?.error_code;
          const errorMessage = error?.response?.data?.error_message || error.message;

          // If cursor is invalid/expired, reset cursor and retry without cursor
          // This will fetch all transactions from the beginning
          if (errorCode === 'INVALID_CURSOR' || errorCode === 'CURSOR_EXPIRED') {
            console.warn(`Cursor invalid/expired for token, resetting cursor and starting fresh: ${errorMessage}`);
            currentCursor = null;
            syncError = `Cursor was reset: ${errorMessage}`;
            // Continue loop - will retry without cursor on next iteration
            continue;
          }

          // For other errors, throw to be caught by outer try-catch
          throw error;
        }
      }

      // Process added transactions
      let addedCount = 0;
      for (const transaction of added) {
        try {
          await this.upsertTransaction(transaction, accessToken);
          addedCount++;
        } catch (error: any) {
          console.error(`Error processing added transaction ${transaction.transaction_id}:`, error.message);
          // Continue with other transactions
        }
      }

      // Process modified transactions (includes pending→settled updates)
      let modifiedCount = 0;
      for (const transaction of modified) {
        try {
          await this.upsertTransaction(transaction, accessToken);
          modifiedCount++;
        } catch (error: any) {
          console.error(`Error processing modified transaction ${transaction.transaction_id}:`, error.message);
          // Continue with other transactions
        }
      }

      // Process removed transactions
      let removedCount = 0;
      for (const removedTx of removed) {
        try {
          await prisma.transaction.deleteMany({
            where: { plaidTransactionId: removedTx.transaction_id },
          });
          removedCount++;
        } catch (error: any) {
          console.error(`Error removing transaction ${removedTx.transaction_id}:`, error.message);
          // Continue with other transactions
        }
      }

      // Update cursor and last sync timestamp in database
      // Always update cursor if we have one (even after reset), and always update lastTransactionSync on success
      // Clear any previous errors since sync completed successfully (even if cursor was reset)
      if (currentCursor) {
        await prisma.accessToken.update({
          where: { token: accessToken },
          data: {
            transactionSyncCursor: currentCursor,
            lastTransactionSync: new Date(),
            lastError: null, // Clear errors - sync completed successfully
          },
        });
      } else {
        // No cursor (first sync or cursor reset but no new cursor yet)
        await prisma.accessToken.update({
          where: { token: accessToken },
          data: {
            lastTransactionSync: new Date(),
            lastError: null, // Clear errors - sync completed successfully
          },
        });
      }

      return {
        success: true,
        added: addedCount,
        modified: modifiedCount,
        removed: removedCount,
        cursor: currentCursor,
        error: syncError,
      };
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error_message || error.message || 'Unknown error';
      console.error(`Error syncing transactions for token:`, errorMessage);

      // Update error in database
      try {
        await prisma.accessToken.update({
          where: { token: accessToken },
          data: {
            lastError: errorMessage,
          },
        });
      } catch (dbError) {
        console.error('Error updating access token error field:', dbError);
      }

      return {
        success: false,
        added: 0,
        modified: 0,
        removed: 0,
        cursor: null,
        error: errorMessage,
      };
    }
  }

  /**
   * Upsert a transaction to the database
   * Handles account lookup, transaction data processing, and categorization
   */
  private static async upsertTransaction(transaction: any, accessToken: string): Promise<void> {
    // Find the account for this transaction
    const account = await prisma.account.findUnique({
      where: { plaidAccountId: transaction.account_id },
    });

    if (!account) {
      console.warn(`Skipping transaction ${transaction.transaction_id} for unknown accountId: ${transaction.account_id}`);
      return;
    }

    // Process transaction data (handles amount correction, category extraction, etc.)
    const processedTx = processTransactionData(transaction);

    // Prepare category string
    let categoryStr = null;
    if (processedTx.category) {
      if (Array.isArray(processedTx.category)) {
        categoryStr = processedTx.category.filter((c: any) => c && c.trim()).join(', ');
      } else if (typeof processedTx.category === 'string') {
        categoryStr = processedTx.category;
      }
    }

    // Check if transaction already exists to see if we need to categorize
    const existing = await prisma.transaction.findUnique({
      where: { plaidTransactionId: transaction.transaction_id },
    });

    // ✅ CRITICAL: Categorize transaction if it doesn't have aiCategory
    // This ensures transactions are categorized during sync, not just when GPT requests data
    let aiCategory: string | null = null;
    let aiCategoryReason: string | null = null;
    let categoryComparedAt: Date | null = null;

    if (!existing?.aiCategory) {
      // Transaction doesn't have aiCategory - categorize it
      try {
        const accountData = {
          account_id: account.plaidAccountId,
          type: account.type,
          subtype: account.subtype || undefined,
          name: account.name,
        };

        const categorized = await categorizationService.categorizeTransaction(
          processedTx,
          accountData
        );

        if (categorized.transaction_type) {
          aiCategory = categorized.transaction_type;
          aiCategoryReason = categorized.categorization_reason || null;
          categoryComparedAt = new Date();
        }
      } catch (error: any) {
        // Log error but don't fail the sync - transaction will be categorized on next GPT request
        console.warn(`Failed to categorize transaction ${transaction.transaction_id}: ${error.message}`);
      }
    } else {
      // Preserve existing categorization (including manual corrections)
      aiCategory = existing.aiCategory;
      aiCategoryReason = existing.aiCategoryReason;
      categoryComparedAt = existing.categoryComparedAt;
    }

    // Upsert transaction
    await prisma.transaction.upsert({
      where: { plaidTransactionId: transaction.transaction_id },
      update: {
        accountId: account.id,
        amount: processedTx.amount,
        date: new Date(processedTx.date),
        name: processedTx.name,
        category: categoryStr,
        categoryId: processedTx.category_id || null,
        pending: processedTx.pending,
        merchantName: processedTx.merchant_name || null,
        paymentChannel: processedTx.payment_channel || null,
        originalDescription: transaction.original_description || null,
        currency: transaction.iso_currency_code || 'USD',
        authorizedDate: transaction.authorized_date ? new Date(transaction.authorized_date) : null,
        checkNumber: transaction.check_number || null,
        location: transaction.location ? JSON.stringify(transaction.location) : null,
        pendingTransactionId: transaction.pending_transaction_id || null,
        lastSynced: new Date(),
        // Update aiCategory only if we just categorized it (preserves manual corrections)
        ...(aiCategory && !existing?.aiCategory ? {
          aiCategory,
          aiCategoryReason,
          categoryComparedAt,
        } : {}),
      },
      create: {
        plaidTransactionId: transaction.transaction_id,
        accountId: account.id,
        amount: processedTx.amount,
        date: new Date(processedTx.date),
        name: processedTx.name,
        category: categoryStr,
        categoryId: processedTx.category_id || null,
        pending: processedTx.pending,
        merchantName: processedTx.merchant_name || null,
        paymentChannel: processedTx.payment_channel || null,
        originalDescription: transaction.original_description || null,
        currency: transaction.iso_currency_code || 'USD',
        authorizedDate: transaction.authorized_date ? new Date(transaction.authorized_date) : null,
        checkNumber: transaction.check_number || null,
        location: transaction.location ? JSON.stringify(transaction.location) : null,
        pendingTransactionId: transaction.pending_transaction_id || null,
        lastSynced: new Date(),
        aiCategory,
        aiCategoryReason,
        categoryComparedAt,
      },
    });
  }

  /**
   * Sync transactions for all active access tokens
   * Used by cron job to sync all users' transactions
   */
  static async syncAllActiveTokens(): Promise<{
    success: boolean;
    totalTokens: number;
    successful: number;
    failed: number;
    results: Array<{
      tokenId: string;
      userId: string | null;
      result: TransactionSyncResult;
    }>;
  }> {
    const activeTokens = await prisma.accessToken.findMany({
      where: { isActive: true },
      select: {
        id: true,
        token: true,
        userId: true,
      },
    });

    console.log(`Starting transaction sync for ${activeTokens.length} active tokens`);

    const results: Array<{
      tokenId: string;
      userId: string | null;
      result: TransactionSyncResult;
    }> = [];

    let successful = 0;
    let failed = 0;

    for (const tokenRecord of activeTokens) {
      try {
        const result = await this.syncTransactionsForToken(tokenRecord.token);
        results.push({
          tokenId: tokenRecord.id,
          userId: tokenRecord.userId,
          result,
        });

        if (result.success) {
          successful++;
          console.log(
            `✅ Token ${tokenRecord.id.substring(0, 8)}... synced: ${result.added} added, ${result.modified} modified, ${result.removed} removed`
          );
        } else {
          failed++;
          console.error(`❌ Token ${tokenRecord.id.substring(0, 8)}... failed: ${result.error}`);
        }
      } catch (error: any) {
        failed++;
        const errorMessage = error.message || 'Unknown error';
        console.error(`❌ Token ${tokenRecord.id.substring(0, 8)}... error: ${errorMessage}`);
        results.push({
          tokenId: tokenRecord.id,
          userId: tokenRecord.userId,
          result: {
            success: false,
            added: 0,
            modified: 0,
            removed: 0,
            cursor: null,
            error: errorMessage,
          },
        });
      }
    }

    console.log(`Transaction sync completed: ${successful} successful, ${failed} failed`);

    return {
      success: failed === 0,
      totalTokens: activeTokens.length,
      successful,
      failed,
      results,
    };
  }
}

