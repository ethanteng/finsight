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
  
  /**
   * Tier-scoped evidence used for both synthesis and rawData persistence.
   * Callers that save market-news rows should persist this list (not the
   * unfiltered aggregate), so omitted points like a superseded FRED DGS10
   * do not linger in Premium rawData.
   */
  filterDataForTier(data: MarketNewsData[], tier: UserTier): MarketNewsData[] {
    switch (tier) {
      case UserTier.STARTER:
        return []; // No market news for starter tier (can be changed in future)
        
      case UserTier.STANDARD:
        return data.filter(d => 
          d.source === 'fred' || 
          d.source === 'brave_search' ||
          d.source === 'tiingo'
        );
        
      case UserTier.PREMIUM: {
        // Massive may return a partial Treasury curve. Only drop FRED's 10-year
        // point when Massive actually provides a finite 10-year yield, so Premium
        // never loses the maturity entirely on a sparse Massive row.
        const hasMassiveTenYearYield = data.some(item => {
          if (
            item.source !== 'massive'
            || item.type !== 'rate_information'
            || item.data?.symbol !== 'TREASURY_YIELDS'
          ) {
            return false;
          }
          const yields = item.data.yields;
          if (!this.isRecord(yields)) return false;
          const tenYear = yields['10_year'];
          return typeof tenYear === 'number' && Number.isFinite(tenYear);
        });
        const filtered = hasMassiveTenYearYield
          ? data.filter(item => !(
            item.source === 'fred'
            && item.type === 'economic_indicator'
            && item.data?.series === 'DGS10'
          ))
          : data;
        // Tiingo IEX is the fresher market observation. Keep Massive's unique
        // macro datasets while avoiding two SPY price rows in the same prompt.
        const hasTiingoSpy = filtered.some(item =>
          item.source === 'tiingo' && item.type === 'market_data' && item.data?.symbol === 'SPY'
        );
        return hasTiingoSpy
          ? filtered.filter(item => !(
              item.source === 'massive'
              && item.type === 'market_data'
              && item.data?.symbol === 'SPY'
            ))
          : filtered;
      }
        
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
        } else if (d.symbol === 'INFLATION_EXPECTATIONS' && this.isRecord(d.expectations)) {
          const formatted = this.formatPercentageRecord(d.expectations, {
            model_1_year: '1Y model',
            model_5_year: '5Y model',
            model_10_year: '10Y model',
            model_30_year: '30Y model',
            market_5_year: '5Y market',
            market_10_year: '10Y market',
            forward_years_5_to_10: '5Y-10Y forward',
          });
          if (formatted) {
            lines.push(`- ${item.source} | Inflation expectations (${d.date || 'date unavailable'}): ${formatted}`);
          }
        } else {
          lines.push(`- ${item.source} | ${JSON.stringify(d)}`);
        }
      } else if (item.type === 'rate_information') {
        if (this.isRecord(d.yields)) {
          const formatted = this.formatPercentageRecord(d.yields, {
            '1_month': '1M',
            '3_month': '3M',
            '6_month': '6M',
            '1_year': '1Y',
            '2_year': '2Y',
            '3_year': '3Y',
            '5_year': '5Y',
            '7_year': '7Y',
            '10_year': '10Y',
            '20_year': '20Y',
            '30_year': '30Y',
          });
          if (formatted) {
            lines.push(`- ${item.source} | U.S. Treasury yields (${d.date || 'date unavailable'}): ${formatted}`);
          }
        } else {
          lines.push(`- ${item.source}: ${JSON.stringify(item.data)}`);
        }
      } else if (item.type === 'market_data') {
        const price = d.closingPrice ?? d.currentPrice;
        const observationLabel = d.feedStatus === 'TIINGO_IEX' ? 'IEX last trade' : 'adjusted daily close';
        const parts = [`${d.symbol || 'Market'} ${observationLabel}: $${price ?? 'N/A'}`];
        if (d.date) parts.push(`on ${d.date}`);
        if (d.changePercent != null && Number.isFinite(Number(d.changePercent))) {
          parts.push(`(${Number(d.changePercent).toFixed(2)}% vs. prior trading day)`);
        }
        if (d.feedStatus === 'TIINGO_IEX') parts.push('[Tiingo IEX]');
        else if (d.feedStatus) parts.push(`[Massive status: ${d.feedStatus}]`);
        lines.push(`- ${item.source} | ${parts.join(' ')}`);
      } else if (item.type === 'news_article') {
        lines.push(`- ${item.source} | News: "${d.title || 'Untitled'}" - ${String(d.description || '').slice(0, 150)}...`);
      } else {
        lines.push(`- ${item.source}: ${JSON.stringify(item.data)}`);
      }
    }

    return lines.join('\n');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private formatPercentageRecord(
    values: Record<string, unknown>,
    labels: Record<string, string>,
  ): string {
    return Object.entries(labels)
      .flatMap(([key, label]) => {
        const value = values[key];
        return typeof value === 'number' && Number.isFinite(value)
          ? [`${label}: ${value.toFixed(2)}%`]
          : [];
      })
      .join(', ');
  }
  
  private getTierContext(tier: UserTier): string {
    switch (tier) {
      case UserTier.STARTER:
        return 'No market context available - focus on personal financial analysis';
      case UserTier.STANDARD:
        return 'Economic indicators and web context, plus Tiingo IEX broad-market quotes and market news';
      case UserTier.PREMIUM:
        return 'Scheduled context from FRED, Brave Search, and Tiingo IEX/news, plus Massive Treasury yield-curve and inflation-expectations data';
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
      }
    }

    return events;
  }
}
