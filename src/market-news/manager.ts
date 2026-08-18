import { PrismaClient } from '@prisma/client';
import { UserTier } from '../data/types';
import { getPrismaClient } from '../prisma-client';
import { MarketNewsAggregator } from './aggregator';
import { MarketNewsSynthesizer, MarketNewsContext } from './synthesizer';
import { MarketNewsData } from './aggregator';
import {
  acquireScheduledRefreshLease,
  completeScheduledRefreshLease,
  failScheduledRefreshLease,
  releaseScheduledRefreshLease,
} from './refresh-lease';

const MARKET_NEWS_REFRESH_JOB = 'market-news-refresh';
const MARKET_NEWS_REFRESH_INTERVAL_MS = 3.75 * 60 * 60 * 1000;
const MARKET_NEWS_REFRESH_LEASE_MS = 30 * 60 * 1000;
const ALL_MARKET_NEWS_TIERS: readonly UserTier[] = [
  UserTier.STARTER,
  UserTier.STANDARD,
  UserTier.PREMIUM,
];

function coversAllMarketNewsTiers(tiers: readonly UserTier[]): boolean {
  const unique = new Set(tiers);
  return ALL_MARKET_NEWS_TIERS.every((tier) => unique.has(tier));
}

export class MarketNewsManager {
  private aggregator: MarketNewsAggregator;
  private synthesizer: MarketNewsSynthesizer;
  public prisma: PrismaClient;

  constructor() {
    this.aggregator = new MarketNewsAggregator();
    this.synthesizer = new MarketNewsSynthesizer();
    // The shared client, not a new one. A manager is constructed per request in
    // the answer path, and its own PrismaClient was never disconnected — one
    // connection pool per question. That was survivable while market context was
    // reached by almost nothing; routing every retirement question here is what
    // would have turned it into refused connections.
    this.prisma = getPrismaClient();
  }
  
  async updateMarketContext(tier: UserTier): Promise<void> {
    await this.updateMarketContexts([tier]);
  }

  /**
   * Collect external market evidence once, then derive every tier's view from
   * that same timestamped batch. The previous cron called updateMarketContext
   * three times and repeated the six Brave searches for each tier.
   */
  async updateMarketContexts(tiers: readonly UserTier[]): Promise<void> {
    try {
      const rawData = await this.aggregator.aggregateMarketData();
      await Promise.all(Array.from(new Set(tiers)).map(async (tier) => {
        const context = await this.synthesizer.synthesizeMarketContext(rawData, tier);
        await this.saveMarketContext(context, rawData);
        console.log(`Market context updated for tier: ${tier}`);
      }));
    } catch (error) {
      console.error('Error updating market contexts:', error);
      throw error;
    }
  }

  /** Run one cluster-wide refresh, or report why another instance need not repeat it. */
  async refreshMarketContexts(
    tiers: readonly UserTier[],
    options: { force?: boolean } = {}
  ): Promise<{ refreshed: boolean; reason?: 'active_lease' | 'already_fresh' }> {
    const lease = await acquireScheduledRefreshLease({
      name: MARKET_NEWS_REFRESH_JOB,
      minimumIntervalMs: MARKET_NEWS_REFRESH_INTERVAL_MS,
      leaseDurationMs: MARKET_NEWS_REFRESH_LEASE_MS,
      force: options.force,
    });
    if (!lease.acquired) return { refreshed: false, reason: lease.reason };

    try {
      await this.updateMarketContexts(tiers);
      // Only a full-tier run advances the success window. A single-tier admin
      // force refresh still holds the cluster lease while it runs, but must not
      // mark the scheduled job fresh or sibling tiers stay stale until the
      // interval elapses.
      if (coversAllMarketNewsTiers(tiers)) {
        await completeScheduledRefreshLease(MARKET_NEWS_REFRESH_JOB, lease.ownerId);
      } else {
        await releaseScheduledRefreshLease(MARKET_NEWS_REFRESH_JOB, lease.ownerId);
      }
      return { refreshed: true };
    } catch (error) {
      await failScheduledRefreshLease(MARKET_NEWS_REFRESH_JOB, lease.ownerId, error).catch((leaseError) => {
        console.error('Failed to release market-news refresh lease:', leaseError);
      });
      throw error;
    }
  }
  
  async getMarketContext(tier: UserTier): Promise<string> {
    const context = await this.prisma.marketNewsContext.findFirst({
      where: {
        availableTiers: { has: tier },
        isActive: true
      },
      orderBy: { lastUpdate: 'desc' }
    });
    
    return context?.contextText || '';
  }
  
  async updateMarketContextManual(
    tier: UserTier, 
    newContext: string, 
    adminUser: string
  ): Promise<void> {
    // Create or update context with manual override
    await this.prisma.marketNewsContext.upsert({
      where: {
        id: `manual-${tier}` // Use a consistent ID for manual overrides
      },
      update: {
        contextText: newContext,
        manualOverride: true,
        lastEditedBy: adminUser,
        lastUpdate: new Date(),
        availableTiers: [tier]
      },
      create: {
        id: `manual-${tier}`,
        contextText: newContext,
        availableTiers: [tier],
        manualOverride: true,
        lastEditedBy: adminUser,
        dataSources: [],
        keyEvents: []
      }
    });
    
    // Log to history
    await this.logContextChange(tier, newContext, 'manual_edit', adminUser);
  }
  
  async getMarketContextHistory(tier: UserTier): Promise<any[]> {
    return await this.prisma.marketNewsHistory.findMany({
      where: {
        context: {
          availableTiers: { has: tier }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
  }
  
  private async saveMarketContext(
    context: MarketNewsContext, 
    rawData: MarketNewsData[]
  ): Promise<void> {
    await this.prisma.marketNewsContext.upsert({
      where: {
        id: `auto-${context.tier}` // Use a consistent ID for auto-generated contexts
      },
      update: {
        contextText: context.contextText,
        dataSources: context.dataSources,
        keyEvents: context.keyEvents,
        rawData: rawData as any,
        lastUpdate: new Date(),
        manualOverride: false
      },
      create: {
        id: `auto-${context.tier}`,
        contextText: context.contextText,
        dataSources: context.dataSources,
        keyEvents: context.keyEvents,
        rawData: rawData as any,
        availableTiers: [context.tier]
      }
    });
    
    // Log to history
    await this.logContextChange(context.tier, context.contextText, 'auto_update');
  }
  
  private async logContextChange(
    tier: UserTier,
    contextText: string,
    changeType: string,
    changedBy?: string
  ): Promise<void> {
    // Find the context record to get its ID
    const context = await this.prisma.marketNewsContext.findFirst({
      where: {
        availableTiers: { has: tier }
      },
      orderBy: { lastUpdate: 'desc' }
    });
    
    if (context) {
      await this.prisma.marketNewsHistory.create({
        data: {
          contextId: context.id,
          contextText,
          dataSources: context.dataSources,
          keyEvents: context.keyEvents,
          changeType,
          changedBy
        }
      });
    }
  }
}
