import { resolveRetirementInputs, retirementPortfolioFingerprint } from '../../openai/retirement-inputs';

describe('resolveRetirementInputs', () => {
  it('reports missing inputs instead of inventing age and a four-percent withdrawal', () => {
    const resolved = resolveRetirementInputs({
      questionParams: { hasRetirementIntent: true },
      profileAge: null,
      profileRetirementAge: null,
    });

    expect(resolved.currentAge).toBeUndefined();
    expect(resolved.retirementAge).toBeUndefined();
    expect(resolved.annualWithdrawalAmount).toBeUndefined();
    expect(resolved.missingParams).toEqual([
      'currentAge',
      'retirementAge',
      'annualWithdrawalAmount',
      'withdrawalStartAge',
    ]);
  });

  it('derives withdrawal start from an explicitly supplied retirement age', () => {
    const resolved = resolveRetirementInputs({
      questionParams: {
        hasRetirementIntent: true,
        currentAge: 50,
        retirementAge: 67,
        annualWithdrawalAmount: 80_000,
      },
      profileAge: null,
      profileRetirementAge: null,
    });

    expect(resolved).toMatchObject({
      currentAge: 50,
      retirementAge: 67,
      annualWithdrawalAmount: 80_000,
      withdrawalStartAge: 67,
      lifeExpectancy: 95,
      missingParams: [],
    });
  });

  it('reuses persisted explicit assumptions while allowing the question to override one', () => {
    const resolved = resolveRetirementInputs({
      questionParams: { hasRetirementIntent: true, annualWithdrawalAmount: 90_000 },
      profileAge: null,
      profileRetirementAge: null,
      storedInput: {
        currentAge: 50,
        retirementAge: 67,
        annualWithdrawalAmount: 80_000,
        withdrawalStartAge: 67,
        lifeExpectancy: 97,
      },
    });

    expect(resolved).toMatchObject({
      currentAge: 50,
      retirementAge: 67,
      annualWithdrawalAmount: 90_000,
      withdrawalStartAge: 67,
      lifeExpectancy: 97,
      missingParams: [],
    });
  });

  it('requires confirmation before reusing a persisted annual withdrawal amount', () => {
    const resolved = resolveRetirementInputs({
      questionParams: { hasRetirementIntent: true },
      profileAge: null,
      profileRetirementAge: null,
      storedInput: {
        currentAge: 50,
        retirementAge: 67,
        annualWithdrawalAmount: 80_000,
        withdrawalStartAge: 67,
      },
    });

    expect(resolved.annualWithdrawalAmount).toBeUndefined();
    expect(resolved.missingParams).toContain('annualWithdrawalAmount');
    expect(resolved.confirmationRequiredParams).toEqual(['annualWithdrawalAmount']);
  });

  it('reuses a persisted annual withdrawal after explicit confirmation', () => {
    const resolved = resolveRetirementInputs({
      questionParams: { hasRetirementIntent: true },
      profileAge: null,
      profileRetirementAge: null,
      storedInput: {
        currentAge: 50,
        retirementAge: 67,
        annualWithdrawalAmount: 80_000,
        withdrawalStartAge: 67,
      },
      allowStoredAnnualWithdrawal: true,
    });

    expect(resolved.annualWithdrawalAmount).toBe(80_000);
    expect(resolved.missingParams).toEqual([]);
    expect(resolved.confirmationRequiredParams).toEqual([]);
  });
});

describe('retirementPortfolioFingerprint', () => {
  const holdings = [
    { security_id: 'a', account_id: 'one', quantity: 2, institution_value: 200, cost_basis: 150 },
    { security_id: 'b', account_id: 'one', quantity: 1, institution_value: 100, cost_basis: 90 },
  ];
  const securities = [
    { security_id: 'a', ticker_symbol: 'AAA', type: 'equity' },
    { security_id: 'b', ticker_symbol: 'BBB', type: 'bond' },
  ];

  it('is insensitive to row order', () => {
    expect(retirementPortfolioFingerprint(holdings, securities)).toBe(
      retirementPortfolioFingerprint([...holdings].reverse(), [...securities].reverse())
    );
  });

  it('changes when a holding value or allocation changes', () => {
    const changed = holdings.map((holding, index) => index === 0
      ? { ...holding, institution_value: 250 }
      : holding);
    expect(retirementPortfolioFingerprint(changed, securities)).not.toBe(
      retirementPortfolioFingerprint(holdings, securities)
    );
  });
});

describe('retirement age phrasing', () => {
  it('reads the retirement age from the way people actually write it', () => {
    // "retiring by age 62" matched nothing, so a question that stated the
    // retirement age plainly was reported as missing it.
    const { parseRetirementQuestion } = require('../../retirement-analytics/retirement-question-parser');
    for (const [question, expected] of [
      ['my goal of retiring by age 62 or sooner', 62],
      ['can I retire at 65?', 65],
      ['planning to retire by age 60', 60],
      ['what is my retirement age of 67 worth?', 67],
      ['I want to retire around age 58', 58],
    ] as Array<[string, number]>) {
      expect(parseRetirementQuestion(question).retirementAge).toBe(expected);
    }
  });

  it('reads the same phrasing out of the profile', () => {
    const {
      extractAgeFromProfile,
      extractRetirementAgeFromProfile,
    } = require('../../retirement-analytics/profile-age-extractor');
    const profile = 'The user is a 48-year-old individual married to a 50-year-old husband. They plan on retiring by age 62.';

    expect(extractAgeFromProfile(profile)).toBe(48);
    expect(extractRetirementAgeFromProfile(profile)).toBe(62);
  });
});
