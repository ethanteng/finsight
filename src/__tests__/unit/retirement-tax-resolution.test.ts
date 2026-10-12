import {
  accountTaxTreatment,
  filingFor,
  linkedAccountTaxMix,
  noIncomeTaxState,
  resolveAccountMix,
  resolveRetirementTaxes,
  resolveStateTax,
  sameTaxAndPremiumInputs,
  savableAccountSplit,
} from '../../services/retirement-taxes';
import { hasPreMedicareYears, resolveHealthcare } from '../../services/retirement-healthcare';
import { acceptedFigureValue, type StatedFigures } from '../../services/stated-figures';
import {
  describeFirstYearCosts,
  describeHealthcare,
  describeTaxAndHealthcareAsks,
  describeTaxes,
  savableTaxAndHealthcareFigures,
  taxAndHealthcareFactRows,
  taxAndHealthcareInputRequest,
} from '../../openai/tax-healthcare-evidence';

const saved = (value: number | string, savedAt = '2026-09-01T00:00:00.000Z') => ({ value, savedAt, source: 'page' as const });

describe('account tax treatment', () => {
  it('reads the subtype, then the name when the subtype is generic', () => {
    expect(accountTaxTreatment({ subtype: '401k' })).toBe('pretax');
    expect(accountTaxTreatment({ subtype: 'roth 401k' })).toBe('roth');
    expect(accountTaxTreatment({ subtype: 'roth' })).toBe('roth');
    expect(accountTaxTreatment({ subtype: 'brokerage' })).toBe('taxable');
    expect(accountTaxTreatment({ subtype: 'hsa' })).toBe('pretax');
    expect(accountTaxTreatment({ subtype: 'other', name: 'Health Savings Account' })).toBe('pretax');
    expect(accountTaxTreatment({ subtype: 'investment', name: 'Rollover IRA' })).toBe('pretax');
    expect(accountTaxTreatment({ subtype: 'other', name: 'My Roth IRA' })).toBe('roth');
    expect(accountTaxTreatment({ subtype: 'other', name: 'Individual' })).toBe('taxable');
    expect(accountTaxTreatment({ subtype: 'other', name: 'Savings bucket' })).toBeUndefined();
    // A Roth filed under "ira" is still a Roth.
    expect(accountTaxTreatment({ subtype: 'ira', name: 'Roth IRA' })).toBe('roth');
    expect(accountTaxTreatment({ subtype: 'ira', name: 'Traditional IRA' })).toBe('pretax');
  });

  it('splits holdings by their account and keeps the known cost basis of taxable ones', () => {
    const mix = linkedAccountTaxMix(
      [
        { account_id: 'k', institution_value: 600_000, cost_basis: 300_000 },
        { account_id: 'b', institution_value: 200_000, cost_basis: 120_000 },
        { account_id: 'b', institution_value: 50_000, cost_basis: null },
        { account_id: 'r', institution_value: 100_000 },
        { account_id: 'manual-1', institution_value: 50_000 },
      ],
      [
        { account_id: 'k', subtype: '401k' },
        { account_id: 'b', subtype: 'brokerage' },
        { account_id: 'r', subtype: 'roth' },
      ]
    );
    expect(mix).toEqual({
      taxable: 250_000,
      pretax: 600_000,
      roth: 100_000,
      unknown: 50_000,
      taxableBasis: 120_000,
      taxableWithoutBasis: 50_000,
    });
  });
});

