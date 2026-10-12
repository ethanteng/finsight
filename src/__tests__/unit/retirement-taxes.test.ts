import { describe, expect, it } from '@jest/globals';
import {
  requiredDistributionAge,
  taxableSocialSecurity,
  taxForYear,
  uniformLifetimeDivisor,
} from '../../retirement-analytics/engine/taxes';
import {
  applicablePercentage,
  marketplaceBenchmarkPremium,
  MEDICARE_ANNUAL_PREMIUM,
  premiumTaxCredit,
} from '../../retirement-analytics/engine/healthcare';
import { planYearCash } from '../../retirement-analytics/engine/retirement-cash-plan';
import { simulateWithdrawals, type SimulatedTaxes } from '../../retirement-analytics/engine/withdrawal-simulator';
import type { PortfolioMapping } from '../../retirement-analytics/types';

describe('a year of income tax in retirement', () => {
  it('taxes ordinary income on the 2026 brackets after the standard deduction', () => {
    // $50,000 single: $33,900 taxable, $12,400 at 10% and $21,500 at 12%.
    expect(taxForYear({ filing: 'single', peopleAged65: 0, ordinaryIncome: 50_000, socialSecurity: 0, capitalGains: 0, stateRate: 0 }).federal)
      .toBeCloseTo(3_820, 6);
    // A couple both over 65 adds $1,650 each: $60,000 leaves $24,500 at 10%.
    expect(taxForYear({ filing: 'joint', peopleAged65: 2, ordinaryIncome: 60_000, socialSecurity: 0, capitalGains: 0, stateRate: 0 }).federal)
      .toBeCloseTo(2_450, 6);
  });

  it('counts Social Security by the provisional-income formula', () => {
    expect(taxableSocialSecurity(20_000, 20_000, [25_000, 34_000])).toBeCloseTo(2_500, 6);
    expect(taxableSocialSecurity(40_000, 30_000, [25_000, 34_000])).toBeCloseTo(22_350, 6);
    expect(taxableSocialSecurity(5_000, 20_000, [25_000, 34_000])).toBe(0);
    // Never more than 85% of the benefit.
    expect(taxableSocialSecurity(500_000, 40_000, [25_000, 34_000])).toBeCloseTo(34_000, 6);
  });

  it('lets the unindexed base amounts shrink as prices rise', () => {
    const today = taxForYear({ filing: 'single', peopleAged65: 1, ordinaryIncome: 20_000, socialSecurity: 20_000, capitalGains: 0, stateRate: 0 });
    const later = taxForYear({ filing: 'single', peopleAged65: 1, ordinaryIncome: 20_000, socialSecurity: 20_000, capitalGains: 0, stateRate: 0, priceLevel: 2 });
    expect(today.taxableSocialSecurity).toBeCloseTo(2_500, 6);
    expect(later.taxableSocialSecurity).toBeGreaterThan(today.taxableSocialSecurity);
  });

  it('stacks gains on top of ordinary income at 0%, 15% and 20%', () => {
    // A couple with only $100,000 of gains stays inside the 0% band.
    expect(taxForYear({ filing: 'joint', peopleAged65: 0, ordinaryIncome: 0, socialSecurity: 0, capitalGains: 100_000, stateRate: 0 }).federal).toBe(0);
    // Single, $60,000 ordinary and $20,000 of gains: $43,900 of ordinary
    // income leaves $5,550 of the gains at 0% and $14,450 at 15%.
    expect(taxForYear({ filing: 'single', peopleAged65: 0, ordinaryIncome: 60_000, socialSecurity: 0, capitalGains: 20_000, stateRate: 0 }).federal)
      .toBeCloseTo(1_240 + 3_780 + 0.15 * 14_450, 6);
  });

  it('charges state tax on withdrawals, pensions and gains, not Social Security', () => {
    const tax = taxForYear({ filing: 'single', peopleAged65: 1, ordinaryIncome: 50_000, socialSecurity: 20_000, capitalGains: 10_000, stateRate: 0.05 });
    expect(tax.state).toBeCloseTo(3_000, 6);
    expect(tax.modifiedAdjustedGrossIncome).toBeCloseTo(80_000, 6);
  });

  it('starts required distributions at 73 or 75 by birth year, on the Uniform Lifetime Table', () => {
    expect(requiredDistributionAge(1960)).toBe(75);
    expect(requiredDistributionAge(1955)).toBe(73);
    expect(uniformLifetimeDivisor(71)).toBeUndefined();
    expect(uniformLifetimeDivisor(75)).toBe(24.6);
    expect(uniformLifetimeDivisor(125)).toBe(2.0);
  });
});

