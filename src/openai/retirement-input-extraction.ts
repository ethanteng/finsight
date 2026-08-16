/**
 * Reading the retirement inputs out of a conversation.
 *
 * These used to come from about twenty regexes and three word lists whose job
 * was to decide, from wording alone, whether a number was money going out.
 * That question is semantic, not lexical — "annual income" is a spending target
 * in one sentence and a salary in another — so every guard added to stop a
 * false positive created a false negative on the other side. The rules shipped
 * four wrong numbers into projections before this replaced them, each one
 * caught by running the code rather than reading it.
 *
 * The model reads the decision's turns and reports the inputs. Two properties
 * keep that safe:
 *
 *   - It sees the assistant's answers, not just the user's questions. "62" is
 *     unresolvable alone, and obvious after "what age do you plan to retire?".
 *     The rules could never see that, and punted with a magnitude floor.
 *   - Nothing here computes. The projection stays deterministic; this only
 *     proposes its inputs, and every proposal is range-checked below.
 */

import OpenAI from 'openai';
import * as Sentry from '@sentry/node';
import { getActiveModel } from './model-config';
import { openAIGenerationParams } from './openai-generation-params';

export interface RetirementInputTurn {
  question: string;
  answer?: string;
}

export interface ExtractedRetirementInputs {
  currentAge?: number;
  retirementAge?: number;
  annualWithdrawalAmount?: number;
  withdrawalStartAge?: number;
  lifeExpectancy?: number;
  /** The words each value came from, for the answer to cite and Show the Math to display. */
  sources: Partial<Record<ExtractedField, string>>;
}

type ExtractedField =
  | 'currentAge'
  | 'retirementAge'
  | 'annualWithdrawalAmount'
  | 'withdrawalStartAge'
  | 'lifeExpectancy';

const FIELDS: ExtractedField[] = [
  'currentAge',
  'retirementAge',
  'annualWithdrawalAmount',
  'withdrawalStartAge',
  'lifeExpectancy',
];

/**
 * Ranges a human plan can actually occupy. Not wording heuristics — these catch
 * a misread, not a phrasing the rules did not anticipate. An out-of-range value
 * is dropped rather than clamped: reporting the input as missing asks the user,
 * where a clamped number would run a projection nobody chose.
 */
const RANGES: Record<ExtractedField, { min: number; max: number; integer: boolean }> = {
  currentAge: { min: 18, max: 120, integer: true },
  retirementAge: { min: 30, max: 100, integer: true },
  withdrawalStartAge: { min: 30, max: 120, integer: true },
  lifeExpectancy: { min: 50, max: 120, integer: true },
  // No lower floor near a plausible "budget": with the turns in front of it the
  // model can tell $8,000 a year from a monthly bill, which is exactly what the
  // rules could not do. The bound only rejects impossible magnitudes.
  annualWithdrawalAmount: { min: 1, max: 100_000_000, integer: false },
};

const NULLABLE_NUMBER = { type: ['number', 'null'] as const };
const NULLABLE_STRING = { type: ['string', 'null'] as const };

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...FIELDS, 'sources'],
  properties: {
    currentAge: NULLABLE_NUMBER,
    retirementAge: NULLABLE_NUMBER,
    annualWithdrawalAmount: NULLABLE_NUMBER,
    withdrawalStartAge: NULLABLE_NUMBER,
    lifeExpectancy: NULLABLE_NUMBER,
    sources: {
      type: 'object',
      additionalProperties: false,
      required: FIELDS,
      properties: Object.fromEntries(FIELDS.map(field => [field, NULLABLE_STRING])),
    },
  },
};

