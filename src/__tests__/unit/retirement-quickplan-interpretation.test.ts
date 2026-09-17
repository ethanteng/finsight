import { describe, expect, it, beforeEach } from '@jest/globals';

/**
 * The model call and the rate lookup are the only two things in this module
 * that leave the process, and both are held here so each case decides what
 * they return. `loadModelConfig` reads the database, which this suite has no
 * use for — the slot's shipped default is a fine answer.
 */
const model = { ask: jest.fn<Promise<string>, unknown[]>(async () => '') };
jest.mock('../../openai/claude-client', () => ({
  askClaude: (...args: unknown[]) => model.ask(...args),
}));

const market = { get: jest.fn(async () => ({ fetchedAt: '2026-09-16T00:00:00.000Z' })) };
jest.mock('../../services/calculator-market-conditions', () => ({
  getCalculatorMarketConditions: () => market.get(),
}));

jest.mock('../../openai/model-config', () => ({
  ...(jest.requireActual('../../openai/model-config') as object),
  loadModelConfig: async () => ({}),
}));

import {
  buildPlanFacts,
  clearInterpretationCache,
  extractNumericTokens,
  groundInterpretation,
  interpretRetirementQuickPlan,
} from '../../services/retirement-quickplan-interpretation';
import type { RetirementQuickPlanResult } from '../../services/retirement-quickplan';

/**
 * A plan-mode result with the figures these cases assert on. Built by hand
 * rather than by running the engine: this suite is about what the module does
 * with a result, and a real run would make every expected number a moving
 * target tied to the checked-in dataset.
 */
function planResult(overrides: Partial<RetirementQuickPlanResult> = {}): RetirementQuickPlanResult {
  const primary = {
    id: 'primary',
    label: 'Your plan',
    change: null,
    retirementAge: 60,
    annualSpending: 132_000,
    survivalRate: 0.873,
    sequencesTested: 709,
    sequencesSurvived: 619,
    projectedPortfolioAtRetirement: 3_326_191.63,
    firstYearPortfolioWithdrawal: 90_600,
    firstYearWithdrawalRate: 0.0272,
    depletionYears: { p10: 18, p25: 22, p50: 27 },
    primaryObservation: 'Balanced allocation pattern with moderate characteristics',
    characteristics: {
      growthPotential: 'moderate',
      drawdownResistance: 'moderate',
      withdrawalFragility: 'low',
      inflationProtection: 'moderate',
    },
    tradeoffs: { upside: 'participates in recoveries', downside: 'gives up ground in drawdowns' },
  } as unknown as RetirementQuickPlanResult['primary'];

  return {
    version: 1,
    computedAt: '2026-09-16T00:00:00.000Z',
    durationMs: 800,
    cached: false,
    mode: 'plan',
    assumed: [],
    missing: [],
    inputs: {
      currentAge: 54,
      retirementAge: 60,
      investableAssets: 2_273_872,
      annualSpending: 132_000,
      annualContributions: 48_000,
      socialSecurityAnnual: 41_400,
      socialSecurityStartAge: 67,
      lifeExpectancy: 95,
      allocation: 'balanced',
    },
    // The whole preset, as the service returns it: the three weights are part
    // of the result, and the fact block licenses them from here.
    allocation: {
      id: 'balanced',
      label: 'Balanced',
      description: '60% US stocks / 35% bonds / 5% cash',
      usEquity: 0.6,
      bonds: 0.35,
      cash: 0.05,
      equityPercent: 60,
    } as RetirementQuickPlanResult['allocation'],
    history: {
      firstMonth: '1926-07',
      lastMonth: '2026-06',
      sequencesTested: 709,
      horizonYears: 41,
      firstStartMonth: '1926-07',
      lastStartMonth: '1985-07',
    },
    primary,
    alternatives: [],
    sustainableSpending: {
      p10: 118_000, p25: 131_000, p50: 149_000, p75: 172_000, p90: 205_000,
      solverFloorRate: 0.02, solverCeilingRate: 0.08,
    },
    sustainableSpendingRates: {
      p10: 0.0355, p25: 0.0394, p50: 0.0448, p75: 0.0517, p90: 0.0616,
      solverFloorRate: 0.02, solverCeilingRate: 0.08,
    },
    assumptions: [],
    limitations: [],
    ...overrides,
  } as RetirementQuickPlanResult;
}

