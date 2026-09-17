/**
 * The plain-language reading of a public retirement quick plan.
 *
 * This is the one part of `/retirement-calculator` written by a model rather
 * than computed, and the split is strict: the deterministic engine produces
 * every number, and the model is only allowed to say what those numbers mean.
 * It is the same division the authenticated product already draws for scenario
 * calculators (`docs/SCENARIO_MODELING.md`) — models identify and describe,
 * the application computes.
 *
 * Three properties hold that do not hold for `/ask`, and they are the reason
 * this exists as its own small module rather than as a call into the analysis
 * pipeline:
 *
 *  1. **There is no user.** No `userId`, no financial snapshot, no profile
 *     read or write, no conversation row. A visitor here has no account, and
 *     nothing about this call can reach one.
 *  2. **There is no free text.** Every input is a number the quick plan's own
 *     validator already accepted and bounded, and the only outside data in the
 *     prompt is a handful of published rates from named series
 *     (`calculator-market-conditions`). Nothing third-party writes prose into
 *     it, so there is nothing to fence.
 *  3. **Every figure is checked.** `groundInterpretation` rejects output
 *     containing any number the engine did not compute. A rejected draft is
 *     retried once and then dropped: the page's deterministic result is
 *     already complete without this, so the failure mode is a missing
 *     paragraph rather than a wrong one.
 */

import * as Sentry from '@sentry/node';
import { askClaude } from '../openai/claude-client';
import {
  getActiveModel,
  getActiveNumericGenerationSetting,
  loadModelConfig,
} from '../openai/model-config';
import {
  getCalculatorMarketConditions,
  type CalculatorMarketConditions,
} from './calculator-market-conditions';
import type { RetirementQuickPlanResult } from './retirement-quickplan';

export const QUICKPLAN_INTERPRETATION_VERSION = 1 as const;

export interface QuickPlanInterpretation {
  /** One sentence naming what the run found. */
  headline: string;
  /** Two or three short paragraphs reading the result. */
  paragraphs: string[];
  /** What this particular plan should watch, drawn from its own figures. */
  watchOuts: string[];
  /** The model that wrote it, for the admin panel and the page's own footnote. */
  model: string;
  cached: boolean;
}

/**
 * One figure the model is allowed to state, and the ways it may write it.
 *
 * The prompt lines and the grounding allowlist are both derived from this
 * array, so a fact the model is shown is exactly a fact it may repeat and
 * there is no second list to drift.
 */
interface PlanFact {
  label: string;
  /** How the fact is written into the prompt. */
  display: string;
  /** Values a plain or money token may carry for this fact. */
  values?: number[];
  /** Values a percentage token may carry for this fact. */
  percentValues?: number[];
}

function moneyFact(label: string, value: number): PlanFact {
  return {
    label,
    display: `$${Math.round(value).toLocaleString('en-US')}`,
    // Both the exact figure and the rounded one it is displayed as: a draft
    // may legitimately repeat either, and the rounding tolerance below is
    // half a unit at the precision written, not half a unit of the source.
    values: [value, Math.round(value)],
  };
}

function countFact(label: string, value: number): PlanFact {
  return { label, display: value.toLocaleString('en-US'), values: [value] };
}

function percentFact(label: string, fraction: number, digits = 1): PlanFact {
  return {
    label,
    display: `${(fraction * 100).toFixed(digits)}%`,
    // The same fact in the two forms a writer reaches for. A percentage token
    // is checked against `percentValues` only, so "98.7%" can never be
    // satisfied by a dollar amount that happens to be 98.7.
    values: [fraction],
    percentValues: [fraction * 100],
  };
}

function plainFact(label: string, display: string, values: number[] = []): PlanFact {
  return { label, display, values };
}

/** `1926-07` as prose, with both the year and the month number licensed. */
function monthFact(label: string, month: string): PlanFact {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return plainFact(label, month);
  const names = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return {
    label,
    display: `${names[Number(match[2]) - 1]} ${match[1]}`,
    values: [Number(match[1]), Number(match[2])],
  };
}

/**
 * Everything true about this run, and nothing else.
 *
 * Exported because the grounding test suite asserts against it directly: the
 * guarantee this module makes is "no number outside this block reaches the
 * page", and that is only testable if the block is reachable.
 */
