import type { CanonicalFact } from './canonical-facts';

export interface ShowTheMathDatabaseData {
  canonical_facts?: CanonicalFact[];
  asset_price_history?: unknown[];
  retirement_analyses?: unknown[];
  security_metadata?: unknown[];
  market_news_context?: unknown;
  market_news_history?: unknown[];
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
  contextSelection?: {
    accountsIncluded: boolean;
    transactionDetailsIncluded: boolean;
    investmentDetailsIncluded: boolean;
    marketContextRequested: boolean;
    searchContextRequested: boolean;
  };
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
  routedContextSelection?: {
    accountsIncluded: boolean;
    transactionDetailsIncluded: boolean;
    investmentDetailsIncluded: boolean;
    marketContextRequested: boolean;
    searchContextRequested: boolean;
  };
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
