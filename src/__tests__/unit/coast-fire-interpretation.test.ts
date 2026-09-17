import { describe, expect, it, beforeEach } from '@jest/globals';

/**
 * The model's reading of a Coast FIRE result.
 *
 * What is under test is not the prose. It is the promise the panel rests on:
 * no number reaches the page that the formula did not produce, and a reading
 * that cannot meet that is dropped rather than shown. The model call and the
 * rate lookup are the only two things here that leave the process, and both
 * are held so each case decides what they return.
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
  buildCoastFireFacts,
  clearCoastFireInterpretationCache,
  interpretCoastFire,
} from '../../services/coast-fire-interpretation';
import { groundDraft } from '../../services/calculator-interpretation';
import { calculateCoastFire, type CoastFireInputs } from '../../services/coast-fire';

/**
 * Run through the real formula rather than hand-built: unlike the quick plan's
 * historical dataset, this is seven numbers and a closed form, so the figures
 * are stable and a fixture that drifted from the formula would be testing the
 * wrong thing.
 */
function result(overrides: Partial<CoastFireInputs> = {}) {
  return calculateCoastFire({
    currentAge: 40,
    retirementAge: 65,
    currentSavings: 400_000,
    annualRetirementSpending: 80_000,
    annualRetirementIncome: 30_000,
    realReturnRate: 5,
    withdrawalRate: 4,
    ...overrides,
  });
}

const DRAFT = (paragraph: string, headline = 'A headline with no figures in it.') =>
  JSON.stringify({ headline, paragraphs: [paragraph], watchOuts: [] });

beforeEach(() => {
  clearCoastFireInterpretationCache();
  model.ask.mockReset().mockResolvedValue('');
  market.get.mockReset().mockResolvedValue({ fetchedAt: '2026-09-16T00:00:00.000Z' });
});