export function buildPlanFacts(
  result: RetirementQuickPlanResult,
  market?: CalculatorMarketConditions
): PlanFact[] {
  const { inputs, history, primary, allocation } = result;
  const facts: PlanFact[] = [
    // The three weights are licensed as percentages, not just as the sentence
    // that names them. A draft that repeats "60% US stocks / 35% bonds / 5%
    // cash" — which the mix being a preset practically invites — would
    // otherwise be rejected for quoting the fact block back at us.
    {
      label: 'Asset mix assumed (a preset the visitor chose, not their holdings)',
      display: `${allocation.label} — ${allocation.description}`,
      values: [allocation.usEquity, allocation.bonds, allocation.cash],
      percentValues: [
        allocation.usEquity * 100,
        allocation.bonds * 100,
        allocation.cash * 100,
      ],
    },
    countFact('Age today', inputs.currentAge),
    countFact('Planned retirement age', inputs.retirementAge),
    countFact('Years from today until retirement', Math.max(0, inputs.retirementAge - inputs.currentAge)),
    countFact('Age the model stops at', inputs.lifeExpectancy),
    countFact('Years of retirement modeled', inputs.lifeExpectancy - inputs.retirementAge),
    moneyFact('Annual saving between now and retirement', inputs.annualContributions),
    countFact('Historical retirements tested', history.sequencesTested),
    monthFact('Earliest retirement start tested', history.firstStartMonth),
    monthFact('Latest retirement start tested', history.lastStartMonth),
    countFact('Length of each tested window, in years', history.horizonYears),
  ];

  // A blank portfolio or a blank spending level is simulated against a
  // notional figure so the engine has dollars to move; that figure is not the
  // visitor's and may not be stated or described. `missing` names exactly
  // which of the two it stood in for, so each is admitted on its own — a run
  // that gave assets but no spending still gets to talk about the assets.
  if (!result.missing.includes('investableAssets')) {
    facts.push(moneyFact('Investments today', inputs.investableAssets));
  }
  if (!result.missing.includes('annualSpending')) {
    facts.push(moneyFact('Annual spending in retirement, in today’s dollars', inputs.annualSpending));
  }

  if (inputs.socialSecurityAnnual > 0) {
    facts.push(
      moneyFact('Annual Social Security entered', inputs.socialSecurityAnnual),
      countFact('Age Social Security starts', inputs.socialSecurityStartAge)
    );
    const gap = inputs.socialSecurityStartAge - inputs.retirementAge;
    if (gap > 0) {
      facts.push(countFact('Years between retiring and claiming, funded by the portfolio alone', gap));
    }
  } else {
    facts.push(plainFact('Social Security entered', 'none — the portfolio funds every year on its own'));
  }

  if (primary) {
    const failed = primary.sequencesTested - primary.sequencesSurvived;
    facts.push(
      percentFact('Share of tested retirements in which the money lasted', primary.survivalRate),
      countFact('Tested retirements in which the money lasted', primary.sequencesSurvived),
      countFact('Tested retirements in which it ran out', failed),
      moneyFact('Portfolio at retirement, median across tested histories', primary.projectedPortfolioAtRetirement),
      moneyFact('First-year withdrawal from the portfolio', primary.firstYearPortfolioWithdrawal),
      percentFact('First-year withdrawal as a share of the portfolio', primary.firstYearWithdrawalRate, 2)
    );
    if (primary.depletionYears?.p50 != null) {
      facts.push(countFact(
        'Years the money lasted in the median run that ran out',
        Math.round(primary.depletionYears.p50)
      ));
    }
    if (primary.depletionYears?.p10 != null) {
      facts.push(countFact(
        'Years it lasted in the worst tenth of the runs that ran out',
        Math.round(primary.depletionYears.p10)
      ));
    }
    facts.push(plainFact(
      'How the engine characterised this asset mix (not this plan’s outcome)',
      `${primary.primaryObservation}. Upside: ${primary.tradeoffs.upside}. Downside: ${primary.tradeoffs.downside}`
    ));

    for (const alternative of result.alternatives) {
      facts.push({
        label: `Variant — ${alternative.label} (${alternative.change ?? 'as entered'})`,
        display: `${(alternative.survivalRate * 100).toFixed(1)}% of the same tested retirements lasted`,
        // The label quotes the variant's own figures back, so all of them are
        // licensed — including the year delta inside "two more years of work",
        // which a draft repeating the row would otherwise be rejected for.
        values: [
          alternative.survivalRate,
          alternative.retirementAge,
          alternative.annualSpending,
          alternative.retirementAge - inputs.retirementAge,
        ],
        percentValues: [
          alternative.survivalRate * 100,
          // The "10%" of "Spend 10% less", which the label states and a draft
          // describing the row will repeat.
          Math.round((1 - alternative.annualSpending / inputs.annualSpending) * 100),
        ],
      });
    }
  }

  // Dollars when a portfolio was given, rates otherwise. The rate form is the
  // only one that is true without knowing the portfolio, which is why the
  // rates-mode pane reports it.
  // The confidence levels are spelled out rather than written "9 of 10". A
  // draft repeating the label should be repeating words, not digits that are
  // about the label rather than about the plan.
  const spending = result.sustainableSpending;
  if (spending) {
    facts.push(
      moneyFact('Annual spending that nine in every ten tested histories sustained', spending.p10),
      moneyFact('Annual spending that half of the tested histories sustained', spending.p50)
    );
  } else {
    facts.push(
      percentFact(
        'Withdrawal rate that nine in every ten tested histories sustained',
        result.sustainableSpendingRates.p10,
        2
      ),
      percentFact(
        'Withdrawal rate that half of the tested histories sustained',
        result.sustainableSpendingRates.p50,
        2
      )
    );
  }

  for (const entry of result.assumed) {
    facts.push({
      label: `Filled in on the visitor’s behalf — ${entry.field}`,
      display: `${entry.value.toLocaleString('en-US')} (${entry.note})`,
      values: [entry.value],
    });
  }

  // Published rates, last so the plan's own figures lead. Each is licensed the
  // same way every other fact is, so a sentence about today's yields is held
  // to the number the series actually printed.
  //
  // The label itself carries digits — "30-year", "10-year", and the as-of date
  // — and a draft that quotes the fact block back will repeat them. Those
  // digits have to be licensed too, or the panel is rejected for restating the
  // prompt, the same failure the asset-mix weights were fixed for above.
  for (const rate of marketRates(market)) {
    const label = `Today, for context — ${rate.label} (${rate.source}, as of ${rate.asOf})`;
    facts.push({
      label,
      display: `${rate.percent.toFixed(2)}%`,
      values: [
        rate.percent / 100,
        ...extractNumericTokens(`${rate.label} ${rate.asOf}`)
          .filter((token) => !token.isPercent)
          .map((token) => token.value),
      ],
      percentValues: [rate.percent],
    });
  }

  return facts;
}

