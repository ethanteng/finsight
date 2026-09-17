/**
 * The plain-language reading of a public Coast FIRE result.
 *
 * Same division as `/retirement-calculator`: the formula produces every
 * number and the model is only allowed to say what those numbers mean. Asking
 * is now all that enforces it — the figures are checked and the mismatches
 * logged, but a reading is shown either way. `calculator-interpretation` holds
 * that machinery; this file holds what is specific to a Coast FIRE run.
 *
 * Two things make this reading harder to write than the quick plan's, and the
 * prompt below is shaped around both:
 *
 *  1. **"Reached" invites the wrong conclusion.** A green badge reads as
 *     permission to stop saving, and the whole point of the page beneath it is
 *     that one simplified projection is not that decision. The model may
 *     describe what the number means; it may not tell anyone what to do about
 *     their contributions, their job, or their spending.
 *  2. **This is one straight line, not a distribution.** The quick plan tests
 *     a plan against hundreds of real historical stretches and can honestly
 *     report how many lasted. Coast FIRE compounds a single assumed return for
 *     a fixed number of years. There is no probability here to report, and the
 *     sensitivity rows exist precisely because that one assumption carries the
 *     answer.
 */

import {
  countFact,
  InterpretationCache,
  marketRateFact,
  moneyFact,
  percentFact,
  plainFact,
  rateFact,
  runCalculatorInterpretation,
  signedMoneyFact,
  type CalculatorFact,
} from './calculator-interpretation';
import { getActiveModel, loadModelConfig } from '../openai/model-config';
import {
  getCalculatorMarketConditions,
  type CalculatorMarketConditions,
} from './calculator-market-conditions';
import { coastFireSensitivity, type CoastFireResult } from './coast-fire';

export const COAST_FIRE_INTERPRETATION_VERSION = 1 as const;

export interface CoastFireInterpretation {
  /** One sentence naming what this result found. */
  headline: string;
  /** Two or three short paragraphs reading it. */
  paragraphs: string[];
  /** What this particular scenario should watch, drawn from its own figures. */
  watchOuts: string[];
  /** The model that wrote it, for the admin panel. */
  model: string;
  cached: boolean;
}

/**
 * Everything true about this run, and nothing else.
 *
 * Exported because the grounding suite asserts against it directly: the
 * advisory check this module runs is "does every number fall inside this
 * block", and that is only testable if the block is reachable.
 */