const DRAFT = (headline: string, paragraphs: string[] = ['A paragraph.'], watchOuts: string[] = []) =>
  JSON.stringify({ headline, paragraphs, watchOuts });

beforeEach(() => {
  clearInterpretationCache();
  model.ask.mockReset();
  market.get.mockClear();
});

describe('extractNumericTokens', () => {
  it('reads dollars, groupings, decimals and percentages', () => {
    const tokens = extractNumericTokens('$3,326,192 at 87.3% and 4.5M more');
    expect(tokens.map((token) => token.value)).toEqual([3_326_192, 87.3, 4_500_000]);
    expect(tokens[1].isPercent).toBe(true);
  });

  it('reads a rate spelled out as a word as the percentage it is', () => {
    const [token] = extractNumericTokens('about 87 percent of them');
    expect(token.isPercent).toBe(true);
    expect(token.value).toBe(87);
  });

  /*
   * The magnitude suffix is the one piece of this that can silently corrupt a
   * figure: reading the "m" of "months" as a million turns an ordinary
   * sentence into a rejected draft, and the rejection names a number the model
   * never wrote.
   */
  it('does not read a word beginning with a magnitude letter as a magnitude', () => {
    const [token] = extractNumericTokens('lasted 27 more years');
    expect(token.value).toBe(27);
    expect(extractNumericTokens('3 months')[0].value).toBe(3);
    expect(extractNumericTokens('$3M')[0].value).toBe(3_000_000);
  });

  it('scales the tolerance to the precision written', () => {
    const [coarse] = extractNumericTokens('$3.3M');
    const [exact] = extractNumericTokens('$3,326,192');
    expect(coarse.halfWidth).toBe(50_000);
    expect(exact.halfWidth).toBe(0.5);
  });

  /*
   * Trailing zeros are a claim about precision too. Reading "$140,000" as
   * exact to the dollar rejects the most ordinary sentence a writer produces.
   */
  it('reads trailing zeros in a money figure as rounding', () => {
    const [rounded] = extractNumericTokens('about $140,000');
    expect(rounded.halfWidth).toBe(5_000);
  });

  /* An age is not a rounded figure, and must not pick up a neighbour's. */
  it('keeps a small round count exact', () => {
    const [age] = extractNumericTokens('retiring at 60');
    expect(age.halfWidth).toBe(0.5);
  });

  /* Two significant figures is the floor: "$3M" cannot stand for $3.36M. */
  it('will not let one significant figure swallow an order of magnitude', () => {
    const [millions] = extractNumericTokens('$3,000,000');
    expect(millions.halfWidth).toBe(50_000);
    expect(extractNumericTokens('$3M')[0].halfWidth).toBe(50_000);
  });

  /* Trailing zeros mean nothing in a rate, and widening there hides a real gap. */
  it('keeps a round percentage exact', () => {
    const [rate] = extractNumericTokens('100% of them');
    expect(rate.halfWidth).toBe(0.5);
  });

  /*
   * Starting the match at the first digit reads "-5%" as "5%". The positive
   * figure is usually in the allowlist — 5% is the cash weight — so a draft
   * stating the opposite of a fact would pass the check meant to catch it.
   */
  it('keeps the sign of a negative figure', () => {
    expect(extractNumericTokens('-5%')[0].value).toBe(-5);
    expect(extractNumericTokens('$-48,000')[0].value).toBe(-48_000);
    expect(extractNumericTokens('down \u221260% this year')[0].value).toBe(-60);
  });

  it('reads a leading decimal as the fraction it is', () => {
    const [token] = extractNumericTokens('.5% a year');
    expect(token.value).toBe(0.5);
    expect(token.isPercent).toBe(true);
  });

  /* A hyphen after a digit is a range or a compound word, never a minus. */
  it('does not read a hyphen inside a range or a compound as a sign', () => {
    expect(extractNumericTokens('1926-1985').map((token) => token.value)).toEqual([1926, 1985]);
    expect(extractNumericTokens('a 30-year window').map((token) => token.value)).toEqual([30]);
    expect(extractNumericTokens('1926\u20131985').map((token) => token.value)).toEqual([1926, 1985]);
  });
});

