import { describe, expect, it } from '@jest/globals';
import {
  accountValuesForHistory,
  buildAccountValueHistory,
  type AccountValueHistoryInput,
} from '../../services/account-value-history';

const timeZone = 'America/Los_Angeles';
const computedAt = new Date('2026-11-20T18:00:00.000Z');

const checking = {
  account_id: 'chk-1',
  name: 'Checking',
  type: 'depository',
  subtype: 'checking',
  source: 'plaid',
  balance: { current: 1000, available: 990, iso_currency_code: 'USD' },
  lastSyncedAt: '2026-11-20T15:00:00.000Z',
};

const card = {
  account_id: 'card-1',
  name: 'Card',
  type: 'credit',
  subtype: 'credit card',
  source: 'plaid',
  balance: { current: 500, iso_currency_code: 'USD' },
  lastSyncedAt: '2026-11-20T15:00:00.000Z',
};

const brokerage = {
  account_id: 'snaptrade-brk-1',
  name: 'Brokerage',
  type: 'investment',
  subtype: 'brokerage',
  source: 'snaptrade',
  balance: { current: 21000 },
  lastSyncedAt: '2026-11-20T14:00:00.000Z',
};

function input(overrides: Partial<AccountValueHistoryInput>): AccountValueHistoryInput {
  return {
    account: checking,
    displayBalances: {},
    transactions: [],
    recorded: [],
    reportingCurrency: 'USD',
    timeZone,
    computedAt,
    ...overrides,
  };
}

describe('buildAccountValueHistory: cash accounts and cards', () => {
  it('works a cash balance back through posted transactions from the reported balance', () => {
    const history = buildAccountValueHistory(input({
      transactions: [
        { transaction_id: 't1', account_id: 'chk-1', date: '2026-11-18', amount: 50 },
        { transaction_id: 't2', account_id: 'chk-1', date: '2026-11-19', amount: -200 },
        // Pending is not in the reported balance, so it is not walked back out of it.
        { transaction_id: 't3', account_id: 'chk-1', date: '2026-11-20', amount: 30, pending: true },
        // The same transaction twice counts once.
        { transaction_id: 't2', account_id: 'chk-1', date: '2026-11-19', amount: -200 },
        // Another account's transaction moves nothing here.
        { transaction_id: 't4', account_id: 'other', date: '2026-11-19', amount: 999 },
      ],
    }));

    expect(history).toEqual({
      accountId: 'chk-1',
      measure: 'balance',
      method: 'transactions',
      currency: 'USD',
      unconverted: false,
      points: [
        { date: '2026-11-18', value: 800 },
        { date: '2026-11-19', value: 1000 },
        { date: '2026-11-20', value: 1000 },
      ],
    });
  });

  it('reads the provider amount rather than a sign-normalized one', () => {
    const history = buildAccountValueHistory(input({
      transactions: [
        { transaction_id: 't0', account_id: 'chk-1', date: '2026-11-19', amount: 0, source_amount: 0 },
        { transaction_id: 't1', account_id: 'chk-1', date: '2026-11-20', amount: -75, source_amount: 75 },
      ],
    }));
    // Money left on the 20th, so the 19th ended with that much more.
    expect(history.points).toEqual([
      { date: '2026-11-19', value: 1075 },
      { date: '2026-11-20', value: 1000 },
    ]);
  });

  it('works what a card owes back: a charge added to it, a payment took from it', () => {
    const history = buildAccountValueHistory(input({
      account: card,
      transactions: [
        { transaction_id: 'c1', account_id: 'card-1', date: '2026-11-19', amount: 100 },
        { transaction_id: 'c2', account_id: 'card-1', date: '2026-11-20', amount: -300 },
      ],
    }));

    expect(history.measure).toBe('owed');
    expect(history.method).toBe('transactions');
    expect(history.points).toEqual([
      { date: '2026-11-19', value: 800 },
      { date: '2026-11-20', value: 500 },
    ]);
  });

  it('keeps cents exact across many days', () => {
    const transactions = Array.from({ length: 30 }, (_, index) => ({
      transaction_id: `t${index}`,
      account_id: 'chk-1',
      date: `2026-11-${String(index + 1).padStart(2, '0')}`,
      amount: 0.1,
    }));
    const history = buildAccountValueHistory(input({ transactions }));
    // The 29 later days each took 10 cents, so the 1st ended $2.90 higher.
    expect(history.points[0]).toEqual({ date: '2026-11-01', value: 1002.9 });
  });

  it('runs to the latest transaction when the provider observation is older', () => {
    const history = buildAccountValueHistory(input({
      account: { ...checking, lastSyncedAt: '2026-11-10T15:00:00.000Z' },
      transactions: [
        { transaction_id: 't1', account_id: 'chk-1', date: '2026-11-11', amount: 20 },
        { transaction_id: 't2', account_id: 'chk-1', date: '2026-11-12', amount: 20 },
      ],
    }));
    expect(history.points.map(point => point.date)).toEqual(['2026-11-11', '2026-11-12']);
    expect(history.points[history.points.length - 1]).toEqual({ date: '2026-11-12', value: 1000 });
  });

  it('falls back to recorded values when a transaction has no amount', () => {
    const history = buildAccountValueHistory(input({
      transactions: [
        { transaction_id: 't1', account_id: 'chk-1', date: '2026-11-18', amount: 50 },
        // Null is missing, not zero. Number(null) is 0, which would keep the walk.
        { transaction_id: 't2', account_id: 'chk-1', date: '2026-11-19', amount: null },
      ],
    }));
    expect(history.method).toBe('recorded');
    expect(history.points).toEqual([{ date: '2026-11-20', value: 1000 }]);
  });

  it('falls back to recorded values when a transaction is in another currency', () => {
    const history = buildAccountValueHistory(input({
      transactions: [
        { transaction_id: 't1', account_id: 'chk-1', date: '2026-11-18', amount: 50 },
        { transaction_id: 't2', account_id: 'chk-1', date: '2026-11-19', amount: 20, iso_currency_code: 'EUR' },
      ],
    }));
    expect(history.method).toBe('recorded');
    expect(history.points).toEqual([{ date: '2026-11-20', value: 1000 }]);
  });

  it('falls back to recorded values when nothing has posted', () => {
    const history = buildAccountValueHistory(input({}));
    expect(history.method).toBe('recorded');
  });

  it('records a hand-entered cash balance rather than rebuilding it', () => {
    const history = buildAccountValueHistory(input({
      account: { ...checking, source: 'manual' },
      transactions: [
        { transaction_id: 't1', account_id: 'chk-1', date: '2026-11-18', amount: 50 },
        { transaction_id: 't2', account_id: 'chk-1', date: '2026-11-19', amount: 20 },
      ],
    }));
    expect(history.method).toBe('recorded');
  });
});

