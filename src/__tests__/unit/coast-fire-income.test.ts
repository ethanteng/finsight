import { describe, expect, it } from '@jest/globals';
import { calculateCoastFireWithIncome } from '../../scenarios/coast-fire-income';
import { calculateCoastFire } from '../../services/coast-fire';

const BASE = {
  currentAge: 38,
  retirementAge: 55,
  currentSavings: 500_000,
  annualRetirementSpending: 60_000,
  realReturnRate: 5,
  withdrawalRate: 4,
};

describe('Coast FIRE with income on its own schedule', () => {
  it('matches the page formula when there is no income', () => {
    const page = calculateCoastFire({ ...BASE, annualRetirementIncome: 0 });
    const result = calculateCoastFireWithIncome(BASE, [], { planThroughAge: 95 });

    expect(result.retirementTarget).toBeCloseTo(page.retirementTarget, 6);
    expect(result.coastFireNumber).toBeCloseTo(page.coastFireNumber, 6);
    expect(result.bridgeReserve).toBe(0);
    expect(result.inflationPercent).toBeUndefined();
  });

  it('matches the page formula for an indexed income from the retirement date', () => {
    const page = calculateCoastFire({ ...BASE, annualRetirementIncome: 20_000 });
    const result = calculateCoastFireWithIncome(
      BASE,
      [{ kind: 'pension', annualAmount: 20_000, startAge: 55, inflationAdjusted: true }],
      { planThroughAge: 95 }
    );

    expect(result.retirementTarget).toBeCloseTo(page.retirementTarget, 6);
    expect(result.incomes[0]).toMatchObject({ levelAmount: 20_000, gapYears: 0 });
  });

  it('sets aside the years before Social Security starts, valued at the real return', () => {
    const result = calculateCoastFireWithIncome(
      BASE,
      [{ kind: 'social_security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true }],
      { planThroughAge: 95 }
    );

    // Twelve years of the $30,000 the benefit will later cover, at 5% real.
    let reserve = 0;
    for (let year = 0; year < 12; year++) reserve += 30_000 / 1.05 ** year;
    expect(result.bridgeReserve).toBeCloseTo(reserve, 6);
    expect(result.portfolioSpendingNeed).toBe(30_000);
    expect(result.retirementTarget).toBeCloseTo(30_000 / 0.04 + reserve, 6);
    expect(result.coastFireNumber).toBeCloseTo(result.retirementTarget / 1.05 ** 17, 6);
    expect(result.incomes[0].gapYears).toBe(12);
  });

  it('only bridges the spending an income will cover, not income above it', () => {
    const result = calculateCoastFireWithIncome(
      { ...BASE, retirementAge: 60, annualRetirementSpending: 50_000, realReturnRate: 0 },
      [{ kind: 'pension', annualAmount: 60_000, startAge: 70, inflationAdjusted: true }],
      { planThroughAge: 95 }
    );

    expect(result.portfolioSpendingNeed).toBe(0);
    expect(result.bridgeReserve).toBeCloseTo(10 * 50_000, 6);
  });

  it('counts a fixed pension for less than its dollars, and the same with no inflation', () => {
    const fixed = calculateCoastFireWithIncome(
      BASE,
      [{ kind: 'pension', annualAmount: 24_000, startAge: 55, inflationAdjusted: false }],
      { planThroughAge: 95 }
    );
    const indexed = calculateCoastFireWithIncome(
      BASE,
      [{ kind: 'pension', annualAmount: 24_000, startAge: 55, inflationAdjusted: true }],
      { planThroughAge: 95 }
    );
    const noInflation = calculateCoastFireWithIncome(
      BASE,
      [{ kind: 'pension', annualAmount: 24_000, startAge: 55, inflationAdjusted: false }],
      { planThroughAge: 95, inflationPercent: 0 }
    );

    expect(fixed.incomes[0].levelAmount).toBeLessThan(24_000 / 1.025 ** 17);
    expect(fixed.incomes[0].levelAmount).toBeGreaterThan(24_000 / 1.025 ** 57);
    expect(fixed.inflationPercent).toBe(2.5);
    expect(fixed.retirementTarget).toBeGreaterThan(indexed.retirementTarget);
    expect(noInflation.incomes[0].levelAmount).toBeCloseTo(24_000, 6);
  });

  it('counts nothing for an income that starts after the plan ends', () => {
    const result = calculateCoastFireWithIncome(
      { ...BASE, retirementAge: 60 },
      [{ kind: 'pension', annualAmount: 24_000, startAge: 95, inflationAdjusted: true }],
      { planThroughAge: 95 }
    );

    expect(result.incomes[0].levelAmount).toBe(0);
    expect(result.bridgeReserve).toBe(0);
    expect(result.portfolioSpendingNeed).toBe(60_000);
  });

  it('counts an income that stops before the plan ends at the level worth of the years it pays', () => {
    // Zero real return: every year weighs the same, so the level amount is the
    // share of the plan's years it is paid in.
    const result = calculateCoastFireWithIncome(
      { ...BASE, realReturnRate: 0 },
      [{ owner: 'partner', kind: 'social_security', annualAmount: 20_000, startAge: 55, inflationAdjusted: true, endAge: 85 }],
      { planThroughAge: 95 }
    );
    // Paid 30 of the 40 years from 55 to 95.
    expect(result.incomes[0].levelAmount).toBeCloseTo(15_000, 6);
    expect(result.portfolioSpendingNeed).toBeCloseTo(45_000, 6);
    expect(result.inflationPercent).toBeUndefined();
  });

  it('counts a survivor\'s lower spending as the level spending with the same value', () => {
    const result = calculateCoastFireWithIncome(
      { ...BASE, realReturnRate: 0 },
      [],
      { planThroughAge: 95, spendingChange: { fromAge: 75, annualAmount: 40_000 } }
    );
    // $60,000 for the 20 years from 55 to 75, then $40,000 for 20: $50,000 level.
    expect(result.levelSpending).toBeCloseTo(50_000, 6);
    expect(result.spendingChange).toEqual({ fromAge: 75, annualAmount: 40_000 });
    expect(result.annualRetirementSpending).toBe(60_000);
    expect(result.retirementTarget).toBeCloseTo(50_000 / 0.04, 6);
  });
});