export function buildCoastFireFacts(
  result: CoastFireResult,
  market?: CalculatorMarketConditions
): CalculatorFact[] {
  const facts: CalculatorFact[] = [
    countFact('Age today', result.currentAge),
    countFact('Planned retirement age', result.retirementAge),
    countFact('Years from today until retirement', result.yearsToRetirement),
    moneyFact('Retirement savings today', result.currentSavings),
    moneyFact('Annual spending planned in retirement, in today’s dollars', result.annualRetirementSpending),
    moneyFact(
      'Annual income expected from the day they retire (Social Security, a pension, or similar)',
      result.annualRetirementIncome
    ),
    moneyFact(
      'Annual spending the portfolio itself has to cover, after that income',
      result.portfolioSpendingNeed
    ),
    rateFact('Assumed annual return after inflation, every year, entered by the visitor', result.realReturnRate),
    rateFact('Assumed first-year withdrawal rate, entered by the visitor', result.withdrawalRate),
    moneyFact('Portfolio needed at retirement', result.retirementTarget),
    moneyFact('Coast FIRE number — what would need to be invested today to reach that without adding a dollar', result.coastFireNumber),
    moneyFact(
      'What today’s savings alone would grow to by retirement, adding nothing further',
      result.projectedSavingsAtRetirement
    ),
    plainFact(
      'Whether today’s savings already meet the Coast FIRE number',
      result.hasReachedCoastFire ? 'yes, they are at or above it' : 'no, they are below it'
    ),
  ];

  // The gaps, signed. A sentence naming one writes the absolute value and
  // carries the direction in words — "$79,000 short", "$212,000 above" — so
  // both signs are licensed; see `signedMoneyFact`.
  facts.push(
    signedMoneyFact(
      result.hasReachedCoastFire
        ? 'How far today’s savings sit above the Coast FIRE number'
        : 'How far today’s savings sit below the Coast FIRE number',
      result.differenceToday
    ),
    signedMoneyFact(
      result.differenceAtRetirement >= 0
        ? 'How far the untouched projection lands above the portfolio needed at retirement'
        : 'How far the untouched projection falls short of the portfolio needed at retirement',
      result.differenceAtRetirement
    )
  );

  /*
   * Only when there is a ratio to state. A scenario whose entered retirement
   * income already covers its entered spending asks nothing of the portfolio:
   * the target and the Coast FIRE number are both zero and the funded share is
   * infinite. That is a real answer, but it is a sentence rather than a
   * percentage, and licensing `Infinity` would license nothing at all.
   */
  if (result.portfolioSpendingNeed > 0 && Number.isFinite(result.fundedRatio)) {
    facts.push(percentFact(
      'Share of the Coast FIRE number today’s savings currently cover',
      result.fundedRatio
    ));
  } else {
    facts.push(plainFact(
      'Share of the Coast FIRE number today’s savings cover',
      'not applicable — the income they entered already covers the spending they entered, so this ' +
      'formula asks nothing of the portfolio'
    ));
  }

  /*
   * The one-point-either-way comparison the page prints under the result. The
   * label quotes each row's own figures, so the rate and the number it
   * produces are both licensed — a draft describing the row would otherwise be
   * rejected for repeating the prompt back at us.
   */
  for (const scenario of coastFireSensitivity(result)) {
    facts.push({
      label:
        `If the return assumption were ${scenario.rate.toFixed(1)}% instead` +
        (scenario.selected ? ' (this is the rate they entered)' : ''),
      display:
        `the Coast FIRE number would be $${Math.round(scenario.coastFireNumber).toLocaleString('en-US')}` +
        `, which today’s savings ${scenario.reached ? 'would still meet' : 'would not meet'}`,
      // The rate stays in percentValues only. Putting 4 or 6 in the plain
      // allowlist would license "over the next 4 years" the same way a
      // "30-year" label used to license a bare 30 — and those adjacent rates
      // are not horizons this run used.
      values: [
        scenario.coastFireNumber,
        Math.round(scenario.coastFireNumber),
        scenario.rate / 100,
      ],
      percentValues: [scenario.rate],
    });
  }

  // Published rates, last so the visitor's own figures lead. Each is licensed
  // the same way every other fact is, so a sentence about today's yields is
  // held to the number the series actually printed. `marketRateFact` is what
  // keeps the label and the date from licensing anything else — a bare "30"
  // from "30-year" would license "over the next 30 years", which is neither a
  // horizon this run used nor a number it produced.
  for (const rate of marketRates(market)) {
    facts.push(marketRateFact(rate));
  }

  return facts;
}

/** The rates present in this set, in the order the prompt should read them. */
function marketRates(market?: CalculatorMarketConditions) {
  if (!market) return [];
  return [
    market.inflationYoY,
    market.inflationExpectation10Y,
    market.treasury30Y,
    market.treasury10Y,
  ].filter((rate): rate is NonNullable<typeof rate> => Boolean(rate));
}

const SYSTEM_PROMPT = `You write the interpretation panel on Ask Linc's public Coast FIRE calculator.

A visitor has entered seven numbers. A deterministic formula has already produced every figure below: it subtracts the retirement income they expect from the spending they expect, divides the remainder by their withdrawal rate to get the portfolio they would need at retirement, and discounts that back to today at their assumed real return. Your job is to say what those figures mean. You are not answering a question, and there is no conversation — this is one panel of a results page.

# Non-negotiable rules

1. Every number you write must come from the supplied figures. State them as given or rounded more coarsely; never add, subtract, divide, average or otherwise derive a new one. Nothing downstream checks this before the visitor reads it: a number you invent here is a number they are shown.
2. Write small counts as words ("two levers", "a third of"). Rule 1 applies to a quantity however it is written: "seven years" and "7 years" are the same claim, and spelling one out does not make it a figure you may invent.
3. Describe, do not prescribe. This is the rule that matters most here: reaching the number does not mean anyone should stop contributing, change jobs, take a pay cut, or spend more, and falling short does not mean anyone should save harder. Say what the figures show. Never tell the visitor what to do, what to buy or sell, when to retire, or to consult anyone.
4. This is one projection at one constant rate, not a simulation and not a forecast. There is no probability here. Never write "chance", "likely", "should be fine", "on track to", or any phrasing that treats the result as an odds. Write "this projection", "at the return you entered", "on these assumptions".
5. The return and the withdrawal rate are assumptions the visitor typed, not our estimates and not market predictions. Say so when the result leans on them, which it always does — a point either way compounds for the whole run, and the figures include what the answer becomes at a point above and below.
6. Never claim to know anything the list does not contain — their actual holdings, contributions, taxes, fees, account types, healthcare, housing, employment, or any income not listed. Nothing here models taxes, fees, account types, a market that moves unevenly, spending that changes, or income that starts later than retirement.
7. Figures labelled "Today, for context" are published rates as of the dates given. Use them only to locate today's conditions against the assumption the visitor typed — an inflation reading or a starting yield is a condition, never a forecast, never a reason the result is wrong, and never a reason to act. If they add nothing to this particular scenario, leave them out.
8. Second person, plain words, short sentences. No headers, no bullets inside a paragraph, no markdown.
9. Write a share as the percentage the list gives. Never turn one into a ratio of your own — "9 in 10", "8 out of 10" — because those digits are a figure you worked out, not one from the list. Where the list spells a proportion out, use its words.
10. Never state a remainder, a complement or a difference you worked out yourself: the share that ran short when you were given the share that lasted, what is left after subtracting, how much more one figure is than another. If the list does not contain it, it does not go on the page.

# Output

Return one JSON object and nothing else:

{
  "headline": "one sentence, under 140 characters, naming what this scenario found",
  "paragraphs": ["2 to 3 paragraphs, each 2 to 4 sentences"],
  "watchOuts": ["2 to 3 single sentences, each naming something specific to these figures"]
}

The first paragraph reads the headline result — where their savings sit against the Coast FIRE number, and what that number is. The second explains what is driving it: the years of compounding, the return assumed, the withdrawal rate, or the retirement income offsetting the spending, whichever the figures actually implicate. A third, if it earns its place, reads what happens to the answer at a point more or less return. The watch-outs are about this scenario, not about calculators in general: "taxes are not modeled" is only worth saying if you tie it to a figure here.`;

