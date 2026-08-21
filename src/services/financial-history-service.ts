import { PrismaClient } from '@prisma/client';
import type { CanonicalFinancialOverview, SnapshotStatus } from '../domain/financial-truth';
import {
  calendarDateInTimeZone,
  normalizeTimeZone,
  observationDateForCalendarDate,
} from '../domain/time-zone';

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

export type MaterialHistoryReason =
  | 'account-sync'
  | 'manual-account-created'
  | 'manual-account-updated'
  | 'manual-account-deleted'
  | 'snaptrade-account-deleted'
  /// One brokerage authorization removed, as opposed to the whole SnapTrade
  /// registration: the user's other institutions survive, so the net-worth move
  /// this records is a partial removal rather than the loss of every brokerage.
  | 'snaptrade-connection-disconnected'
  /// One Plaid Item revoked, as opposed to every connection: the user's other
  /// banks survive, so this records a partial removal rather than a full wipe.
  | 'plaid-connection-disconnected'
  /// Every connection removed at once, across both providers, without the user's
  /// account being deleted -- a different net-worth event from losing one link.
  | 'all-connections-disconnected'
  | 'home-value-updated'
  | 'home-value-removed'
  | 'home-value-refreshed'
  | 'home-value-override-set'
  | 'home-value-override-removed'
  | 'user-refresh';

export type HistoryWriteIntent =
  | { kind: 'daily'; reason?: string }
  | { kind: 'material'; reason: MaterialHistoryReason }
  | { kind: 'none' };

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
  observationDate: Date | null;
  observationKind: string;
  observationReason: string | null;
  timeZone: string;
}

function sameDate(left: Date | null, right: Date | null): boolean {
  return (
    (left === null && right === null) ||
    (left !== null && right !== null && left.getTime() === right.getTime())
  );
}

