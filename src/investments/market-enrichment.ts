import { TiingoIexQuote, TiingoProvider } from '../data/providers/tiingo';
import type { Holding, Security } from '../services/financial-data-service';
import { DataProviderFactory } from '../retirement-analytics/data/data-provider-factory';
import { looksLikeMutualFundTicker } from '../retirement-analytics/data/providers/fmp-provider';
import type { SecurityMetadata } from '../retirement-analytics/types';
import type { InvestmentExternalData } from '../openai/types';

const MAX_ENRICHED_SECURITIES = 12;
const MAX_HISTORY_SECURITIES = 8;

function configuredKey(value: string | undefined): string | undefined {
  const key = value?.trim();
  return key && !key.startsWith('test_') ? key : undefined;
}

/**
 * Enrich the largest portfolio positions using only endpoints included in FMP
 * Starter and Tiingo Power. Broker values remain canonical; Tiingo quotes are
 * explicitly supplemental market observations.
 */
export async function enrichInvestmentSnapshot(
  holdings: Holding[],
  securities: Security[],
): Promise<InvestmentExternalData | undefined> {
  const fmpKey = configuredKey(process.env.FMP_API_KEY);
  const tiingoKey = configuredKey(process.env.TIINGO_API_KEY);
  if (!fmpKey && !tiingoKey) return undefined;

  const securityMap = new Map(securities.map(security => [security.security_id, security]));
  const positions = holdings
    .flatMap(holding => {
      const security = securityMap.get(holding.security_id);
      const ticker = (security?.ticker_symbol || holding.ticker_symbol || '').trim().toUpperCase();
      return ticker && ticker.length <= 10
        ? [{ ticker, name: security?.name || holding.security_name, value: holding.institution_value || 0 }]
        : [];
    })
    .sort((left, right) => right.value - left.value);

  const positionByTicker = new Map<string, typeof positions[number]>();
  for (const position of positions) {
    const existing = positionByTicker.get(position.ticker);
    positionByTicker.set(position.ticker, existing
      ? { ...existing, value: existing.value + position.value }
      : position);
  }
  const selected = [...positionByTicker.values()]
    .sort((left, right) => right.value - left.value)
    .slice(0, MAX_ENRICHED_SECURITIES);
  if (!selected.length) return undefined;
  const tickers = selected.map(position => position.ticker);
  // Mutual funds publish one daily NAV and are not IEX-traded. Their Tiingo
  // EOD history is still useful, but including them in the IEX batch can make
  // the whole quote request fail on some symbols. Match only the five/six
  // character mutual-fund pattern — a plain /X$/ test would also drop
  // exchange-traded equities such as NFLX, CVX and FDX.
  const iexTickers = tickers.filter(ticker =>
    !looksLikeMutualFundTicker(ticker) && /^[A-Z.]{1,6}$/.test(ticker));
  const providerFactory = new DataProviderFactory(tiingoKey || 'test_tiingo_key', fmpKey || 'test_fmp_key');
  const historyEnd = new Date();
  const historyStart = new Date(historyEnd);
  historyStart.setUTCMonth(historyStart.getUTCMonth() - 13);

  const historyPositions = selected.slice(0, MAX_HISTORY_SECURITIES);

  const [metadataResult, quotesResult, historiesResult] = await Promise.allSettled([
    fmpKey
      ? providerFactory.getSecurityMetadataBatch(tickers)
      : Promise.resolve(new Map<string, SecurityMetadata>()),
    tiingoKey
      ? new TiingoProvider(tiingoKey).getIexQuotes(iexTickers)
      : Promise.resolve([] as TiingoIexQuote[]),
    tiingoKey
      ? Promise.allSettled(historyPositions.map(async position => ({
          ticker: position.ticker,
          history: await providerFactory.getPriceHistory(position.ticker, historyStart, historyEnd),
        }))).then(results => results.flatMap((result, index) => {
          if (result.status === 'fulfilled') return [result.value];
          // Name the position that dropped out. Without this the holding simply
          // has no trailing return and nothing says why.
          console.warn(
            `Tiingo history unavailable for ${historyPositions[index].ticker}:`,
            result.reason,
          );
          return [];
        }))
      : Promise.resolve([]),
  ]);

  const metadata = metadataResult.status === 'fulfilled'
    ? metadataResult.value
    : new Map<string, SecurityMetadata>();
  const quotes = quotesResult.status === 'fulfilled' ? quotesResult.value : [];
  if (metadataResult.status === 'rejected') console.warn('FMP investment enrichment failed:', metadataResult.reason);
  if (quotesResult.status === 'rejected') console.warn('Tiingo investment quote enrichment failed:', quotesResult.reason);
  const quoteMap = new Map(quotes.map(quote => [quote.ticker.toUpperCase(), quote]));
  const historyMap = new Map(
    (historiesResult.status === 'fulfilled' ? historiesResult.value : []).map(item => [item.ticker, item.history]),
  );

  const enriched = selected.flatMap(position => {
    const item = metadata.get(position.ticker);
    const quote = quoteMap.get(position.ticker);
    const normalizedQuote = quote ? normalizeQuote(quote) : undefined;
    const history = historyMap.get(position.ticker)?.data;
    const trailingReturns = history?.returns.slice(-12) || [];
    const trailing12MonthReturn = trailingReturns.length === 12
      ? trailingReturns.reduce((growth, monthlyReturn) => growth * (1 + monthlyReturn), 1) - 1
      : undefined;
    if (!item && !normalizedQuote && trailing12MonthReturn === undefined) return [];
    return [{
      ticker: position.ticker,
      name: item?.securityName || position.name,
      assetClass: item?.assetClass,
      geographicFocus: item?.geographicFocus,
      expenseRatio: item?.expenseRatio,
      instrumentType: item?.fundData?.instrumentType,
      countryAllocations: item?.fundData?.countryAllocations.slice(0, 12),
      sectorAllocations: item?.fundData?.sectorAllocations.slice(0, 12),
      countryCoverage: item?.fundData?.countryCoverage,
      sectorCoverage: item?.fundData?.sectorCoverage,
      quote: normalizedQuote,
      trailing12MonthReturn,
      performanceThrough: trailing12MonthReturn !== undefined && history?.dates.length
        ? history.dates[history.dates.length - 1].toISOString()
        : undefined,
      // The aggregate asOf is the newest observation across every source, so
      // fee and allocation facts carry their own (possibly older) FMP time.
      metadataAsOf: item?.lastUpdated && Number.isFinite(item.lastUpdated.getTime())
        ? item.lastUpdated.toISOString()
        : undefined,
    }];
  });
  if (!enriched.length) return undefined;

  const sources: InvestmentExternalData['sources'] = [];
  if ([...metadata.values()].some(item => item.provider === 'fmp')) sources.push('fmp');
  if (quotes.length || historiesResult.status === 'fulfilled' && historiesResult.value.length) sources.push('tiingo');

  // Prefer the newest contributing observation time over "now" so cached FMP
  // rows and Tiingo quotes are not presented as freshly fetched.
  const observationTimes = [
    ...[...metadata.values()]
      .map(item => item.lastUpdated?.getTime())
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
    ...enriched.flatMap(security => {
      const times: number[] = [];
      if (security.quote?.timestamp) {
        const quoteTime = Date.parse(security.quote.timestamp);
        if (Number.isFinite(quoteTime)) times.push(quoteTime);
      }
      if (security.performanceThrough) {
        const performanceTime = Date.parse(security.performanceThrough);
        if (Number.isFinite(performanceTime)) times.push(performanceTime);
      }
      return times;
    }),
  ];
  const asOf = observationTimes.length
    ? new Date(Math.max(...observationTimes)).toISOString()
    : new Date().toISOString();

  return {
    asOf,
    sources,
    portfolioExposure: buildPortfolioExposure([...positionByTicker.values()], metadata),
    securities: enriched,
  };
}

