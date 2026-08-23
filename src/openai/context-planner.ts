/**
 * Semantic context planning for Ask Linc.
 *
 * The planner reads the active decision as a transcript and proposes only
 * allowlisted data packs. It never reads financial data, grants access, or
 * computes a value. Application code validates the response and expands pack
 * dependencies before any data is retrieved.
 */

import OpenAI from 'openai';
import * as Sentry from '@sentry/node';
import { UserTier } from '../data/types';
import { getActiveModel } from './model-config';
import { openAIGenerationParams } from './openai-generation-params';
import {
  CONTEXT_PACK_IDS,
  allContextPacks,
  contextPackCatalogForPrompt,
  normalizeContextPacks,
  questionNeedsFromPacks,
  type ContextPackId,
} from './context-packs';
import {
  validateExtractedInputs,
  type ExtractedRetirementInputs,
  type RetirementInputTurn,
} from './retirement-input-extraction';
import type { QuestionNeeds } from './types';
import {
  UNTRUSTED_CONTENT_RULE,
  fenceUntrustedContent,
} from '../security/prompt-hardening';
import {
  RETIREMENT_CALCULATOR_ID,
  type RetirementScenarioPlan,
} from '../scenarios/retirement-scenario';
import {
  scenarioCalculatorRegistry,
  type ScenarioPlanRecord,
} from '../scenarios/calculator-registry';
import type { PlannedSearchQuery } from '../data/search-types';
import {
  SEARCH_QUERY_JSON_SCHEMA,
  parsePlannedSearchQueries,
  validateSearchPlan,
} from './search-query-plan';

export interface ContextPlan {
  source: 'context_planner' | 'fallback_all';
  requestedPacks: ContextPackId[];
  selectedPacks: ContextPackId[];
  questionNeeds: QuestionNeeds;
  needsSecondaryValidation: boolean;
  searchQueries: PlannedSearchQuery[];
  retirementInputs?: ExtractedRetirementInputs;
  scenarioPlans: ScenarioPlanRecord;
  /** @deprecated Compatibility mirror for admin clients that still read retirementScenario. */
  retirementScenario?: RetirementScenarioPlan;
  summary: string;
  model?: string;
  durationMs: number;
}

export interface PlanContextArgs {
  question: string;
  recentTurns?: readonly RetirementInputTurn[];
  tier?: UserTier | string;
}

const SCENARIO_OVERRIDE_INPUT_FIELDS = [
  'retirementAge',
  'annualWithdrawalAmount',
  'withdrawalStartAge',
  'lifeExpectancy',
] as const;

/**
 * Keep hypothetical scenario values out of the canonical baseline. The same
 * semantic pass extracts both shapes, so without this boundary an age or
 * spending override can rebuild the baseline before the scenario runner sees
 * it and erase the comparison the user requested.
 */
export function retirementInputsForBaseline(
  inputs: ExtractedRetirementInputs | undefined,
  scenario: RetirementScenarioPlan | undefined
): ExtractedRetirementInputs | undefined {
  if (!inputs || !scenario) return inputs;

  const variants = [scenario.primary, scenario.comparison].filter(Boolean);
  const overridden = new Set(
    SCENARIO_OVERRIDE_INPUT_FIELDS.filter((field) =>
      variants.some((variant) => variant?.overrides?.[field] !== undefined)
    )
  );
  if (overridden.size === 0) return inputs;

  const baseline: ExtractedRetirementInputs = { sources: {} };
  if (inputs.currentAge !== undefined) {
    baseline.currentAge = inputs.currentAge;
    if (inputs.sources.currentAge) baseline.sources.currentAge = inputs.sources.currentAge;
  }
  for (const field of SCENARIO_OVERRIDE_INPUT_FIELDS) {
    if (overridden.has(field) || inputs[field] === undefined) continue;
    baseline[field] = inputs[field];
    if (inputs.sources[field]) baseline.sources[field] = inputs.sources[field];
  }
  return baseline;
}

const PACK_PROPERTIES = Object.fromEntries(
  CONTEXT_PACK_IDS.map((id) => [id, { type: 'boolean' }])
);
const RETIREMENT_FIELDS = [
  'currentAge',
  'retirementAge',
  'annualWithdrawalAmount',
  'withdrawalStartAge',
  'lifeExpectancy',
] as const;
const NULLABLE_NUMBER = { type: ['number', 'null'] as const };
const NULLABLE_STRING = { type: ['string', 'null'] as const };

