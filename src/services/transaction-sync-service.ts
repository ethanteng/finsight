import { PrismaClient } from '@prisma/client';
import { plaidClient } from '../plaid';
import { processTransactionData } from '../plaid';
import { TransactionCategorizationService } from './transaction-categorization-service';
import { TransactionNormalizationService } from './transaction-normalization-service';
import { withTransientProviderRetry } from './provider-request-policy';
import { extractPlaidErrorCode, isUserActionRequiredPlaidError } from './plaid-error-classification';

const prisma = new PrismaClient();
const categorizationService = new TransactionCategorizationService();
const normalizationService = new TransactionNormalizationService();

export interface TransactionSyncResult {
  success: boolean;
  added: number;
  modified: number;
  removed: number;
  cursor: string | null;
  error?: string;
  /**
   * Plaid's error code for a failed sync, when it supplied one. Carried so
   * callers can tell a connection the user must re-link from a provider
   * failure a retry could clear, without matching on the message text.
   */
  errorCode?: string;
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
      const tokenRecord = await prisma.accessToken.findUnique({
        where: { token: accessToken },
        select: { id: true, userId: true, transactionSyncCursor: true, institutionName: true },
      });
      if (!tokenRecord) throw new Error('Unknown Plaid connection');
      if (!cursor) cursor = tokenRecord.transactionSyncCursor || undefined;

      const added: any[] = [];
      const modified: any[] = [];
      const removed: any[] = [];
      let currentCursor: string | null = cursor || null;
      // Preserve the cursor that started this sync so a mid-pagination mutation
      // can restart from the same acknowledgement boundary (Plaid guidance).
      const paginationStartCursor: string | null = currentCursor;
      let hasMore = true;
      let syncError: string | undefined;
      let cursorResetAttempted = false;
      let mutationRestartAttempted = false;

      // Paginate through all changes
      while (hasMore) {
        try {
          const syncResp = await withTransientProviderRetry(() => plaidClient.transactionsSync({
            access_token: accessToken,
            cursor: currentCursor || undefined,
          }));

          added.push(...syncResp.data.added);
          modified.push(...syncResp.data.modified);
          removed.push(...syncResp.data.removed);
          currentCursor = syncResp.data.next_cursor;
          hasMore = syncResp.data.has_more;
        } catch (error: any) {
          // Handle specific Plaid errors
          const errorCode = error?.response?.data?.error_code;
          const errorMessage = error?.response?.data?.error_message || error.message;

          // Underlying data changed while paging. Restart from the original
          // cursor for this sync — not from null, and not from next_cursor.
          if (errorCode === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION') {
            if (mutationRestartAttempted) {
              throw error;
            }
            console.warn(
              `Transaction sync mutation during pagination; restarting from sync start cursor: ${errorMessage}`
            );
            currentCursor = paginationStartCursor;
            mutationRestartAttempted = true;
            added.length = 0;
            modified.length = 0;
            removed.length = 0;
            hasMore = true;
            continue;
          }

          // If cursor is invalid/expired, reset cursor and retry without cursor
          // This will fetch all transactions from the beginning
          if (errorCode === 'INVALID_CURSOR' || errorCode === 'CURSOR_EXPIRED') {
            if (cursorResetAttempted || currentCursor === null) {
              throw error;
            }
            console.warn(`Cursor invalid/expired for token, resetting cursor and starting fresh: ${errorMessage}`);
            currentCursor = null;
            cursorResetAttempted = true;
            // Discard changes collected from the invalid cursor. The cursorless
            // restart returns the authoritative stream from the beginning, and
            // retaining the earlier pages would process the same changes twice.
            added.length = 0;
            modified.length = 0;
            removed.length = 0;
            hasMore = true;
            syncError = `Cursor was reset: ${errorMessage}`;
            // Continue loop - will retry without cursor on next iteration
            continue;
          }

          // For other errors, throw to be caught by outer try-catch
          throw error;
        }
      }

      // Plaid can report changes for an account opened after this connection was
      // linked, and nothing on the scheduled path creates account rows. Create
      // them here, before the unknown-account guard in upsertTransaction would
      // fail the sync and pin the cursor to the same page on every future run.
      await this.backfillMissingAccounts(accessToken, tokenRecord, [...added, ...modified]);

      // Process added transactions
      let addedCount = 0;
      const processingErrors: string[] = [];
      for (const transaction of added) {
        try {
          await this.upsertTransaction(transaction, tokenRecord);
          addedCount++;
        } catch (error: any) {
          console.error(`Error processing added transaction ${transaction.transaction_id}:`, error.message);
          processingErrors.push(`added ${transaction.transaction_id}: ${error.message}`);
        }
      }

      // Process modified transactions (includes pending→settled updates)
      let modifiedCount = 0;
      for (const transaction of modified) {
        try {
          await this.upsertTransaction(transaction, tokenRecord);
          modifiedCount++;
        } catch (error: any) {
          console.error(`Error processing modified transaction ${transaction.transaction_id}:`, error.message);
          processingErrors.push(`modified ${transaction.transaction_id}: ${error.message}`);
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
          processingErrors.push(`removed ${removedTx.transaction_id}: ${error.message}`);
        }
      }

