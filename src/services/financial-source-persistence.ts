import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../prisma-client';
import { SUPERSEDED_ERROR_CODE } from './plaid-connection-supersede';

const prisma = getPrismaClient();

type PersistedBalance = {
  current: number | null;
  available?: number;
  limit?: number;
  iso_currency_code: string;
};

export async function loadPersistedPlaidData(
    userId: string,
    options: { includeTransactions: boolean; includeInvestments: boolean }
  ): Promise<{ data: any; lastSynced: Date | null; isFresh: boolean } | null> {
    // Persisted snapshots currently store only account/core balance data. When
    // investment holdings are requested we must force a live Plaid fetch to keep
    // portfolio analytics accurate.
    if (options.includeInvestments) {
      return null;
    }

    try {
      const historyDays = parseInt(process.env.TRANSACTION_HISTORY_DAYS || '90', 10);
      const startDate = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000);
      const accountInclude = options.includeTransactions
        ? {
            transactions: {
              orderBy: { date: Prisma.SortOrder.desc },
              where: {
                date: {
                  gte: startDate
                }
              }
            }
          }
        : undefined;

      const accountRecordsRaw = await prisma.account.findMany({
        where: { userId },
        include: accountInclude
      }) as Array<Prisma.AccountGetPayload<{
        include: {
          transactions: true;
        };
      }>>;

      // Accounts left behind by a connection that was superseded by a re-link must not surface.
      // Scoped to SUPERSEDED_BY_RELINK specifically: tokens that are merely erroring (e.g.
      // ITEM_LOGIN_REQUIRED) must still yield their last known balances here.
      const supersededTokens = await prisma.accessToken.findMany({
        where: { userId, isActive: false, lastError: SUPERSEDED_ERROR_CODE },
        select: { id: true }
      });
      const supersededTokenIds = new Set(supersededTokens.map(token => token.id));

      const accountRecords = accountRecordsRaw.filter(record => {
        if (!record.plaidAccountId) {
          return false;
        }
        if (record.accessTokenId && supersededTokenIds.has(record.accessTokenId)) {
          return false;
        }
        if (record.plaidAccountId.startsWith('snaptrade-')) {
          return false;
        }
        // Exclude manual accounts - they come from ManualAccount table via fetchManualAccounts.
        // If Account table has legacy manual records, including them would duplicate with fetchManualAccounts.
        if (record.plaidAccountId.startsWith('manual-')) {
          return false;
        }
        return true;
      });

      if (accountRecords.length === 0) {
        return null;
      }

      // ✅ CRITICAL: Filter out corrupted records where plaidAccountId points to another account's database id
      // This is a safety measure to prevent corrupted data from being used
      // Identity resolution is handled by mergeFinancialSources(); this is data quality filtering only.
      const accountIdSet = new Set(accountRecords.map(r => r.id));

      // Helper to check if plaidAccountId looks like a database ID (cuid format: 25 chars, starts with 'c')
      const isDatabaseId = (id: string) => id.length === 25 && id.startsWith('c');

      // Filter out corrupted records only; identity resolution happens later.
      const validRecords = accountRecords.filter(record => {
        // If plaidAccountId matches another account's database id, it's corrupted
        if (isDatabaseId(record.plaidAccountId) && accountIdSet.has(record.plaidAccountId) && record.plaidAccountId !== record.id) {
          console.warn(`⚠️ tryLoadPersistedPlaidData: Skipping corrupted account ${record.id} (${record.name}) - plaidAccountId points to another account's id: ${record.plaidAccountId}`);
          return false;
        }
        return true;
      });

      // Trust mergeFinancialSources() for identity resolution.
      const uniqueRecords = validRecords;

      if (accountRecords.length !== validRecords.length) {
        const corruptedCount = accountRecords.length - validRecords.length;
        console.warn(`⚠️ loadPersistedPlaidData: Filtered out ${corruptedCount} corrupted accounts (${accountRecords.length} → ${validRecords.length}).`);
      }

      // ✅ FIX: Sort validRecords (not accountRecords) and use them for timestamp calculation
      // This ensures corrupted records (which were filtered out) don't affect the lastSynced calculation
      const sortedValidRecords = validRecords
        .slice()
        .sort((a, b) => {
          const aTimestamp = (a.lastSynced || a.updatedAt)?.getTime?.() ?? 0;
          const bTimestamp = (b.lastSynced || b.updatedAt)?.getTime?.() ?? 0;
          return bTimestamp - aTimestamp;
        });

      const lastSyncedTimestamps = sortedValidRecords
        .map(record => record.lastSynced || record.updatedAt)
        .filter((value): value is Date => Boolean(value))
        .map(value => value.getTime());

      const lastSynced =
        lastSyncedTimestamps.length > 0
          ? new Date(Math.max(...lastSyncedTimestamps))
          : null;

      const maxAgeMinutes = parseInt(process.env.PERSISTED_DATA_MAX_AGE_MINUTES || '120', 10);
      const isFresh = lastSynced
        ? Date.now() - lastSynced.getTime() <= maxAgeMinutes * 60 * 1000
        : false;

      // Infer institution for records missing it - ensures consistent getLogicalKey() deduplication
      // so persisted accounts match fresh API accounts with the same identity.
      const institutionsInBatch = [...new Set(uniqueRecords.map(r => r.institution).filter(Boolean))] as string[];
      const singleInstitution = institutionsInBatch.length === 1 ? institutionsInBatch[0] : null;
      // When multiple institutions: infer per-account by matching name+type+subtype to records that have institution
      const keyToInstitutions = new Map<string, Set<string>>();
      for (const r of uniqueRecords) {
        if (r.institution) {
          const k = `${(r.name || '').trim()}|${(r.type || '').trim()}|${(r.subtype || '').trim()}`;
          if (!keyToInstitutions.has(k)) keyToInstitutions.set(k, new Set());
          keyToInstitutions.get(k)!.add(r.institution);
        }
      }
      const inferInstitution = (record: (typeof uniqueRecords)[0]): string | undefined => {
        if (record.institution) return record.institution;
        if (singleInstitution) return singleInstitution;
        const k = `${(record.name || '').trim()}|${(record.type || '').trim()}|${(record.subtype || '').trim()}`;
        const insts = keyToInstitutions.get(k);
        return insts?.size === 1 ? [...insts][0] : undefined;
      };

      const accounts = uniqueRecords.map(record => ({
        account_id: record.plaidAccountId,
        id: record.plaidAccountId,
        name: record.name,
        type: record.type,
        subtype: record.subtype || undefined,
        balance: {
          current: record.currentBalance,
          available: record.availableBalance ?? undefined,
          limit: record.limit ?? undefined,
          iso_currency_code: record.currency || 'USD',
          unofficial_currency_code: undefined
        },
        institution: inferInstitution(record),
        institution_id: undefined,
        institution_logo: undefined,
        institution_url: undefined,
        source: 'plaid',
        sourceConnectionId: record.accessTokenId || undefined,
        persisted: true,
        // Pass through persistentAccountId only when it's the real Plaid value (TAN institutions).
        // When persistentAccountId === plaidAccountId it was likely our incorrect fallback. Omit it
        // so identity falls back to the source connection plus the provider account ID.
        persistentAccountId:
          record.persistentAccountId &&
          record.persistentAccountId !== record.plaidAccountId
            ? record.persistentAccountId
            : undefined,
        snapshotTimestamp: (
          record.balanceLastFetched || record.lastSynced || record.updatedAt
        )?.toISOString?.(),
        lastSyncedAt: record.lastSynced?.toISOString?.()
      }));

      const balances: Record<string, PersistedBalance> = {};
      accounts.forEach(account => {
        balances[account.account_id] = {
          current: account.balance.current,
          available: account.balance.available,
          limit: account.balance.limit,
          iso_currency_code: account.balance.iso_currency_code
        };
      });

      const transactions: any[] = [];
      if (options.includeTransactions) {
        uniqueRecords.forEach(record => {
          const plaidAccountId = record.plaidAccountId;
          record.transactions?.forEach((dbTx: any) => {
            const categoryArray =
              typeof dbTx.category === 'string'
                ? dbTx.category.split(',').map((item: string) => item.trim()).filter(Boolean)
                : undefined;

            transactions.push({
              id: dbTx.plaidTransactionId,
              transaction_id: dbTx.plaidTransactionId,
              account_id: plaidAccountId,
              amount: dbTx.amount,
              source_amount: dbTx.sourceAmount ?? dbTx.amount,
              cash_flow_amount: dbTx.cashFlowAmount ?? undefined,
              date: dbTx.date.toISOString().split('T')[0],
              name: dbTx.name,
              category: categoryArray,
              pending: dbTx.pending,
              iso_currency_code: dbTx.currency || 'USD',
              merchant_name: dbTx.merchantName || undefined,
              payment_channel: dbTx.paymentChannel || undefined,
              enriched_data: dbTx.enriched_data || undefined,
              aiCategory: dbTx.aiCategory || undefined,
              aiCategoryReason: dbTx.aiCategoryReason || undefined,
              transaction_type: dbTx.aiCategory || undefined,
              categoryComparedAt: dbTx.categoryComparedAt || undefined,
              persisted: true
            });
          });
        });
      }

      return {
        data: {
          accounts,
          balances,
          holdings: [],
          securities: [],
          transactions,
          errors: [],
          performance: {
            duration: 0,
            source: 'persisted',
            lastSynced: lastSynced ? lastSynced.toISOString() : undefined
          }
        },
        lastSynced,
        isFresh
      };
    } catch (error) {
      console.error('FinancialDataService: Failed to load persisted Plaid data:', error);
      return null;
    }
}
