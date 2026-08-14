/**
 * Fetches database records relevant to "Show the Math" transparency.
 * Used to display what data was available when the LLM generated its response.
 */

import { getPrismaClient } from '../prisma-client';
import type { FinancialContextSnapshot } from './types';
import type { ShowTheMathDatabaseData } from './show-the-math-types';

function extractTickersFromSnapshot(snapshot: FinancialContextSnapshot): string[] {
  const tickers = new Set<string>();

  // From investments.holdings
  const holdings = snapshot.investments?.holdings || [];
  for (const h of holdings) {
    const ticker = (h as { ticker_symbol?: string }).ticker_symbol?.toUpperCase();
    if (ticker && ticker.length > 0 && ticker.length <= 10 && ticker !== 'CASH') {
      tickers.add(ticker);
    }
  }

  // From investments.securities
  const securities = snapshot.investments?.securities || [];
  for (const s of securities) {
    const ticker = (s as { ticker_symbol?: string }).ticker_symbol?.toUpperCase();
    if (ticker && ticker.length > 0 && ticker.length <= 10 && ticker !== 'CASH') {
      tickers.add(ticker);
    }
  }

  return Array.from(tickers);
}

export async function fetchShowTheMathDBData(
  userId: string | undefined,
  snapshot: FinancialContextSnapshot
): Promise<ShowTheMathDatabaseData> {
  const result: ShowTheMathDatabaseData = {
    analysis_context_snapshot: JSON.parse(JSON.stringify(snapshot))
  };

  const tickers = extractTickersFromSnapshot(snapshot);
  const needsUserRecords = Boolean(userId && (snapshot.retirementAnalysis || tickers.length > 0));
  const needsMarketRecords = Boolean(snapshot.contextSelection?.marketContextRequested);
  if (!needsUserRecords && !needsMarketRecords) return result;

  const prisma = getPrismaClient();
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // User-scoped tables (skip for demo)
  if (userId) {
    if (snapshot.retirementAnalysis) {
      try {
        const retirementAnalyses = await prisma.retirementAnalysis.findMany({
          where: { userId },
          orderBy: { computedAt: 'desc' },
          take: 3
        });
        result.retirement_analyses = retirementAnalyses.map((record) => JSON.parse(JSON.stringify(record)));
      } catch (err) {
        console.warn('Show the math: failed to fetch retirement analysis records:', err);
      }
    }

    // Asset price history and security metadata by tickers
    if (tickers.length > 0) {
      try {
        const [priceHistory, securityMetadata] = await Promise.all([
          prisma.assetPriceHistory.findMany({
            where: {
              tickerSymbol: { in: tickers },
              date: { gte: ninetyDaysAgo }
            },
            orderBy: [{ tickerSymbol: 'asc' }, { date: 'desc' }],
            take: 500
          }),
          prisma.securityMetadata.findMany({
            where: { tickerSymbol: { in: tickers } }
          })
        ]);

        result.asset_price_history = priceHistory.map((r) => {
          const { volume, ...rest } = r;
          return { ...rest, volume: volume?.toString() };
        });
        result.security_metadata = securityMetadata.map((r) => JSON.parse(JSON.stringify(r)));
      } catch (err) {
        console.warn('Show the math: failed to fetch ticker-scoped DB data:', err);
      }
    }
  }

  // Market-news records are relevant only when market context was part of the prompt.
  if (snapshot.contextSelection?.marketContextRequested) {
    try {
      const activeContext = await prisma.marketNewsContext.findFirst({
        where: { isActive: true }
      });
      if (activeContext) {
        result.market_news_context = JSON.parse(JSON.stringify(activeContext));
        const history = await prisma.marketNewsHistory.findMany({
          where: { contextId: activeContext.id },
          orderBy: { createdAt: 'desc' },
          take: 10
        });
        result.market_news_history = history.map((h) => JSON.parse(JSON.stringify(h)));
      }
    } catch (err) {
      console.warn('Show the math: failed to fetch market news data:', err);
    }
  }

  return result;
}