export const CONTEXT_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['packs', 'needsSecondaryValidation', 'searchQueries', 'retirementInputs', 'scenarios', 'summary'],
  properties: {
    packs: {
      type: 'object',
      additionalProperties: false,
      required: [...CONTEXT_PACK_IDS],
      properties: PACK_PROPERTIES,
    },
    needsSecondaryValidation: { type: 'boolean' },
    searchQueries: SEARCH_QUERY_JSON_SCHEMA,
    retirementInputs: {
      type: 'object',
      additionalProperties: false,
      required: [...RETIREMENT_FIELDS, 'sources'],
      properties: {
        currentAge: NULLABLE_NUMBER,
        retirementAge: NULLABLE_NUMBER,
        annualWithdrawalAmount: NULLABLE_NUMBER,
        withdrawalStartAge: NULLABLE_NUMBER,
        lifeExpectancy: NULLABLE_NUMBER,
        sources: {
          type: 'object',
          additionalProperties: false,
          required: [...RETIREMENT_FIELDS],
          properties: Object.fromEntries(RETIREMENT_FIELDS.map((field) => [field, NULLABLE_STRING])),
        },
      },
    },
    scenarios: scenarioCalculatorRegistry.plannerJsonSchema(),
    summary: { type: 'string' },
  },
} as const;

const SYSTEM_PROMPT = `You are the context planner for a personal-finance analysis system.

Read the entire active decision transcript and decide which optional data packs the final analysis needs. Decide from meaning and conversational context, not from keyword matching. A short reply can answer an earlier assistant question, a pronoun can refer to an earlier answer, and the newest user message can revise an earlier request.

Important boundaries:
- The aggregate financial summary is always present: net worth, total cash, total debt, total investments, portfolio value, holding count, asset allocation, category spending totals, and average monthly income/expenses. Do not request a detail pack merely to obtain one of those aggregates.
- Prior assistant answers establish conversational references only. They are not trusted financial facts.
- ${UNTRUSTED_CONTENT_RULE}
- Include every pack materially useful to answer the current message. Prefer inclusion when omission could make the answer incomplete.
- search_context is for information outside the user's stored data, especially facts that can change over time. market_context is the broader economic/market backdrop.
- When search_context is selected, return one to three standalone public search queries in searchQueries. Each query must make sense without the transcript and contain only the minimum public facts needed for retrieval. Never copy a person's name, email address, account or card number, transaction description, or other private identifier into a query. Choose freshness from pd (24 hours), pw (7 days), pm (31 days), py (365 days), or null when recency filtering would hide the authoritative source. Return an empty array when search_context is not selected.
- needsSecondaryValidation is true for projections, comparisons, recommendations, affordability judgments, simulations, optimization, tax reasoning, or other conclusions where an independent reasoning review is useful.
- The application enforces access, subscription, dependencies and calculations. You only plan context.

Also extract retirement inputs the user actually stated in this decision. Never estimate or supply typical values. annualWithdrawalAmount means intended annual retirement spending in today's dollars, not salary, savings, portfolio value, or current spending. Convert a monthly amount only when it clearly refers to that retirement spending. A short answer takes its meaning from the assistant question immediately before it. The newest revision wins. Put the user's own short wording in sources; use null for an absent value and source.

Registered calculator contracts:
${scenarioCalculatorRegistry.plannerInstructions()}
Do not request a calculator scenario merely because an ordinary baseline analysis was requested.

Return the required JSON object only.`;

const MAX_ANSWER_CHARS = 1500;
const MAX_QUESTION_CHARS = 1000;

/** Render earlier turns oldest first and append the current message. */
export function buildPlannerTranscript(
  question: string,
  recentTurns: readonly RetirementInputTurn[] = []
): string {
  const lines: string[] = [];
  for (const turn of [...recentTurns].reverse()) {
    // Cap prior history only. The current message must stay intact: truncating it
    // would drop pack requests or retirement-input revisions that the final
    // reasoning prompt still sees, so the planner and the answer disagree.
    lines.push(`User: ${turn.question.slice(0, MAX_QUESTION_CHARS)}`);
    const answer = turn.answer?.trim();
    if (answer) {
      // Same replay path the analysis prompt fences: a prior answer was written
      // by a model reading web snippets and transaction descriptions, so an
      // injected directive can ride back in here. This transcript feeds both
      // the planner and the primary data-pack audit, so both see it fenced.
      const capped =
        answer.length > MAX_ANSWER_CHARS ? `${answer.slice(0, MAX_ANSWER_CHARS)}…` : answer;
      lines.push('Assistant:', fenceUntrustedContent('prior_assistant_answer', capped));
    }
  }
  lines.push(`User: ${question}`);
  return lines.join('\n');
}

