import {
  expandPlannedEvent,
  plannedEventNetEffect,
  validatePlannedEventInput,
  type PlannedCashFlowEvent,
} from '../../cash-flow/planned-events';

const base = { label: 'Holiday bonus', kind: 'income', amount: 10000, startDate: '2026-12-15', recurrence: 'once' };

describe('validatePlannedEventInput', () => {
  it('accepts a well-formed one-time event and normalizes it', () => {
    const result = validatePlannedEventInput({ ...base, label: '  Holiday   bonus ', amount: 10000.456, endDate: '2027-01-01' });
    expect(result).toEqual({
      ok: true,
      value: {
        label: 'Holiday bonus', kind: 'income', amount: 10000.46, startDate: '2026-12-15', recurrence: 'once', endDate: null,
        accountId: null, toAccountId: null, paymentMode: null,
      },
    });
  });

  it.each([
    [{ ...base, label: '' }, 'Give the event a name'],
    [{ ...base, label: 'x'.repeat(81) }, 'Keep the name under 80 characters'],
    [{ ...base, kind: 'gift' }, 'Choose whether the event is money in, money out, a transfer or a card payment'],
    [{ ...base, amount: 0 }, 'Enter an amount greater than zero'],
    [{ ...base, amount: '100' }, 'Enter an amount greater than zero'],
    [{ ...base, amount: 2e8 }, 'That amount is too large'],
    [{ ...base, startDate: '2026-02-30' }, 'Enter a valid date'],
    [{ ...base, recurrence: 'daily' }, 'Choose how often it happens'],
    [{ ...base, recurrence: 'monthly', endDate: '2026-12-01' }, 'The end date must be on or after the start date'],
  ])('rejects %j', (input, error) => {
    expect(validatePlannedEventInput(input)).toEqual({ ok: false, error });
  });
});

describe('validatePlannedEventInput for card payments', () => {
  const card = { label: 'Pay off Rewards Card', kind: 'card_payment', accountId: 'card', startDate: '2026-11-01', recurrence: 'once' };

  it('sizes a full payment by the balance, not the event', () => {
    expect(validatePlannedEventInput({ ...card, paymentMode: 'full', amount: 999 })).toEqual({
      ok: true,
      value: {
        label: 'Pay off Rewards Card', kind: 'card_payment', amount: 0, startDate: '2026-11-01', recurrence: 'once', endDate: null,
        accountId: 'card', toAccountId: null, paymentMode: 'full',
      },
    });
  });

  it('keeps the amount of a fixed payment', () => {
    const result = validatePlannedEventInput({ ...card, paymentMode: 'fixed', amount: 500, recurrence: 'monthly', endDate: '2027-06-01' });
    expect(result).toMatchObject({ ok: true, value: { amount: 500, recurrence: 'monthly', endDate: '2027-06-01', paymentMode: 'fixed' } });
  });

  it.each([
    [{ ...card, paymentMode: 'full', accountId: '' }, 'Choose a credit card to pay'],
    [{ ...card, paymentMode: 'half' }, 'Choose whether to pay the card in full or a set amount'],
    [{ ...card, paymentMode: 'fixed' }, 'Enter an amount greater than zero'],
    [{ ...card, paymentMode: 'full', recurrence: 'weekly' }, 'A card payment happens once or every month'],
  ])('rejects %j', (input, error) => {
    expect(validatePlannedEventInput(input)).toEqual({ ok: false, error });
  });

  it('keeps the account income or an expense names, and never a payment mode', () => {
    // Which kind of account it is is checked against the user's own accounts when it is saved.
    const result = validatePlannedEventInput({ ...base, accountId: ' checking ', paymentMode: 'full' });
    expect(result).toMatchObject({ ok: true, value: { accountId: 'checking', paymentMode: null } });
    expect(validatePlannedEventInput({ ...base, accountId: null })).toMatchObject({ ok: true, value: { accountId: null } });
    expect(validatePlannedEventInput({ ...base, accountId: '' })).toMatchObject({ ok: true, value: { accountId: null } });
    expect(validatePlannedEventInput({ ...base, accountId: 'x'.repeat(201) }).ok).toBe(false);
    expect(validatePlannedEventInput({ ...base, accountId: 42 }).ok).toBe(false);
  });

  it('gives a card payment no effect on savings', () => {
    expect(plannedEventNetEffect({ kind: 'card_payment', amount: 500 })).toBe(0);
  });
});