describe('buildAccountValueHistory: recorded values', () => {
  it('dates each value by when the provider reported it, one per day, ending on the current snapshot', () => {
    const history = buildAccountValueHistory(input({
      account: brokerage,
      displayBalances: { 'snaptrade-brk-1': 21500 },
      recorded: [
        // Written before per-account values were recorded.
        { computedAt: new Date('2026-11-15T12:00:00.000Z'), accountValues: null },
        {
          computedAt: new Date('2026-11-17T12:00:00.000Z'),
          accountValues: { 'snaptrade-brk-1': { value: 20000, observedAt: '2026-11-17T10:00:00.000Z' } },
        },
        // The provider did not refresh: the same observation adds no new day.
        {
          computedAt: new Date('2026-11-18T12:00:00.000Z'),
          accountValues: { 'snaptrade-brk-1': { value: 20000, observedAt: '2026-11-17T10:00:00.000Z' } },
        },
        // Unconfirmed values and other accounts are not plotted.
        {
          computedAt: new Date('2026-11-19T12:00:00.000Z'),
          accountValues: {
            'snaptrade-brk-1': { value: 20800, observedAt: null },
            other: { value: 5, observedAt: '2026-11-19T10:00:00.000Z' },
          },
        },
      ],
    }));

    expect(history).toEqual({
      accountId: 'snaptrade-brk-1',
      measure: 'value',
      method: 'recorded',
      currency: 'USD',
      unconverted: false,
      points: [
        { date: '2026-11-17', value: 20000 },
        { date: '2026-11-20', value: 21500 },
      ],
    });
  });

  it('lets the later computation win a day, and the current snapshot win its own', () => {
    const history = buildAccountValueHistory(input({
      account: brokerage,
      displayBalances: { 'snaptrade-brk-1': 21500 },
      recorded: [
        {
          computedAt: new Date('2026-11-20T16:00:00.000Z'),
          accountValues: { 'snaptrade-brk-1': { value: 21400, observedAt: '2026-11-20T13:00:00.000Z' } },
        },
        {
          computedAt: new Date('2026-11-19T16:00:00.000Z'),
          accountValues: { 'snaptrade-brk-1': { value: 21100, observedAt: '2026-11-19T13:00:00.000Z' } },
        },
        {
          computedAt: new Date('2026-11-19T20:00:00.000Z'),
          accountValues: { 'snaptrade-brk-1': { value: 21200, observedAt: '2026-11-19T19:00:00.000Z' } },
        },
      ],
    }));
    expect(history.points).toEqual([
      { date: '2026-11-19', value: 21200 },
      { date: '2026-11-20', value: 21500 },
    ]);
  });

  it('has no points for an account no provider has confirmed', () => {
    const history = buildAccountValueHistory(input({
      account: { ...brokerage, lastSyncedAt: undefined },
      displayBalances: { 'snaptrade-brk-1': 21500 },
    }));
    expect(history.points).toEqual([]);
  });

  it('charts what a loan owes as a positive amount', () => {
    const history = buildAccountValueHistory(input({
      account: {
        account_id: 'loan-1', type: 'loan', subtype: 'student', source: 'plaid',
        balance: { current: -12000, iso_currency_code: 'USD' }, lastSyncedAt: '2026-11-20T15:00:00.000Z',
      },
      displayBalances: { 'loan-1': 12000 },
    }));
    expect(history.measure).toBe('owed');
    expect(history.points).toEqual([{ date: '2026-11-20', value: 12000 }]);
  });
});