/** The rates present in this set, in the order the prompt should read them. */
function marketRates(market?: CalculatorMarketConditions) {
  if (!market) return [];
  return [
    market.treasury30Y,
    market.treasury10Y,
    market.inflationYoY,
    market.inflationExpectation10Y,
  ].filter((rate): rate is NonNullable<typeof rate> => Boolean(rate));
}

/* ------------------------------------------------------------------ *
 * Grounding
 * ------------------------------------------------------------------ */

/**
 * A number as the model wrote it.
 *
 * `halfWidth` is what rounding to the precision actually written permits: a
 * figure given as "$3.3M" is any value within $50,000 of 3,300,000, while the
 * same figure as "$3,326,192" is within half a dollar. Checking against a flat
 * tolerance would either reject honest rounding or accept a wrong million.
 */
interface NumericToken {
  raw: string;
  value: number;
  halfWidth: number;
  isPercent: boolean;
}

const MAGNITUDES: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  m: 1_000_000,
  million: 1_000_000,
  b: 1_000_000_000,
  billion: 1_000_000_000,
};

/**
 * The precision a written figure actually commits to.
 *
 * Decimals state it outright. Trailing zeros state it too — "$140,000" is a
 * figure rounded to the nearest ten thousand, and reading it as exact to the
 * dollar rejects the most ordinary sentence a writer can produce. Rates are
 * the exception: trailing zeros mean nothing in "100%", and widening there
 * would let a round number stand in for a materially different one.
 *
 * The widening stops at two significant figures, so "$3M" cannot stand for
 * $3.36M. Within that bound an accepted figure is a correct rounding of a
 * figure the engine computed, which is exactly what the prompt licenses.
 */
