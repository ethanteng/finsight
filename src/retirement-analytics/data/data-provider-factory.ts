// Data Provider Factory
// Phase 2: Historical Data Plumbing

import { PriceHistory, SecurityMetadata } from '../types';
import { TiingoProvider } from './providers/tiingo-provider';
import { FMP_METADATA_VERSION, FMPProvider } from './providers/fmp-provider';
import { dbCache } from './db-cache';

const DEFAULT_FMP_METADATA_CONCURRENCY = 3;

function fmpMetadataConcurrency(): number {
  const configured = Number.parseInt(process.env.FMP_METADATA_CONCURRENCY || '', 10);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, 10)
    : DEFAULT_FMP_METADATA_CONCURRENCY;
}

async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      await mapper(item);
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) },
    () => worker(),
  ));
}

export class DataProviderFactory {
  private tiingoProvider: TiingoProvider;
  private fmpProvider: FMPProvider;
  private readonly fmpConfigured: boolean;

  constructor(
    tiingoApiKey: string,
    fmpApiKey: string
  ) {
    this.tiingoProvider = new TiingoProvider(tiingoApiKey);
    this.fmpProvider = new FMPProvider(fmpApiKey);
    this.fmpConfigured = Boolean(fmpApiKey.trim() && !fmpApiKey.startsWith('test_'));
  }

  /**
   * Get price history with provider fallback chain
   * Tiingo is the configured provider for adjusted security price history.
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
      console.warn(`Tiingo failed for ${ticker}:`, error);
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

  /**
   * Get security metadata for multiple tickers with a single DB lookup, then
   * fetch only uncached tickers from the FMP API and persist them in one batch
   * transaction — avoids N+1 INSERT/SELECT queries on security_metadata.
   */
  async getSecurityMetadataBatch(tickers: string[]): Promise<Map<string, SecurityMetadata>> {
    const result = new Map<string, SecurityMetadata>();
    if (tickers.length === 0) return result;

    // One SELECT for all tickers
    const cached = await dbCache.getSecurityMetadataBatch(tickers);
    const uncached: string[] = [];

    for (const ticker of tickers) {
      const hit = cached.get(ticker);
      if (
        hit
        && hit.metadataVersion === FMP_METADATA_VERSION
        && (hit.provider !== 'inferred' || !this.fmpConfigured)
      ) {
        result.set(ticker, hit);
      } else {
        uncached.push(ticker);
      }
    }

    if (uncached.length === 0) return result;

    // Each ticker may fan out across multiple Starter endpoints. Bound ticker
    // concurrency so a large portfolio cannot burst the provider after a cold cache.
    const fetched: Array<{ ticker: string; metadata: SecurityMetadata; provider: string }> = [];
    await mapWithConcurrency(
      uncached,
      fmpMetadataConcurrency(),
      async (ticker) => {
        try {
          const metadata = await this.fmpProvider.getSecurityMetadata(ticker, {
            persistToDatabase: false,
            skipDatabaseLookup: true
          });
          result.set(ticker, metadata);
          fetched.push({ ticker, metadata, provider: metadata.provider });
        } catch (error) {
          console.warn(`FMP batch: failed for ${ticker}:`, error);
          const inferred = this.fmpProvider['inferMetadata'](ticker);
          result.set(ticker, inferred);
          fetched.push({ ticker, metadata: inferred, provider: 'inferred' });
        }
      },
    );

    // One batch INSERT/UPDATE for all newly-fetched records
    if (fetched.length > 0) {
      await dbCache.saveSecurityMetadataBatch(fetched).catch((err) => {
        console.warn('Failed to batch-save security metadata:', err);
      });
    }

    return result;
  }
}