describe('accountValuesForHistory', () => {
  it('records the page figure and when the provider reported it, keeping a cash account signed', () => {
    const values = accountValuesForHistory(
      [
        brokerage,
        { ...checking, balance: { current: -40, iso_currency_code: 'USD' } },
        card,
        { account_id: 'unsynced', type: 'investment', source: 'snaptrade', balance: { current: 10 } },
        brokerage,
      ],
      { 'snaptrade-brk-1': 21500, 'chk-1': 40, 'card-1': 500, unsynced: 10 },
      'USD'
    );

    expect(values).toEqual({
      'snaptrade-brk-1': { value: 21500, observedAt: '2026-11-20T14:00:00.000Z' },
      // The page lists an overdraft as debt; the chart plots it below zero.
      'chk-1': { value: -40, observedAt: '2026-11-20T15:00:00.000Z' },
      'card-1': { value: 500, observedAt: '2026-11-20T15:00:00.000Z' },
      unsynced: { value: 10, observedAt: null },
    });
  });

  it('records nothing without accounts', () => {
    expect(accountValuesForHistory(undefined, undefined, 'USD')).toEqual({});
  });

  it('dates a balance by the fetch that produced it, not an older account sync', () => {
    // A Plaid account read back from the database when the live fetch failed:
    // the balance fetch is in snapshotTimestamp, the last account sync in lastSyncedAt.
    const persisted = {
      ...checking,
      persisted: true,
      snapshotTimestamp: '2026-11-20T15:00:00.000Z',
      lastSyncedAt: '2026-11-02T15:00:00.000Z',
    };
    expect(accountValuesForHistory([persisted], {}, 'USD')['chk-1'])
      .toEqual({ value: 1000, observedAt: '2026-11-20T15:00:00.000Z' });
  });

  it('does not date a SnapTrade value by when Linc read the cache', () => {
    // Without a holdings sync, snapshotTimestamp is only Linc's own fetch time.
    const unsynced = { ...brokerage, snapshotTimestamp: '2026-11-20T18:00:00.000Z', lastSyncedAt: undefined };
    expect(accountValuesForHistory([unsynced], { 'snaptrade-brk-1': 21500 }, 'USD')['snaptrade-brk-1'])
      .toEqual({ value: 21500, observedAt: null });
  });

  it('records no value for a balance Linc does not convert, but keeps a holdings value', () => {
    const values = accountValuesForHistory(
      [
        { ...checking, account_id: 'eur-1', balance: { current: 1000, iso_currency_code: 'EUR' } },
        { ...card, account_id: 'nocode-1', balance: { current: 300 } },
        // Valued from its reporting-currency holdings, whatever its own balance is in.
        { ...brokerage, account_id: 'snaptrade-eur-brk', balance: { current: 900, iso_currency_code: 'EUR' } },
      ],
      { 'eur-1': 1000, 'nocode-1': 300, 'snaptrade-eur-brk': 1200 },
      'USD'
    );
    expect(values['eur-1'].value).toBeNull();
    expect(values['nocode-1'].value).toBeNull();
    expect(values['snaptrade-eur-brk'].value).toBe(1200);
  });
});

describe('buildAccountValueHistory: currency', () => {
  it('charts nothing for a cash account in another currency, and says so', () => {
    const eur = { ...checking, balance: { current: 1000, iso_currency_code: 'EUR' } };
    const history = buildAccountValueHistory(input({
      account: eur,
      transactions: [
        { transaction_id: 't1', account_id: 'chk-1', date: '2026-11-18', amount: 50, iso_currency_code: 'EUR' },
        { transaction_id: 't2', account_id: 'chk-1', date: '2026-11-19', amount: 20, iso_currency_code: 'EUR' },
      ],
      // Even a value recorded before the account's currency changed is not charted as dollars.
      recorded: [{
        computedAt: new Date('2026-11-19T12:00:00.000Z'),
        accountValues: { 'chk-1': { value: 950, observedAt: '2026-11-19T11:00:00.000Z' } },
      }],
    }));
    expect(history).toEqual({
      accountId: 'chk-1',
      measure: 'balance',
      method: 'recorded',
      currency: 'USD',
      points: [],
      unconverted: true,
    });
  });

  it('anchors a rebuilt balance on the fetch that produced it', () => {
    const history = buildAccountValueHistory(input({
      account: { ...checking, snapshotTimestamp: '2026-11-20T15:00:00.000Z', lastSyncedAt: '2026-11-02T15:00:00.000Z' },
      transactions: [
        { transaction_id: 't1', account_id: 'chk-1', date: '2026-11-17', amount: 20 },
        { transaction_id: 't2', account_id: 'chk-1', date: '2026-11-18', amount: 20 },
      ],
    }));
    expect(history.points[history.points.length - 1]).toEqual({ date: '2026-11-20', value: 1000 });
  });
});
