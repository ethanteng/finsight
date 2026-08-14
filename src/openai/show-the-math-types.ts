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
    timeToFirstAnswerTokenMs?: number;
    totalMs: number;
  };
  validation: {
    deterministic: { valid: boolean; issues: string[] };
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
