import {
  persistableAssumptions,
  resolveRetirementInputs,
  retirementPortfolioFingerprint,
  sameAssumptions,
  withoutStoredAssumptions,
} from '../../openai/retirement-inputs';
import { describeRetirementAssumptions } from '../../openai/retirement-assumptions';

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

describe('resolveRetirementInputs with assumptions allowed', () => {
  const assume = (currentAnnualSpending: number | null = null) => ({ assumeWhenMissing: { currentAnnualSpending } });

  it('assumes the conventional age and current spending rather than stopping to ask', () => {
    const resolved = resolveRetirementInputs({
      questionParams: { hasRetirementIntent: true, currentAge: 45 },
      profileAge: null,
      profileRetirementAge: null,
      ...assume(66_000),
    });

    expect(resolved).toMatchObject({
      currentAge: 45,
      retirementAge: 65,
      withdrawalStartAge: 65,
      annualWithdrawalAmount: 66_000,
      missingParams: [],
      assumed: { retirementAge: 'convention', annualWithdrawalAmount: 'current_spending' },
    });
  });

  it('models retiring now for someone already past the conventional age', () => {
    const resolved = resolveRetirementInputs({
      questionParams: { hasRetirementIntent: true, currentAge: 70, annualWithdrawalAmount: 50_000 },
      profileAge: null,
      profileRetirementAge: null,
      ...assume(),
    });
    expect(resolved.retirementAge).toBe(70);
  });

  it('prefers the figure the user gave before over what they spend now', () => {
    const resolved = resolveRetirementInputs({
      questionParams: { hasRetirementIntent: true },
      profileAge: null,
      profileRetirementAge: null,
      storedInput: { currentAge: 50, retirementAge: 67, annualWithdrawalAmount: 80_000, withdrawalStartAge: 67 },
      ...assume(66_000),
    });

    expect(resolved).toMatchObject({
      annualWithdrawalAmount: 80_000,
      assumed: { annualWithdrawalAmount: 'earlier' },
      confirmationRequiredParams: [],
    });
  });

  it('never assumes an age, and never invents spending with nothing to read it from', () => {
    const resolved = resolveRetirementInputs({
      questionParams: { hasRetirementIntent: true },
      profileAge: null,
      profileRetirementAge: null,
      ...assume(null),
    });

    expect(resolved.missingParams).toEqual(['currentAge', 'retirementAge', 'annualWithdrawalAmount', 'withdrawalStartAge']);
    expect(resolved.assumed).toEqual({});
  });

  it('remembers only real assumptions, so the user\'s earlier figure is never stripped', () => {
    expect(persistableAssumptions({ retirementAge: 'convention', annualWithdrawalAmount: 'earlier' }))
      .toEqual({ retirementAge: 'convention' });
    expect(sameAssumptions(
      { retirementAge: 'convention', annualWithdrawalAmount: 'current_spending' },
      { annualWithdrawalAmount: 'current_spending', retirementAge: 'convention' }
    )).toBe(true);
    expect(sameAssumptions({}, { retirementAge: 'convention' })).toBe(false);
  });

  it('forgets an assumed age, and the withdrawal age that followed it, but not one the user named', () => {
    const stored = { currentAge: 45, retirementAge: 65, annualWithdrawalAmount: 66_000, withdrawalStartAge: 65 };
    expect(withoutStoredAssumptions(stored, { retirementAge: 'convention', annualWithdrawalAmount: 'current_spending' }))
      .toEqual({ currentAge: 45 });
    // "I would start withdrawing at 70", with no retirement age named.
    expect(withoutStoredAssumptions({ ...stored, withdrawalStartAge: 70 }, { retirementAge: 'convention' }))
      .toEqual({ currentAge: 45, annualWithdrawalAmount: 66_000, withdrawalStartAge: 70 });
    expect(withoutStoredAssumptions(stored, {})).toEqual(stored);
  });

  it('says where each assumed figure came from in the answer', () => {
    const sentence = describeRetirementAssumptions({
      retirementAnalysis: {
        _storedInputParams: { currentAge: 45, retirementAge: 65, annualWithdrawalAmount: 66_000, withdrawalStartAge: 65 },
        _assumedInputs: { retirementAge: 'convention', annualWithdrawalAmount: 'current_spending' },
      },
    } as any);

    expect(sentence).toContain('spending $66,000 a year, which is what you spend now (I assumed retirement costs the same)');
    expect(sentence).toContain('retiring at 65, a conventional age I assumed because you did not name one');
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

  it("changes when the custodian's cash-equivalent flag changes", () => {
    // Classification reads this flag, so a feed that flips it changes the
    // modeled portfolio. Left out of the signature, a cached analysis would
    // outlive the change that invalidated it.
    const flagged = securities.map(security =>
      security.security_id === 'a' ? { ...security, is_cash_equivalent: true } : security
    );

    expect(retirementPortfolioFingerprint(holdings, flagged)).not.toBe(
      retirementPortfolioFingerprint(holdings, securities)
    );
  });

  it('treats an absent flag and an explicit false as the same portfolio', () => {
    // Neither asserts anything, so neither may force a recomputation.
    const explicitlyFalse = securities.map(security => ({
      ...security,
      is_cash_equivalent: false,
    }));

    expect(retirementPortfolioFingerprint(holdings, explicitlyFalse)).toBe(
      retirementPortfolioFingerprint(holdings, securities)
    );
  });

  it('does not recompute when a feed only changes CUSIP casing', () => {
    // The provider normalizes before resolving, so the two spellings reach the
    // same auction record. Treating them as different portfolios would discard
    // a cached analysis for no change in what gets modeled.
    const upper = securities.map(security => ({ ...security, cusip: '91282CRE3' }));
    const lower = securities.map(security => ({ ...security, cusip: ' 91282cre3 ' }));

    expect(retirementPortfolioFingerprint(holdings, upper)).toBe(
      retirementPortfolioFingerprint(holdings, lower)
    );
  });

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

describe('describeMissingRetirementInputs', () => {
  const { describeMissingRetirementInputs } = require('../../openai/retirement-inputs');

  it('asks for exactly what is missing, in plain language', () => {
    expect(describeMissingRetirementInputs({
      missingParams: ['annualWithdrawalAmount'],
      detectedParams: {},
    })).toBe(
      'To run your retirement projection I need roughly how much you expect to ' +
      'spend per year once retired, in today\'s dollars. Reply with that and I will work it into the next answer.'
    );
  });

  it('lists several missing inputs', () => {
    const ask = describeMissingRetirementInputs({
      missingParams: ['retirementAge', 'annualWithdrawalAmount'],
      detectedParams: {},
    });
    expect(ask).toContain('the age you plan to retire and roughly how much');
    expect(ask).toContain('Reply with those');
  });

  it('asks to confirm a remembered amount rather than asking again', () => {
    expect(describeMissingRetirementInputs({
      missingParams: ['annualWithdrawalAmount'],
      detectedParams: { annualWithdrawalAmount: 118_000 },
      confirmationRequiredParams: ['annualWithdrawalAmount'],
    })).toBe(
      'To run the retirement projection I need to confirm one thing: are you still planning to spend ' +
      'about $118,000 a year in retirement? Tell me either way and I will include the analysis.'
    );
  });

  it('says nothing when there is nothing the user can supply', () => {
    expect(describeMissingRetirementInputs(undefined)).toBeNull();
    expect(describeMissingRetirementInputs({
      missingParams: [],
      detectedParams: {},
      unavailableReason: 'No linked investment holdings are available.',
    })).toBeNull();
  });
});
