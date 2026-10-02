import { addDays, type CalendarDate } from '../../cash-flow/calendar';
import { buildCashFlowLedger, counterpartyKey, legacyCounterpartyKey, type CashFlowEntry } from '../../cash-flow/ledger';
import { detectRecurringStreams, scheduleStream, type RecurringStream } from '../../cash-flow/recurring';
import {
  ACCOUNTS,
  CARD_PAYMENT_CATEGORY,
  INTEREST_CHARGE_CATEGORY,
  householdTransactions,
  tx,
} from './factories/cash-flow.factory';

function entry(date: CalendarDate, amount: number, key = 'payee', flow: CashFlowEntry['flow'] = 'spending'): CashFlowEntry {
  return { id: `${key}-${date}`, accountId: 'checking', date, flow, amount, counterpartyKey: key, label: key, category: 'Test' };
}

function only(streams: RecurringStream[], label: string): RecurringStream {
  const match = streams.filter(stream => stream.label === label);
  expect(match).toHaveLength(1);
  return match[0];
}

describe('buildCashFlowLedger', () => {
  it('keeps cash accounts and cards, and leaves investment and loan accounts out', () => {
    const ledger = buildCashFlowLedger(
      [
        tx('checking', '2026-09-01', 'income', 100, 'Pay'),
        tx('card', '2026-09-02', 'expense', 40, 'Lunch'),
        tx('brokerage', '2026-09-03', 'income', 25, 'Dividend'),
        tx('mortgage', '2026-09-04', 'expense', 1800, 'Mortgage payment received'),
      ],
      ACCOUNTS
    );

    expect(ledger.accounts.map(account => [account.id, account.kind])).toEqual([['checking', 'cash'], ['card', 'credit']]);
    expect(ledger.entries.map(item => [item.accountId, item.flow, item.amount])).toEqual([
      ['checking', 'income', 100],
      ['card', 'spending', 40],
    ]);
  });

  it('treats transfers and card payments as neither income nor spending, but as history coverage', () => {
    const ledger = buildCashFlowLedger(
      [
        tx('checking', '2026-08-20', 'transfer_out', 1500, 'CARD CO AUTOPAY'),
        tx('card', '2026-08-20', 'transfer_out', 1500, 'PAYMENT THANK YOU'),
        tx('checking', '2026-09-01', 'income', 100, 'Pay'),
      ],
      ACCOUNTS
    );

    expect(ledger.entries).toHaveLength(1);
    expect(ledger.coverageStart).toBe('2026-08-20');
    expect(ledger.latestTransactionDate).toBe('2026-09-01');
  });

  it('counts a refund as negative spending', () => {
    const ledger = buildCashFlowLedger([tx('card', '2026-09-02', 'refund', 30, 'Store refund')], ACCOUNTS);
    expect(ledger.entries[0]).toMatchObject({ flow: 'spending', amount: -30 });
  });

  it('reports unclassified and foreign-currency activity instead of guessing', () => {
    const ledger = buildCashFlowLedger(
      [
        { transaction_id: 'mystery', account_id: 'checking', date: '2026-09-02', amount: -20, name: 'Mystery', iso_currency_code: 'USD' },
        tx('card', '2026-09-03', 'expense', 50, 'Hotel', { iso_currency_code: 'EUR' }),
        tx('card', '2026-09-04', 'expense', 10, 'Pending coffee', { pending: true }),
      ],
      ACCOUNTS
    );

    expect(ledger.entries).toHaveLength(0);
    expect(ledger.excluded).toEqual({ unclassified: 1, currencyMismatch: 1 });
  });

  it('labels a payee without its reference numbers or ACH field names', () => {
    const ledger = buildCashFlowLedger(
      [
        tx('checking', '2026-09-01', 'income', 100, 'GUSTO DES:PAYROLL ID:88231 INDN:SMITH'),
        tx('card', '2026-09-02', 'expense', 40, 'SQ *BLUE BOTTLE #1042', { merchant_name: 'Blue Bottle Coffee' }),
        tx('card', '2026-09-03', 'expense', 40, '#4412 9981'),
      ],
      ACCOUNTS
    );
    expect(ledger.entries.map(item => item.label)).toEqual(['GUSTO PAYROLL SMITH', 'Blue Bottle Coffee', 'Unnamed transaction']);
  });

  it('records money moving between accounts by its effect on each account', () => {
    const ledger = buildCashFlowLedger(
      [
        tx('checking', '2026-09-05', 'transfer_out', 500, 'TRANSFER TO SAVINGS'),
        tx('checking', '2026-09-20', 'transfer_out', 1500, 'CARD CO AUTOPAY', { personal_finance_category: CARD_PAYMENT_CATEGORY }),
        tx('card', '2026-09-21', 'transfer_out', -1500, 'PAYMENT THANK YOU', { personal_finance_category: CARD_PAYMENT_CATEGORY }),
      ],
      ACCOUNTS
    );

    expect(ledger.movements.map(movement => [movement.accountId, movement.amount, movement.cardPayment])).toEqual([
      ['checking', -500, false],
      ['checking', -1500, true],
      ['card', 1500, true],
    ]);
    const [, sent, received] = ledger.movements;
    expect(sent.pairedWith).toBe(received.id);
    expect(received.pairedWith).toBe(sent.id);
    expect(ledger.entries).toHaveLength(0);
  });

  it('leaves a card payment unmatched when the amounts or dates do not line up', () => {
    const ledger = buildCashFlowLedger(
      [
        tx('checking', '2026-09-01', 'transfer_out', 400, 'STORE CARD PAYMENT', { personal_finance_category: CARD_PAYMENT_CATEGORY }),
        tx('checking', '2026-09-10', 'transfer_out', 900, 'CARD CO AUTOPAY', { personal_finance_category: CARD_PAYMENT_CATEGORY }),
        tx('card', '2026-09-17', 'transfer_out', -900, 'PAYMENT THANK YOU', { personal_finance_category: CARD_PAYMENT_CATEGORY }),
      ],
      ACCOUNTS
    );
    expect(ledger.movements.every(movement => movement.pairedWith === null)).toBe(true);
  });

  it('flags interest a card charged, and only on cards', () => {
    const ledger = buildCashFlowLedger(
      [
        tx('card', '2026-09-28', 'fee', 62.5, 'INTEREST CHARGE ON PURCHASES', { personal_finance_category: INTEREST_CHARGE_CATEGORY }),
        tx('checking', '2026-09-28', 'fee', 3, 'OVERDRAFT INTEREST', { personal_finance_category: INTEREST_CHARGE_CATEGORY }),
        tx('card', '2026-09-29', 'expense', 40, 'Lunch'),
      ],
      ACCOUNTS
    );
    expect(ledger.entries.map(entry => [entry.accountId, entry.amount, entry.interest ?? false])).toEqual([
      ['card', 62.5, true],
      ['checking', 3, false],
      ['card', 40, false],
    ]);
  });

  it('keys a payee the same way across reference numbers and ACH boilerplate', () => {
    expect(counterpartyKey(null, 'GUSTO DES:PAYROLL ID:88231 INDN:SMITH')).toBe('gusto payroll smith');
    expect(counterpartyKey(null, 'GUSTO DES:PAYROLL ID:99102 INDN:SMITH')).toBe('gusto payroll smith');
    expect(counterpartyKey('Netflix', 'NETFLIX.COM 866-579')).toBe('netflix');
  });

  it('drops reference words whole, so a fresh ID code each time does not make a new payee', () => {
    const navi = (code: string) => counterpartyKey(null, `Navi Nurses DES:PAYROLL ID:${code} INDN:David Teng CO ID:XXXXX12345 PPD`);
    expect(navi('ABC123XYZ')).toBe('navi nurses payroll david teng');
    expect(navi('QRS456TUV')).toBe('navi nurses payroll david teng');
    expect(counterpartyKey(null, 'AMZN MKTP US*AB12C34D5')).toBe(counterpartyKey(null, 'AMZN MKTP US*ZZ98Y76X5'));
    // A name made only of such words keeps its letters, so it still has a key.
    expect(counterpartyKey('1Password', null)).toBe('password');
    expect(counterpartyKey(null, '7-ELEVEN #1234')).toBe('eleven');
  });

  it('remembers the key a payee had before, only where it differs', () => {
    expect(legacyCounterpartyKey(null, 'Navi Nurses DES:PAYROLL ID:ABC123XYZ INDN:David Teng')).toBe('navi nurses payroll abc xyz david teng');
    expect(legacyCounterpartyKey(null, 'GUSTO DES:PAYROLL ID:88231 INDN:SMITH')).toBeUndefined();
    expect(legacyCounterpartyKey('Netflix', null)).toBeUndefined();
  });

  it('finds one regular paycheck when each deposit carries a fresh reference code', () => {
    const codes = ['ABC123XYZ', 'QRS456TUV', 'LMN789OPQ', 'DEF246GHI', 'JKL135MNO', 'PQR864STU', 'VWX975YZA'];
    const paychecks = codes.map((code, index) => tx('checking', addDays('2026-07-03', index * 14), 'income', 3104.22,
      `Navi Nurses DES:PAYROLL ID:${code} INDN:David Teng CO ID:XXXXX12345 PPD`));
    const streams = detectRecurringStreams(buildCashFlowLedger(paychecks, ACCOUNTS).entries, '2026-09-30');
    expect(streams).toEqual([
      expect.objectContaining({ label: 'Navi Nurses PAYROLL David Teng', flow: 'income', cadence: 'biweekly', occurrences: 7, status: 'active' }),
    ]);
  });
});