describe('validatePlannedEventInput for transfers', () => {
  const transfer = {
    label: 'Move to savings', kind: 'transfer', amount: 500, accountId: 'checking', toAccountId: 'savings',
    startDate: '2026-11-01', recurrence: 'monthly',
  };

  it('keeps both accounts and any cadence, and never a payment mode', () => {
    expect(validatePlannedEventInput({ ...transfer, accountId: ' checking ', paymentMode: 'full' })).toEqual({
      ok: true,
      value: {
        label: 'Move to savings', kind: 'transfer', amount: 500, startDate: '2026-11-01', recurrence: 'monthly', endDate: null,
        accountId: 'checking', toAccountId: 'savings', paymentMode: null,
      },
    });
    expect(validatePlannedEventInput({ ...transfer, recurrence: 'biweekly' }).ok).toBe(true);
  });

  it.each([
    [{ ...transfer, accountId: '' }, 'Choose the account the money leaves'],
    [{ ...transfer, accountId: null }, 'Choose the account the money leaves'],
    [{ ...transfer, toAccountId: undefined }, 'Choose the account the money goes to'],
    [{ ...transfer, toAccountId: 'x'.repeat(201) }, 'Choose the account the money goes to'],
    [{ ...transfer, toAccountId: 'checking' }, 'Choose two different accounts'],
    [{ ...transfer, amount: 0 }, 'Enter an amount greater than zero'],
  ])('rejects %j', (input, error) => {
    expect(validatePlannedEventInput(input)).toEqual({ ok: false, error });
  });

  it('drops a destination from every other kind', () => {
    expect(validatePlannedEventInput({ ...base, toAccountId: 'savings' })).toMatchObject({ ok: true, value: { toAccountId: null } });
  });

  it('gives a transfer no effect on savings', () => {
    expect(plannedEventNetEffect({ kind: 'transfer', amount: 500 })).toBe(0);
  });
});

describe('expandPlannedEvent', () => {
  const event = (overrides: Partial<PlannedCashFlowEvent>): PlannedCashFlowEvent => ({
    id: 'event', label: 'Event', kind: 'expense', amount: 100, startDate: '2026-01-31', recurrence: 'monthly', endDate: null,
    accountId: null, toAccountId: null, paymentMode: null,
    ...overrides,
  });

  it('keeps a month-end event on the last day of shorter months', () => {
    expect(expandPlannedEvent(event({}), '2026-01-01', '2026-05-01'))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('stops at the end date and starts at the window', () => {
    expect(expandPlannedEvent(event({ endDate: '2026-03-31' }), '2026-02-15', '2026-12-01'))
      .toEqual(['2026-02-28', '2026-03-31']);
  });

  it('expands one-time, biweekly and annual events', () => {
    expect(expandPlannedEvent(event({ recurrence: 'once', startDate: '2026-06-01' }), '2026-01-01', '2027-01-01')).toEqual(['2026-06-01']);
    expect(expandPlannedEvent(event({ recurrence: 'once', startDate: '2026-06-01' }), '2026-07-01', '2027-01-01')).toEqual([]);
    expect(expandPlannedEvent(event({ recurrence: 'biweekly', startDate: '2026-10-02' }), '2026-10-01', '2026-11-01'))
      .toEqual(['2026-10-02', '2026-10-16', '2026-10-30']);
    expect(expandPlannedEvent(event({ recurrence: 'annually', startDate: '2024-02-29' }), '2025-01-01', '2029-01-01'))
      .toEqual(['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
  });

  it('signs the effect by kind', () => {
    expect(plannedEventNetEffect({ kind: 'income', amount: 50 })).toBe(50);
    expect(plannedEventNetEffect({ kind: 'expense', amount: 50 })).toBe(-50);
  });
});