/** Everything the model sees about this run, in one block. */
function buildUserMessage(result: CoastFireResult, facts: CalculatorFact[]): string {
  const framing = result.hasReachedCoastFire
    ? 'On these assumptions the savings they already have would reach their retirement target with nothing further added. Read that as what the projection shows, never as permission to stop saving.'
    : 'On these assumptions the savings they already have would not reach their retirement target on their own. Read that as what the projection shows, never as an instruction to save harder.';

  return [
    framing,
    '',
    'Figures the formula computed. These are the only numbers you may write:',
    ...facts.map((fact) => `- ${fact.label}: ${fact.display}`),
  ].join('\n');
}

const interpretationCache = new InterpretationCache<CoastFireInterpretation>();

export function clearCoastFireInterpretationCache(): void {
  interpretationCache.clear();
}

/** The run, not the request: two requests with the same seven numbers share a reading. */
function cacheKey(result: CoastFireResult, market: CalculatorMarketConditions): string {
  return JSON.stringify([
    COAST_FIRE_INTERPRETATION_VERSION,
    getActiveModel('calculatorNarrative'),
    // The rates themselves, not just their dates. A date alone misses a
    // provider revising a value in place, and misses the 10-year point falling
    // back from Massive to FRED — same label, possibly the same date, a
    // different number. Either would serve prose quoting a yield that is no
    // longer the one in the facts.
    marketRates(market).map((rate) => `${rate.label}@${rate.source}@${rate.asOf}@${rate.percent}`),
    result.currentAge,
    result.retirementAge,
    result.currentSavings,
    result.annualRetirementSpending,
    result.annualRetirementIncome,
    result.realReturnRate,
    result.withdrawalRate,
  ]);
}

/**
 * Write the reading of one Coast FIRE result.
 *
 * Returns null only when the model returned nothing usable, which the route
 * serves as an empty body and the page renders as nothing at all. A draft
 * whose figures do not match the formula's is no longer one of those cases:
 * it is shown, and the mismatch goes to the log instead.
 */
export async function interpretCoastFire(
  result: CoastFireResult
): Promise<CoastFireInterpretation | null> {
  // Both before the cache is consulted, and both nearly free on the usual
  // path: the config is cached in-process and the rates behind their own hour.
  // The model and the rate vintage are part of the key, so neither can be read
  // after the lookup that depends on it.
  const [, market] = await Promise.all([loadModelConfig(), getCalculatorMarketConditions()]);

  const key = cacheKey(result, market);
  const hit = interpretationCache.get(key);
  if (hit) return { ...hit, cached: true };

  const facts = buildCoastFireFacts(result, market);
  const written = await runCalculatorInterpretation({
    label: 'Coast FIRE',
    systemPrompt: SYSTEM_PROMPT,
    userMessage: buildUserMessage(result, facts),
    facts,
  });
  if (!written) return null;

  const interpretation: CoastFireInterpretation = {
    ...written.draft,
    model: written.model,
    cached: false,
  };
  interpretationCache.set(key, interpretation);
  return interpretation;
}