const SYSTEM_PROMPT = `You read a financial planning conversation and report the retirement projection inputs the user has actually stated.

Report only what the conversation states or plainly implies. Never estimate, never fill a gap with a typical value, and never carry a number over from a different purpose. A missing input is null — the assistant will ask the user for it, which is always better than a projection built on a guess.

Rules that matter:
- annualWithdrawalAmount is what the user expects to SPEND per year in retirement, in today's dollars. Income, salary, savings, portfolio value and current (pre-retirement) spending are not this number.
- A figure given per month is not the annual figure. Convert only when the user is clearly describing the same spending (multiply by 12); otherwise report null.
- The user's short replies answer whatever the assistant last asked. "62" after a question about retirement age is an age; the same reply after a question about spending is not an age.
- When the user revises a number, the most recent statement wins.
- withdrawalStartAge is when they begin drawing from the portfolio, which is usually the retirement age unless they say otherwise.

For every value you report, put the user's own words for it in sources — a short quote, not a paraphrase. If a value is null its source is null.`;

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey) throw new Error('OPENAI_API_KEY is required for retirement input extraction.');
    client = new OpenAI({ apiKey });
  }
  return client;
}

/**
 * An answer only has to establish what was being asked, and the opening of one
 * does that. Full answers run long, and paying for the tail of each of them on
 * every retirement question buys nothing. Matches the cap the main reasoning
 * prompt already applies to conversation history.
 */
const MAX_ANSWER_CHARS = 1500;

/** Render the decision as a transcript, oldest turn first, so "the last question" is unambiguous. */
export function buildExtractionTranscript(question: string, priorTurns: readonly RetirementInputTurn[]): string {
  const lines: string[] = [];
  for (const turn of [...priorTurns].reverse()) {
    lines.push(`User: ${turn.question}`);
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

/** Drop anything outside the range a real plan occupies; keep the rest. */
export function validateExtractedInputs(raw: unknown): ExtractedRetirementInputs {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawSources = (record.sources && typeof record.sources === 'object' ? record.sources : {}) as Record<string, unknown>;

  const result: ExtractedRetirementInputs = { sources: {} };
  for (const field of FIELDS) {
    const value = record[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const range = RANGES[field];
    if (value < range.min || value > range.max) continue;
    if (range.integer && !Number.isInteger(value)) continue;
    result[field] = value;
    const source = rawSources[field];
    if (typeof source === 'string' && source.trim()) result.sources[field] = source.trim();
  }

  // Withdrawals start at retirement unless the conversation said otherwise.
  if (result.withdrawalStartAge == null && result.retirementAge != null) {
    result.withdrawalStartAge = result.retirementAge;
  }
  return result;
}

/**
 * @param question the message being answered
 * @param priorTurns earlier turns of this decision, newest first
 * @returns the stated inputs, or null when the extraction could not run — the
 *   caller falls back to pattern matching rather than losing the turn
 */
export async function extractRetirementInputs(
  question: string,
  priorTurns: readonly RetirementInputTurn[] = []
): Promise<ExtractedRetirementInputs | null> {
  try {
    const response = await getClient().chat.completions.create({
      model: getActiveModel('retirementInputs'),
      // The inputs to a financial projection should not vary between identical
      // conversations; the analysis is also cached by exact parameters. That is
      // why this slot's temperature ships at 0 — see SLOT_GENERATION_SETTINGS,
      // which carries the reasoning to anyone about to change it in the panel.
      ...openAIGenerationParams('retirementInputs'),
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'retirement_inputs', strict: true, schema: EXTRACTION_SCHEMA },
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildExtractionTranscript(question, priorTurns) },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    // An all-null result is an answer, not an absence of one: the model read the
    // turns and reports that the user has not stated these inputs. Falling back
    // to patterns here would hand the final say to wording rules in exactly the
    // cases where a reader with the full conversation declined to find a number
    // — which is where every one of the four wrong values came from. A missing
    // input asks the user, which is the outcome worth protecting.
    return validateExtractedInputs(JSON.parse(content));
  } catch (error) {
    // Never fatal: the pattern matcher still runs, and a missing input is
    // reported to the user as missing rather than surfacing as a failed answer.
    console.warn('Retirement input extraction failed; falling back to pattern matching:', error);
    Sentry.captureException(error);
    return null;
  }
}
