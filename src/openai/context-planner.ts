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
  /**
   * Whether a good answer depends on the user's own money -- their balances,
   * income, spending, debts or holdings -- whether or not any optional pack
   * was selected. "What is my net worth?" selects none (the totals are always
   * present) and is entirely personal; "What is a Roth IRA?" is not. Only
   * this decides whether a user with nothing linked is told what linking
   * would change about the answer, since packs alone cannot.
   */
  personalDataQuestion: boolean;
  searchQueries: PlannedSearchQuery[];
  /**
   * Inputs the planner extracted from the user's words, before scenario
   * overrides are removed for the baseline. Recovery must start here so a
   * genuine what-if can restore a withheld field instead of adopting the
   * hypothetical value that caused the withhold.
   */
  statedRetirementInputs?: ExtractedRetirementInputs;
  /** Baseline gather inputs after differing scenario overrides are removed. */
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
 * Plan inputs a what-if rebuilding the baseline must copy through explicitly,
 * because none of them is withheld above -- otherwise "retire at 62 with $30k
 * of Social Security" would strip the benefit from both the baseline and the
 * variant that inherits it.
 */
const BASELINE_PLAN_FIELDS = [
  'socialSecurityAnnual',
  'socialSecurityStartAge',
  'socialSecurityAmountAge',
  'pensionAnnual',
  'pensionStartAge',
  'annualContributionAmount',
  'partnerAge',
  'partnerSocialSecurityAnnual',
  'partnerSocialSecurityStartAge',
  'partnerSocialSecurityAmountAge',
  'partnerPensionAnnual',
  'partnerPensionStartAge',
  'partnerPlanThroughAge',
  'survivorAnnualSpending',
  'spendingCutPercent',
  'spendingCutAnnual',
  'essentialAnnualSpending',
] as const;

/**
 * Of those, the ones a holdings what-if can set too, the partner's claiming
 * age included. A stated value is
 * withheld only when it is a variant's own: "I get $30,000 at 62; what if I
 * wait until 70?" and "I save $20,000 a year; what if I saved $30,000?" each
 * state the plan beside the what-if, and dropping the plan's value would
 * leave the baseline on a default the what-if then departs from. The same
 * value in both is the what-if read twice.
 */
const WITHHELD_WHEN_A_WHAT_IF_FIELDS = [
  'socialSecurityStartAge',
  'annualContributionAmount',
  'partnerSocialSecurityStartAge',
] as const;

/**
 * Keep hypothetical scenario values out of the canonical baseline. The same
 * semantic pass extracts both shapes, so without this boundary an age or
 * spending override can rebuild the baseline before the scenario runner sees
 * it and erase the comparison the user requested.
 *
 * Equality between a variant and a stated input does not make the variant a
 * restatement: "what if I retire at 58 instead" reaches the planner as both,
 * and admitting it would rebuild the baseline on the hypothetical and dedupe
 * the requested case against its own default comparison. Every mentioned field
 * is withheld here. Whether the baseline can be built without them is decided
 * further down, where the stored plan and the profile are in hand, and
 * `statedRetirementInputs` keeps the user's words available for that.
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
  const readTwice = new Set(
    WITHHELD_WHEN_A_WHAT_IF_FIELDS.filter((field) =>
      inputs[field] !== undefined &&
      variants.some((variant) => variant?.overrides?.[field] === inputs[field])
    )
  );
  if (overridden.size === 0 && readTwice.size === 0) return inputs;

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
  for (const field of BASELINE_PLAN_FIELDS) {
    if (inputs[field] === undefined) continue;
    if ((readTwice as Set<string>).has(field)) continue;
    baseline[field] = inputs[field];
    if (inputs.sources[field]) baseline.sources[field] = inputs.sources[field];
  }
  for (const field of ['pensionInflation', 'partnerPensionInflation'] as const) {
    if (inputs[field] === undefined) continue;
    baseline[field] = inputs[field];
    if (inputs.sources[field]) baseline.sources[field] = inputs.sources[field];
  }
  if (inputs.partnerMarried !== undefined) {
    baseline.partnerMarried = inputs.partnerMarried;
    if (inputs.sources.partnerMarried) baseline.sources.partnerMarried = inputs.sources.partnerMarried;
  }
  return baseline;
}

/**
 * Baseline inputs of last resort, for a scenario that no baseline can support.
 *
 * A variant is a comparison only when there is something to compare against.
 * When the user states a plan for the first time and the planner reads that
 * one sentence as the scenario too, its values are withheld from the baseline
 * and nothing else supplies them: no stored plan, no profile. The projection
 * cannot run, so the answer asks for numbers the user has already given while
 * the scenario reports that it needs a completed baseline. Neither side can
 * move, and restating the numbers reproduces both messages.
 *
 * Fold the primary variant's values into the fields the baseline is still
 * missing so the projection runs on what the user said. The values are already
 * range-checked and carry the user's own wording, and the scenario runner then
 * reuses the baseline for that variant instead of inventing a comparison.
 * Fields the caller already has are left alone, so a real what-if keeps its
 * comparison — pass the stated plan (pre-withhold), not the stripped baseline.
 *
 * This is reached only after the baseline has failed on its own evidence, so a
 * user with a plan on file never arrives here: their stored inputs build the
 * baseline and the variant is compared against it, which is the whole point of
 * withholding it.
 */
