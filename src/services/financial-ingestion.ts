import { getPrismaClient } from '../prisma-client';
import { plaidClient } from '../plaid';
import { BalanceService } from './balance-service';
import { FinancialDataService, type UnifiedFinancialData } from './financial-data-service';

export interface FinancialIngestionOptions {
  balanceMaxAgeHours: number;
  categorize: boolean;
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

  if (staleAccount) {
    const tokens = await prisma.accessToken.findMany({
      where: { userId, isActive: true },
      select: { token: true, id: true },
    });
    for (const token of tokens) {
      try {
        await BalanceService.getAccountBalances(token.token, plaidClient, false);
      } catch (error) {
        console.warn(`Balance refresh skipped for token ${token.id}:`, error);
      }
    }
  }

  return new FinancialDataService().getUserFinancialData(userId, {
    includeTransactions: true,
    includeInvestments: true,
    includeHomeValue: true,
    skipCategorization: !options.categorize,
    shouldPersistTransactions: options.categorize,
  });
}
