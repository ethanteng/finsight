import type { FinancialSummarySnapshot } from '@prisma/client';
import { getPrismaClient } from '../prisma-client';
import {
  hasAccountDisplayBalances,
  withAccountDisplayBalances,
} from './finances-overview-service';

export type FinancialSnapshotView = 'summary' | 'finances' | 'full';

export interface AnalysisSnapshotOptions {
  includeAccounts?: boolean;
  includeTransactions?: boolean;
  includeInvestments?: boolean;
}

export type AnalysisFinancialSummarySnapshot = Pick<
  FinancialSummarySnapshot,
  | 'computedAt'
  | 'asOf'
  | 'status'
  | 'reportingCurrency'
  | 'financialOverview'
  | 'investmentPortfolio'
  | 'transactionsSummary'
  | 'quality'
  | 'sourceObservations'
  | 'meta'
> & Partial<Pick<FinancialSummarySnapshot, 'accounts' | 'transactions' | 'holdings' | 'securities'>>;

export async function upsertFinancialSnapshot(userId: string, payload: any): Promise<void> {
  const { computedAt, asOf, status, reportingCurrency, financialOverview,
    investmentPortfolio, accounts, holdings, securities, transactions,
    transactionsSummary, activities, quality, sourceObservations, meta } = payload;
  await getPrismaClient().financialSummarySnapshot.upsert({
    where: { userId },
    update: {
      computedAt, asOf, status, reportingCurrency, financialOverview,
      investmentPortfolio, accounts, holdings, securities, transactions,
      transactionsSummary, activities, quality, sourceObservations, meta,
    },
    create: {
      userId, computedAt, asOf, status, reportingCurrency, financialOverview,
      investmentPortfolio, accounts, holdings, securities, transactions,
      transactionsSummary, activities, quality, sourceObservations, meta,
    },
  });
}

export async function getLatestFinancialSnapshot(userId: string, view: FinancialSnapshotView = 'summary') {
  const prisma = getPrismaClient();
  if (view === 'finances') {
    const select = {
      computedAt: true, asOf: true, status: true, reportingCurrency: true,
      financialOverview: true, investmentPortfolio: true, accounts: true,
      transactionsSummary: true, meta: true, quality: true,
      // Carries each source's own observation time, which the overview reduces
      // to the newest one it displays.
      sourceObservations: true,
    } as const;
    const snapshot = await prisma.financialSummarySnapshot.findUnique({ where: { userId }, select });
    if (!snapshot || hasAccountDisplayBalances(snapshot as any)) return snapshot;

    const fullSnapshot = await prisma.financialSummarySnapshot.findUnique({ where: { userId } });
    if (!fullSnapshot) return null;
    const upgraded = withAccountDisplayBalances(fullSnapshot as any);
    const update = await prisma.financialSummarySnapshot.updateMany({
      where: { userId, computedAt: fullSnapshot.computedAt },
      data: { meta: upgraded.meta as any },
    });
    if (update.count === 0) {
      return prisma.financialSummarySnapshot.findUnique({ where: { userId }, select });
    }
    return {
      computedAt: fullSnapshot.computedAt,
      asOf: fullSnapshot.asOf,
      status: fullSnapshot.status,
      reportingCurrency: fullSnapshot.reportingCurrency,
      financialOverview: fullSnapshot.financialOverview,
      investmentPortfolio: fullSnapshot.investmentPortfolio,
      accounts: fullSnapshot.accounts,
      transactionsSummary: fullSnapshot.transactionsSummary,
      meta: upgraded.meta,
      quality: fullSnapshot.quality,
      sourceObservations: fullSnapshot.sourceObservations,
    };
  }

  const snapshot = await prisma.financialSummarySnapshot.findUnique({ where: { userId } });
  if (!snapshot || view === 'full') return snapshot;
  const { accounts: _accounts, holdings: _holdings, securities: _securities,
    transactions: _transactions, activities: _activities, ...summary } = snapshot as any;
  return summary;
}

export async function getFinancialSnapshotForAnalysis(
  userId: string,
  options: AnalysisSnapshotOptions = {}
): Promise<AnalysisFinancialSummarySnapshot | null> {
  const select: Record<string, boolean> = {
    computedAt: true, asOf: true, status: true, reportingCurrency: true,
    financialOverview: true, investmentPortfolio: true, transactionsSummary: true,
    quality: true, sourceObservations: true, meta: true,
  };
  if (options.includeAccounts) select.accounts = true;
  if (options.includeTransactions) select.transactions = true;
  if (options.includeInvestments) {
    select.holdings = true;
    select.securities = true;
  }
  return await getPrismaClient().financialSummarySnapshot.findUnique({
    where: { userId },
    select: select as any,
  }) as unknown as AnalysisFinancialSummarySnapshot | null;
}
