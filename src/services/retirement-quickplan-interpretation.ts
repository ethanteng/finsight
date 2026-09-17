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
 *  2. **There is no free text.** Every input is a number the quick plan’s own
 *     validator already accepted and bounded, and the only outside data in the
 *     prompt is a handful of published rates from named series
 *     (`calculator-market-conditions`). Nothing third-party writes prose into
 *     it, so there is nothing to fence.
 *  3. **Every figure is checked, and the check only reports.** A draft
 *     containing a number the engine did not compute is logged and shown. It
 *     used to be dropped; on a free, unauthenticated page an empty panel was
 *     judged the worse outcome, so the prompt now carries this alone.
 *
 * What this file holds is the part specific to a quick plan — its figures, its
 * prompt, and its cache key. The grounding, the retry budget and the model call
 * live in `calculator-interpretation`, shared with the Coast FIRE reading.
 */

import {
  countFact,
  extractNumericTokens,
  groundDraft,
  InterpretationCache,
  marketRateFact,
  monthFact,
  moneyFact,
  percentFact,
  plainFact,
  runCalculatorInterpretation,
  type CalculatorFact,
  type InterpretationDraft,
} from './calculator-interpretation';
import { loadModelConfig, getActiveModel } from '../openai/model-config';
import {
  getCalculatorMarketConditions,
  type CalculatorMarketConditions,
} from './calculator-market-conditions';
import type { RetirementQuickPlanResult } from './retirement-quickplan';

/**
 * Re-exported because the grounding suite asserts against them directly: the
 * advisory check this module runs is "does every number fall inside the fact
 * block", and that is only testable through the tokenizer that measures it.
 */
export { extractNumericTokens };
export type { GroundingResult } from './calculator-interpretation';

/** The facts a quick plan licenses, in the shared shape the grounder reads. */
type PlanFact = CalculatorFact;

export const QUICKPLAN_INTERPRETATION_VERSION = 1 as const;

export interface QuickPlanInterpretation {
  /** One sentence naming what the run found. */
  headline: string;
  /** Two or three short paragraphs reading the result. */
  paragraphs: string[];
  /** What this particular plan should watch, drawn from its own figures. */
  watchOuts: string[];
  /** The model that wrote it, for the admin panel and the page’s own footnote. */
  model: string;
  cached: boolean;
}

/** Kept under its original name; the check itself is shared. */
export function groundInterpretation(draft: InterpretationDraft, facts: PlanFact[]) {
  return groundDraft(draft, facts);
}

/**
 * Everything true about this run, and nothing else.
 *
 * Exported because the grounding test suite asserts against it directly: the
 * advisory check this module runs is "does every number fall inside this
 * block", and that is only testable if the block is reachable.
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
  // to the number the series actually printed. `marketRateFact` is what keeps
  // the label and the date from licensing anything else.
  for (const rate of marketRates(market)) {
    facts.push(marketRateFact(rate));
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
 * The model call
 * ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You write the interpretation panel on Ask Linc's public retirement calculator.

A visitor has entered a handful of numbers. A deterministic engine has already run their plan against a century of month-by-month US market history and produced every figure below. Your job is to say what those figures mean. You are not answering a question, and there is no conversation — this is one panel of a results page.

# Non-negotiable rules

1. Every number you write must come from the supplied figures. State them as given or rounded more coarsely; never add, subtract, divide, average or otherwise derive a new one. Nothing downstream checks this before the visitor reads it: a number you invent here is a number they are shown.
2. Write small counts as words ("two levers", "a third of"). Rule 1 applies to a quantity however it is written: "seven years" and "7 years" are the same claim, and spelling one out does not make it a figure you may invent.
3. Describe, do not prescribe. Say what the tested histories did and what this plan's own numbers imply. Never tell the visitor what to do, what to buy or sell, when to retire, or to consult anyone.
4. Never claim to know anything the list does not contain — their actual holdings, taxes, fees, account types, health, housing, or any income not listed. The asset mix is a preset the visitor picked from three, not their portfolio.
5. A survival share is a count of historical stretches, never a probability of their future. Write "in 87% of the retirements we could test", not "you have an 87% chance".
6. Figures labelled "Today, for context" are published rates as of the dates given. Use them only to locate today inside the tested record — a starting yield or an inflation reading is a condition this retirement would begin from, and the historical distribution averages over hundreds of such starting points. Never present one as a forecast, a reason the result is wrong, or a reason to act. If they add nothing to this particular plan, leave them out.
7. Second person, plain words, short sentences. No headers, no bullets inside a paragraph, no markdown.
8. Write a share as the percentage the list gives. Never turn one into a ratio of your own — "9 in 10", "8 out of 10" — because those digits are a figure you worked out, not one from the list. Where the list spells a proportion out, use its words.
9. Never state a remainder, a complement or a difference you worked out yourself: the share that ran short when you were given the share that lasted, what is left after subtracting, how much more one figure is than another. If the list does not contain it, it does not go on the page.
10. Never name a calendar year or a span of years — "2008", "the 1970s", "1966 to 1982". The tested record is described by the figures you have: how many retirements were tested, when the earliest and latest of them began, how long each ran. No individual year or crisis is among them, and naming one states something this run did not produce.

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
function buildUserMessage(result: RetirementQuickPlanResult, facts: PlanFact[]): string {
  const mode = result.mode === 'plan'
    ? 'The visitor gave both a portfolio and a spending level, so the engine produced a survival verdict for their own plan.'
    : ratesModeInstructions(result.missing);

  const lines = [
    mode,
    '',
    'Figures the engine computed. These are the only numbers you may write:',
    ...facts.map((fact) => `- ${fact.label}: ${fact.display}`),
  ];

  return lines.join('\n');
}

/**
 * Results are a pure function of the run, and landing-page visitors reach for
 * round numbers, so the same plan is interpreted once.
 */
const interpretationCache = new InterpretationCache<QuickPlanInterpretation>();

export function clearInterpretationCache(): void {
  interpretationCache.clear();
}

/** The run, not the request: two requests that normalize alike share a reading. */
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
    // longer the one in the facts, which is what the advisory check measures.
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
 * Returns null only when the model returned nothing usable, which the route
 * serves as an empty body and the page renders as nothing at all. A draft
 * whose figures do not match the engine's is no longer one of those cases: it
 * is shown, and the mismatch goes to the log instead.
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
  const written = await runCalculatorInterpretation({
    label: 'Retirement',
    systemPrompt: SYSTEM_PROMPT,
    userMessage: buildUserMessage(result, facts),
    facts,
  });
  if (!written) return null;

  const interpretation: QuickPlanInterpretation = {
    ...written.draft,
    model: written.model,
    cached: false,
  };
  interpretationCache.set(key, interpretation);
  return interpretation;
}
