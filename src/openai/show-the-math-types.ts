import type { CanonicalFact } from './canonical-facts';

export interface ShowTheMathDatabaseData {
  canonical_facts?: CanonicalFact[];
  asset_price_history?: unknown[];
  retirement_analyses?: unknown[];
  security_metadata?: unknown[];
  market_news_context?: unknown;
  market_news_history?: unknown[];
}

/**
 * Context tiers still decided by question routing. Everything else is loaded on
 * every request, so only these can be withheld from an answer.
 */
export const ROUTED_CONTEXT_TIERS = [
  'accountsIncluded',
  'transactionDetailsIncluded',
  'investmentDetailsIncluded',
  'marketContextRequested',
  'searchContextRequested',
] as const;

export type RoutedContextTier = (typeof ROUTED_CONTEXT_TIERS)[number];

export type ContextSelection = Record<RoutedContextTier, boolean>;

/**
 * Which tiers a retry's widening actually switched on.
 *
 * Escalation only reaches for the tiers that carry canonical facts, so an
 * escalated request is evidence about those tiers alone. Market and search
 * context are withheld from most questions and are never widened; charging them
 * with every escalation would invent a routing signal that isn't there.
 */
export function widenedContextTiers(manifest: {
  contextSelection?: ContextSelection;
  routedContextSelection?: ContextSelection;
}): RoutedContextTier[] {
  const routed = manifest.routedContextSelection;
  const final = manifest.contextSelection;
  if (!routed || !final) return [];
  return ROUTED_CONTEXT_TIERS.filter((tier) => routed[tier] === false && final[tier] === true);
}

export interface EvidenceManifest {
  version: 1;
  generatedAt: string;
  snapshot: {
    computedAt?: string;
    asOf?: string;
    status?: string;
  };
  facts: CanonicalFact[];
  contextSelection?: ContextSelection;
  /**
   * The first answer cited numbers the fact pack did not contain, so the retry
   * was given a wider context than routing selected. contextSelection above
   * describes the widened read.
   */
  contextEscalated?: boolean;
  /**
   * What routing selected before that widening. Present only when escalation
   * happened; routing metrics score this, since contextSelection above records
   * the correction rather than the prediction that needed correcting.
   */
  routedContextSelection?: ContextSelection;
  modelCalls: Array<{
    phase: 'initial' | 'retry';
    provider: 'claude' | 'openai';
    outcome: 'success' | 'failed';
    promptCharacters: number;
    responseCharacters: number;
    durationMs: number;
  }>;
  timings: {
    contextGatherMs: number;
    promptBuildMs: number;
    /** Added in Step 8; absent on older persisted evidence manifests. */
    modelMs?: number;
    validationMs?: number;
    timeToFirstAnswerTokenMs?: number;
    totalMs: number;
  };
  validation: {
    deterministic: {
      valid: boolean;
      issues: string[];
      /**
       * What the pipeline did with a failed check: kept the grounded part of the
       * answer, or replaced it with the placeholder. Absent on older manifests.
       */
      outcome?: 'passed' | 'salvaged' | 'replaced';
    };
    secondary?: Array<{ phase: 'initial' | 'retry'; valid: boolean; issues: string[] }>;
  };
  evidenceRefs: {
    tickers: string[];
    retirementAnalysis: boolean;
    retirementAnalysisId?: string;
    marketContext: boolean;
    marketContextDigest?: string;
    searchContextDigest?: string;
  };
}

/** Compact manifest is persisted; database evidence is attached only on GET. */
export interface ShowTheMathData {
  evidenceManifest: EvidenceManifest;
  databaseData?: ShowTheMathDatabaseData;
}