export function retirementInputsFromScenarioPlan(
  inputs: ExtractedRetirementInputs | undefined,
  scenario: RetirementScenarioPlan | undefined
): ExtractedRetirementInputs | undefined {
  const overrides = scenario?.primary?.overrides;
  if (!overrides) return inputs;

  const merged: ExtractedRetirementInputs = {
    ...(inputs ?? {}),
    sources: { ...(inputs?.sources ?? {}) },
  };
  let folded = false;
  for (const field of SCENARIO_OVERRIDE_INPUT_FIELDS) {
    const value = overrides[field];
    if (value === undefined || merged[field] !== undefined) continue;
    merged[field] = value;
    const source = overrides.sources?.[field];
    if (source) merged.sources[field] = source;
    folded = true;
  }
  return folded ? merged : inputs;
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
  'socialSecurityAnnual',
  'socialSecurityStartAge',
  'socialSecurityAmountAge',
  'annualContributionAmount',
  'pensionAnnual',
  'pensionStartAge',
  'partnerAge',
  'partnerSocialSecurityAnnual',
  'partnerSocialSecurityStartAge',
  'partnerSocialSecurityAmountAge',
  'partnerPensionAnnual',
  'partnerPensionStartAge',
  'partnerPlanThroughAge',
  'survivorAnnualSpending',
  'spendingCutPercent',
  'spendingCutAnnual',
  'essentialAnnualSpending',
] as const;
const RETIREMENT_SOURCE_FIELDS = [...RETIREMENT_FIELDS, 'pensionInflation', 'partnerPensionInflation', 'partnerMarried'] as const;
const NULLABLE_NUMBER = { type: ['number', 'null'] as const };
const NULLABLE_STRING = { type: ['string', 'null'] as const };