describe('account mix', () => {
  it('counts untyped linked money as pre-tax and says how much', () => {
    const resolution = resolveAccountMix({
      linked: { taxable: 250_000, pretax: 600_000, roth: 100_000, unknown: 50_000, taxableBasis: 120_000, taxableWithoutBasis: 50_000 },
    });
    expect(resolution.origin).toBe('linked');
    expect(resolution.untypedOrigin).toBe('assumed');
    expect(resolution.shares.pretax).toBeCloseTo(0.65);
    expect(resolution.shares.taxable).toBeCloseTo(0.25);
    expect(resolution.shares.roth).toBeCloseTo(0.10);
    expect(resolution.assumedPretaxShare).toBeCloseTo(0.05);
    expect(resolution.taxableBasisShare).toBeCloseTo(120_000 / 250_000);
    expect(resolution.basisUnknown).toBe(true);
  });

  it('reads stated amounts against the plan total and counts what was not placed as pre-tax', () => {
    const resolution = resolveAccountMix({ stated: { rothAmount: 100_000, taxableAmount: 100_000 }, total: 500_000 });
    expect(resolution.origin).toBe('stated');
    expect(resolution.shares).toEqual({ taxable: 0.2, pretax: 0.6, roth: 0.2 });
    expect(resolution.assumedPretaxShare).toBeCloseTo(0.6);
    expect(savableAccountSplit(resolution)).toBeUndefined();
  });

  it('takes a fully placed split as the user\'s, savable as whole percents', () => {
    const resolution = resolveAccountMix({ stated: { pretaxPercent: 70, rothPercent: 20, taxablePercent: 10 } });
    expect(resolution.shares.pretax).toBeCloseTo(0.7);
    expect(resolution.assumedPretaxShare).toBe(0);
    expect(savableAccountSplit(resolution)).toEqual({ rothSavingsPercent: 20, taxableSavingsPercent: 10 });
  });

  it('treats a percent split\'s blank remainder as stated pre-tax, like Your numbers', () => {
    const resolution = resolveAccountMix({ stated: { rothPercent: 20 } });
    expect(resolution.shares).toEqual({ taxable: 0, pretax: 0.8, roth: 0.2 });
    expect(resolution.assumedPretaxShare).toBe(0);
    expect(savableAccountSplit(resolution)).toEqual({ rothSavingsPercent: 20, taxableSavingsPercent: 0 });
  });

  it('fills an incomplete stated dollar split from Your numbers instead of assuming the rest is pre-tax', () => {
    const figures: StatedFigures = { rothSavingsPercent: saved(20), taxableSavingsPercent: saved(30) };
    const resolution = resolveAccountMix({
      stated: { rothAmount: 100_000 },
      total: 500_000,
      statedFigures: figures,
    });
    expect(resolution.origin).toBe('stated');
    expect(resolution.assumedPretaxShare).toBe(0);
    // $100k Roth placed; the other $400k follows the saved 30/50/20 split.
    expect(resolution.shares.roth).toBeCloseTo(0.2 + 0.8 * 0.2);
    expect(resolution.shares.taxable).toBeCloseTo(0.8 * 0.3);
    expect(resolution.shares.pretax).toBeCloseTo(0.8 * 0.5);
  });

  it('falls back to Your numbers, then to all pre-tax', () => {
    const figures: StatedFigures = { rothSavingsPercent: saved(30) };
    const fromSaved = resolveAccountMix({ statedFigures: figures });
    expect(fromSaved).toMatchObject({ origin: 'saved', shares: { taxable: 0, pretax: 0.7, roth: 0.3 }, assumedPretaxShare: 0 });
    expect(resolveAccountMix({})).toMatchObject({ origin: 'assumed', shares: { taxable: 0, pretax: 1, roth: 0 }, assumedPretaxShare: 1 });
  });
});

describe('filing and state', () => {
  it('files jointly only when married', () => {
    expect(filingFor(null).filing).toBe('single');
    expect(filingFor({ married: { value: true, origin: 'stated' } }).filing).toBe('joint');
    expect(filingFor({ married: { value: false, origin: 'stated' } })).toMatchObject({ filing: 'separate_singles', origin: 'not_married' });
    expect(filingFor({})).toMatchObject({ filing: 'separate_singles', origin: 'marriage_unknown' });
  });

  it('takes a stated rate, then a saved one, then none in a state without income tax', () => {
    expect(resolveStateTax({ statedPercent: 4.5 })).toEqual({ kind: 'rate', rate: 0.045, origin: 'stated' });
    expect(resolveStateTax({ statedFigures: { stateIncomeTaxPercent: saved(5.75) } })).toMatchObject({ kind: 'rate', rate: 0.0575, origin: 'saved' });
    expect(resolveStateTax({ stateOrProvince: 'TX' })).toEqual({ kind: 'none', state: 'Texas' });
    expect(resolveStateTax({ stateOrProvince: 'washington', country: 'USA' })).toEqual({ kind: 'none', state: 'Washington' });
    expect(resolveStateTax({ stateOrProvince: 'California' })).toEqual({ kind: 'unknown' });
    expect(noIncomeTaxState('Alberta', 'Canada')).toBeUndefined();
    // A rate past any state's is a misreading, and the next source stands.
    expect(resolveStateTax({ statedPercent: 22, stateOrProvince: 'FL' })).toEqual({ kind: 'none', state: 'Florida' });
  });

  it('keeps a state rate to a fraction of a point and the account split to whole percents', () => {
    expect(acceptedFigureValue('stateIncomeTaxPercent', 4.95)).toBe(4.95);
    expect(acceptedFigureValue('stateIncomeTaxPercent', 16)).toBeUndefined();
    expect(acceptedFigureValue('rothSavingsPercent', 12.5)).toBeUndefined();
  });
});

