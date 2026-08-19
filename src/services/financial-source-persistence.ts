import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../prisma-client';
import { TokenStatus, type PlaidTokenHealth } from './token-validation-service';

const prisma = getPrismaClient();

type PersistedBalance = {
  current: number | null;
  available?: number;
  limit?: number;
  iso_currency_code: string;
};

export async function loadPersistedPlaidData(
    userId: string,
    options: { includeTransactions: boolean; includeInvestments: boolean; includeLiabilities?: boolean }
  ): Promise<{ data: any; lastSynced: Date | null; isFresh: boolean } | null> {
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
      // Keyed on supersededAt, not lastError: token revalidation clears lastError on any successful
      // Plaid call, and a superseded Item usually still works at Plaid. Tokens that are merely
      // erroring (e.g. ITEM_LOGIN_REQUIRED) are untouched and still yield last known balances.
      const tokenRecords = await prisma.accessToken.findMany({
        where: { userId },
        select: {
          id: true,
          isActive: true,
          lastError: true,
          lastChecked: true,
          updatedAt: true,
          supersededAt: true,
        }
      });
      const supersededTokenIds = new Set(
        tokenRecords.filter(token => token.supersededAt).map(token => token.id)
      );

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

      const accountLastSynced =
        lastSyncedTimestamps.length > 0
          ? new Date(Math.max(...lastSyncedTimestamps))
          : null;

      const maxAgeMinutes = parseInt(process.env.PERSISTED_DATA_MAX_AGE_MINUTES || '120', 10);
      const accountIsFresh = accountLastSynced
        ? Date.now() - accountLastSynced.getTime() <= maxAgeMinutes * 60 * 1000
        : false;

      const needsFullSnapshot = options.includeInvestments || options.includeLiabilities;
      const fullSnapshot = needsFullSnapshot
        ? await prisma.financialSummarySnapshot.findUnique({
            where: { userId },
            select: {
              computedAt: true,
              asOf: true,
              status: true,
              accounts: true,
              holdings: true,
              securities: true,
              activities: true,
            },
          })
        : null;
      const fullSnapshotObservedAt = fullSnapshot?.computedAt ?? null;
      const fullSnapshotIsFresh = fullSnapshotObservedAt
        ? Date.now() - fullSnapshotObservedAt.getTime() <= maxAgeMinutes * 60 * 1000
        : false;
      // Freshness alone is not completeness. A revision written while a provider call
      // failed is stored as 'partial'/'unavailable' with an empty holdings or liability
      // set, and its computedAt is still current. Reusing it would republish a missing
      // observation as a zero-value portfolio for the whole freshness window, and the
      // caller sees no errors to say otherwise. Only a complete revision may stand in
      // for a live fetch; anything else falls through to the provider, matching
      // FinancialRevisionService.recomputeIfStale, which also reuses 'current' only.
      const fullSnapshotIsReusable = fullSnapshotIsFresh && fullSnapshot?.status === 'current';
      if (needsFullSnapshot && !fullSnapshotIsReusable) return null;

      const persistedSnapshotAccounts = Array.isArray(fullSnapshot?.accounts)
        ? fullSnapshot.accounts as Array<Record<string, any>>
        : [];
      const liabilityDetailsByAccountId = new Map<string, unknown>();
      for (const account of persistedSnapshotAccounts) {
        const accountId = String(account.account_id || account.plaidAccountId || account.id || '');
        if (accountId && Array.isArray(account.liabilityDetails)) {
          liabilityDetailsByAccountId.set(accountId, account.liabilityDetails);
        }
      }

      const lastSyncedCandidates = [accountLastSynced, fullSnapshot?.asOf, fullSnapshotObservedAt]
        .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));
      const lastSynced = lastSyncedCandidates.length
        ? new Date(Math.max(...lastSyncedCandidates.map(value => value.getTime())))
        : null;
      const isFresh = accountIsFresh && (!needsFullSnapshot || fullSnapshotIsReusable);

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
        ...(liabilityDetailsByAccountId.has(record.plaidAccountId) && {
          liabilityDetails: liabilityDetailsByAccountId.get(record.plaidAccountId),
        }),
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

      const plaidAccountIds = new Set(accounts.map(account => account.account_id));
      const holdings = options.includeInvestments && Array.isArray(fullSnapshot?.holdings)
        ? (fullSnapshot.holdings as Array<Record<string, any>>)
            .filter(holding => plaidAccountIds.has(String(holding.account_id || '')))
        : [];
      const securityIds = new Set(holdings.map(holding => String(holding.security_id || '')).filter(Boolean));
      const securities = options.includeInvestments && Array.isArray(fullSnapshot?.securities)
        ? (fullSnapshot.securities as Array<Record<string, any>>)
            .filter(security => securityIds.has(String(security.security_id || '')))
        : [];

      if (options.includeTransactions && options.includeInvestments && Array.isArray(fullSnapshot?.activities)) {
        const seen = new Set(transactions.map(transaction => String(
          transaction.transaction_id || transaction.investment_transaction_id || transaction.id || ''
        )));
        for (const activity of fullSnapshot.activities as Array<Record<string, any>>) {
          if (!plaidAccountIds.has(String(activity.account_id || ''))) continue;
          const id = String(activity.investment_transaction_id || activity.transaction_id || activity.id || '');
          if (!id || seen.has(id)) continue;
          seen.add(id);
          transactions.push({ ...activity, isInvestmentTransaction: true, persisted: true });
        }
      }

      const tokenHealth: PlaidTokenHealth[] = tokenRecords
        .filter(token => !token.supersededAt)
        .map(token => {
          const error = token.lastError || undefined;
          const normalizedError = error?.toUpperCase() || '';
          const status = normalizedError.includes('ITEM_LOGIN_REQUIRED')
            ? TokenStatus.LOGIN_REQUIRED
            : !token.isActive || error
              ? TokenStatus.ERROR
              : TokenStatus.VALID;
          return {
            tokenId: token.id,
            status,
            ...(error && { error }),
            lastChecked: token.lastChecked || token.updatedAt,
          };
        });

      return {
        data: {
          accounts,
          balances,
          holdings,
          securities,
          transactions,
          tokenHealth,
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
