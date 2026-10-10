import { describe, expect, it } from '@jest/globals';
import { linkedContributions, resolveRetirementContribution } from '../../openai/retirement-contributions';

const ACCOUNTS = new Set(['plaid-401k', 'snaptrade-ira']);
const AS_OF = new Date('2026-10-10T00:00:00.000Z');

/** A Plaid 401(k) contribution: Plaid signs cash in as negative. */
const plaid = (date: string, amount: number, subtype = 'contribution', type = 'cash') => ({
  account_id: 'plaid-401k',
  date,
  amount: -amount,
  type,
  subtype,
  isInvestmentTransaction: true,
});

/** Twelve monthly contributions ending last month. */
const monthly = (amount: number) => Array.from({ length: 12 }, (_, index) => {
  const month = new Date(Date.UTC(2025, 9 + index, 15)).toISOString().slice(0, 10);
  return plaid(month, amount);
});

describe('contributions from linked investment accounts', () => {
  it('takes a typical month times twelve over the last twelve complete months', () => {
    const linked = linkedContributions(monthly(1_500), { accountIds: ACCOUNTS, asOf: AS_OF })!;
    expect(linked).toMatchObject({
      annualAmount: 18_000,
      typicalMonthlyNet: 1_500,
      months: 12,
      firstMonth: '2025-10',
      lastMonth: '2026-09',
      contributed: 18_000,
      withdrawn: 0,
    });
  });

  it('does not take a one-off transfer in as yearly saving, or a one-off withdrawal as stopping', () => {
    const activity = [
      ...monthly(1_000),
      plaid('2026-03-02', 100_000, 'deposit'),
      plaid('2026-05-02', 40_000, 'withdrawal'),
    ];
    const linked = linkedContributions(activity, { accountIds: ACCOUNTS, asOf: AS_OF })!;
    expect(linked.annualAmount).toBe(12_000);
    expect(linked).toMatchObject({ contributed: 112_000, withdrawn: 40_000 });
  });

  it('nets regular withdrawals, never below zero', () => {
    const activity = Array.from({ length: 12 }, (_, index) => {
      const month = new Date(Date.UTC(2025, 9 + index, 15)).toISOString().slice(0, 10);
      return plaid(month, 2_000, 'withdrawal');
    });
    const linked = linkedContributions(activity, { accountIds: ACCOUNTS, asOf: AS_OF })!;
    expect(linked).toMatchObject({ annualAmount: 0, typicalMonthlyNet: -2_000, withdrawn: 24_000 });
  });

  it('reads SnapTrade by its own activity type and ignores transfers, trades and other accounts', () => {
    const activity = [
      ...Array.from({ length: 6 }, (_, index) => ({
        account_id: 'snaptrade-ira',
        date: new Date(Date.UTC(2026, 3 + index, 3)).toISOString().slice(0, 10),
        amount: 500,
        type: 'contribution',
        source: 'snaptrade',
        snapTradeData: { type: 'CONTRIBUTION' },
      })),
      { account_id: 'snaptrade-ira', date: '2026-05-04', amount: 50_000, type: 'transfer', source: 'snaptrade', snapTradeData: { type: 'TRANSFER' } },
      plaid('2026-06-10', 9_000, 'buy', 'buy'),
      { ...plaid('2026-06-10', 9_000), account_id: 'someone-elses' },
    ];
    const linked = linkedContributions(activity, { accountIds: ACCOUNTS, asOf: AS_OF })!;
    // Activity starts in April: six complete months, each with $500.
    expect(linked).toMatchObject({ months: 6, firstMonth: '2026-04', lastMonth: '2026-09', annualAmount: 6_000 });
  });

  it('counts a buy Plaid marks as a contribution', () => {
    const activity = monthly(800).map((row) => ({ ...row, type: 'buy' }));
    expect(linkedContributions(activity, { accountIds: ACCOUNTS, asOf: AS_OF })?.annualAmount).toBe(9_600);
  });

  it('says nothing from silence, too little history, or the month in progress', () => {
    // Trades and dividends only: no evidence either way.
    expect(linkedContributions([plaid('2026-05-01', 300, 'dividend', 'cash')], { accountIds: ACCOUNTS, asOf: AS_OF })).toBeNull();
    // Two complete months of history.
    expect(linkedContributions(
      [plaid('2026-08-05', 1_000), plaid('2026-09-05', 1_000), plaid('2026-10-05', 1_000)],
      { accountIds: ACCOUNTS, asOf: AS_OF }
    )).toBeNull();
    expect(linkedContributions([], { accountIds: ACCOUNTS, asOf: AS_OF })).toBeNull();
  });

  it('counts the months with nothing in them since the history began', () => {
    // One contribution in a year of history: the typical month is zero.
    const activity = [plaid('2025-10-03', 300, 'dividend'), plaid('2026-02-10', 7_000)];
    expect(linkedContributions(activity, { accountIds: ACCOUNTS, asOf: AS_OF })).toMatchObject({
      annualAmount: 0,
      months: 12,
      contributed: 7_000,
    });
  });
});

describe('which contribution the projection runs', () => {
  const linked = linkedContributions(monthly(1_500), { accountIds: ACCOUNTS, asOf: AS_OF });
  const saved = { annualContribution: { value: 20_000, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' as const } };

  it('takes what the user said, then Your numbers, then linked accounts, then none', () => {
    expect(resolveRetirementContribution({ stated: 0, statedFigures: saved, linked }))
      .toEqual({ annualAmount: 0, origin: { origin: 'stated' } });
    expect(resolveRetirementContribution({ statedFigures: saved, linked }))
      .toEqual({ annualAmount: 20_000, origin: { origin: 'saved', savedAt: '2026-09-14T10:00:00.000Z' } });
    expect(resolveRetirementContribution({ linked }))
      .toEqual({ annualAmount: 18_000, origin: { origin: 'linked', linked } });
    expect(resolveRetirementContribution({ linked: null }))
      .toEqual({ annualAmount: 0, origin: { origin: 'none' } });
  });
});