function writtenStep(digits: string, decimals: number, multiplier: number, isPercent: boolean): number {
  if (decimals > 0) return Math.pow(10, -decimals) * multiplier;
  if (isPercent) return 1;

  const trailingZeros = /0*$/.exec(digits)?.[0].length ?? 0;
  const written = Math.pow(10, trailingZeros) * multiplier;
  const value = Math.abs(Number(digits) * multiplier);
  const significantFigures = value >= 1 ? Math.floor(Math.log10(value)) + 1 : 1;
  const twoSignificantFigures = Math.pow(10, Math.max(0, significantFigures - 2));
  return Math.min(written, twoSignificantFigures);
}

/**
 * Every number in a piece of prose.
 *
 * The magnitude suffix has to be followed by a non-letter, or "3 months"
 * reads as three million and a draft that said something ordinary is rejected
 * for a figure it never wrote. A rate spelled out as "percent" is read as the
 * percentage it is, so it is checked against the percentage facts rather than
 * falling through to the dollar amounts.
 */
export function extractNumericTokens(text: string): NumericToken[] {
  /*
   * The sign is captured rather than skipped. Starting the match at the first
   * digit reads "-5%" as "5%" and "$-48,000" as "$48,000", and since the
   * positive figure is usually in the allowlist — 5% is the cash weight,
   * $48,000 the contributions — a draft stating the opposite of a fact would
   * pass the check that exists to catch exactly that.
   *
   * Both sign positions refuse a hyphen that follows a digit, so the one in
   * "30-year" or "1926-1985" stays a hyphen. An en dash is never a sign, for
   * the same reason: it is how a range is written.
   */
  const pattern = new RegExp(
    String.raw`(?:(?<![\d.,])(?<neg>[-\u2212])\s*)?` +
    String.raw`(?<dollar>\$\s*)?` +
    String.raw`(?:(?<![\d.,])(?<negAfterDollar>[-\u2212])\s*)?` +
    String.raw`(?<num>\d[\d,]*(?:\.\d+)?|\.\d+)` +
    String.raw`\s*(?<magnitude>thousand|million|billion|[kmb])?(?![a-z])` +
    String.raw`\s*(?<percent>%|percent\b)?`,
    'gi'
  );

  const tokens: NumericToken[] = [];
  for (const match of text.matchAll(pattern)) {
    const groups = match.groups ?? {};
    const plain = (groups.num ?? '').replace(/,/g, '');
    const base = Number(plain);
    if (!Number.isFinite(base)) continue;

    const multiplier = groups.magnitude
      ? MAGNITUDES[groups.magnitude.toLowerCase()] ?? 1
      : 1;
    const dot = plain.indexOf('.');
    const decimals = dot === -1 ? 0 : plain.length - dot - 1;
    const isPercent = Boolean(groups.percent);
    const negative = Boolean(groups.neg || groups.negAfterDollar);
    // Trailing zeros are read off the integer part only: the "0" ending
    // "3.10" says something about the decimals, which are already counted.
    const integerDigits = dot === -1 ? plain : plain.slice(0, dot);

    tokens.push({
      raw: match[0].trim(),
      value: (negative ? -base : base) * multiplier,
      halfWidth: 0.5 * writtenStep(integerDigits, decimals, multiplier, isPercent),
      isPercent,
    });
  }
  return tokens;
}

export interface GroundingResult {
  grounded: boolean;
  /** The tokens that matched nothing, as written, for the retry to name. */
  ungrounded: string[];
}

/**
 * Check every number in the draft against the figures the engine computed.
 *
 * Percentage tokens are checked only against percentage facts, so a rate
 * cannot be satisfied by an unrelated dollar amount that shares its digits.
 * Within each kind the check is by value rather than by fact, which does leave
 * one gap worth naming: a draft can attach a true figure to the wrong label —
 * quoting the median portfolio as the first-year draw, say. Every number that
 * reaches the page is one this run produced; that it is the *right* one for
 * the sentence around it is what the prompt and the fact labels are for.
 */