describe('health premiums in retirement', () => {
  it('prices the marketplace benchmark by age on the federal curve', () => {
    expect(marketplaceBenchmarkPremium(40)).toBeCloseTo(7_500, 6);
    expect(marketplaceBenchmarkPremium(64)).toBeCloseTo(7_500 * 3 / 1.278, 6);
    expect(marketplaceBenchmarkPremium(70)).toBeCloseTo(7_500 * 3 / 1.278, 6);
    expect(MEDICARE_ANNUAL_PREMIUM).toBeCloseTo(2_902.68, 6);
  });

  it('credits the benchmark less the expected share of income, with nothing below 100% or above 400% of the poverty line', () => {
    expect(applicablePercentage(0.99)).toBeUndefined();
    expect(premiumTaxCredit({ benchmarkPremium: 10_000, modifiedAdjustedGrossIncome: 0, householdSize: 1 })).toBe(0);
    expect(applicablePercentage(1)).toBeCloseTo(0.021, 6);
    expect(applicablePercentage(3.5)).toBeCloseTo(0.0996, 6);
    expect(applicablePercentage(4.01)).toBeUndefined();
    const benchmark = marketplaceBenchmarkPremium(60);
    const multiple = 40_000 / 15_650;
    const share = 0.0844 + (0.0996 - 0.0844) * (multiple - 2.5) / 0.5;
    expect(premiumTaxCredit({ benchmarkPremium: benchmark, modifiedAdjustedGrossIncome: 40_000, householdSize: 1 }))
      .toBeCloseTo(benchmark - share * 40_000, 4);
    expect(premiumTaxCredit({ benchmarkPremium: benchmark, modifiedAdjustedGrossIncome: 70_000, householdSize: 1 })).toBe(0);
  });
});