describe('groundInterpretation', () => {
  const facts = () => buildPlanFacts(planResult());

  it('accepts figures the engine computed', () => {
    const result = groundInterpretation(
      {
        headline: 'Your money lasted in 87.3% of the retirements we could test.',
        paragraphs: ['That is 619 of 709, on a portfolio of $2,273,872 today.'],
        watchOuts: ['You retire at 60 and claim at 67.'],
      },
      facts()
    );
    expect(result).toEqual({ grounded: true, ungrounded: [] });
  });

  it('accepts a figure rounded more coarsely than it was given', () => {
    const result = groundInterpretation(
      { headline: 'About $3.3M at retirement.', paragraphs: ['Roughly $3.3M.'], watchOuts: [] },
      facts()
    );
    expect(result.grounded).toBe(true);
  });

  /* The whole point of the module: a number nobody computed never ships. */
  it('rejects a figure the engine never produced', () => {
    const result = groundInterpretation(
      {
        headline: 'Your money lasted in 87.3% of tested retirements.',
        paragraphs: ['You could safely spend $250,000 a year instead.'],
        watchOuts: [],
      },
      facts()
    );
    expect(result.grounded).toBe(false);
    expect(result.ungrounded).toContain('$250,000');
  });

  it('rejects a derived figure even when both of its inputs are facts', () => {
    // 132,000 spending less 41,400 of Social Security is arithmetic the model
    // is not allowed to do; 90,600 happens to be right here, but the next one
    // would not be and nothing downstream could tell the difference.
    const result = groundInterpretation(
      { headline: 'A headline.', paragraphs: ['That leaves $90,601 net.'], watchOuts: [] },
      facts()
    );
    expect(result.grounded).toBe(false);
  });

  it('does not let a dollar amount satisfy a percentage', () => {
    const result = groundInterpretation(
      // 48,000 is a real fact (the contributions); 48% is not a rate here.
      { headline: 'A headline.', paragraphs: ['It lasted 48% of the time.'], watchOuts: [] },
      facts()
    );
    expect(result.grounded).toBe(false);
    expect(result.ungrounded).toContain('48%');
  });

  /*
   * From production. Every dropped panel in the first day and a half of this
   * feature failed grounding — no provider error, no timeout, no unparseable
   * response — and the rejected tokens were mostly of two shapes.
   *
   * The first was a licensed count written the way rule 2 asks for, which the
   * spelled-quantity check then refused. "Seven years between retiring and
   * claiming" is a figure this plan produced, and the panel was dropped for
   * saying so in words.
   */
  it('grounds a licensed count whether it is spelled or written', () => {
    const facts = buildPlanFacts(planResult());

    for (const phrasing of [
      'Seven years pass between retiring at 60 and claiming at 67.',
      'There are 7 years between retiring at 60 and claiming at 67.',
    ]) {
      expect(groundInterpretation(
        { headline: 'A headline.', paragraphs: [phrasing], watchOuts: [] },
        facts
      )).toEqual({ grounded: true, ungrounded: [] });
    }
  });

  /*
   * The second shape, which the prompt now forbids rather than the grounder
   * accommodating: a share turned into a ratio of the model's own, and a
   * calendar year. Both state a figure the run did not produce, so both stay
   * rejected — the fix for these is rules 8 and 10, not a wider allowlist.
   */
  it('still refuses a ratio of its own making, and a calendar year', () => {
    const facts = buildPlanFacts(planResult());

    const ratio = groundInterpretation(
      { headline: 'A headline.', paragraphs: ['Your money lasted in 9 of every 10 tested retirements.'], watchOuts: [] },
      facts
    );
    expect(ratio.grounded).toBe(false);

    const year = groundInterpretation(
      { headline: 'A headline.', paragraphs: ['Runs beginning near the 2008 downturn are the hard ones.'], watchOuts: [] },
      facts
    );
    expect(year.grounded).toBe(false);
    expect(year.ungrounded).toContain('2008');
  });

  /* And the retry has to say what to do about them, not just name them. */
  it('tells a rejected draft which mistake it made', async () => {
    model.ask
      .mockResolvedValueOnce(DRAFT('That leaves 13% of them running short.'))
      .mockResolvedValueOnce(DRAFT('Your money lasted in 87.3% of tested retirements.'));

    await interpretRetirementQuickPlan(planResult());

    const retry = String(model.ask.mock.calls[1][1]);
    expect(retry).toContain('13%');
    expect(retry).toContain('a remainder, a complement, a difference');
    expect(retry).toContain('Use the percentage the list gives');
    expect(retry).toContain('"seven years" is read as 7');
  });

  /*
   * The whole block, echoed. The targeted cases below each pin one string the
   * prompt shows the model; this pins all of them at once, including every
   * published-rate label — which is where the mistake actually happens, since
   * a label is edited for how it reads and not for what it licenses.
   */
  it('licenses its own fact block, verbatim, with every series present', () => {
    const built = buildPlanFacts(planResult(), {
      fetchedAt: '2026-09-16T00:00:00.000Z',
      inflationYoY: {
        percent: 3.02,
        asOf: '2026-08-01',
        label: 'US inflation over the last year (CPI)',
        source: 'FRED',
      },
      inflationExpectation10Y: {
        percent: 2.35,
        asOf: '2026-09-16',
        label: 'inflation the market expects over the coming decade',
        source: 'Massive',
      },
      treasury30Y: {
        percent: 4.71,
        asOf: '2026-09-16',
        label: 'thirty-year Treasury yield',
        source: 'Massive',
      },
      treasury10Y: {
        percent: 4.18,
        asOf: '2026-09-16',
        label: 'ten-year Treasury yield',
        source: 'Massive',
      },
    });
    const echoed = built.map((fact) => `${fact.label}: ${fact.display}`);

    expect(groundInterpretation(
      { headline: echoed[0], paragraphs: echoed.slice(1), watchOuts: [] },
      built
    )).toEqual({ grounded: true, ungrounded: [] });
  });

  /*
   * The failure mode that is easy to miss: a draft rejected for repeating the
   * fact block back at us. Every string the prompt shows the model is one it
   * will quote, so the numbers inside those strings have to be licensed too —
   * otherwise the panel is rejected twice and dropped on the plans where the
   * model did exactly what it was told.
   */
  it('accepts the asset mix written back as the prompt gave it', () => {
    const result = groundInterpretation(
      {
        headline: 'A headline.',
        paragraphs: ['We assumed a balanced mix: 60% US stocks / 35% bonds / 5% cash.'],
        watchOuts: [],
      },
      facts()
    );
    expect(result).toEqual({ grounded: true, ungrounded: [] });
  });

  it('accepts a variant row written back as the prompt gave it', () => {
    const withVariant = planResult({
      alternatives: [{
        id: 'retire-at-62',
        label: 'Retire at 62',
        change: '2 more years of work and saving',
        retirementAge: 62,
        annualSpending: 132_000,
        survivalRate: 0.964,
        sequencesTested: 709,
        sequencesSurvived: 683,
        projectedPortfolioAtRetirement: 3_600_000,
        firstYearPortfolioWithdrawal: 90_600,
        firstYearWithdrawalRate: 0.025,
        depletionYears: null,
        primaryObservation: 'Example',
        characteristics: {
          growthPotential: 'moderate', drawdownResistance: 'moderate',
          withdrawalFragility: 'low', inflationProtection: 'moderate',
        },
        tradeoffs: { upside: 'Example', downside: 'Example' },
      }] as unknown as RetirementQuickPlanResult['alternatives'],
    });

    const result = groundInterpretation(
      {
        headline: 'A headline.',
        paragraphs: ['Retiring at 62 — 2 more years of work and saving — reached 96.4%.'],
        watchOuts: [],
      },
      buildPlanFacts(withVariant)
    );
    expect(result).toEqual({ grounded: true, ungrounded: [] });
  });

  it('accepts a money figure rounded to a round number of thousands', () => {
    // The median portfolio is $3,326,191.63; "$3.3M" and "$3,330,000" are both
    // correct roundings of it, and both are things a writer says.
    const result = groundInterpretation(
      { headline: 'A headline.', paragraphs: ['Around $3,330,000 by then.'], watchOuts: [] },
      facts()
    );
    expect(result.grounded).toBe(true);
  });

  /* The widening must not reach far enough to turn one rate into another. */
  it('does not let a round percentage stand for a different one', () => {
    const result = groundInterpretation(
      { headline: 'Your money lasted every time — 100%.', paragraphs: ['A paragraph.'], watchOuts: [] },
      facts()
    );
    expect(result.grounded).toBe(false);
    expect(result.ungrounded).toContain('100%');
  });

  /*
   * The allocation weights and the contributions are in the allowlist as
   * positive figures. Their negatives are not facts about this plan, and a
   * sentence asserting one is the kind of contradiction that reads as
   * authoritative on the page.
   */
  it('rejects a negated figure whose positive is a fact', () => {
    const result = groundInterpretation(
      {
        headline: 'A headline.',
        paragraphs: ['Your equity sleeve fell -60% in the worst stretch.'],
        watchOuts: [],
      },
      facts()
    );
    expect(result.grounded).toBe(false);
    expect(result.ungrounded).toContain('-60%');
  });

  it('checks the watch-outs too, not just the prose above them', () => {
    const result = groundInterpretation(
      {
        headline: 'A headline.',
        paragraphs: ['A paragraph.'],
        watchOuts: ['Healthcare could run $40,000 a year.'],
      },
      facts()
    );
    expect(result.grounded).toBe(false);
    expect(result.ungrounded).toContain('$40,000');
  });
});

