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

    // No market data for this tier - return fixed message without calling LLM
    // (tierContext is for LLM prompts only, not user-facing empty-state messages)
    if (tierData.length === 0) {
      return {
        id: crypto.randomUUID(),
        contextText: `ECONOMIC INDICATORS:\nNo market context available for this tier. Market data could not be fetched or is not configured.\n\nMARKET TRENDS:\nN/A\n\nKEY DEVELOPMENTS:\nN/A\n\nMARKET OUTLOOK:\nN/A`,
        dataSources: [],
        keyEvents: [],
        lastUpdate: new Date(),
        tier
      };
    }

    // Create synthesis prompt
    const prompt = this.buildSynthesisPrompt(tierData, tier);

    // Generate AI synthesis via Gemini
    const client = getClient();
    const model = client.getGenerativeModel({
      model: DEFAULT_MODEL,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 65536  // Model limit for gemini-2.5-flash; ensures full market context
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
    const formattedData = this.formatDataForPrompt(data);

    return `You are a financial market analyst. Synthesize the following market data into a clear, actionable market context summary.

TIER CONTEXT: ${tierContext}

AVAILABLE DATA (use ONLY this data - do not invent or assume values for missing indicators):
${formattedData}

INSTRUCTIONS:
- Create a concise but comprehensive market summary (max 800 words)
- Include EVERY data point provided above with its specific value - never leave blanks like "( )" or incomplete sentences
- For economic indicators: state the exact value and date (e.g., "Federal Funds Rate: 4.33% as of 2024-01-15")
- Only mention indicators that appear in the data - omit any that are not listed
- Focus on the most relevant and impactful market developments
- Use clear, professional language suitable for financial advice
- Complete every section fully - never truncate mid-sentence
- Avoid speculation - stick to factual information from the data

OUTPUT FORMAT (complete all sections):
ECONOMIC INDICATORS:
[Summary of economic data with specific values and dates]

MARKET TRENDS:
[Current market trends and movements]

KEY DEVELOPMENTS:
[Most important recent developments]

MARKET OUTLOOK:
[Brief outlook based on current data]`;
  }

  /** Format data in a clear, parseable way for the LLM (avoids raw JSON) */
  private formatDataForPrompt(data: MarketNewsData[]): string {
    const lines: string[] = [];

    for (const item of data) {
      const d = item.data as Record<string, unknown> | null;
      if (!d) continue;

      if (item.type === 'economic_indicator') {
        // FRED format: { series, name, value, date }
        if (d.series && d.value != null) {
          const units = d.unit === 'percent' ? '%' : d.unit === 'index' ? ' (index)' : '';
          lines.push(`- ${item.source} | ${d.name || d.series}: ${d.value}${units} (${d.date || 'N/A'})`);
        } else if (d.inflationContext) {
          lines.push(`- ${item.source} | ${d.inflationContext}`);
        } else if (d.expectationsContext) {
          lines.push(`- ${item.source} | ${d.expectationsContext}`);
        } else {
          lines.push(`- ${item.source} | ${JSON.stringify(d)}`);
        }
      } else if (item.type === 'rate_information') {
        if (d.rateContext) {
          lines.push(`- ${item.source} | ${d.rateContext}`);
        } else if (d.yields && typeof d.yields === 'object') {
          const yields = d.yields as Record<string, unknown>;
          lines.push(`- ${item.source} | Treasury Yields: ${JSON.stringify(yields)}`);
        } else {
          lines.push(`- ${item.source}: ${JSON.stringify(item.data)}`);
        }
      } else if (item.type === 'market_data') {
        const parts = [`${d.symbol || 'Market'}: $${d.currentPrice ?? 'N/A'}`];
        if (d.changePercent != null) parts.push(`(${Number(d.changePercent).toFixed(2)}% change)`);
        lines.push(`- ${item.source} | ${parts.join(' ')}`);
      } else if (item.type === 'news_article') {
        lines.push(`- ${item.source} | News: "${d.title || 'Untitled'}" - ${String(d.description || '').slice(0, 150)}...`);
      } else {
        lines.push(`- ${item.source}: ${JSON.stringify(item.data)}`);
      }
    }

    return lines.join('\n');
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
        const ind = item.data as Record<string, unknown>;
        // FRED format
        if (['DFF', 'FEDFUNDS'].includes(String(ind.series)) && Number(ind.value) > 5) {
          events.push(`Federal Reserve rate at ${ind.value}% - high interest rate environment`);
        }
        if (ind.series === 'CPIAUCSL' && Number(ind.value) > 3) {
          events.push(`Inflation rate elevated at ${ind.value}% year-over-year - cost of living concerns`);
        }
        if (ind.series === 'MORTGAGE30US' && Number(ind.value) > 7) {
          events.push(`Mortgage rates high at ${ind.value}% - housing market impact`);
        }
        // Polygon inflation format
        if (ind.cpi != null && Number(ind.cpi_year_over_year) > 3) {
          events.push(`Inflation year-over-year at ${Number(ind.cpi_year_over_year).toFixed(1)}% - cost of living concerns`);
        }
      }
    }

    return events;
  }
}
