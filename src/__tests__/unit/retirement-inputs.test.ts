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