function buildPortfolioExposure(
  positions: Array<{ ticker: string; value: number }>,
  metadata: Map<string, SecurityMetadata>,
): InvestmentExternalData['portfolioExposure'] | undefined {
  const totalValue = positions.reduce((sum, position) => sum + Math.max(0, position.value), 0);
  if (totalValue <= 0 || metadata.size === 0) return undefined;
  const metadataTimes = [...metadata.values()]
    .map(item => item.lastUpdated?.getTime())
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const countryValues = new Map<string, number>();
  const sectorValues = new Map<string, number>();
  let countryCoverageValue = 0;
  let sectorCoverageValue = 0;
  let expenseCoverageValue = 0;
  let weightedExpenseRatio = 0;

  for (const position of positions) {
    const item = metadata.get(position.ticker);
    if (!item || position.value <= 0) continue;
    if (item.fundData?.countryCoverage === 'available') {
      countryCoverageValue += position.value;
      addWeightedExposures(countryValues, item.fundData.countryAllocations, position.value);
    }
    if (item.fundData?.sectorCoverage === 'available') {
      sectorCoverageValue += position.value;
      addWeightedExposures(sectorValues, item.fundData.sectorAllocations, position.value);
    }
    if (item.expenseRatio !== undefined || item.fundData?.instrumentType === 'equity') {
      expenseCoverageValue += position.value;
      weightedExpenseRatio += (position.value / totalValue) * (item.expenseRatio || 0);
    }
  }

  return {
    ...(metadataTimes.length && { metadataAsOf: new Date(Math.min(...metadataTimes)).toISOString() }),
    countryAllocations: exposurePercentages(countryValues, totalValue),
    sectorAllocations: exposurePercentages(sectorValues, totalValue),
    countryCoverage: countryCoverageValue / totalValue,
    sectorCoverage: sectorCoverageValue / totalValue,
    expenseRatioWeighted: weightedExpenseRatio,
    expenseRatioCoverage: expenseCoverageValue / totalValue,
  };
}

function addWeightedExposures(
  target: Map<string, number>,
  exposures: Array<{ name: string; weight: number }>,
  value: number,
): void {
  for (const exposure of exposures) {
    if (!Number.isFinite(exposure.weight) || exposure.weight <= 0) continue;
    target.set(exposure.name, (target.get(exposure.name) || 0) + value * exposure.weight);
  }
}

function exposurePercentages(values: Map<string, number>, totalValue: number) {
  return [...values.entries()]
    .map(([name, value]) => ({ name, percentage: value / totalValue * 100 }))
    .filter(exposure => exposure.percentage >= 0.01)
    .sort((left, right) => right.percentage - left.percentage)
    .slice(0, 15);
}

function normalizeQuote(quote: TiingoIexQuote): InvestmentExternalData['securities'][number]['quote'] | undefined {
  const price = [quote.last, quote.tngoLast, quote.mid]
    .find(value => typeof value === 'number' && Number.isFinite(value));
  if (price === undefined) return undefined;
  const previousClose = typeof quote.prevClose === 'number' && Number.isFinite(quote.prevClose)
    ? quote.prevClose
    : undefined;
  return {
    price,
    previousClose,
    changePercent: previousClose && previousClose !== 0
      ? ((price - previousClose) / previousClose) * 100
      : undefined,
    timestamp: quote.lastSaleTimestamp || quote.quoteTimestamp || quote.timestamp,
    feed: 'tiingo_iex',
  };
}
