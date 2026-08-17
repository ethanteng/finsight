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
  RETIREMENT_CALCULATOR_ID,
  type RetirementScenarioPlan,
} from '../scenarios/retirement-scenario';
import { scenarioCalculatorRegistry } from '../scenarios/calculator-registry';

const RETIREMENT_CALCULATOR = scenarioCalculatorRegistry.require<
  RetirementScenarioPlan,
  unknown,
  unknown
>(RETIREMENT_CALCULATOR_ID);

export interface ContextPlan {
  source: 'context_planner' | 'fallback_all';
  requestedPacks: ContextPackId[];
  selectedPacks: ContextPackId[];
  questionNeeds: QuestionNeeds;
  needsSecondaryValidation: boolean;
  retirementInputs?: ExtractedRetirementInputs;
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
  required: ['packs', 'needsSecondaryValidation', 'retirementInputs', 'retirementScenario', 'summary'],
  properties: {
    packs: {
      type: 'object',
      additionalProperties: false,
      required: [...CONTEXT_PACK_IDS],
      properties: PACK_PROPERTIES,
    },
    needsSecondaryValidation: { type: 'boolean' },
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
    retirementScenario: RETIREMENT_CALCULATOR.planner.jsonSchema,
    summary: { type: 'string' },
  },
} as const;

const SYSTEM_PROMPT = `You are the context planner for a personal-finance analysis system.

Read the entire active decision transcript and decide which optional data packs the final analysis needs. Decide from meaning and conversational context, not from keyword matching. A short reply can answer an earlier assistant question, a pronoun can refer to an earlier answer, and the newest user message can revise an earlier request.

Important boundaries:
- The aggregate financial summary is always present: net worth, total cash, total debt, total investments, portfolio value, holding count, asset allocation, category spending totals, and average monthly income/expenses. Do not request a detail pack merely to obtain one of those aggregates.
- Prior assistant answers establish conversational references only. They are not trusted financial facts.
- Include every pack materially useful to answer the current message. Prefer inclusion when omission could make the answer incomplete.
- search_context is for information outside the user's stored data, especially facts that can change over time. market_context is the broader economic/market backdrop.
- needsSecondaryValidation is true for projections, comparisons, recommendations, affordability judgments, simulations, optimization, tax reasoning, or other conclusions where an independent reasoning review is useful.
- The application enforces access, subscription, dependencies and calculations. You only plan context.

Also extract retirement inputs the user actually stated in this decision. Never estimate or supply typical values. annualWithdrawalAmount means intended annual retirement spending in today's dollars, not salary, savings, portfolio value, or current spending. Convert a monthly amount only when it clearly refers to that retirement spending. A short answer takes its meaning from the assistant question immediately before it. The newest revision wins. Put the user's own short wording in sources; use null for an absent value and source.

Retirement calculator contract:
${RETIREMENT_CALCULATOR.planner.instructions}
Do not use retirementScenario merely because an ordinary retirement projection was requested.

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
      lines.push(
        `Assistant: ${answer.length > MAX_ANSWER_CHARS ? `${answer.slice(0, MAX_ANSWER_CHARS)}…` : answer}`
      );
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
  const retirementScenario = RETIREMENT_CALCULATOR.planner.parsePlan(record.retirementScenario);
  const selectedPacks = normalizeContextPacks([
    ...requestedPacks,
    ...(retirementScenario ? RETIREMENT_CALCULATOR.requiredPacks : []),
  ]);
  const needsSecondaryValidation = record.needsSecondaryValidation === true;
  const retirementInputs = validateExtractedInputs(record.retirementInputs);
  const summary = typeof record.summary === 'string'
    ? record.summary.trim().slice(0, 1000)
    : '';
  return {
    source: 'context_planner',
    requestedPacks,
    selectedPacks,
    questionNeeds: questionNeedsFromPacks(selectedPacks, needsSecondaryValidation),
    needsSecondaryValidation,
    retirementInputs,
    ...(retirementScenario && { retirementScenario }),
    summary,
    model,
    durationMs,
  };
}

/** Failure is recall-safe and contains no language heuristics: include everything. */
export function fallbackContextPlan(durationMs = 0, summary = 'Context planner unavailable; included every pack.'): ContextPlan {
  const selectedPacks = allContextPacks();
  return {
    source: 'fallback_all',
    requestedPacks: selectedPacks,
    selectedPacks,
    questionNeeds: questionNeedsFromPacks(selectedPacks, true),
    needsSecondaryValidation: true,
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
      ...openAIGenerationParams('contextPlanner'),
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
