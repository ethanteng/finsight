import { getPrismaClient } from '../prisma-client';
import { plaidClient } from '../plaid';
import { BalanceService } from './balance-service';
import { FinancialDataService, type UnifiedFinancialData } from './financial-data-service';
import { applyCategoryOverrides } from './transaction-category-override-service';

export interface FinancialIngestionOptions {
  balanceMaxAgeHours: number;
  categorize: boolean;
  /** User-initiated refreshes bypass Plaid's balance cache and freshness window. */
  forceBalanceRefresh?: boolean;
}

/** Provider I/O boundary used by canonical snapshot production. */
export async function ingestFinancialData(
  userId: string,
  options: FinancialIngestionOptions
): Promise<UnifiedFinancialData> {
  const prisma = getPrismaClient();
  const oldestAllowed = new Date(Date.now() - options.balanceMaxAgeHours * 60 * 60 * 1000);
  const staleAccount = await prisma.account.findFirst({
    where: {
      userId,
      OR: [{ balanceLastFetched: null }, { balanceLastFetched: { lt: oldestAllowed } }],
    },
    select: { plaidAccountId: true },
  });

  if (staleAccount || options.forceBalanceRefresh) {
    const tokens = await prisma.accessToken.findMany({
      where: { userId, isActive: true, supersededAt: null },
      select: { token: true, id: true },
    });
    const refreshErrors: Error[] = [];
    for (const token of tokens) {
      try {
        await BalanceService.getAccountBalances(
          token.token,
          plaidClient,
          Boolean(options.forceBalanceRefresh)
        );
      } catch (error) {
        console.warn(`Balance refresh failed for token ${token.id}:`, error);
        if (options.forceBalanceRefresh) {
          refreshErrors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
    if (refreshErrors.length > 0) {
      const refreshError = new Error(
        `Live balance refresh failed for ${refreshErrors.length} Plaid connection${refreshErrors.length === 1 ? '' : 's'}`
      );
      (refreshError as Error & { causes?: Error[] }).causes = refreshErrors;
      throw refreshError;
    }
  }

  const data = await new FinancialDataService().getUserFinancialData(userId, {
    includeTransactions: true,
    includeInvestments: true,
    includeLiabilities: true,
    includeHomeValue: true,
    skipCategorization: !options.categorize,
    shouldPersistTransactions: options.categorize,
  });

  // Provider payloads are re-read on every revision, so a category the user chose has to
  // be stamped back on here — otherwise each recompute would restore Plaid's category.
  // A failure here must not sink the whole revision; the provider category is still valid.
  try {
    await applyCategoryOverrides(userId, data);
  } catch (error) {
    console.warn('Failed to apply transaction category overrides (non-fatal):', error);
  }

  return data;
}
