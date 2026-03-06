import { GoogleGenerativeAI } from '@google/generative-ai';
import { UserTier } from '../data/types';
import { MarketNewsData } from './aggregator';
import crypto from 'crypto';

const GEMINI_API_KEY = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
const DEFAULT_MODEL = process.env.GEMINI_MARKET_SYNTHESIS_MODEL || 'gemini-2.5-flash';

export interface MarketNewsContext {
  id: string;
  contextText: string;
  dataSources: string[];
  keyEvents: string[];
  lastUpdate: Date;
  tier: UserTier;
}

let genAIClient: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAIClient) {
    if (!GEMINI_API_KEY) {
      throw new Error('GOOGLE_AI_API_KEY or GEMINI_API_KEY is required for market news synthesis.');
    }
    genAIClient = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return genAIClient;
}

export class MarketNewsSynthesizer {
  async synthesizeMarketContext(
    rawData: MarketNewsData[],
    tier: UserTier
  ): Promise<MarketNewsContext> {
    // Filter data based on tier access
    const tierData = this.filterDataForTier(rawData, tier);

    // Create synthesis prompt
    const prompt = this.buildSynthesisPrompt(tierData, tier);

    // Generate AI synthesis via Gemini
    const client = getClient();
    const model = client.getGenerativeModel({
      model: DEFAULT_MODEL,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1500
      }
    });

    const result = await model.generateContent(prompt);
    const contextText = result.response.text().trim() || '';
    
    // Extract key events and sources
    const keyEvents = this.extractKeyEvents(tierData);
    const dataSources = [...new Set(tierData.map(d => d.source))];
    
    return {
      id: crypto.randomUUID(),
      contextText,
      dataSources,
      keyEvents,
      lastUpdate: new Date(),
      tier
    };
  }
  
  private filterDataForTier(data: MarketNewsData[], tier: UserTier): MarketNewsData[] {
    switch (tier) {
      case UserTier.STARTER:
        return []; // No market news for starter tier (can be changed in future)
        
      case UserTier.STANDARD:
        return data.filter(d => 
          d.source === 'fred' || 
          d.source === 'brave_search'
        );
        
      case UserTier.PREMIUM:
        return data; // Full access to all data including complete Polygon.io suite
        
      default:
        return [];
    }
  }
  
  private buildSynthesisPrompt(data: MarketNewsData[], tier: UserTier): string {
    const tierContext = this.getTierContext(tier);
    
    return `You are a financial market analyst. Synthesize the following market data into a clear, actionable market context summary.

TIER CONTEXT: ${tierContext}

AVAILABLE DATA:
${data.map(d => `- ${d.source}: ${JSON.stringify(d.data)}`).join('\n')}

INSTRUCTIONS:
- Create a concise but comprehensive market summary (max 800 words)
- Focus on the most relevant and impactful market developments
- Include specific numbers, rates, and trends where available
- Highlight any significant changes or emerging patterns
- Use clear, professional language suitable for financial advice
- Structure the summary with clear sections (Economic Indicators, Market Trends, Key Developments)
- Avoid speculation - stick to factual information from the data

OUTPUT FORMAT:
ECONOMIC INDICATORS:
[Summary of economic data]

MARKET TRENDS:
[Current market trends and movements]

KEY DEVELOPMENTS:
[Most important recent developments]

MARKET OUTLOOK:
[Brief outlook based on current data]`;
  }
  
  private getTierContext(tier: UserTier): string {
    switch (tier) {
      case UserTier.STARTER:
        return 'No market context available - focus on personal financial analysis';
      case UserTier.STANDARD:
        return 'Basic economic indicators and general market trends from FRED and web search';
      case UserTier.PREMIUM:
        return 'Comprehensive market intelligence including real-time data, professional news, advanced analytics, and detailed market analysis from Polygon.io';
      default:
        return 'Standard market context';
    }
  }
  
  private extractKeyEvents(data: MarketNewsData[]): string[] {
    const events: string[] = [];
    
    for (const item of data) {
      if (item.type === 'economic_indicator') {
        const indicator = item.data;
        if (indicator.series === 'FEDFUNDS' && indicator.value > 5) {
          events.push(`Federal Reserve rate at ${indicator.value}% - high interest rate environment`);
        }
        if (indicator.series === 'CPIAUCSL' && indicator.value > 300) {
          events.push(`Inflation rate elevated at ${indicator.value} - cost of living concerns`);
        }
        if (indicator.series === 'MORTGAGE30US' && indicator.value > 7) {
          events.push(`Mortgage rates high at ${indicator.value}% - housing market impact`);
        }
      }
    }
    
    return events;
  }
}