export function groundInterpretation(
  draft: Pick<QuickPlanInterpretation, 'headline' | 'paragraphs' | 'watchOuts'>,
  facts: PlanFact[]
): GroundingResult {
  const plain: number[] = [];
  const percents: number[] = [];
  for (const fact of facts) {
    for (const value of fact.values ?? []) plain.push(value);
    for (const value of fact.percentValues ?? []) percents.push(value);
  }

  const text = [draft.headline, ...draft.paragraphs, ...draft.watchOuts].join('\n');
  const ungrounded: string[] = [];
  for (const token of extractNumericTokens(text)) {
    const allowed = token.isPercent ? percents : plain;
    // A hair over the half-width, so a value sitting exactly on a rounding
    // boundary is not rejected by floating-point noise.
    const slack = token.halfWidth * 1.000001;
    if (!allowed.some((value) => Math.abs(token.value - value) <= slack)) {
      ungrounded.push(token.raw);
    }
  }

  return { grounded: ungrounded.length === 0, ungrounded: [...new Set(ungrounded)] };
}

/* ------------------------------------------------------------------ *
 * The model call
 * ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You write the interpretation panel on Ask Linc's public retirement calculator.

A visitor has entered a handful of numbers. A deterministic engine has already run their plan against a century of month-by-month US market history and produced every figure below. Your job is to say what those figures mean. You are not answering a question, and there is no conversation — this is one panel of a results page.

# Non-negotiable rules

1. Every number you write must come from the supplied figures. State them as given or rounded more coarsely; never add, subtract, divide, average or otherwise derive a new one. Output containing any other number is rejected and discarded.
2. Write small counts as words ("two levers", "a third of"), so that every digit on the page is a figure from the list.
3. Describe, do not prescribe. Say what the tested histories did and what this plan's own numbers imply. Never tell the visitor what to do, what to buy or sell, when to retire, or to consult anyone.
4. Never claim to know anything the list does not contain — their actual holdings, taxes, fees, account types, health, housing, or any income not listed. The asset mix is a preset the visitor picked from three, not their portfolio.
5. A survival share is a count of historical stretches, never a probability of their future. Write "in 87% of the retirements we could test", not "you have an 87% chance".
6. Figures labelled "Today, for context" are published rates as of the dates given. Use them only to locate today inside the tested record — a starting yield or an inflation reading is a condition this retirement would begin from, and the historical distribution averages over hundreds of such starting points. Never present one as a forecast, a reason the result is wrong, or a reason to act. If they add nothing to this particular plan, leave them out.
7. Second person, plain words, short sentences. No headers, no bullets inside a paragraph, no markdown.

# Output

Return one JSON object and nothing else:

{
  "headline": "one sentence, under 140 characters, naming what this run found",
  "paragraphs": ["2 to 3 paragraphs, each 2 to 4 sentences"],
  "watchOuts": ["2 to 3 single sentences, each naming something specific to these figures"]
}

The first paragraph reads the headline result. The second explains what is driving it — the withdrawal rate, the horizon, the contributions, the Social Security timing, whichever the figures actually implicate. A third, if it earns its place, reads the variants. The watch-outs are about this plan, not about calculators in general: "no taxes are modeled" is only worth saying if you tie it to a figure here.`;

/** What a rates-mode reading must not invent, given which boxes were blank. */
function ratesModeInstructions(missing: RetirementQuickPlanResult['missing']): string {
  const missingLabels: Record<RetirementQuickPlanResult['missing'][number], string> = {
    investableAssets: 'what they have invested',
    annualSpending: 'what they expect to spend each year',
  };
  const blanks = missing.map((field) => missingLabels[field]);
  // Only withhold the figure that was actually blank. A visitor who gave
  // spending but not a portfolio still gets to hear about the spending — the
  // fact block already licenses it — and telling the model not to mention it
  // would contradict the list below.
  const withhold = [
    'a verdict',
    missing.includes('investableAssets') ? 'a balance' : null,
    missing.includes('annualSpending') ? 'a spending level' : null,
  ].filter((entry): entry is string => entry !== null);
  const withholdClause = withhold.length === 2
    ? `${withhold[0]} or ${withhold[1]}`
    : withhold.length > 2
      ? `${withhold.slice(0, -1).join(', ')}, or ${withhold[withhold.length - 1]}`
      : withhold[0];
  const plural = blanks.length > 1;
  return (
    'The visitor left ' + blanks.join(' and ') + ' blank. There is no survival verdict, because '
    + (plural ? 'neither can' : 'it cannot') + ' be guessed at: the engine answered in '
    + 'withdrawal rates instead, which hold whatever ' + (plural ? 'those figures' : 'that figure')
    + ' turn' + (plural ? '' : 's') + ' out to be. Do not state or imply ' + withholdClause
    + '. Say plainly what filling the blank' + (plural ? 's' : '') + ' in would add.'
  );
}