describe('detectRecurringStreams', () => {
  const ledger = buildCashFlowLedger(householdTransactions('2026-06-03', '2026-09-30'), ACCOUNTS);
  const streams = detectRecurringStreams(ledger.entries, '2026-09-30');

  it('recognizes a biweekly paycheck', () => {
    expect(only(streams, 'GUSTO PAYROLL SMITH')).toMatchObject({
      flow: 'income', cadence: 'biweekly', amount: 2500, status: 'active',
    });
  });

  it('recognizes monthly rent and a monthly subscription with their days of the month', () => {
    expect(only(streams, 'Oak Street Apartments')).toMatchObject({ cadence: 'monthly', amount: 2000, anchorDays: [1] });
    expect(only(streams, 'Netflix')).toMatchObject({ cadence: 'monthly', amount: 15.49, anchorDays: [12] });
  });

  it('does not schedule irregular shopping or a one-time purchase', () => {
    const labels = streams.map(stream => stream.label);
    expect(labels).not.toContain('United Airlines');
    expect(labels).not.toContain('Safeway');
  });

  it('tells a semimonthly paycheck from a biweekly one by its days of the month', () => {
    const dates = ['2026-06-15', '2026-06-30', '2026-07-15', '2026-07-31', '2026-08-14', '2026-08-31', '2026-09-15', '2026-09-30'];
    const [stream] = detectRecurringStreams(dates.map(date => entry(date, 3000, 'acme payroll', 'income')), '2026-09-30');
    expect(stream).toMatchObject({ cadence: 'semimonthly', anchorDays: [15, 31] });
  });

  it('accepts two occurrences of an identical charge but not two different ones', () => {
    expect(detectRecurringStreams([entry('2026-08-05', 9.99), entry('2026-09-05', 9.99)], '2026-09-30')).toHaveLength(1);
    expect(detectRecurringStreams([entry('2026-08-05', 40), entry('2026-09-05', 95)], '2026-09-30')).toHaveLength(0);
  });

  it('marks a stream that stopped as lapsed', () => {
    const dates = ['2026-03-05', '2026-04-05', '2026-05-05', '2026-06-05'];
    const [stream] = detectRecurringStreams(dates.map(date => entry(date, 12)), '2026-09-30');
    expect(stream.status).toBe('lapsed');
  });

  it('merges a split deposit on one day into a single occurrence', () => {
    const dates = ['2026-07-03', '2026-07-17', '2026-07-31', '2026-08-14'];
    const entries = dates.flatMap(date => [
      { ...entry(date, 2000, 'acme payroll', 'income'), id: `${date}-a` },
      { ...entry(date, 500, 'acme payroll', 'income'), id: `${date}-b` },
    ]);
    const [stream] = detectRecurringStreams(entries, '2026-08-20');
    expect(stream).toMatchObject({ cadence: 'biweekly', amount: 2500, occurrences: 4 });
  });
});