describe('healthcare', () => {
  it('counts nothing separately when spending already includes premiums', () => {
    expect(resolveHealthcare({ stated: { inSpending: true }, preMedicareYears: true })).toEqual({ kind: 'included', origin: 'stated' });
    expect(resolveHealthcare({ statedFigures: { healthcareInSpending: saved('included') }, preMedicareYears: true }))
      .toMatchObject({ kind: 'included', origin: 'saved' });
  });

  it('lets a decision-level coverage statement outrank a saved "spending includes healthcare"', () => {
    expect(resolveHealthcare({
      stated: { coverage: 'cobra', annualPremium: 4_000 },
      statedFigures: { healthcareInSpending: saved('included') },
      preMedicareYears: true,
    })).toMatchObject({
      kind: 'counted',
      healthcare: { coverage: 'cobra', annualPremium: 4_000 },
      coverageOrigin: 'stated',
      premiumOrigin: 'stated',
    });
  });

  it('assumes a marketplace plan on top of spending until told otherwise', () => {
    expect(resolveHealthcare({ preMedicareYears: true })).toEqual({
      kind: 'counted',
      healthcare: { coverage: 'marketplace' },
      inSpendingOrigin: 'default',
      coverageOrigin: 'default',
      preMedicareYears: true,
    });
    expect(resolveHealthcare({
      stated: { coverage: 'employer_retiree', annualPremium: 3_600, inSpending: false },
      preMedicareYears: true,
    })).toMatchObject({
      healthcare: { coverage: 'employer_retiree', annualPremium: 3_600 },
      inSpendingOrigin: 'stated',
      coverageOrigin: 'stated',
      premiumOrigin: 'stated',
    });
  });

  it('knows when anyone reaches withdrawals before Medicare', () => {
    expect(hasPreMedicareYears({ currentAge: 50, withdrawalStartAge: 60 })).toBe(true);
    expect(hasPreMedicareYears({ currentAge: 60, withdrawalStartAge: 67 })).toBe(false);
    // A partner five years younger is 62 when the user starts at 67.
    expect(hasPreMedicareYears({ currentAge: 60, withdrawalStartAge: 67, partnerAge: 55 })).toBe(true);
  });
});

describe('cache matching', () => {
  it('matches a stored run whatever order its keys came back in', () => {
    const current = {
      taxes: { accounts: { taxable: 0.2, pretax: 0.7, roth: 0.1 }, taxableBasisShare: 0.5, filing: 'joint' as const, stateRate: 0.05 },
      healthcare: { coverage: 'marketplace' as const },
    };
    const stored = {
      healthcare: { coverage: 'marketplace' },
      taxes: { stateRate: 0.05, filing: 'joint', taxableBasisShare: 0.5, accounts: { roth: 0.1, pretax: 0.7, taxable: 0.2 } },
    };
    expect(sameTaxAndPremiumInputs(stored, current)).toBe(true);
    expect(sameTaxAndPremiumInputs({ ...stored, healthcare: undefined }, current)).toBe(false);
    expect(sameTaxAndPremiumInputs({}, current)).toBe(false);
  });
});