/** Everything the model sees about this run, in one block. */
function buildUserMessage(
  result: RetirementQuickPlanResult,
  facts: PlanFact[],
  feedback?: string[]
): string {
  const mode = result.mode === 'plan'
    ? 'The visitor gave both a portfolio and a spending level, so the engine produced a survival verdict for their own plan.'
    : ratesModeInstructions(result.missing);

  const lines = [
    mode,
    '',
    'Figures the engine computed. These are the only numbers you may write:',
    ...facts.map((fact) => `- ${fact.label}: ${fact.display}`),
  ];

  if (feedback && feedback.length > 0) {
    lines.push(
      '',
      'Your previous draft was rejected. These numbers appear in it but are not in the list above:',
      ...feedback.map((token) => `- ${token}`),
      '',
      'Rewrite it using only the figures listed. Do not compute anything.'
    );
  }

  return lines.join('\n');
}

/**
 * Pull the JSON object out of a response that may be fenced or prefaced.
 * Returns null rather than throwing: an unparseable draft is a dropped panel,
 * not a failed request.
 */
function parseDraft(raw: string): Pick<QuickPlanInterpretation, 'headline' | 'paragraphs' | 'watchOuts'> | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const candidate = parsed as Record<string, unknown>;
  const headline = typeof candidate.headline === 'string' ? candidate.headline.trim() : '';
  const paragraphs = Array.isArray(candidate.paragraphs)
    ? candidate.paragraphs.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim())
    : [];
  const watchOuts = Array.isArray(candidate.watchOuts)
    ? candidate.watchOuts.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim())
    : [];

  if (!headline || paragraphs.length === 0) return null;
  return { headline, paragraphs, watchOuts };
}

const DEFAULT_MAX_OUTPUT_TOKENS = 2_000;

/**
 * The hard ceiling on one visitor's wait for this panel, across both attempts.
 *
 * Without it the SDK's own default applies — ten minutes per request, and it
 * retries a timeout — so a provider that stalls rather than refusing would
 * leave "Reading your result…" on the page and an unauthenticated request open
 * for as long as it cared to. The whole design is that a reading which cannot
 * be produced is dropped; a stall has to reach that same path, not hang.
 */
const TOTAL_BUDGET_MS = 25_000;

/**
 * Below this, there is no point starting an attempt: the model cannot write
 * and return a JSON object in the time left, and trying spends the budget on a
 * request that will time out anyway.
 */
const MIN_ATTEMPT_MS = 4_000;

function maxOutputTokens(): number {
  const configured = getActiveNumericGenerationSetting('calculatorNarrative', 'maxOutputTokens');
  return configured !== null && configured > 0 ? configured : DEFAULT_MAX_OUTPUT_TOKENS;
}

/**
 * Results are a pure function of the run, and landing-page visitors reach for
 * round numbers, so the same plan is interpreted once. Bounded and dropped on
 * restart, exactly like the plan cache it shadows.
 */
const MAX_CACHED_INTERPRETATIONS = 300;
const interpretationCache = new Map<string, QuickPlanInterpretation>();

export function clearInterpretationCache(): void {
  interpretationCache.clear();
}