describe('the figures a Coast FIRE reading may state', () => {
  /*
   * The most ordinary failure there is: a draft that quotes the fact block
   * back at us. Every label and every value the prompt shows the model has to
   * survive being repeated, or the panel is rejected for restating its own
   * instructions.
   */
  it('licenses its own fact block, verbatim', () => {
    const facts = buildCoastFireFacts(result(), {
      fetchedAt: '2026-09-16T00:00:00.000Z',
      inflationYoY: {
        percent: 3.02,
        asOf: '2026-08-01',
        label: 'US inflation over the last year (CPI)',
        source: 'FRED',
      },
      treasury30Y: {
        percent: 4.71,
        asOf: '2026-09-16',
        label: 'thirty-year Treasury yield',
        source: 'Massive',
      },
    });
    const echoed = facts.map((fact) => `${fact.label}: ${fact.display}`);

    expect(groundDraft(
      { headline: echoed[0], paragraphs: echoed.slice(1), watchOuts: [] },
      facts
    )).toEqual({ grounded: true, ungrounded: [] });
  });

  it('licenses the figures the page itself prints', () => {
    const facts = buildCoastFireFacts(result());

    // Coast FIRE number, savings, gap, target, untouched projection, funded share.
    expect(groundDraft({
      headline: 'Your Coast FIRE number is $369,128 and you have $400,000.',
      paragraphs: [
        'That is $30,872 above it, or 108.4% of it. The target is $1,250,000 at 65, and today’s ' +
        'savings project to $1,354,542 over 25 years at 5.0% after inflation.',
      ],
      watchOuts: ['At 4.0% the bar would be $468,896 instead.'],
    }, facts)).toEqual({ grounded: true, ungrounded: [] });
  });

  /*
   * A shortfall is written without its sign — "$79,000 short" — so both signs
   * are licensed. What must not survive is the direction being reversed on a
   * figure, which is why the fact carries the gap rather than the page's
   * wording of it.
   */
  it('licenses a gap written as the page words it, in either direction', () => {
    const short = result({ currentSavings: 120_000, annualRetirementIncome: 0 });
    const facts = buildCoastFireFacts(short);

    expect(groundDraft({
      headline: 'A headline.',
      paragraphs: [`You are $${Math.round(Math.abs(short.differenceToday)).toLocaleString('en-US')} short.`],
      watchOuts: [],
    }, facts).grounded).toBe(true);
  });

  it('refuses a figure the formula never produced', () => {
    const facts = buildCoastFireFacts(result());

    const grounded = groundDraft({
      headline: 'A headline.',
      paragraphs: ['That works out to $4,167 a month.'],
      watchOuts: [],
    }, facts);
    expect(grounded.grounded).toBe(false);
    expect(grounded.ungrounded).toContain('$4,167');
  });

  it('refuses a probability, which this formula does not produce at all', () => {
    const grounded = groundDraft({
      headline: 'A headline.',
      paragraphs: ['There is roughly an 85% chance this holds.'],
      watchOuts: [],
    }, buildCoastFireFacts(result()));
    expect(grounded.grounded).toBe(false);
  });

  /*
   * The published-rate labels are spelled out for this reason: "30-year" in a
   * label would license a bare 30, and a draft could then state a horizon this
   * scenario never ran.
   */
  it('does not license a horizon smuggled in by a series name', () => {
    const facts = buildCoastFireFacts(result(), {
      fetchedAt: '2026-09-16T00:00:00.000Z',
      treasury30Y: {
        percent: 4.71,
        asOf: '2026-09-16',
        label: 'thirty-year Treasury yield',
        source: 'Massive',
      },
    });

    const grounded = groundDraft({
      headline: 'A headline.',
      paragraphs: ['Over the next 30 years that compounds.'],
      watchOuts: [],
    }, facts);
    expect(grounded.grounded).toBe(false);
    expect(grounded.ungrounded).toContain('30');
  });

  /*
   * Same idea as the series-name case, for the sensitivity rows. Those rows
   * have to license "4.0%" and "6.0%" as rates, but a bare 6 must not become
   * permission to write "over the next 6 years" when this run's horizon is 25.
   */
  it('does not license a bare adjacent return as a horizon', () => {
    const facts = buildCoastFireFacts(result({
      // Keep the entered rates clear of 6 so the only way a bare 6 gets in is
      // the +1 sensitivity row.
      realReturnRate: 5,
      withdrawalRate: 3.5,
    }));

    const grounded = groundDraft({
      headline: 'A headline.',
      paragraphs: ['Over the next 6 years that compounds.'],
      watchOuts: [],
    }, facts);
    expect(grounded.grounded).toBe(false);
    expect(grounded.ungrounded).toContain('6');
  });

  /*
   * A scenario whose entered income covers its entered spending has an
   * infinite funded share. Licensing that licenses nothing, and a percentage
   * is the wrong shape for the answer anyway — it is a sentence.
   */
  it('states the covered case in words rather than as an infinite share', () => {
    const facts = buildCoastFireFacts(result({
      annualRetirementSpending: 60_000,
      annualRetirementIncome: 60_000,
    }));
    const covered = facts.find((fact) => fact.label.includes('Share of the Coast FIRE number'));

    expect(covered?.display).toContain('not applicable');
    expect(facts.flatMap((fact) => [...(fact.values ?? []), ...(fact.percentValues ?? [])]))
      .not.toContain(Infinity);
  });

  /*
   * The same rule as the series names, one level up. The two rates the visitor
   * typed are small integers, so licensing them as plain numbers would let a
   * draft write "over the next 5 years" or "$4 a year" off the back of a 5%
   * return and a 4% withdrawal rate. They are percentages and nothing else.
   */
  it('does not license a rate as a plain number', () => {
    const facts = buildCoastFireFacts(result());

    for (const borrowed of ['Over the next 5 years that compounds.', 'You could add $4 a year.']) {
      expect(groundDraft(
        { headline: 'A headline.', paragraphs: [borrowed], watchOuts: [] },
        facts
      ).grounded).toBe(false);
    }

    // Written as the rate it is, it still grounds.
    expect(groundDraft({
      headline: 'A headline.',
      paragraphs: ['At the 5.0% you entered, and a 4.0% withdrawal rate.'],
      watchOuts: [],
    }, facts).grounded).toBe(true);
  });

  /*
   * The hole the digit tokenizer leaves. The prompts ask for small counts as
   * words so that every digit on the page is a licensed figure, which means a
   * figure spelled out carries nothing to check — and "a ninety percent
   * chance" is the exact claim rule 4 of this prompt forbids.
   *
   * The line is the unit: a quantity spelled out is refused, a count is not.
   */
  it('refuses a quantity spelled out in words', () => {
    const facts = buildCoastFireFacts(result());

    for (const spelled of [
      'There is roughly a ninety percent chance this holds.',
      'Over the next five years that compounds.',
      'You would need about two million dollars.',
      'Left alone for twenty-five years it grows.',
    ]) {
      const grounded = groundDraft(
        { headline: 'A headline.', paragraphs: [spelled], watchOuts: [] },
        facts
      );
      expect(grounded.grounded).toBe(false);
    }
  });

  /*
   * And does not refuse the phrasings the prompt asks for. The hyphenated
   * compound matters on its own account: it is how the fact block names the
   * published series, so flagging it would reject a draft for quoting the
   * prompt — the failure this whole file exists to catch.
   */
  it('leaves counts and series names alone', () => {
    const facts = buildCoastFireFacts(result(), {
      fetchedAt: '2026-09-16T00:00:00.000Z',
      treasury30Y: {
        percent: 4.71,
        asOf: '2026-09-16',
        label: 'thirty-year Treasury yield',
        source: 'Massive',
      },
      inflationExpectation10Y: {
        percent: 2.35,
        asOf: '2026-09-16',
        label: 'ten-year breakeven inflation',
        source: 'Massive',
      },
    });

    for (const allowed of [
      'There are two levers here, and a third of the answer is timing.',
      'The thirty-year Treasury yields 4.71% as of September 2026.',
      'That is one of the two assumptions doing the work.',
      // The breakeven series used to be labelled with a whitespace "ten years",
      // which the spelled-figure check would then refuse in any draft that
      // named it. Hyphenated, the series name is prose again.
      'The ten-year breakeven inflation is 2.35% as of September 2026.',
    ]) {
      const grounded = groundDraft(
        { headline: 'A headline.', paragraphs: [allowed], watchOuts: [] },
        facts
      );
      expect(grounded).toEqual({ grounded: true, ungrounded: [] });
    }
  });

  it('names the rate the visitor typed as theirs, not as ours', () => {
    const labels = buildCoastFireFacts(result()).map((fact) => fact.label);
    expect(labels.some((label) => label.includes('entered by the visitor'))).toBe(true);
  });
});