      // A Plaid cursor is an acknowledgement boundary. If even one change was
      // not durably applied, leave the stored cursor untouched so the entire
      // page is replayed on the next run. Successful upserts/deletes are
      // idempotent, whereas advancing here would permanently lose the failure.
      if (processingErrors.length > 0) {
        throw new Error(
          `Failed to persist ${processingErrors.length} transaction change(s): ${processingErrors.slice(0, 3).join('; ')}`
        );
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
      const errorCode = extractPlaidErrorCode(error);
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
        errorCode,
      };
    }
  }

  /**
   * Create account rows for any account this page references that we do not
   * already store. Accounts are otherwise only written by request-driven Plaid
   * flows (link, /sync, refresh), so a bank account opened after linking would
   * make every scheduled sync fail on the same page forever: the cursor is only
   * advanced once every change persists.
   *
   * Only genuinely absent rows are created. An account_id that already belongs
   * to another connection or user is left alone, and the caller's unknown-account
   * guard still refuses to attribute transactions to it.
   */
  private static async backfillMissingAccounts(
    accessToken: string,
    connection: { id: string; userId: string | null; institutionName?: string | null },
    transactions: any[]
  ): Promise<void> {
    const referenced = new Set(
      transactions
        .map((transaction) => transaction?.account_id)
        .filter((accountId: unknown): accountId is string => typeof accountId === 'string' && accountId.length > 0)
    );
    if (referenced.size === 0) return;

    const known = await prisma.account.findMany({
      where: { plaidAccountId: { in: Array.from(referenced) } },
      select: { plaidAccountId: true },
    });
    known.forEach((account) => referenced.delete(account.plaidAccountId));
    if (referenced.size === 0) return;

    console.log(
      `Transaction sync: ${referenced.size} account(s) unknown locally; fetching accounts for this Plaid Item`
    );
    const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
    for (const account of accountsResponse.data.accounts) {
      if (!referenced.has(account.account_id)) continue;
      // A concurrent sync may create the same row first; upsert keeps that safe
      // and deliberately leaves an existing row's fields untouched.
      await prisma.account.upsert({
        where: { plaidAccountId: account.account_id },
        update: {},
        create: {
          plaidAccountId: account.account_id,
          name: account.name,
          officialName: account.official_name || null,
          mask: account.mask || null,
          type: String(account.type),
          subtype: account.subtype ? String(account.subtype) : null,
          currentBalance: account.balances?.current ?? null,
          availableBalance: account.balances?.available ?? null,
          limit: account.balances?.limit ?? null,
          currency: account.balances?.iso_currency_code ?? null,
          institution: connection.institutionName || null,
          persistentAccountId: account.persistent_account_id || null,
          userId: connection.userId,
          accessTokenId: connection.id,
          lastSynced: new Date(),
        },
      });
      console.log(`Transaction sync: created account row for ${account.account_id}`);
    }
  }

  /**
   * Upsert a transaction to the database
   * Handles account lookup, transaction data processing, and categorization
   */
  private static async upsertTransaction(
    transaction: any,
    connection: { id: string; userId: string | null }
  ): Promise<void> {
    const account = await prisma.account.findFirst({
      where: {
        plaidAccountId: transaction.account_id,
        ...(connection.userId
          ? {
              OR: [
                { accessTokenId: connection.id },
                { accessTokenId: null, userId: connection.userId },
              ],
            }
          : { accessTokenId: connection.id }),
      },
    });

    if (!account) {
      throw new Error(
        `Unknown accountId ${transaction.account_id} for transaction ${transaction.transaction_id}`
      );
    }
    if (account.accessTokenId === null) {
      await prisma.account.update({
        where: { id: account.id },
        data: { accessTokenId: connection.id },
      });
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

    const normalizedTx = normalizationService.normalizeTransaction(
      { ...processedTx, transaction_type: aiCategory || undefined },
      account.type,
      account.subtype || undefined
    );

    // Upsert transaction
    await prisma.transaction.upsert({
      where: { plaidTransactionId: transaction.transaction_id },
      update: {
        accountId: account.id,
        amount: normalizedTx.amount,
        sourceAmount: normalizedTx.source_amount,
        cashFlowAmount: normalizedTx.cash_flow_amount,
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
        amount: normalizedTx.amount,
        sourceAmount: normalizedTx.source_amount,
        cashFlowAmount: normalizedTx.cash_flow_amount,
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
    /** False only when a failure a retry could plausibly clear occurred. */
    success: boolean;
    totalTokens: number;
    successful: number;
    failed: number;
    /** Failures only the account holder can fix by re-linking through Plaid. */
    needsReauth: number;
    /** Failures worth alerting on: provider outages, rate limits, bugs. */
    providerFailures: number;
    results: Array<{
      tokenId: string;
      userId: string | null;
      result: TransactionSyncResult;
    }>;
  }> {
    const activeTokens = await prisma.accessToken.findMany({
      where: { isActive: true, supersededAt: null },
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
            errorCode: extractPlaidErrorCode(error),
          },
        });
      }
    }

    // A connection whose credentials or MFA changed fails identically on every
    // run until its owner re-links, so it is reported rather than counted as a
    // failure. Only failures a retry could clear decide the overall result.
    const needsReauth = results.filter(
      (item) => !item.result.success && isUserActionRequiredPlaidError(item.result.errorCode)
    ).length;
    const providerFailures = failed - needsReauth;

    console.log(
      `Transaction sync completed: ${successful} successful, ${failed} failed ` +
      `(${needsReauth} awaiting user re-authentication, ${providerFailures} provider failures)`
    );

    return {
      success: providerFailures === 0,
      totalTokens: activeTokens.length,
      successful,
      failed,
      needsReauth,
      providerFailures,
      results,
    };
  }
}