function isUniqueConstraintError(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function isOlderThanExisting(
  existing: Record<string, unknown> | null,
  snapshot: CanonicalHistoryInput
): boolean {
  return (
    existing?.computedAt instanceof Date &&
    existing.computedAt.getTime() > snapshot.computedAt.getTime()
  );
}

function hasSameCanonicalValues(
  existing: Record<string, unknown> | null,
  snapshot: CanonicalHistoryInput
): boolean {
  if (!existing) return false;
  const overview = snapshot.financialOverview;
  return (
    sameDate(existing.asOf instanceof Date ? existing.asOf : null, snapshot.asOf) &&
    existing.status === snapshot.status &&
    existing.reportingCurrency === snapshot.reportingCurrency &&
    existing.netWorth === overview.netWorth &&
    existing.totalCash === overview.totalCash &&
    existing.totalInvestments === overview.totalInvestments &&
    existing.totalDebt === overview.totalDebt &&
    existing.homeValue === overview.homeValue &&
    existing.totalAssets === overview.totalAssets &&
    existing.totalLiabilities === overview.totalLiabilities
  );
}

function hasSameFinancialValues(
  existing: Record<string, unknown> | null,
  snapshot: CanonicalHistoryInput
): boolean {
  if (!existing) return false;
  const overview = snapshot.financialOverview;
  return (
    existing.reportingCurrency === snapshot.reportingCurrency &&
    existing.netWorth === overview.netWorth &&
    existing.totalCash === overview.totalCash &&
    existing.totalInvestments === overview.totalInvestments &&
    existing.totalDebt === overview.totalDebt &&
    existing.homeValue === overview.homeValue &&
    existing.totalAssets === overview.totalAssets &&
    existing.totalLiabilities === overview.totalLiabilities
  );
}

function canonicalHistoryData(
  userId: string,
  snapshot: CanonicalHistoryInput,
  fields: {
    observationDate: Date;
    observationKind: 'daily' | 'material';
    observationReason: string | null;
    timeZone: string;
    dailyKey: string | null;
  }
) {
  const overview = snapshot.financialOverview;
  return {
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
    ...fields,
  };
}

export class FinancialHistoryService {
  /**
   * Save a historical snapshot of financial metrics
   */
  static async saveHistoricalSnapshot(
    userId: string,
    snapshot: CanonicalHistoryInput,
    intent: HistoryWriteIntent = { kind: 'daily' }
  ): Promise<void> {
    if (intent.kind === 'none') return;
    const prisma = getPrisma();

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { timeZone: true },
      });
      const timeZone = normalizeTimeZone(user?.timeZone);
      const calendarDate = calendarDateInTimeZone(snapshot.computedAt, timeZone);
      const observationDate = observationDateForCalendarDate(calendarDate);
      const dailyKey = `${userId}:${calendarDate}`;
      const [existingDaily, latest] = await Promise.all([
        prisma.financialSummaryHistory.findUnique({ where: { dailyKey } }),
        intent.kind === 'material'
          ? prisma.financialSummaryHistory.findFirst({
              where: { userId, observationKind: { in: ['daily', 'material'] } },
              orderBy: { computedAt: 'desc' },
            })
          : Promise.resolve(null),
      ]);

      if (
        !hasSameCanonicalValues(existingDaily, snapshot) &&
        !isOlderThanExisting(existingDaily, snapshot)
      ) {
        const dailyData = canonicalHistoryData(userId, snapshot, {
          observationDate,
          observationKind: 'daily',
          observationReason: intent.kind === 'material' ? intent.reason : intent.reason || null,
          timeZone,
          dailyKey,
        });
        const updateDailyIfCurrent = () => prisma.financialSummaryHistory.updateMany({
          where: { dailyKey, computedAt: { lte: snapshot.computedAt } },
          data: dailyData,
        });

        if (existingDaily) {
          // The computedAt predicate makes this update safe if a newer
          // computation wins the race after the read above.
          await updateDailyIfCurrent();
        } else {
          try {
            await prisma.financialSummaryHistory.create({ data: dailyData });
          } catch (error) {
            if (!isUniqueConstraintError(error)) throw error;

            // Another computation created this day's row first. Update it
            // only when this snapshot is at least as recent.
            await updateDailyIfCurrent();
          }
        }
      }

      if (intent.kind === 'material' && latest && !hasSameFinancialValues(latest, snapshot)) {
        await prisma.financialSummaryHistory.create({
          data: canonicalHistoryData(userId, snapshot, {
            observationDate,
            observationKind: 'material',
            observationReason: intent.reason,
            timeZone,
            dailyKey: null,
          }),
        });
      }
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
    limit?: number,
    includeMaterial = false
  ): Promise<HistoricalSnapshot[]> {
    const prisma = getPrisma();
    
    const where: any = {
      userId,
      observationKind: includeMaterial ? { in: ['daily', 'material'] } : 'daily',
    };
    
    if (startDate || endDate) {
      where.observationDate = {};
      if (startDate) {
        where.observationDate.gte = startDate;
      }
      if (endDate) {
        where.observationDate.lte = endDate;
      }
    }
    
    const snapshots = await prisma.financialSummaryHistory.findMany({
      where,
      orderBy: [
        { observationDate: 'desc' },
        { computedAt: 'desc' },
      ],
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
      observationDate: Date | null;
      observationKind: string;
      observationReason: string | null;
      timeZone: string;
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
      observationDate: snapshot.observationDate,
      observationKind: snapshot.observationKind,
      observationReason: snapshot.observationReason,
      timeZone: snapshot.timeZone,
    }));
  }

  /**
   * Get the most recent historical snapshot for a user
   */
  static async getLatestSnapshot(userId: string): Promise<HistoricalSnapshot | null> {
    const prisma = getPrisma();
    
    const snapshot = await prisma.financialSummaryHistory.findFirst({
      where: { userId, observationKind: { in: ['daily', 'material'] } },
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
      observationDate: snapshot.observationDate,
      observationKind: snapshot.observationKind,
      observationReason: snapshot.observationReason,
      timeZone: snapshot.timeZone,
    };
  }
}

export default FinancialHistoryService;