describe('buildPlanFacts', () => {
  it('licenses the survival rate as a percentage and as a fraction', () => {
    const labels = buildPlanFacts(planResult()).map((fact) => fact.label);
    expect(labels).toContain('Share of tested retirements in which the money lasted');
  });

  /*
   * A blank box is simulated against a notional portfolio so the engine has
   * dollars to move. Naming that figure to the model is how it ends up on the
   * page as the visitor's own.
   */
  it('withholds a portfolio the visitor never entered', () => {
    const rates = planResult({
      mode: 'rates',
      missing: ['investableAssets'],
      primary: null,
      alternatives: [],
      sustainableSpending: null,
      inputs: { ...planResult().inputs, investableAssets: 1_000_000 },
    });

    const facts = buildPlanFacts(rates);
    expect(facts.map((fact) => fact.label)).not.toContain('Investments today');
    expect(facts.flatMap((fact) => fact.values ?? [])).not.toContain(1_000_000);
    // The spending they did enter is still theirs, and still usable.
    expect(facts.map((fact) => fact.label)).toContain(
      'Annual spending in retirement, in today’s dollars'
    );
  });

  it('withholds a spending level the visitor never entered', () => {
    const rates = planResult({
      mode: 'rates',
      missing: ['annualSpending'],
      primary: null,
      alternatives: [],
      sustainableSpending: null,
      inputs: { ...planResult().inputs, annualSpending: 40_000 },
    });

    const labels = buildPlanFacts(rates).map((fact) => fact.label);
    expect(labels).not.toContain('Annual spending in retirement, in today’s dollars');
    expect(labels).toContain('Investments today');
  });

  it('licenses today’s published rates when they are available', () => {
    const facts = buildPlanFacts(planResult(), {
      fetchedAt: '2026-09-16T00:00:00.000Z',
      treasury30Y: {
        percent: 4.62,
        asOf: '2026-09-15',
        label: 'thirty-year Treasury yield',
        source: 'Massive',
      },
    });

    const grounded = groundInterpretation(
      { headline: 'A headline.', paragraphs: ['Long Treasuries yield 4.62% today.'], watchOuts: [] },
      facts
    );
    expect(grounded.grounded).toBe(true);
  });

  /*
   * Same class of failure as the asset-mix weights: the prompt puts the series
   * name and its as-of date in front of the model, so a draft quoting the fact
   * line back must not be rejected for those digits. What keeps that from
   * licensing anything else is that the line carries as few as it can — the
   * label holds no digits at all, and the date is given to the month.
   */
  it('licenses a published rate as the prompt actually writes it', () => {
    const facts = buildPlanFacts(planResult(), {
      fetchedAt: '2026-09-16T00:00:00.000Z',
      treasury30Y: {
        percent: 4.62,
        asOf: '2026-09-15',
        label: 'thirty-year Treasury yield',
        source: 'Massive',
      },
    });

    const grounded = groundInterpretation(
      {
        headline: 'A headline.',
        paragraphs: ['The thirty-year Treasury yields 4.62% as of September 2026.'],
        watchOuts: [],
      },
      facts
    );
    expect(grounded).toEqual({ grounded: true, ungrounded: [] });
  });

  /*
   * The reason the label is spelled out. "30-year" in a label would put a bare
   * 30 in the allowlist, and a draft could then state a horizon this run never
   * ran — which is exactly the class of mistake the grounding exists to catch.
   */
  it('does not license a horizon smuggled in by a series name', () => {
    const facts = buildPlanFacts(planResult(), {
      fetchedAt: '2026-09-16T00:00:00.000Z',
      treasury30Y: {
        percent: 4.62,
        asOf: '2026-09-15',
        label: 'thirty-year Treasury yield',
        source: 'Massive',
      },
    });

    const grounded = groundInterpretation(
      {
        headline: 'A headline.',
        paragraphs: ['Over the next 30 years that compounds.'],
        watchOuts: [],
      },
      facts
    );
    expect(grounded.grounded).toBe(false);
    expect(grounded.ungrounded).toContain('30');
  });
});

