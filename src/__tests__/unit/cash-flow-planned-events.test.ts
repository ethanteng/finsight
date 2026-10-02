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
      value: { label: 'Holiday bonus', kind: 'income', amount: 10000.46, startDate: '2026-12-15', recurrence: 'once', endDate: null },
    });
  });

  it.each([
    [{ ...base, label: '' }, 'Give the event a name'],
    [{ ...base, label: 'x'.repeat(81) }, 'Keep the name under 80 characters'],
    [{ ...base, kind: 'transfer' }, 'Choose whether the event is money in or money out'],
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

describe('expandPlannedEvent', () => {
  const event = (overrides: Partial<PlannedCashFlowEvent>): PlannedCashFlowEvent => ({
    id: 'event', label: 'Event', kind: 'expense', amount: 100, startDate: '2026-01-31', recurrence: 'monthly', endDate: null,
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
