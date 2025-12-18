import { PrismaClient } from '@prisma/client';

// Lazy Prisma to avoid multiple instances during different runtimes
let prisma: PrismaClient | null = null;
const getPrisma = (): PrismaClient => {
  if (!prisma) prisma = new PrismaClient();
  return prisma!;
};

export interface FinancialOverview {
  netWorth: number;
  totalCash: number;
  totalInvestments: number;
  totalDebt: number;
  homeValue: number | null;
}

export interface HistoricalSnapshot {
  computedAt: Date;
  netWorth: number;
  totalCash: number;
  totalInvestments: number;
  totalDebt: number;
  homeValue: number | null;
}

export class FinancialHistoryService {
  /**
   * Save a historical snapshot of financial metrics
   */
  static async saveHistoricalSnapshot(
    userId: string,
    financialOverview: FinancialOverview
  ): Promise<void> {
    const prisma = getPrisma();
    
    try {
      await prisma.financialSummaryHistory.create({
        data: {
          userId,
          computedAt: new Date(),
          netWorth: financialOverview.netWorth,
          totalCash: financialOverview.totalCash,
          totalInvestments: financialOverview.totalInvestments,
          totalDebt: financialOverview.totalDebt,
          homeValue: financialOverview.homeValue ?? null,
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
    
    return snapshots.map((snapshot) => ({
      computedAt: snapshot.computedAt,
      netWorth: snapshot.netWorth,
      totalCash: snapshot.totalCash,
      totalInvestments: snapshot.totalInvestments,
      totalDebt: snapshot.totalDebt,
      homeValue: snapshot.homeValue,
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
      netWorth: snapshot.netWorth,
      totalCash: snapshot.totalCash,
      totalInvestments: snapshot.totalInvestments,
      totalDebt: snapshot.totalDebt,
      homeValue: snapshot.homeValue,
    };
  }
}

export default FinancialHistoryService;