describe('scheduleStream', () => {
  const stream = (overrides: Partial<RecurringStream>): RecurringStream => ({
    id: 'spending:test', counterpartyKey: 'test', label: 'Test', flow: 'spending', cadence: 'monthly', amount: 100, occurrences: 3,
    firstDate: '2026-07-01', lastDate: '2026-09-01', anchorDays: [1], category: 'Test', status: 'active', entryIds: [],
    accountId: 'checking',
    ...overrides,
  });

  it('projects a monthly charge on its anchor day', () => {
    expect(scheduleStream(stream({}), '2026-10-01', '2027-01-01').map(item => item.date))
      .toEqual(['2026-10-01', '2026-11-01', '2026-12-01']);
  });

  it('does not double-count a payment made a day early for the next cycle', () => {
    const early = stream({ lastDate: '2026-09-30' });
    expect(scheduleStream(early, '2026-10-02', '2027-01-01').map(item => item.date))
      .toEqual(['2026-11-01', '2026-12-01']);
  });

  it('keeps a month-end anchor on the last day of shorter months', () => {
    const monthEnd = stream({ anchorDays: [31], lastDate: '2026-12-31' });
    expect(scheduleStream(monthEnd, '2027-01-01', '2027-04-01').map(item => item.date))
      .toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });

  it('expects a payment that is slightly late on the first forecast day', () => {
    const biweekly = stream({ cadence: 'biweekly', anchorDays: [], lastDate: '2026-09-15' });
    // Due Sep 29; the forecast starts Oct 1, inside the four-day grace.
    expect(scheduleStream(biweekly, '2026-10-01', '2026-10-31').map(item => item.date))
      .toEqual(['2026-10-01', '2026-10-13', '2026-10-27']);
  });

  it('treats a payment overdue past its grace as missed', () => {
    const biweekly = stream({ cadence: 'biweekly', anchorDays: [], lastDate: '2026-09-01' });
    // Due Sep 15 (missed) and Sep 29 (two days late: still expected).
    expect(scheduleStream(biweekly, '2026-10-01', '2026-10-20').map(item => item.date))
      .toEqual(['2026-10-01', '2026-10-13']);
  });

  it('projects nothing for a lapsed stream', () => {
    expect(scheduleStream(stream({ status: 'lapsed' }), '2026-10-01', '2027-01-01')).toEqual([]);
  });

  it('projects semimonthly paydays on both anchors', () => {
    const semimonthly = stream({ cadence: 'semimonthly', anchorDays: [15, 31], lastDate: '2026-09-30' });
    expect(scheduleStream(semimonthly, '2026-10-01', '2026-12-01').map(item => item.date))
      .toEqual(['2026-10-15', '2026-10-31', '2026-11-15', '2026-11-30']);
  });

  it('projects a quarterly charge three months on', () => {
    const quarterly = stream({ cadence: 'quarterly', anchorDays: [10], lastDate: '2026-08-10' });
    expect(scheduleStream(quarterly, '2026-10-01', '2027-05-01').map(item => item.date))
      .toEqual(['2026-11-10', '2027-02-10']);
  });
});