describe('a year of a retired household\'s cash', () => {
  const none = { taxable: 0, pretax: 0, roth: 0 };
  const single = { household: 'single' as const, peopleAged65: 0, stateRate: 0, priceLevel: 1 };

  it('grosses a pre-tax draw up to cover the tax on it', () => {
    // W - (1,240 + 12% of (W - 28,500)) = 40,000.
    const plan = planYearCash({
      spending: 40_000, ordinaryIncome: 0, socialSecurity: 0, balances: { ...none, pretax: 1_000_000 },
      taxableBasis: 0, requiredDistribution: 0, tax: single,
    });
    expect(plan.draws.pretax).toBeCloseTo(37_820 / 0.88, 1);
    expect(plan.federalTax).toBeCloseTo(37_820 / 0.88 - 40_000, 1);
  });

  it('draws taxable money first, taxing only its gain', () => {
    const plan = planYearCash({
      spending: 30_000, ordinaryIncome: 0, socialSecurity: 0,
      balances: { taxable: 100_000, pretax: 100_000, roth: 100_000 }, taxableBasis: 50_000,
      requiredDistribution: 0, tax: { ...single, household: 'joint' },
    });
    expect(plan.draws).toEqual({ taxable: expect.closeTo(30_000, 1), pretax: 0, roth: 0 });
    expect(plan.federalTax).toBe(0);
  });

  it('takes a required distribution even when it is not needed, and reinvests the rest after tax', () => {
    const plan = planYearCash({
      spending: 20_000, ordinaryIncome: 0, socialSecurity: 0, balances: { ...none, pretax: 1_000_000 },
      taxableBasis: 0, requiredDistribution: 40_000, tax: { ...single, peopleAged65: 1 },
    });
    expect(plan.draws.pretax).toBe(40_000);
    expect(plan.federalTax).toBeCloseTo(2_374, 6);
    expect(plan.reinvested).toBeCloseTo(40_000 - 2_374 - 20_000, 6);
  });

  it('keeps marketplace premiums low when the draw adds no income', () => {
    const benchmark = marketplaceBenchmarkPremium(60);
    // A $20,000 pension is 128% of the poverty line; Roth money adds nothing to it.
    const roth = planYearCash({
      spending: 40_000, ordinaryIncome: 20_000, socialSecurity: 0, balances: { ...none, roth: 1_000_000 },
      taxableBasis: 0, requiredDistribution: 0, tax: single,
      healthcare: { fixedPremiums: 0, marketplaceBenchmark: benchmark, marketplacePeople: 1, householdSize: 1 },
    });
    expect(roth.premiumTaxCredit).toBeCloseTo(benchmark - 0.021 * 20_000, 6);
    expect(roth.premiums).toBeCloseTo(0.021 * 20_000, 6);
    // Below the poverty line no credit is paid: the full premium.
    const noIncome = planYearCash({
      spending: 40_000, ordinaryIncome: 0, socialSecurity: 0, balances: { ...none, roth: 1_000_000 },
      taxableBasis: 0, requiredDistribution: 0, tax: single,
      healthcare: { fixedPremiums: 0, marketplaceBenchmark: benchmark, marketplacePeople: 1, householdSize: 1 },
    });
    expect(noIncome.premiumTaxCredit).toBe(0);
    expect(noIncome.draws.roth).toBeCloseTo(40_000 + benchmark, 1);
    // From pre-tax money the same spending is income, past the 400% line.
    const pretax = planYearCash({
      spending: 60_000, ordinaryIncome: 0, socialSecurity: 0, balances: { ...none, pretax: 2_000_000 },
      taxableBasis: 0, requiredDistribution: 0, tax: single,
      healthcare: { fixedPremiums: 0, marketplaceBenchmark: benchmark, marketplacePeople: 1, householdSize: 1 },
    });
    expect(pretax.premiumTaxCredit).toBe(0);
    expect(pretax.premiums).toBeCloseTo(benchmark, 6);
  });

  it('prefers a below-cliff draw when one covers spending after the premium credit', () => {
    // $50k spend with $20k Social Security from all pre-tax money: a ~$41k
    // draw keeps MAGI under 400% of the poverty line; naive bisection jumps
    // past the cliff to ~$54k with no credit.
    const benchmark = marketplaceBenchmarkPremium(62);
    const plan = planYearCash({
      spending: 50_000, ordinaryIncome: 0, socialSecurity: 20_000, balances: { ...none, pretax: 1_000_000 },
      taxableBasis: 0, requiredDistribution: 0, tax: single,
      healthcare: { fixedPremiums: 0, marketplaceBenchmark: benchmark, marketplacePeople: 1, householdSize: 1 },
    });
    expect(plan.premiumTaxCredit).toBeGreaterThan(10_000);
    expect(plan.draws.pretax).toBeLessThan(45_000);
    expect(plan.draws.pretax).toBeGreaterThan(38_000);
  });

  it('credits only marketplace enrollees when an unmarried couple files two returns', () => {
    const benchmark = marketplaceBenchmarkPremium(60);
    // A $40,000 pension between them: each return is 128% of the poverty line.
    const both = planYearCash({
      spending: 40_000, ordinaryIncome: 40_000, socialSecurity: 0, balances: { ...none, roth: 1_000_000 },
      taxableBasis: 0, requiredDistribution: 0,
      tax: { household: 'separate_singles', peopleAged65: 0, stateRate: 0, priceLevel: 1 },
      healthcare: { fixedPremiums: 0, marketplaceBenchmark: benchmark * 2, marketplacePeople: 2, householdSize: 2 },
    });
    const one = planYearCash({
      spending: 40_000, ordinaryIncome: 40_000, socialSecurity: 0, balances: { ...none, roth: 1_000_000 },
      taxableBasis: 0, requiredDistribution: 0,
      tax: { household: 'separate_singles', peopleAged65: 1, stateRate: 0, priceLevel: 1 },
      healthcare: {
        fixedPremiums: MEDICARE_ANNUAL_PREMIUM,
        marketplaceBenchmark: benchmark,
        marketplacePeople: 1,
        householdSize: 2,
      },
    });
    // One marketplace enrollee must not be priced as two half-benchmarks.
    expect(both.premiumTaxCredit).toBeGreaterThan(0);
    expect(one.premiumTaxCredit).toBeGreaterThan(both.premiumTaxCredit / 2 - 1);
    expect(one.premiums).toBeLessThan(MEDICARE_ANNUAL_PREMIUM + benchmark - both.premiumTaxCredit / 2 + 1);
  });

  it('keeps the credit when spending can be covered without crossing 400% of the poverty line', () => {
    // At 62 the benchmark is about $16,860. Drawing $62,510 of pre-tax money
    // stays just under the line and covers $50,960 after tax and premiums;
    // just past it, the whole credit is gone and the next draw that covers
    // the spending is about $75,600.
    const plan = planYearCash({
      spending: 50_960, ordinaryIncome: 0, socialSecurity: 0, balances: { ...none, pretax: 500_000 },
      taxableBasis: 0, requiredDistribution: 0, tax: single,
      healthcare: { fixedPremiums: 0, marketplaceBenchmark: marketplaceBenchmarkPremium(62), marketplacePeople: 1, householdSize: 1 },
    });
    expect(plan.draws.pretax).toBeLessThan(4 * 15_650);
    expect(plan.draws.pretax).toBeGreaterThan(62_400);
    expect(plan.premiumTaxCredit).toBeGreaterThan(10_000);
    expect(plan.shortfall).toBe(0);
  });

  it('crosses 400% of the poverty line only when spending cannot be covered below it', () => {
    const plan = planYearCash({
      spending: 60_000, ordinaryIncome: 0, socialSecurity: 0, balances: { ...none, pretax: 500_000 },
      taxableBasis: 0, requiredDistribution: 0, tax: single,
      healthcare: { fixedPremiums: 0, marketplaceBenchmark: marketplaceBenchmarkPremium(62), marketplacePeople: 1, householdSize: 1 },
    });
    expect(plan.premiumTaxCredit).toBe(0);
    expect(plan.draws.pretax - plan.federalTax - plan.premiums).toBeCloseTo(60_000, 2);
  });

  it('adds the 10% additional tax to pre-tax money drawn before 59 1/2, for the part of the year it applies', () => {
    const base = {
      spending: 40_000, ordinaryIncome: 0, socialSecurity: 0, balances: { ...none, pretax: 1_000_000 },
      taxableBasis: 0, requiredDistribution: 0,
    };
    const early = planYearCash({ ...base, tax: { ...single, earlyWithdrawalShare: 1 } });
    const halfYear = planYearCash({ ...base, tax: { ...single, earlyWithdrawalShare: 0.5 } });
    const later = planYearCash({ ...base, tax: single });
    // W - (1,240 + 12% of (W - 28,500)) - 10% of W = 40,000.
    expect(early.draws.pretax).toBeCloseTo(37_820 / 0.78, 1);
    expect(halfYear.draws.pretax).toBeGreaterThan(later.draws.pretax);
    expect(halfYear.draws.pretax).toBeLessThan(early.draws.pretax);
    // Roth and taxable money pay nothing extra.
    const roth = planYearCash({ ...base, balances: { ...none, roth: 1_000_000 }, tax: { ...single, earlyWithdrawalShare: 1 } });
    expect(roth.federalTax).toBe(0);
  });

  it('reports what it could not cover', () => {
    const plan = planYearCash({
      spending: 40_000, ordinaryIncome: 0, socialSecurity: 0, balances: { ...none, roth: 10_000 },
      taxableBasis: 0, requiredDistribution: 0, tax: single,
    });
    expect(plan.draws.roth).toBe(10_000);
    expect(plan.shortfall).toBeCloseTo(30_000, 6);
  });
});

