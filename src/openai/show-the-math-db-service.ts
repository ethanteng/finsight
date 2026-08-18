/**
 * Fetches database records relevant to "Show the Math" transparency.
 * Used to display what data was available when the LLM generated its response.
 */

import { getPrismaClient } from '../prisma-client';
import type { EvidenceManifest, ShowTheMathDatabaseData, ShowTheMathData } from './show-the-math-types';
import { createHash } from 'crypto';

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function evidenceTimestamp(manifest: EvidenceManifest): Date {
  for (const candidate of [manifest.snapshot.computedAt, manifest.snapshot.asOf, manifest.generatedAt]) {
    if (!candidate) continue;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(manifest.generatedAt);
}

function generatedTimestamp(manifest: EvidenceManifest): Date {
  const generatedAt = new Date(manifest.generatedAt);
  return Number.isNaN(generatedAt.getTime()) ? evidenceTimestamp(manifest) : generatedAt;
}

export async function fetchShowTheMathDBData(
  userId: string | undefined,
  manifest: EvidenceManifest
): Promise<ShowTheMathDatabaseData> {
  const result: ShowTheMathDatabaseData = {
    canonical_facts: manifest.facts,
  };

  const tickers = manifest.evidenceRefs.tickers;
  const needsUserRecords = Boolean(userId && (manifest.evidenceRefs.retirementAnalysis || tickers.length > 0));
  const needsMarketRecords = manifest.evidenceRefs.marketContext;
  if (!needsUserRecords && !needsMarketRecords) return result;

  const prisma = getPrismaClient();
  const evidenceAt = evidenceTimestamp(manifest);
  const ninetyDaysBeforeEvidence = new Date(evidenceAt);
  ninetyDaysBeforeEvidence.setDate(ninetyDaysBeforeEvidence.getDate() - 90);

  // Load user-scoped evidence only when the manifest references it.
  if (userId) {
    if (manifest.evidenceRefs.retirementAnalysis) {
      try {
        const retirementWhere = manifest.evidenceRefs.retirementAnalysisId
          ? { userId, id: manifest.evidenceRefs.retirementAnalysisId }
          : { userId, computedAt: { lte: generatedTimestamp(manifest) } };
        const retirementAnalyses = await prisma.retirementAnalysis.findMany({
          where: retirementWhere,
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
              date: { gte: ninetyDaysBeforeEvidence, lte: evidenceAt },
              cachedAt: { lte: evidenceAt },
            },
            orderBy: [{ tickerSymbol: 'asc' }, { date: 'desc' }],
            take: 500
          }),
          prisma.securityMetadata.findMany({
            where: {
              tickerSymbol: { in: tickers },
              lastUpdated: { lte: evidenceAt },
            }
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
  if (manifest.evidenceRefs.marketContext) {
    try {
      const referencedContext = manifest.evidenceRefs.marketContextId
        ? await prisma.marketNewsContext.findUnique({
            where: { id: manifest.evidenceRefs.marketContextId },
          })
        : await prisma.marketNewsContext.findFirst({
            where: {
              isActive: true,
              ...(manifest.evidenceRefs.marketContextTier && {
                availableTiers: { has: manifest.evidenceRefs.marketContextTier },
              }),
            },
            orderBy: [
              { manualOverride: 'desc' },
              { lastUpdate: 'desc' },
            ],
          });
      const matchesReferenced = referencedContext && (
        !manifest.evidenceRefs.marketContextDigest ||
        digest(referencedContext.contextText) === manifest.evidenceRefs.marketContextDigest
      );
      if (matchesReferenced && referencedContext) {
        result.market_news_context = JSON.parse(JSON.stringify(referencedContext));
        const history = await prisma.marketNewsHistory.findMany({
          where: { contextId: referencedContext.id },
          orderBy: { createdAt: 'desc' },
          take: 10
        });
        result.market_news_history = history.map((h) => JSON.parse(JSON.stringify(h)));
      } else if (manifest.evidenceRefs.marketContextDigest) {
        const contextId = manifest.evidenceRefs.marketContextId || referencedContext?.id;
        if (!contextId) return result;
        const history = await prisma.marketNewsHistory.findMany({
          where: { contextId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });
        const matchingHistory = history.find((record) => digest(record.contextText) === manifest.evidenceRefs.marketContextDigest);
        if (matchingHistory) result.market_news_history = [JSON.parse(JSON.stringify(matchingHistory))];
      }
    } catch (err) {
      console.warn('Show the math: failed to fetch market news data:', err);
    }
  }

  return result;
}

export function isEvidenceManifestData(value: unknown): value is ShowTheMathData {
  if (!value || typeof value !== 'object') return false;
  const manifest = (value as { evidenceManifest?: unknown }).evidenceManifest;
  if (!manifest || typeof manifest !== 'object') return false;
  const candidate = manifest as {
    version?: unknown;
    facts?: unknown;
    evidenceRefs?: { tickers?: unknown; retirementAnalysis?: unknown; marketContext?: unknown };
  };
  return candidate.version === 1 &&
    Array.isArray(candidate.facts) &&
    Array.isArray(candidate.evidenceRefs?.tickers) &&
    typeof candidate.evidenceRefs?.retirementAnalysis === 'boolean' &&
    typeof candidate.evidenceRefs?.marketContext === 'boolean';
}

/** Expand compact persisted evidence only when the user opens Show the Math. */
export async function loadShowTheMathEvidence(
  stored: unknown,
  userId?: string
): Promise<unknown> {
  if (!isEvidenceManifestData(stored)) return stored;
  const databaseData = await fetchShowTheMathDBData(userId, stored.evidenceManifest);
  return { ...stored, databaseData };
}
