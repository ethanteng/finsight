import { PrismaClient } from '@prisma/client';
import { UserTier } from '../data/types';
import { getPrismaClient } from '../prisma-client';
import { MarketNewsAggregator } from './aggregator';
import {
  MarketNewsSynthesizer,
  MarketNewsContext,
  hasMassiveTenYearYield,
} from './synthesizer';
import { MarketNewsData } from './aggregator';
import {
  acquireScheduledRefreshLease,
  completeScheduledRefreshLease,
  failScheduledRefreshLease,
  releaseScheduledRefreshLease,
} from './refresh-lease';

const MARKET_NEWS_REFRESH_JOB = 'market-news-refresh';
// The macro baseline every non-starter answer quotes. Supporting series
// (unemployment, credit-card APR, CD rates) enrich the summary but their
// absence does not make the context materially wrong, so they stay optional.
const REQUIRED_FRED_SERIES: readonly string[] = ['CPIAUCSL', 'DFF'];
// The macro datasets no other configured provider supplies. Massive's SPY bar
// is deliberately absent: Premium drops it whenever Tiingo carries the same
// quote, so requiring it would fail a refresh over evidence Premium discards.
const REQUIRED_MASSIVE_DATASETS: readonly string[] = ['TREASURY_YIELDS', 'INFLATION_EXPECTATIONS'];
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

export interface MarketContextObservation {
  id: string;
  tier: UserTier;
  contextText: string;
  lastUpdate: Date;
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
      const tierEvidence = Array.from(new Set(tiers)).map((tier) => {
        const tierRawData = this.synthesizer.filterDataForTier(rawData, tier);
        // Validate provider coverage against the shared source batch. Premium's
        // tier filter intentionally removes a duplicate FRED DGS10 row when
        // Massive has the same maturity, which must not be mistaken for a FRED
        // outage.
        this.validateRefreshEvidence(tier, rawData);
        return { tier, tierRawData };
      });
      const preparedContexts = await Promise.all(tierEvidence.map(async ({ tier, tierRawData }) => {
        const context = await this.synthesizer.synthesizeMarketContext(rawData, tier);
        if (!context.contextText.trim()) {
          throw new Error(`Refusing to save an empty ${tier} market context`);
        }
        return { tier, tierRawData, context };
      }));

      // Validate every requested tier before writing any of them. A provider
      // outage must leave the last-known-good rows intact instead of replacing
      // them with a plausible-looking empty or materially incomplete summary.
      await Promise.all(preparedContexts.map(async ({ tier, tierRawData, context }) => {
        await this.saveMarketContext(context, tierRawData);
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
    options: { force?: boolean; clearManualOverride?: boolean } = {}
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
      // An admin asking to refresh a tier is asking to see the refreshed text.
      // Without this the manual row keeps outranking the new automatic one and
      // the admin UI reports a successful refresh nobody can observe.
      if (options.clearManualOverride) {
        await this.clearManualOverrides(tiers);
      }
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
  
  /**
   * The row every reader must resolve to. A manual override outranks a newer
   * automatic row, so admin edits stay authoritative until an admin-initiated
   * refresh retires them.
   */
  async getActiveMarketContextRecord(tier: UserTier) {
    return this.prisma.marketNewsContext.findFirst({
      where: {
        availableTiers: { has: tier },
        isActive: true
      },
      orderBy: [
        { manualOverride: 'desc' },
        { lastUpdate: 'desc' },
      ]
    });
  }

  async getMarketContext(tier: UserTier): Promise<string> {
    return (await this.getMarketContextObservation(tier))?.contextText || '';
  }

  async getMarketContextObservation(tier: UserTier): Promise<MarketContextObservation | null> {
    const context = await this.getActiveMarketContextRecord(tier);
    if (!context) return null;
    return {
      id: context.id,
      tier,
      contextText: context.contextText,
      lastUpdate: context.lastUpdate,
    };
  }

  /**
   * Retire the manual rows for these tiers so the automatic context is served
   * again. The row is kept (its history references it) and a later manual edit
   * reactivates it.
   */
  private async clearManualOverrides(tiers: readonly UserTier[]): Promise<void> {
    const cleared = await this.prisma.marketNewsContext.updateMany({
      where: {
        id: { in: Array.from(new Set(tiers)).map(tier => `manual-${tier}`) },
        isActive: true,
      },
      data: { isActive: false },
    });
    if (cleared.count > 0) {
      console.log(`Cleared ${cleared.count} manual market-context override(s)`);
    }
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
        // A previous refresh may have retired this row; an explicit edit
        // reinstates it.
        isActive: true,
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
    await this.logContextChange(`manual-${tier}`, newContext, 'manual_edit', adminUser);
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
    await this.logContextChange(`auto-${context.tier}`, context.contextText, 'auto_update');
  }

  /**
   * Every provider here tolerates partial endpoint failure: FRED fetches each
   * series independently, Massive aggregates three separate endpoints, and
   * Tiingo splits quotes from news. A source name in the batch therefore proves
   * nothing about what the batch contains, so require the datasets themselves.
   */
  private validateRefreshEvidence(
    tier: UserTier,
    rawData: MarketNewsData[]
  ): void {
    // Starter intentionally has no market-news entitlement.
    if (tier === UserTier.STARTER) return;

    const missing: string[] = [];
    const fredSeries = new Set(
      rawData
        .filter(item => item.source === 'fred')
        .map(item => (typeof item.data?.series === 'string' ? item.data.series : ''))
    );
    for (const seriesId of REQUIRED_FRED_SERIES) {
      if (!fredSeries.has(seriesId)) missing.push(`fred:${seriesId}`);
    }

    // A 10-year yield is required, but either provider may supply it: Premium's
    // tier filter drops FRED's DGS10 exactly when Massive carries the maturity.
    if (!fredSeries.has('DGS10') && !hasMassiveTenYearYield(rawData)) {
      missing.push('treasury-10y');
    }

    if (!rawData.some(item => (
      (item.source === 'tiingo' || item.source === 'brave_search') && item.type === 'news_article'
    ))) {
      missing.push('news:tiingo-or-brave_search');
    }

    const massiveConfigured = Boolean(
      (process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || '').trim()
    );
    if (tier === UserTier.PREMIUM && massiveConfigured) {
      for (const symbol of REQUIRED_MASSIVE_DATASETS) {
        if (!rawData.some(item => item.source === 'massive' && item.data?.symbol === symbol)) {
          missing.push(`massive:${symbol}`);
        }
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Refusing to replace ${tier} market context; missing required evidence: ${missing.join(', ')}`
      );
    }
  }
  
  private async logContextChange(
    contextId: string,
    contextText: string,
    changeType: string,
    changedBy?: string
  ): Promise<void> {
    const context = await this.prisma.marketNewsContext.findUnique({
      where: { id: contextId }
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