describe('the simulation with taxes and premiums', () => {
  const mapping = {
    usEquityWeight: 1, internationalEquityWeight: 0, nominalBondsWeight: 0, tipsWeight: 0, cashWeight: 0,
    totalValue: 1, usEquityValue: 1, internationalEquityValue: 0, nominalBondsValue: 0, tipsValue: 0,
    unsupportedFixedIncomeValue: 0, cashValue: 0, mappedValue: 1, unmappedValue: 0, unsupportedValue: 0,
    unrecognizedValue: 0, valueCoverage: 1, proxiedValue: 0, proxiedValuePercentage: 0, holdingExposures: [],
    mappingConfidence: 'high', unmappedHoldings: [], unrecognizedHoldings: [], equityGeographyUnresolvedHoldings: [],
    targetDateUnregisteredHoldings: [], unsupportedHoldings: [], partiallyMappedHoldings: [], mappingMethod: 'direct',
    targetDateFunds: [],
  } as unknown as PortfolioMapping;
  const flat = (months: number) => {
    const zeroes = Array.from({ length: months }, () => 0);
    return {
      startDate: new Date('2000-01-01T00:00:00.000Z'), endDate: new Date('2010-01-01T00:00:00.000Z'), sequenceId: 'flat',
      assetBasketReturns: { usEquity: [...zeroes], internationalEquity: [...zeroes], nominalBonds: [...zeroes], tips: [...zeroes], cash: [...zeroes] },
      inflationRates: [...zeroes],
    };
  };
  const taxes = (accounts: SimulatedTaxes['accounts'], extra: Partial<SimulatedTaxes> = {}): SimulatedTaxes => ({
    accounts, taxableBasisShare: 0, filing: 'single', stateRate: 0, asOfYear: 2026, ...extra,
  });

  it('matches the untaxed simulation for Roth money and costs the tax for pre-tax money', () => {
    const untaxed = simulateWithdrawals(mapping, 1_000_000, flat(24), 40_000);
    const roth = simulateWithdrawals(mapping, 1_000_000, flat(24), 40_000, {
      taxes: taxes({ taxable: 0, pretax: 0, roth: 1 }), people: [{ age: 60 }],
    });
    expect(roth.finalValue).toBeCloseTo(untaxed.finalValue, 2);
    expect(roth.firstYearCosts).toEqual({ federalTax: 0, stateTax: 0, healthcarePremiums: 0, premiumTaxCredit: 0 });

    const pretax = simulateWithdrawals(mapping, 1_000_000, flat(24), 40_000, {
      taxes: taxes({ taxable: 0, pretax: 1, roth: 0 }), people: [{ age: 60 }],
    });
    const yearly = 37_820 / 0.88;
    expect(pretax.firstYearCosts!.federalTax).toBeCloseTo(yearly - 40_000, 1);
    expect(pretax.finalValue).toBeCloseTo(1_000_000 - 2 * yearly, 0);
    expect(pretax.realFirstYearPortfolioWithdrawal).toBeCloseTo(yearly, 0);
  });

  it('takes required distributions from pre-tax money and keeps what is not spent', () => {
    // At 75, $1,000,000 must give up $40,650 though only $10,000 is spent.
    const outcome = simulateWithdrawals(mapping, 1_000_000, flat(12), 10_000, {
      taxes: taxes({ taxable: 0, pretax: 1, roth: 0 }), people: [{ age: 75 }],
    });
    const required = 1_000_000 / 24.6;
    const tax = 1_240 + 0.12 * (required - 16_100 - 2_050 - 12_400);
    expect(outcome.firstYearCosts!.federalTax).toBeCloseTo(tax, 0);
    // The portfolio loses only the spending and the tax: the rest moves to the taxable account.
    expect(outcome.finalValue).toBeCloseTo(1_000_000 - 10_000 - tax, 0);
  });

  it('charges the additional tax on pre-tax money drawn before the owner reaches 59 1/2', () => {
    const run = (age: number) => simulateWithdrawals(mapping, 1_000_000, flat(12), 40_000, {
      taxes: taxes({ taxable: 0, pretax: 1, roth: 0 }), people: [{ age }],
    });
    const early = run(50);
    const later = run(60);
    expect(early.firstYearCosts!.federalTax).toBeGreaterThan(later.firstYearCosts!.federalTax);
    expect(early.finalValue).toBeLessThan(later.finalValue);
    // Half the year under 59 1/2: half the additional tax.
    const half = run(59);
    expect(half.firstYearCosts!.federalTax).toBeGreaterThan(later.firstYearCosts!.federalTax);
    expect(half.firstYearCosts!.federalTax).toBeLessThan(early.firstYearCosts!.federalTax);
  });

  it('does not charge the additional tax once the original owner has died', () => {
    const run = (people: Array<{ age: number; endMonth?: number }>) =>
      simulateWithdrawals(mapping, 1_000_000, flat(24), 40_000, {
        taxes: taxes({ taxable: 0, pretax: 1, roth: 0 }),
        people,
      });
    // Owner dies after year 1; the survivor is under 59½. Death distributions
    // are excepted, so year 2 must not pay the 10% tax.
    const excepted = run([{ age: 60, endMonth: 12 }, { age: 50 }]);
    // Same ages, but the under-59½ person is the original owner for the whole plan.
    const charged = run([{ age: 50 }, { age: 60, endMonth: 12 }]);
    expect(excepted.firstYearCosts!.federalTax).toBeLessThan(charged.firstYearCosts!.federalTax);
    expect(excepted.finalValue).toBeGreaterThan(charged.finalValue);
  });

  it('files single once a partner\'s plan ends', () => {
    const couple = (endMonth?: number) => simulateWithdrawals(mapping, 2_000_000, flat(24), 80_000, {
      taxes: taxes({ taxable: 0, pretax: 1, roth: 0 }, { filing: 'joint' }),
      people: [{ age: 66 }, { age: 66, ...(endMonth !== undefined && { endMonth }) }],
    });
    // The second year files single, and pays more on the same draw.
    expect(couple(12).finalValue).toBeLessThan(couple().finalValue);
  });

  it('adds marketplace premiums before 65, credited by income, and Medicare from 65', () => {
    const marketplace = { coverage: 'marketplace' as const, startMonth: 0 };
    const roth = simulateWithdrawals(mapping, 1_000_000, flat(12), 40_000, {
      taxes: taxes({ taxable: 0, pretax: 0, roth: 1 }), healthcare: marketplace, people: [{ age: 60 }],
    });
    // No income at all is below the poverty line, where no credit is paid.
    expect(roth.firstYearCosts!.premiumTaxCredit).toBe(0);
    expect(roth.firstYearCosts!.healthcarePremiums).toBeCloseTo(marketplaceBenchmarkPremium(60), 4);

    const pretax = simulateWithdrawals(mapping, 1_000_000, flat(12), 70_000, {
      taxes: taxes({ taxable: 0, pretax: 1, roth: 0 }), healthcare: marketplace, people: [{ age: 60 }],
    });
    expect(pretax.firstYearCosts!.premiumTaxCredit).toBe(0);
    expect(pretax.firstYearCosts!.healthcarePremiums).toBeCloseTo(marketplaceBenchmarkPremium(60), 4);

    const medicare = simulateWithdrawals(mapping, 1_000_000, flat(12), 40_000, {
      taxes: taxes({ taxable: 0, pretax: 0, roth: 1 }), healthcare: marketplace, people: [{ age: 66 }],
    });
    expect(medicare.firstYearCosts!.healthcarePremiums).toBeCloseTo(MEDICARE_ANNUAL_PREMIUM, 4);
    expect(medicare.finalValue).toBeCloseTo(1_000_000 - 40_000 - MEDICARE_ANNUAL_PREMIUM, 2);
  });

  it('runs COBRA for 18 months, then the marketplace', () => {
    const cobra = simulateWithdrawals(mapping, 1_000_000, flat(36), 40_000, {
      taxes: taxes({ taxable: 0, pretax: 0, roth: 1 }), healthcare: { coverage: 'cobra' as const, startMonth: 0 }, people: [{ age: 60 }],
    });
    expect(cobra.firstYearCosts!.healthcarePremiums).toBeCloseTo(9_325 * 1.02, 2);
  });
});
