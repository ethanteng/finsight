import { PrismaClient } from '@prisma/client';
import type { CanonicalFinancialOverview, SnapshotStatus } from '../domain/financial-truth';

// Lazy Prisma to avoid multiple instances during different runtimes
let prisma: PrismaClient | null = null;
const getPrisma = (): PrismaClient => {
  if (!prisma) prisma = new PrismaClient();
  return prisma!;
};

export interface CanonicalHistoryInput {
  computedAt: Date;
  asOf: Date | null;
  status: SnapshotStatus;
  reportingCurrency: string;
  financialOverview: CanonicalFinancialOverview;
}

export interface HistoricalSnapshot {
  computedAt: Date;
  asOf: Date | null;
  status: string | null;
  reportingCurrency: string;
  netWorth: number;
  totalCash: number;
  totalInvestments: number;
  totalDebt: number;
  homeValue: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
}

function sameDate(left: Date | null, right: Date | null): boolean {
  return (
    (left === null && right === null) ||
    (left !== null && right !== null && left.getTime() === right.getTime())
  );
}

export class FinancialHistoryService {
  /**
   * Save a historical snapshot of financial metrics
   */
  static async saveHistoricalSnapshot(
    userId: string,
    snapshot: CanonicalHistoryInput
  ): Promise<void> {
    const prisma = getPrisma();
    const overview = snapshot.financialOverview;
    
    try {
      const latest = await prisma.financialSummaryHistory.findFirst({
        where: { userId },
        orderBy: { computedAt: 'desc' },
      });
      if (
        latest &&
        sameDate(latest.asOf, snapshot.asOf) &&
        latest.status === snapshot.status &&
        latest.reportingCurrency === snapshot.reportingCurrency &&
        latest.netWorth === overview.netWorth &&
        latest.totalCash === overview.totalCash &&
        latest.totalInvestments === overview.totalInvestments &&
        latest.totalDebt === overview.totalDebt &&
        latest.homeValue === overview.homeValue &&
        latest.totalAssets === overview.totalAssets &&
        latest.totalLiabilities === overview.totalLiabilities
      ) {
        return;
      }

      await prisma.financialSummaryHistory.create({
        data: {
          userId,
          computedAt: snapshot.computedAt,
          asOf: snapshot.asOf,
          status: snapshot.status,
          reportingCurrency: snapshot.reportingCurrency,
          netWorth: overview.netWorth,
          totalCash: overview.totalCash,
          totalInvestments: overview.totalInvestments,
          totalDebt: overview.totalDebt,
          homeValue: overview.homeValue,
          totalAssets: overview.totalAssets,
          totalLiabilities: overview.totalLiabilities,
        },
      });
    } catch (error) {
      // Log error but don't throw - historical snapshot failures shouldn't break main flow
      console.error(`Failed to save historical snapshot for user ${userId}:`, error);
    }
  }

  /**
   * Get historical snapshots for a user
   */
  static async getHistoricalSnapshots(
    userId: string,
    startDate?: Date,
    endDate?: Date,
    limit?: number
  ): Promise<HistoricalSnapshot[]> {
    const prisma = getPrisma();
    
    const where: any = { userId };
    
    if (startDate || endDate) {
      where.computedAt = {};
      if (startDate) {
        where.computedAt.gte = startDate;
      }
      if (endDate) {
        where.computedAt.lte = endDate;
      }
    }
    
    const snapshots = await prisma.financialSummaryHistory.findMany({
      where,
      orderBy: {
        computedAt: 'desc',
      },
      take: limit,
    });
    
    return snapshots.map((snapshot: {
      computedAt: Date;
      asOf: Date | null;
      status: string | null;
      reportingCurrency: string;
      netWorth: number;
      totalCash: number;
      totalInvestments: number;
      totalDebt: number;
      homeValue: number | null;
      totalAssets: number | null;
      totalLiabilities: number | null;
    }) => ({
      computedAt: snapshot.computedAt,
      asOf: snapshot.asOf,
      status: snapshot.status,
      reportingCurrency: snapshot.reportingCurrency,
      netWorth: snapshot.netWorth,
      totalCash: snapshot.totalCash,
      totalInvestments: snapshot.totalInvestments,
      totalDebt: snapshot.totalDebt,
      homeValue: snapshot.homeValue,
      totalAssets: snapshot.totalAssets,
      totalLiabilities: snapshot.totalLiabilities,
    }));
  }

  /**
   * Get the most recent historical snapshot for a user
   */
  static async getLatestSnapshot(userId: string): Promise<HistoricalSnapshot | null> {
    const prisma = getPrisma();
    
    const snapshot = await prisma.financialSummaryHistory.findFirst({
      where: { userId },
      orderBy: {
        computedAt: 'desc',
      },
    });
    
    if (!snapshot) {
      return null;
    }
    
    return {
      computedAt: snapshot.computedAt,
      asOf: snapshot.asOf,
      status: snapshot.status,
      reportingCurrency: snapshot.reportingCurrency,
      netWorth: snapshot.netWorth,
      totalCash: snapshot.totalCash,
      totalInvestments: snapshot.totalInvestments,
      totalDebt: snapshot.totalDebt,
      homeValue: snapshot.homeValue,
      totalAssets: snapshot.totalAssets,
      totalLiabilities: snapshot.totalLiabilities,
    };
  }
}

export default FinancialHistoryService;
