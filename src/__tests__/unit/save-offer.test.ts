/**
 * "Use these next time?": what an answer offers to keep, and what it never
 * offers -- a what-if, a figure already saved, a balance that would be counted
 * twice.
 */
import { describe, expect, it, jest } from '@jest/globals';
import { buildSaveOffer } from '../../openai/save-offer';
import { NOTHING_LINKED } from '../../openai/linked-data';
import { scenarioCalculatorRegistry } from '../../scenarios/calculator-registry';
import {
  coastFireSavableFigures,
  parseCoastFireScenarioPlan,
  runCoastFireScenario,
} from '../../scenarios/coast-fire-scenario';

const FIELDS = ['currentAge', 'retirementAge', 'currentSavings', 'annualRetirementSpending', 'annualRetirementIncome', 'realReturnRatePercent', 'withdrawalRatePercent', 'annualContribution'];

function plan(primary: Record<string, number>, comparison: Record<string, number> = {}) {
  const variant = (values: Record<string, number>) => ({
    overrides: {
      ...Object.fromEntries(FIELDS.map((field) => [field, values[field] ?? null])),
      allocation: 'unspecified',
      sources: { ...Object.fromEntries(FIELDS.map((field) => [field, values[field] !== undefined ? `stated ${field}` : null])), allocation: null },
    },
  });
  return parseCoastFireScenarioPlan({ requested: true, primary: variant(primary), comparison: variant(comparison) })!;
}

const noHistory = jest.fn(async () => { throw new Error('history not needed here'); }) as any;

describe('the offer', () => {
  it('offers each new figure, written the way the user reads it', () => {
    expect(buildSaveOffer('coast_fire', [
      { key: 'retirementAge', value: 55 },
      { key: 'annualRetirementSpending', value: 80_000 },
      { key: 'allocation', value: 'growth' },
      { key: 'investedBalance', value: 500_000 },
    ], { linkedData: NOTHING_LINKED })).toEqual({
      calculatorId: 'coast_fire',
      items: [
        { key: 'retirementAge', label: 'Retirement age', value: 55, display: '55' },
        { key: 'annualRetirementSpending', label: 'Spending in retirement', value: 80_000, display: '$80,000 a year' },
        { key: 'allocation', label: 'Preset mix', value: 'growth', display: 'Growth' },
        { key: 'investedBalance', label: 'Invested today', value: 500_000, display: '$500,000' },
      ],
    });
  });

  it('leaves out what is already saved, a zero, and anything Your numbers would not accept', () => {
    expect(buildSaveOffer('coast_fire', [
      { key: 'retirementAge', value: 55 },
      { key: 'retirementIncome', value: 0 },
      { key: 'annualRetirementSpending', value: 500 },
    ], {
      linkedData: NOTHING_LINKED,
      statedFigures: { retirementAge: { value: 55, savedAt: '2026-10-01T00:00:00.000Z', source: 'page' } },
    })).toBeNull();
  });

  it('never offers a balance when an investment account is linked or entered, or coverage is unknown', () => {
    const balance = [{ key: 'investedBalance' as const, value: 500_000 }];
    expect(buildSaveOffer('coast_fire', balance, { linkedData: { ...NOTHING_LINKED, accounts: 1, investments: 1 } })).toBeNull();
    expect(buildSaveOffer('coast_fire', balance, {
      linkedData: { ...NOTHING_LINKED, entered: { accounts: 1, cash: 0, credit: 0, loans: 0, investments: 1 } },
    })).toBeNull();
    expect(buildSaveOffer('coast_fire', balance, {})).toBeNull();
  });
});

describe('what a calculation offers', () => {
  it('offers the main case the user stated, never a comparison\'s what-if', async () => {
    const execution = await runCoastFireScenario(
      { linkedData: NOTHING_LINKED, investments: { holdings: [{ id: 'x' }] } } as any,
      plan(
        { currentAge: 38, retirementAge: 55, currentSavings: 500_000, annualRetirementSpending: 80_000 },
        { retirementAge: 50 }
      ),
      noHistory
    );

    const figures = coastFireSavableFigures(execution);
    expect(figures).toEqual(expect.arrayContaining([
      { key: 'retirementAge', value: 55 },
      { key: 'annualRetirementSpending', value: 80_000 },
      { key: 'investedBalance', value: 500_000 },
    ]));
    expect(figures).not.toContainEqual({ key: 'retirementAge', value: 50 });
    // Defaults the calculator filled in are not the user's figures.
    expect(figures.some((figure) => figure.key === 'retirementIncome')).toBe(false);

    const offer = scenarioCalculatorRegistry.saveOffer({ coast_fire: execution }, { linkedData: NOTHING_LINKED });
    expect(offer?.items.map((item) => item.key)).toEqual(['retirementAge', 'annualRetirementSpending', 'investedBalance']);
  });

  it('offers nothing for a calculation that did not run', async () => {
    const execution = await runCoastFireScenario({} as any, plan({ retirementAge: 55 }), noHistory);
    expect(coastFireSavableFigures(execution)).toEqual([]);
  });
});