describe('interpretCoastFire', () => {
  it('returns a grounded reading and caches it', async () => {
    model.ask.mockResolvedValue(DRAFT('Your Coast FIRE number is $369,128.'));

    const first = await interpretCoastFire(result());
    expect(first?.paragraphs[0]).toContain('$369,128');
    expect(first?.cached).toBe(false);

    const second = await interpretCoastFire(result());
    expect(second?.cached).toBe(true);
    expect(model.ask).toHaveBeenCalledTimes(1);
  });

  it('reads a different scenario separately', async () => {
    model.ask.mockResolvedValue(DRAFT('A paragraph with no figures.'));

    await interpretCoastFire(result());
    await interpretCoastFire(result({ realReturnRate: 6 }));
    expect(model.ask).toHaveBeenCalledTimes(2);
  });

  it('retries once, naming the figure it would not accept', async () => {
    model.ask
      .mockResolvedValueOnce(DRAFT('That is $4,167 a month.'))
      .mockResolvedValueOnce(DRAFT('Your Coast FIRE number is $369,128.'));

    const interpretation = await interpretCoastFire(result());
    expect(interpretation?.paragraphs[0]).toContain('$369,128');

    const retryPrompt = String(model.ask.mock.calls[1][1]);
    expect(retryPrompt).toContain('$4,167');
    expect(retryPrompt).toContain('Do not compute anything.');
  });

  it('gives up rather than shipping a figure it could not check', async () => {
    model.ask.mockResolvedValue(DRAFT('That is $4,167 a month.'));

    expect(await interpretCoastFire(result())).toBeNull();
    expect(model.ask).toHaveBeenCalledTimes(2);
  });

  it('returns null when the provider fails, without retrying it', async () => {
    model.ask.mockRejectedValue(new Error('provider down'));

    expect(await interpretCoastFire(result())).toBeNull();
    expect(model.ask).toHaveBeenCalledTimes(1);
  });

  it('gives up on a response that never parses', async () => {
    model.ask.mockResolvedValue('I am afraid I cannot do that.');

    expect(await interpretCoastFire(result())).toBeNull();
    expect(model.ask).toHaveBeenCalledTimes(2);
  });

  /*
   * A stalled provider has to reach the same dropped-panel path as a refusing
   * one. Without a bound of our own the SDK's ten-minute default applies, and
   * it retries a timeout — so the page would sit on "Reading your result…"
   * with an unauthenticated request open behind it.
   */
  it('bounds the model call so a stalled provider drops the panel', async () => {
    model.ask.mockResolvedValue(DRAFT('A paragraph with no figures.'));

    await interpretCoastFire(result());
    const options = model.ask.mock.calls[0][2] as { timeoutMs: number; maxRetries: number };
    expect(options.maxRetries).toBe(0);
    expect(options.timeoutMs).toBeLessThanOrEqual(25_000);
  });

  /*
   * The rates are part of the key, not just their dates: a provider revising a
   * value in place would otherwise serve prose quoting a yield that is no
   * longer the one in the facts.
   */
  it('re-reads a scenario when a published rate moves', async () => {
    model.ask.mockResolvedValue(DRAFT('A paragraph with no figures.'));

    market.get.mockResolvedValue({
      fetchedAt: '2026-09-16T00:00:00.000Z',
      treasury30Y: { percent: 4.62, asOf: '2026-09-15', label: 'thirty-year Treasury yield', source: 'Massive' },
    } as never);
    await interpretCoastFire(result());

    market.get.mockResolvedValue({
      fetchedAt: '2026-09-16T00:00:00.000Z',
      treasury30Y: { percent: 4.71, asOf: '2026-09-15', label: 'thirty-year Treasury yield', source: 'Massive' },
    } as never);
    await interpretCoastFire(result());

    expect(model.ask).toHaveBeenCalledTimes(2);
  });

  /* The rule the whole prompt is shaped around. */
  it('tells the model that reaching the number is not permission to stop saving', async () => {
    model.ask.mockResolvedValue(DRAFT('A paragraph with no figures.'));

    await interpretCoastFire(result({ currentSavings: 900_000 }));
    const [system, user] = model.ask.mock.calls[0] as [string, string];
    expect(system).toContain('Describe, do not prescribe');
    expect(system).toContain('There is no probability here');
    expect(user).toContain('never as permission to stop saving');
  });

  it('tells the model that falling short is not an instruction to save harder', async () => {
    model.ask.mockResolvedValue(DRAFT('A paragraph with no figures.'));

    await interpretCoastFire(result({ currentSavings: 10_000 }));
    expect(String(model.ask.mock.calls[0][1])).toContain('never as an instruction to save harder');
  });
});