/** The run, not the request: two requests that normalize alike share a reading. */
function cacheKey(
  result: RetirementQuickPlanResult,
  market: CalculatorMarketConditions
): string {
  const { inputs } = result;
  return JSON.stringify([
    QUICKPLAN_INTERPRETATION_VERSION,
    result.version,
    result.mode,
    getActiveModel('calculatorNarrative'),
    // The rates themselves, not just their dates. A date alone misses a
    // provider revising a value in place, and misses the 10-year point falling
    // back from Massive to FRED — same label, possibly the same date, a
    // different number. Either would serve prose quoting a yield that is no
    // longer the one in the facts, which is the guarantee this module makes.
    marketRates(market).map(
      (rate) => `${rate.label}@${rate.source}@${rate.asOf}@${rate.percent}`
    ),
    inputs.currentAge,
    inputs.retirementAge,
    inputs.investableAssets,
    inputs.annualSpending,
    inputs.annualContributions,
    inputs.socialSecurityAnnual,
    inputs.socialSecurityStartAge,
    inputs.lifeExpectancy,
    inputs.allocation,
  ]);
}

/**
 * Write the reading of one quick plan.
 *
 * Returns null when no grounded draft could be produced, which the route
 * serves as an empty body and the page renders as nothing at all. The
 * deterministic result is complete without this panel, so dropping it costs a
 * paragraph; shipping an ungrounded one would put an invented figure under our
 * own branding on the page that argues our numbers are real.
 */
export async function interpretRetirementQuickPlan(
  result: RetirementQuickPlanResult
): Promise<QuickPlanInterpretation | null> {
  // Both before the cache is consulted, and both nearly free on the usual
  // path: the config is cached in-process and the rates behind their own hour.
  // The model and the rate vintage are part of the key, so neither can be read
  // after the lookup that depends on it.
  const [, market] = await Promise.all([loadModelConfig(), getCalculatorMarketConditions()]);

  const key = cacheKey(result, market);
  const hit = interpretationCache.get(key);
  if (hit) return { ...hit, cached: true };

  const facts = buildPlanFacts(result, market);
  const model = getActiveModel('calculatorNarrative');
  let feedback: string[] | undefined;

  const deadline = Date.now() + TOTAL_BUDGET_MS;

  // One retry, and only for a draft that was rejected for its numbers. A
  // second failure means the model is not going to stay inside the block for
  // this plan, and a third call would spend a visitor's wait on the same odds.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    // Each attempt gets what is left of the whole budget rather than a fixed
    // slice, so a fast first attempt leaves the retry room to finish and a
    // slow one cannot start a second request the visitor would wait out.
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) {
      console.warn('Retirement interpretation: out of time before attempt %d.', attempt + 1);
      return null;
    }

    let raw: string;
    try {
      raw = await askClaude(SYSTEM_PROMPT, buildUserMessage(result, facts, feedback), {
        slot: 'calculatorNarrative',
        maxTokens: maxOutputTokens(),
        timeoutMs: remaining,
        // The SDK retries a timeout by default, which would multiply the
        // ceiling just set. Retrying is also the wrong answer here: this panel
        // is optional and the page is waiting.
        maxRetries: 0,
      });
    } catch (error) {
      // The provider is the one thing here that fails for reasons unrelated to
      // this plan, so it is worth seeing in Sentry; the visitor still gets
      // their deterministic result.
      console.warn('Retirement interpretation: model call failed:', error);
      Sentry.captureException(error);
      return null;
    }

    const draft = parseDraft(raw);
    if (!draft) {
      console.warn('Retirement interpretation: response did not parse as the expected object.');
      return null;
    }

    const grounding = groundInterpretation(draft, facts);
    if (grounding.grounded) {
      const interpretation: QuickPlanInterpretation = { ...draft, model, cached: false };
      if (interpretationCache.size >= MAX_CACHED_INTERPRETATIONS) {
        const oldest = interpretationCache.keys().next();
        if (!oldest.done) interpretationCache.delete(oldest.value);
      }
      interpretationCache.set(key, interpretation);
      return interpretation;
    }

    feedback = grounding.ungrounded;
  }

  // Worth a message rather than silence: a model that cannot stay inside the
  // fact block for a whole class of plans shows up here as a rate, and the
  // page gives no other sign that anything was dropped.
  const message = `Retirement interpretation: ungrounded after retry (model=${model}, tokens=${feedback?.join(', ')})`;
  console.warn(message);
  Sentry.captureMessage(message, 'warning');
  return null;
}