describe('what an answer says', () => {
  const unknownEverything = {
    taxes: resolveRetirementTaxes({ total: 500_000 }),
    healthcare: resolveHealthcare({ preMedicareYears: true }),
  };

  it('names the rules, the assumed split and the unknown state', () => {
    const text = describeTaxes(unknownEverything.taxes)!;
    expect(text).toBe(
      '2026 federal income tax on each year\'s withdrawals and income, filing single, drawing taxable savings first, ' +
      'then pre-tax, then Roth, with required minimum distributions; all savings counted as pre-tax, the most heavily ' +
      'taxed kind (assumed); no state income tax, since I do not know your state\'s rate'
    );
  });

  it('names the additional tax on early pre-tax draws only where withdrawals start before 59 1/2', () => {
    expect(describeTaxes(unknownEverything.taxes, 50)).toContain(
      'with required minimum distributions, and the 10% additional tax on pre-tax money drawn before 59½'
    );
    expect(describeTaxes(unknownEverything.taxes, 62)).not.toContain('additional tax');
    // An HSA drawn for ordinary spending is taxed like a traditional IRA.
    expect(accountTaxTreatment({ subtype: 'hsa', name: 'Health Savings Account' })).toBe('pretax');
  });

  it('says what coverage it priced and that it was assumed', () => {
    expect(describeHealthcare(unknownEverything.healthcare)).toBe(
      'health premiums on top of your spending (assumed) from the first withdrawal: before 65, an average marketplace ' +
      'plan less the premium tax credit each year\'s income earns (assumed); from 65, Medicare Part B and D ($2,903 a ' +
      'year each); premiums only, not deductibles or Medicare\'s income surcharges'
    );
    expect(describeHealthcare(resolveHealthcare({ stated: { inSpending: false }, preMedicareYears: false }))).toBe(
      'health premiums on top of your spending from the first withdrawal: Medicare Part B and D ($2,903 a year each); ' +
      'premiums only, not deductibles'
    );
  });

  it('reports the first year\'s costs and asks for what it assumed', () => {
    const costs = { federalTax: 4_210.4, stateTax: 0, healthcarePremiums: 2_400, premiumTaxCredit: 14_000 };
    expect(describeFirstYearCosts(costs, unknownEverything)).toBe(
      ' In the first year of withdrawals, at the median of the historical sequences, the plan pays $4,210 of federal ' +
      'income tax and $2,400 of health premiums after a $14,000 premium tax credit, in today\'s dollars, on top of what it spends.'
    );
    expect(describeTaxAndHealthcareAsks(unknownEverything)).toBe(
      ' To make the tax and health figures yours, tell me how much of your savings is in Roth and in taxable accounts, ' +
      'your state income tax rate, what health coverage you will have before Medicare and whether your spending already ' +
      'includes health premiums.'
    );
    const rows = taxAndHealthcareFactRows(unknownEverything, costs);
    expect(rows.find((row) => row.suffix === 'tax_first_year_federal')).toMatchObject({ value: 4_210, result: true });
    expect(rows.find((row) => row.suffix === 'tax_pretax_share')).toMatchObject({ value: 100 });
    expect(rows.some((row) => row.suffix === 'tax_first_year_state')).toBe(false);
  });

  it('offers a form of optional fields for what it assumed, and nothing once all is known', () => {
    const request = taxAndHealthcareInputRequest(unknownEverything, 'retirement', 'Am I on track for retirement?')!;
    expect(request.fields.map((field) => field.id)).toEqual([
      'rothSavingsPercent', 'taxableSavingsPercent', 'stateIncomeTaxPercent', 'preMedicareCoverage', 'healthcareInSpending',
    ]);
    expect(request.fields.every((field) => !field.required)).toBe(true);

    const known = {
      taxes: resolveRetirementTaxes({ stated: { pretaxPercent: 100 }, stateOrProvince: 'FL' }),
      healthcare: resolveHealthcare({ stated: { inSpending: true }, preMedicareYears: true }),
    };
    expect(taxAndHealthcareInputRequest(known, 'retirement', 'Am I on track for retirement?')).toBeNull();
    expect(describeTaxAndHealthcareAsks(known)).toBe('');
  });

  it('offers to save only what the user stated', () => {
    const stated = {
      taxes: resolveRetirementTaxes({ stated: { rothPercent: 25, taxablePercent: 25, pretaxPercent: 50 }, statedStatePercent: 4.4 }),
      healthcare: resolveHealthcare({ stated: { coverage: 'cobra', inSpending: false }, preMedicareYears: true }),
    };
    expect(savableTaxAndHealthcareFigures(stated)).toEqual([
      { key: 'rothSavingsPercent', value: 25 },
      { key: 'taxableSavingsPercent', value: 25 },
      { key: 'stateIncomeTaxPercent', value: 4.4 },
      { key: 'healthcareInSpending', value: 'not_included' },
      { key: 'preMedicareCoverage', value: 'cobra' },
    ]);
    expect(savableTaxAndHealthcareFigures(unknownEverything)).toEqual([]);
  });
});
