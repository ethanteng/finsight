import { describe, expect, it } from '@jest/globals';
import {
  accountsWithErrors,
  linkedContributions,
  resolveRetirementContribution,
} from '../../openai/retirement-contributions';
import { describeRetirementAssumptions } from '../../openai/retirement-assumptions';

const PLAID = new Set(['plaid-401k']);
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
    const linked = linkedContributions(monthly(1_500), { accountIds: PLAID, asOf: AS_OF })!;
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
    const linked = linkedContributions(activity, { accountIds: PLAID, asOf: AS_OF })!;
    expect(linked.annualAmount).toBe(12_000);
    expect(linked).toMatchObject({ contributed: 112_000, withdrawn: 40_000 });
  });

  it('nets regular withdrawals, never below zero', () => {
    const activity = Array.from({ length: 12 }, (_, index) => {
      const month = new Date(Date.UTC(2025, 9 + index, 15)).toISOString().slice(0, 10);
      return plaid(month, 2_000, 'withdrawal');
    });
    const linked = linkedContributions(activity, { accountIds: PLAID, asOf: AS_OF })!;
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
    expect(linkedContributions(activity, { accountIds: PLAID, asOf: AS_OF })?.annualAmount).toBe(9_600);
  });

  it('says nothing from silence, too little history, or the month in progress', () => {
    // Trades and dividends only: no evidence either way.
    expect(linkedContributions([plaid('2026-05-01', 300, 'dividend', 'cash')], { accountIds: PLAID, asOf: AS_OF })).toBeNull();
    // Two complete months of history.
    expect(linkedContributions(
      [plaid('2026-08-05', 1_000), plaid('2026-09-05', 1_000), plaid('2026-10-05', 1_000)],
      { accountIds: PLAID, asOf: AS_OF }
    )).toBeNull();
    expect(linkedContributions([], { accountIds: PLAID, asOf: AS_OF })).toBeNull();
  });

  it('reads the accounts with activity when a holdings account has none, and counts both', () => {
    // SnapTrade can return holdings while one account's activity fetch failed.
    // That silence is left out and counted, not read as saving nothing.
    const onlyPlaid = monthly(1_500);
    expect(linkedContributions(onlyPlaid, { accountIds: ACCOUNTS, asOf: AS_OF })).toMatchObject({
      annualAmount: 18_000,
      accountsRead: 1,
      accountsHeld: 2,
    });
    // One dividend on the other account is enough to show its history loaded.
    expect(linkedContributions(
      [
        ...onlyPlaid,
        {
          account_id: 'snaptrade-ira',
          date: '2026-06-01',
          amount: 10,
          type: 'dividend',
          source: 'snaptrade',
          snapTradeData: { type: 'DIVIDEND' },
        },
      ],
      { accountIds: ACCOUNTS, asOf: AS_OF }
    )).toMatchObject({ annualAmount: 18_000, accountsRead: 2, accountsHeld: 2 });
  });

  it('reads only the accounts whose activity came through, and says how many', () => {
    const ira = (date: string, amount: number) => ({
      account_id: 'snaptrade-ira',
      date,
      amount,
      type: 'contribution',
      source: 'snaptrade',
      snapTradeData: { type: 'CONTRIBUTION' },
    });
    const activity = [...monthly(1_000), ...monthly(1_000).map((row) => ira(row.date, 400))];

    // The IRA's fetch failed this refresh: its rows are not its whole history.
    const failed = accountsWithErrors(
      { errors: [{ sourceId: 'snaptrade:error:snaptrade-ira', message: 'SnapTrade activities incomplete: timeout' }] },
      ACCOUNTS
    );
    expect([...failed]).toEqual(['snaptrade-ira']);
    const partial = linkedContributions(activity, { accountIds: ACCOUNTS, asOf: AS_OF, incompleteAccountIds: failed })!;
    expect(partial).toMatchObject({ annualAmount: 12_000, accountsRead: 1, accountsHeld: 2 });

    // Both came through.
    expect(linkedContributions(activity, { accountIds: ACCOUNTS, asOf: AS_OF })).toMatchObject({
      annualAmount: 16_800,
      accountsRead: 2,
      accountsHeld: 2,
    });

    const line = describeRetirementAssumptions({
      retirementAnalysis: {
        _storedInputParams: { currentAge: 45, withdrawalStartAge: 60, annualContributionAmount: 12_000 },
        _contributionOrigin: { origin: 'linked', linked: partial },
      },
    } as any)!;
    expect(line).toContain(
      'adding $12,000 a year in today\'s dollars until withdrawals begin at 60: what the 1 of your 2 linked investment ' +
      'accounts whose activity came through received in a typical month from October 2025 to September 2026, less ' +
      'withdrawals, times twelve (the others may add more;'
    );
  });

  it('places an error on an account only when it names one, and never an advisory', () => {
    const quality = {
      errors: [
        { sourceId: 'plaid:error:token-abc', message: 'Investment transactions failed' },
        { sourceId: 'snaptrade:advisory:snaptrade-ira', message: 'Connection could not be verified' },
        { sourceId: 'plaid:error:plaid-401k', message: 'Holdings unavailable' },
      ],
    };
    expect([...accountsWithErrors(quality, ACCOUNTS)]).toEqual(['plaid-401k']);
    expect(accountsWithErrors(undefined, ACCOUNTS).size).toBe(0);
  });

  it('counts the months with nothing in them since the history began', () => {
    // One contribution in a year of history: the typical month is zero.
    const activity = [plaid('2025-10-03', 300, 'dividend'), plaid('2026-02-10', 7_000)];
    expect(linkedContributions(activity, { accountIds: PLAID, asOf: AS_OF })).toMatchObject({
      annualAmount: 0,
      months: 12,
      contributed: 7_000,
    });
  });
});

describe('which contribution the projection runs', () => {
  const linked = linkedContributions(monthly(1_500), { accountIds: PLAID, asOf: AS_OF });
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