export const CONTEXT_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['packs', 'needsSecondaryValidation', 'personalDataQuestion', 'searchQueries', 'retirementInputs', 'scenarios', 'summary'],
  properties: {
    packs: {
      type: 'object',
      additionalProperties: false,
      required: [...CONTEXT_PACK_IDS],
      properties: PACK_PROPERTIES,
    },
    needsSecondaryValidation: { type: 'boolean' },
    personalDataQuestion: { type: 'boolean' },
    searchQueries: SEARCH_QUERY_JSON_SCHEMA,
    retirementInputs: {
      type: 'object',
      additionalProperties: false,
      required: [...RETIREMENT_SOURCE_FIELDS, 'sources'],
      properties: {
        ...Object.fromEntries(RETIREMENT_FIELDS.map((field) => [field, NULLABLE_NUMBER])),
        pensionInflation: { type: 'string', enum: ['unspecified', 'fixed', 'rises_with_inflation'] },
        partnerPensionInflation: { type: 'string', enum: ['unspecified', 'fixed', 'rises_with_inflation'] },
        partnerMarried: { type: 'string', enum: ['unspecified', 'yes', 'no'] },
        sources: {
          type: 'object',
          additionalProperties: false,
          required: [...RETIREMENT_SOURCE_FIELDS],
          properties: Object.fromEntries(RETIREMENT_SOURCE_FIELDS.map((field) => [field, NULLABLE_STRING])),
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
- The aggregate financial summary is always present: net worth, total cash, total debt, total investments, portfolio value, holding count, asset allocation, category spending totals, average monthly income/expenses, and the expected monthly income/expenses/surplus from the cash-flow forecast. Do not request a detail pack merely to obtain one of those aggregates.
- Prior assistant answers establish conversational references only. They are not trusted financial facts.
- ${UNTRUSTED_CONTENT_RULE}
- Include every pack materially useful to answer the current message. Prefer inclusion when omission could make the answer incomplete.
- search_context is for information outside the user's stored data, especially facts that can change over time. market_context is the broader economic/market backdrop.
- When search_context is selected, return one to three standalone public search queries in searchQueries. Each query must make sense without the transcript and contain only the minimum public facts needed for retrieval. Never copy a person's name, email address, account or card number, transaction description, or other private identifier into a query. Choose freshness from pd (24 hours), pw (7 days), pm (31 days), py (365 days), or null when recency filtering would hide the authoritative source. Return an empty array when search_context is not selected.
- personalDataQuestion is true when a good answer depends on the user's own money -- their balances, income, spending, debts or holdings -- even when the always-present totals cover it and no optional pack is selected. It is false for general explanations that would be the same for anyone.
- needsSecondaryValidation is true for projections, comparisons, recommendations, affordability judgments, simulations, optimization, tax reasoning, or other conclusions where an independent reasoning review is useful.
- The application enforces access, subscription, dependencies and calculations. You only plan context.

Also extract retirement inputs the user actually stated in this decision. Never estimate or supply typical values. annualWithdrawalAmount means intended annual retirement spending in today's dollars, not salary, savings, portfolio value, or current spending. Convert a monthly amount only when it clearly refers to that retirement spending. socialSecurityAnnual and socialSecurityStartAge are the user's Social Security benefit per year and the age they plan to claim it, never a claiming age they only ask about as a what-if; socialSecurityAmountAge is the claiming age their Social Security figure is for, only when they say so (such as a statement showing $2,500 a month at 67), because application code applies Social Security's own claiming rules when it differs from the claiming age; annualContributionAmount is what the user adds to their investments per year until they retire, employer match included when they say so, in today's dollars (convert a monthly or per-paycheck amount only when it clearly is one), never a contribution they only ask about as a what-if; pensionAnnual and pensionStartAge are a pension, annuity or other retirement income that is not Social Security, per year, and when it starts; pensionInflation is fixed when the user says that pension is a fixed amount or has no cost-of-living adjustment, rises_with_inflation when they say it has one or rises with inflation, and otherwise unspecified with a null source. When the user plans with a spouse or partner, the partner* fields are that partner's: partnerAge their age today, partnerSocialSecurityAnnual and partnerSocialSecurityStartAge their own Social Security and the age (theirs) they claim it, never a claiming age the user only asks about as a what-if, partnerSocialSecurityAmountAge the claiming age their figure is for when the user says so, partnerPensionAnnual, partnerPensionStartAge (their age) and partnerPensionInflation their pension, partnerPlanThroughAge the age (theirs) to plan through; survivorAnnualSpending is what one of them would spend a year alone, in today's dollars, only when the user says so; partnerMarried is yes when the user says they are married to that partner or calls them their husband, wife or spouse, no when they say they are not married to them (including a boyfriend, girlfriend or fiancé), and otherwise unspecified with a null source, because "partner" alone does not say. spendingCutPercent, spendingCutAnnual and essentialAnnualSpending are how much of their retirement spending the user says they could cut if markets fell, only when they say so, in the form they used: spendingCutPercent in percentage points (20 for 20%), spendingCutAnnual in dollars a year less, essentialAnnualSpending as the spending a year they could not go below; set only one, and 0 for spendingCutPercent when they say they could not cut at all. Never put a partner's figure in the user's own fields, or the other way round. Convert a monthly benefit to a year only when it clearly is one. A short answer takes its meaning from the assistant question immediately before it. The newest revision wins. Put the user's own short wording in sources; use null for an absent value and source.

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
  // A plan that omits the flag (an older payload) reads as personal: offering
  // what linking would add is the recall-safe side of the decision.
  const personalDataQuestion = record.personalDataQuestion !== false;
  const statedRetirementInputs = validateExtractedInputs(record.retirementInputs);
  const retirementInputs = retirementInputsForBaseline(
    statedRetirementInputs,
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
    personalDataQuestion,
    searchQueries,
    ...(statedRetirementInputs && { statedRetirementInputs }),
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
    // Nothing here knows what the question means, and with every pack
    // selected the packs cannot say either. No closing note beats a note about
    // linking a checking account on "What is a Roth IRA?".
    personalDataQuestion: false,
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
