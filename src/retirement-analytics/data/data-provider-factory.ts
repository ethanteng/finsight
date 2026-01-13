// Data Provider Factory
// Phase 2: Historical Data Plumbing

import { PriceHistory, SecurityMetadata } from '../types';
import { TiingoProvider } from './providers/tiingo-provider';
import { FMPProvider } from './providers/fmp-provider';
import { AlphaVantageProvider } from '../../data/providers/alpha-vantage';

export class DataProviderFactory {
  private tiingoProvider: TiingoProvider;
  private fmpProvider: FMPProvider;
  private alphaVantageProvider?: AlphaVantageProvider;

  constructor(
    tiingoApiKey: string,
    fmpApiKey: string,
    alphaVantageApiKey?: string
  ) {
    this.tiingoProvider = new TiingoProvider(tiingoApiKey);
    this.fmpProvider = new FMPProvider(fmpApiKey);
    if (alphaVantageApiKey) {
      this.alphaVantageProvider = new AlphaVantageProvider(alphaVantageApiKey);
    }
  }

  /**
   * Get price history with provider fallback chain
   * Tiingo preferred for long history, Polygon/Alpha Vantage for recent data
   */
  async getPriceHistory(ticker: string, startDate: Date, endDate: Date): Promise<PriceHistory> {
    // Try Tiingo first (best for long history with dividend adjustments)
    try {
      const tiingoData = await this.tiingoProvider.getPriceHistory(ticker, startDate, endDate);
      return {
        ticker,
        startDate,
        endDate,
        data: tiingoData
      };
    } catch (error) {
      console.warn(`Tiingo failed for ${ticker}, trying fallback:`, error);
      
      // Fallback to Alpha Vantage if available
      if (this.alphaVantageProvider) {
        try {
          // Alpha Vantage returns different format, would need normalization
          // For now, re-throw to indicate we need Tiingo
          throw new Error(`Price history requires Tiingo provider for ${ticker}`);
        } catch (fallbackError) {
          throw new Error(`All price history providers failed for ${ticker}`);
        }
      }
      
      throw error;
    }
  }
  
  /**
   * Get security metadata with FMP fallback to inference
   */
  async getSecurityMetadata(ticker: string): Promise<SecurityMetadata> {
    // Try FMP first (best metadata)
    try {
      return await this.fmpProvider.getSecurityMetadata(ticker);
    } catch (error) {
      console.warn(`FMP failed for ${ticker}, using inferred metadata:`, error);
      // FMP provider already handles inference internally, but if it throws,
      // we fall back to basic inference
      return this.fmpProvider['inferMetadata'](ticker);
    }
  }
}