describe('interpretRetirementQuickPlan', () => {
  it('returns a grounded reading and caches it', async () => {
    model.ask.mockResolvedValue(DRAFT('Your money lasted in 87.3% of tested retirements.'));

    const first = await interpretRetirementQuickPlan(planResult());
    expect(first?.headline).toContain('87.3%');
    expect(first?.cached).toBe(false);

    const second = await interpretRetirementQuickPlan(planResult());
    expect(second?.cached).toBe(true);
    expect(model.ask).toHaveBeenCalledTimes(1);
  });

  it('retries once, naming the figures it would not accept', async () => {
    model.ask
      .mockResolvedValueOnce(DRAFT('You can spend $250,000 a year.'))
      .mockResolvedValueOnce(DRAFT('Your money lasted in 87.3% of tested retirements.'));

    const result = await interpretRetirementQuickPlan(planResult());
    expect(result?.headline).toContain('87.3%');
    expect(model.ask).toHaveBeenCalledTimes(2);

    const retryMessage = String(model.ask.mock.calls[1][1]);
    expect(retryMessage).toContain('$250,000');
    expect(retryMessage).toContain('rejected');
  });

  it('gives up rather than shipping a figure it could not check', async () => {
    model.ask.mockResolvedValue(DRAFT('You can spend $250,000 a year.'));

    expect(await interpretRetirementQuickPlan(planResult())).toBeNull();
    expect(model.ask).toHaveBeenCalledTimes(2);
  });

  it('returns null when the provider fails, without retrying it', async () => {
    model.ask.mockRejectedValue(new Error('provider down'));

    expect(await interpretRetirementQuickPlan(planResult())).toBeNull();
    expect(model.ask).toHaveBeenCalledTimes(1);
  });

  /*
   * A response that is not the object asked for is usually a formatting slip,
   * so it gets the same one more chance an ungrounded draft gets — inside the
   * same two-attempt ceiling, not on top of it.
   */
  it('retries an unparseable response, telling it what was wrong', async () => {
    model.ask
      .mockResolvedValueOnce('Sure! Here is my analysis of your plan.')
      .mockResolvedValueOnce(DRAFT('Your money lasted in 87.3% of tested retirements.'));

    const result = await interpretRetirementQuickPlan(planResult());
    expect(result?.headline).toContain('87.3%');
    expect(model.ask).toHaveBeenCalledTimes(2);

    // The correction names the format, not figures the model never wrote.
    const retryMessage = String(model.ask.mock.calls[1][1]);
    expect(retryMessage).toContain('could not be read');
    expect(retryMessage).not.toContain('are not in the list above');
  });

  it('gives up on a response that never parses', async () => {
    model.ask.mockResolvedValue('I am afraid I cannot do that.');
    expect(await interpretRetirementQuickPlan(planResult())).toBeNull();
    expect(model.ask).toHaveBeenCalledTimes(2);
  });

  it('reads a draft wrapped in a code fence', async () => {
    model.ask.mockResolvedValue(
      '```json\n' + DRAFT('Your money lasted in 87.3% of tested retirements.') + '\n```'
    );
    const result = await interpretRetirementQuickPlan(planResult());
    expect(result?.headline).toContain('87.3%');
  });

  /*
   * The rate vintage is in the key. Without it a reading written about
   * yesterday's yield would keep serving after the series republished.
   */
  it('re-reads a plan when the published rates have moved', async () => {
    model.ask.mockResolvedValue(DRAFT('Your money lasted in 87.3% of tested retirements.'));

    market.get.mockResolvedValue({
      fetchedAt: '2026-09-16T00:00:00.000Z',
      treasury30Y: { percent: 4.62, asOf: '2026-09-15', label: 'thirty-year Treasury yield', source: 'Massive' },
    } as never);
    await interpretRetirementQuickPlan(planResult());

    market.get.mockResolvedValue({
      fetchedAt: '2026-09-17T00:00:00.000Z',
      treasury30Y: { percent: 4.71, asOf: '2026-09-16', label: 'thirty-year Treasury yield', source: 'Massive' },
    } as never);
    const second = await interpretRetirementQuickPlan(planResult());

    expect(second?.cached).toBe(false);
    expect(model.ask).toHaveBeenCalledTimes(2);
  });

  /*
   * A date alone misses a provider revising a value in place, and misses the
   * 10-year point falling back from Massive to FRED under the same label. The
   * cached prose would quote a yield that is no longer in the facts.
   */
  it('re-reads a plan when a rate is revised without its date moving', async () => {
    model.ask.mockResolvedValue(DRAFT('Your money lasted in 87.3% of tested retirements.'));

    market.get.mockResolvedValue({
      fetchedAt: '2026-09-16T00:00:00.000Z',
      treasury10Y: { percent: 4.21, asOf: '2026-09-15', label: 'ten-year Treasury yield', source: 'Massive' },
    } as never);
    await interpretRetirementQuickPlan(planResult());

    market.get.mockResolvedValue({
      fetchedAt: '2026-09-16T01:00:00.000Z',
      treasury10Y: { percent: 4.24, asOf: '2026-09-15', label: 'ten-year Treasury yield', source: 'Massive' },
    } as never);
    expect((await interpretRetirementQuickPlan(planResult()))?.cached).toBe(false);

    // Same value and date, different provider: also a different set of facts.
    market.get.mockResolvedValue({
      fetchedAt: '2026-09-16T02:00:00.000Z',
      treasury10Y: { percent: 4.24, asOf: '2026-09-15', label: 'ten-year Treasury yield', source: 'FRED' },
    } as never);
    expect((await interpretRetirementQuickPlan(planResult()))?.cached).toBe(false);

    expect(model.ask).toHaveBeenCalledTimes(3);
  });

  /*
   * The SDK's default is ten minutes per request and it retries a timeout, so
   * an unbounded call would hold an unauthenticated request open — and the
   * page's placeholder with it — far past the point the panel is worth having.
   */
  it('bounds the model call so a stalled provider drops the panel', async () => {
    model.ask.mockResolvedValue(DRAFT('Your money lasted in 87.3% of tested retirements.'));

    await interpretRetirementQuickPlan(planResult());

    const options = model.ask.mock.calls[0][2] as { timeoutMs: number; maxRetries: number };
    expect(options.maxRetries).toBe(0);
    expect(options.timeoutMs).toBeGreaterThan(0);
    expect(options.timeoutMs).toBeLessThanOrEqual(25_000);
  });

  it('does not start a retry it has no time to finish', async () => {
    // A first attempt that eats the budget and comes back ungrounded: the
    // retry is skipped rather than started and waited out.
    model.ask.mockImplementationOnce(async () => {
      jest.advanceTimersByTime(24_000);
      return DRAFT('You can spend $250,000 a year.');
    });

    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      expect(await interpretRetirementQuickPlan(planResult())).toBeNull();
      expect(model.ask).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('tells the model not to claim a verdict it does not have', async () => {
    model.ask.mockResolvedValue(DRAFT('What this mix sustained, as a share of the portfolio.'));

    await interpretRetirementQuickPlan(planResult({
      mode: 'rates',
      missing: ['investableAssets'],
      primary: null,
      alternatives: [],
      sustainableSpending: null,
    }));

    const message = String(model.ask.mock.calls[0][1]);
    expect(message).toContain('what they have invested');
    expect(message).toContain('Do not state or imply a verdict or a balance');
    // Spending was entered; withholding it would contradict the fact block.
    expect(message).not.toContain('spending level');
  });

  it('withholds only the spending level when that box alone was blank', async () => {
    model.ask.mockResolvedValue(DRAFT('What this mix sustained, as a share of the portfolio.'));

    await interpretRetirementQuickPlan(planResult({
      mode: 'rates',
      missing: ['annualSpending'],
      primary: null,
      alternatives: [],
      sustainableSpending: null,
    }));

    const message = String(model.ask.mock.calls[0][1]);
    expect(message).toContain('Do not state or imply a verdict or a spending level');
    expect(message).not.toContain('a balance');
  });
});
