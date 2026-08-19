import type { CanonicalFact } from './canonical-facts';
import type { ContextPackId } from './context-packs';
import type { AskLincResponse } from './structured-response';
import type { PlannedSearchQuery } from '../data/search-types';
import type {
  RetirementScenarioEvidence,
  RetirementScenarioPlan,
} from '../scenarios/retirement-scenario';
import type {
  ScenarioEvidenceRecord,
  ScenarioPlanRecord,
} from '../scenarios/calculator-registry';

export interface ShowTheMathDatabaseData {
  canonical_facts?: CanonicalFact[];
  asset_price_history?: unknown[];
  retirement_analyses?: unknown[];
  security_metadata?: unknown[];
  market_news_context?: unknown;
  market_news_history?: unknown[];
}

/**
 * Backward-compatible compact projection flags for the original five optional
 * context types. New evidence uses contextPlanning for the complete nine-pack
 * semantic plan, while these flags still describe what the snapshot read.
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

/** Which legacy projection flags a primary-tool or late widening switched on. */
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
  /** The primary analysis model added packs through its constrained pre-answer tool. */
  contextToolExpanded?: boolean;
  /** Complete semantic plan, including packs that are not represented by the legacy five-tier view. */
  contextPlanning?: {
    source: 'context_planner' | 'fallback_all';
    model?: string;
    durationMs: number;
    requestedPacks: ContextPackId[];
    selectedPacks: ContextPackId[];
    finalPacks: ContextPackId[];
    needsSecondaryValidation: boolean;
    searchQueries?: PlannedSearchQuery[];
    summary: string;
    scenarios?: ScenarioPlanRecord;
    /** @deprecated Persisted manifests before registry-keyed scenario planning. */
    retirementScenario?: RetirementScenarioPlan;
    primaryTool?: {
      outcome: 'accepted' | 'expanded' | 'failed';
      model?: string;
      requestedPacks: ContextPackId[];
      addedPacks: ContextPackId[];
      reason: string;
      durationMs: number;
      scenarios?: ScenarioPlanRecord;
      /** @deprecated Persisted manifests before registry-keyed scenario planning. */
      searchQueries?: PlannedSearchQuery[];
      retirementScenario?: RetirementScenarioPlan;
    };
  };
  /** Deterministic what-if calculations and their explicit assumption ledger. */
  scenarioExecutions?: ScenarioEvidenceRecord;
  /** @deprecated Persisted manifests before registry-keyed scenario execution. */
  scenarioExecution?: RetirementScenarioEvidence;
  /**
   * Secondary validation objected to the answer's reasoning after it had passed
   * grounding. The answer ships with a caveat rather than being discarded; the
   * objections themselves are in validation.secondary.
   */
  secondaryCaveat?: boolean;
  /**
   * What the preflight planner selected before a primary-tool or post-answer
   * widening. Routing metrics score this prediction, while contextSelection
   * records what the final answer actually received.
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
    /** Semantic preflight planner latency; absent on manifests from before context planning. */
    planningMs?: number;
    /** Primary-model pack-audit latency; excludes any subsequent context retrieval. */
    contextToolMs?: number;
    /** Deterministic scenario-calculator time, including any historical-data reads. */
    scenarioMs?: number;
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
    marketContextId?: string;
    marketContextTier?: string;
    marketContextLastUpdate?: string;
    searchContextDigest?: string;
    search?: {
      queries: PlannedSearchQuery[];
      cacheHits: number;
      providerCalls: number;
      resultCount: number;
      retrievedAt: string;
    };
  };
}

/** Compact answer and manifest are persisted; database evidence is attached only on GET. */
export interface ShowTheMathData {
  evidenceManifest: EvidenceManifest;
  /**
   * The display-ready response is stored beside its evidence so reopening a
   * conversation can restore the rich cards instead of falling back to the
   * flattened Markdown compatibility string.
   */
  structuredResponse?: AskLincResponse;
  databaseData?: ShowTheMathDatabaseData;
}
