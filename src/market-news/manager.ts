import { PrismaClient } from '@prisma/client';
import { UserTier } from '../data/types';
import { MarketNewsAggregator } from './aggregator';
import { MarketNewsSynthesizer, MarketNewsContext } from './synthesizer';
import { MarketNewsData } from './aggregator';

export class MarketNewsManager {
  private aggregator: MarketNewsAggregator;
  private synthesizer: MarketNewsSynthesizer;
  public prisma: PrismaClient;
  
  constructor() {
    this.aggregator = new MarketNewsAggregator();
    this.synthesizer = new MarketNewsSynthesizer();
    this.prisma = new PrismaClient();
  }
  
  async updateMarketContext(tier: UserTier): Promise<void> {
    try {
      // Aggregate fresh market data
      const rawData = await this.aggregator.aggregateMarketData();
      
      // Synthesize into context
      const context = await this.synthesizer.synthesizeMarketContext(rawData, tier);
      
      // Save to database
      await this.saveMarketContext(context, rawData);
      
      console.log(`Market context updated for tier: ${tier}`);
    } catch (error) {
      console.error('Error updating market context:', error);
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