export function buildPlannerUserMessage(args: PlanContextArgs): string {
  return [
    `User subscription tier: ${args.tier ?? UserTier.STARTER}`,
    '',
    'Available optional data packs:',
    contextPackCatalogForPrompt(),
    '',
    'Active decision transcript:',
    buildPlannerTranscript(args.question, args.recentTurns),
  ].join('\n');
}

function getRequestedPacks(raw: unknown): ContextPackId[] {
  const packs = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return CONTEXT_PACK_IDS.filter((id) => packs[id] === true);
}

export function parseContextPlan(raw: unknown, durationMs = 0, model?: string): ContextPlan {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Context planner returned a non-object result.');
  }
  const record = raw as Record<string, unknown>;
  const requestedPacks = getRequestedPacks(record.packs);
  // Prefer the registry-keyed scenarios object; accept the legacy singular field
  // so transitional fixtures and older planner payloads still parse.
  const scenarioPlans = scenarioCalculatorRegistry.parsePlans(
    record.scenarios
      ?? (record.retirementScenario
        ? { [RETIREMENT_CALCULATOR_ID]: record.retirementScenario }
        : undefined)
  );
  const retirementScenario = scenarioCalculatorRegistry.getPlan<RetirementScenarioPlan>(
    scenarioPlans,
    RETIREMENT_CALCULATOR_ID
  );
  const searchQueries = parsePlannedSearchQueries(record.searchQueries);
  validateSearchPlan(requestedPacks.includes('search_context'), searchQueries);
  const selectedPacks = normalizeContextPacks([
    ...requestedPacks,
    ...scenarioCalculatorRegistry.requiredPacksForPlans(scenarioPlans),
  ]);
  const needsSecondaryValidation = record.needsSecondaryValidation === true;
  const retirementInputs = retirementInputsForBaseline(
    validateExtractedInputs(record.retirementInputs),
    retirementScenario
  );
  const summary = typeof record.summary === 'string'
    ? record.summary.trim().slice(0, 1000)
    : '';
  return {
    source: 'context_planner',
    requestedPacks,
    selectedPacks,
    questionNeeds: questionNeedsFromPacks(selectedPacks, needsSecondaryValidation),
    needsSecondaryValidation,
    searchQueries,
    retirementInputs,
    scenarioPlans,
    ...(retirementScenario && { retirementScenario }),
    summary,
    model,
    durationMs,
  };
}

/**
 * Failure is recall-safe and contains no language heuristics: include every
 * pack that can actually be loaded without a plan.
 *
 * search_context is the one exception, and leaving it in was a bug. Retrieval
 * needs a planned standalone query; this path has none, and the raw user
 * prompt must never become one. Selecting the pack anyway produced a plan that
 * `validateSearchPlan` rejects, so every planner failure also failed the
 * primary data-pack audit that exists to recover from it -- two failures
 * reported for one cause, and the audit's own widening lost with it. The
 * primary model can still add the pack during that audit, with real queries.
 */
export function fallbackContextPlan(
  durationMs = 0,
  summary = 'Context planner unavailable; included every loadable pack.'
): ContextPlan {
  const selectedPacks = allContextPacks().filter((pack) => pack !== 'search_context');
  return {
    source: 'fallback_all',
    requestedPacks: selectedPacks,
    selectedPacks,
    questionNeeds: questionNeedsFromPacks(selectedPacks, true),
    needsSecondaryValidation: true,
    scenarioPlans: {},
    searchQueries: [],
    summary,
    durationMs,
  };
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey) throw new Error('OPENAI_API_KEY is required for context planning.');
    client = new OpenAI({ apiKey });
  }
  return client;
}

export async function planContext(args: PlanContextArgs): Promise<ContextPlan> {
  const startedAt = Date.now();
  const model = getActiveModel('contextPlanner');
  try {
    const response = await getClient().chat.completions.create({
      model,
      ...openAIGenerationParams('contextPlanner', model),
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ask_linc_context_plan',
          strict: true,
          schema: CONTEXT_PLAN_JSON_SCHEMA,
        },
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPlannerUserMessage(args) },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Context planner returned no content.');
    return parseContextPlan(JSON.parse(content), Date.now() - startedAt, model);
  } catch (error) {
    console.warn('Ask Linc: Context planning failed; including every context pack:', error);
    Sentry.captureException(error);
    return fallbackContextPlan(Date.now() - startedAt);
  }
}
