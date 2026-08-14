import { SummaryCacheService } from './summary-cache-service';

export interface FinancialOverview {
  reportingCurrency?: string;
  netWorth: number;
  totalCash: number;
  totalInvestments: number;
  totalDebt: number;
  homeValue: number | null;
  totalAssets?: number;
  totalLiabilities?: number;
}

export interface InvestmentPortfolio {
  reportingCurrency?: string;
  totalValue: number;
  holdingCount?: number;
  holdingsCount?: number;
  assetAllocation: Array<{
    type: string;
    value: number;
    percentage: number;
  }>;
  securityCount: number;
}

export interface FinancialSummary {
  financialOverview: FinancialOverview;
  investmentPortfolio: InvestmentPortfolio;
  lastUpdated: Date;
  asOf: Date | null;
  status: string | null;
  reportingCurrency: string;
}

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function toFinancialSummary(snapshot: any): FinancialSummary {
  return {
    financialOverview: snapshot.financialOverview as FinancialOverview,
    investmentPortfolio: snapshot.investmentPortfolio as InvestmentPortfolio,
    lastUpdated: new Date(snapshot.computedAt),
    asOf: snapshot.asOf ? new Date(snapshot.asOf) : null,
    status: snapshot.status || null,
    reportingCurrency: snapshot.reportingCurrency || 'USD',
  };
}

/**
 * Compatibility facade for legacy callers. SummaryCacheService is the only
 * fetch, calculation, and persistence path; this class no longer maintains a
 * second financial-summary implementation.
 */
export class FinancialSummaryService {
  isSummaryStale(lastUpdated: Date | null): boolean {
    if (!lastUpdated) return true;
    return Date.now() - lastUpdated.getTime() > STALE_THRESHOLD_MS;
  }

  async getUserSummary(userId: string): Promise<FinancialSummary> {
    const snapshot = await SummaryCacheService.getLatestSnapshot(userId, 'summary');
    if (!snapshot) return this.refreshUserSummary(userId);

    const summary = toFinancialSummary(snapshot);
    if (summary.status !== 'current' || this.isSummaryStale(summary.lastUpdated)) {
      setImmediate(() => {
        SummaryCacheService.computeForUser(userId, { categorize: false }).catch(error => {
          console.error(`Failed to refresh canonical snapshot for user ${userId}:`, error);
        });
      });
    }
    return summary;
  }

  async refreshUserSummary(userId: string): Promise<FinancialSummary> {
    try {
      const snapshot = await SummaryCacheService.computeForUser(userId, { categorize: false });
      return toFinancialSummary(snapshot);
    } catch (error) {
      const staleSnapshot = await SummaryCacheService.getLatestSnapshot(userId, 'summary');
      if (staleSnapshot) return toFinancialSummary(staleSnapshot);
      throw new Error(
        `Failed to refresh summary and no cached data is available: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
}

export default FinancialSummaryService;
