import { validateForecastAdjustmentInput, type ForecastAdjustment } from '../../cash-flow/adjustments';
import { addMonths } from '../../cash-flow/calendar';
import {
  actualTotals,
  buildCashFlowModel,
  buildCashFlowReport,
  forecastAdjustmentTarget,
  forecastTotals,
  type CashFlowModelInput,
} from '../../cash-flow/forecast';
import { ACCOUNTS, householdTransactions, tx } from './factories/cash-flow.factory';

const FROM = '2026-06-03';
const THROUGH = '2026-09-30';
const NEXT_12 = ['2026-10-01', addMonths('2026-10-01', 12)] as const;

/** A gym membership paid monthly until June, so it reads as stopped by October. */
const oldGym = ['2026-02-05', '2026-03-05', '2026-04-05', '2026-05-05', '2026-06-05']
  .map(date => tx('checking', date, 'expense', 40, 'Harbor Bay Club', { merchant_name: 'Harbor Bay Club' }));
/** $400 to a brokerage on the 5th of every month. */
const brokerage = ['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05']
  .map(date => tx('checking', date, 'transfer_out', 400, 'VANGUARD BUY TRANSFER'));
const history = [...householdTransactions(FROM, THROUGH), ...oldGym, ...brokerage];

function model(adjustments: ForecastAdjustment[] = [], overrides: Partial<CashFlowModelInput> = {}) {
  return buildCashFlowModel({
    transactions: history,
    accounts: ACCOUNTS,
    plannedEvents: [],
    dataThrough: THROUGH,
    today: '2026-10-01',
    adjustments,
    ...overrides,
  });
}

let sequence = 0;
const adjustment = (overrides: Partial<ForecastAdjustment>): ForecastAdjustment => ({
  id: `adjustment-${++sequence}`, kind: 'exclude_payee', flow: 'spending', key: '', label: 'Item',
  ...overrides,
});

describe('validateForecastAdjustmentInput', () => {
  it('takes a kind, a direction and a key, and nothing else', () => {
    expect(validateForecastAdjustmentInput({ kind: 'exclude_payee', flow: 'spending', key: ' netflix ', label: 'ignored' }))
      .toEqual({ ok: true, value: { kind: 'exclude_payee', flow: 'spending', key: 'netflix' } });
    expect(validateForecastAdjustmentInput({ kind: 'drop_table', flow: 'spending', key: 'x' }).ok).toBe(false);
    expect(validateForecastAdjustmentInput({ kind: 'exclude_payee', flow: 'sideways', key: 'x' }).ok).toBe(false);
    expect(validateForecastAdjustmentInput({ kind: 'exclude_payee', flow: 'income', key: '   ' }).ok).toBe(false);
    expect(validateForecastAdjustmentInput({ kind: 'exclude_payee', flow: 'income', key: 'x'.repeat(201) }).ok).toBe(false);
    expect(validateForecastAdjustmentInput(null).ok).toBe(false);
  });
});

describe('adjusting what the forecast counts', () => {
  it('leaves a regular bill out of the forecast but not out of the history', () => {
    const base = model();
    const adjusted = model([adjustment({ key: 'oak street apartments', label: 'Oak Street Apartments' })]);
    expect(base.streams.some(stream => stream.label === 'Oak Street Apartments')).toBe(true);
    expect(adjusted.streams.some(stream => stream.label === 'Oak Street Apartments')).toBe(false);
    // A year without twelve $2,000 rent payments.
    expect(forecastTotals(base, ...NEXT_12)!.spending - forecastTotals(adjusted, ...NEXT_12)!.spending).toBeCloseTo(24000, 0);
    // Rent was paid; the past says so either way.
    expect(actualTotals(adjusted, '2026-07-01', '2026-10-01')).toEqual(actualTotals(base, '2026-07-01', '2026-10-01'));
  });

  it('takes a payee out of typical spending, and lists what typical spending is made of', () => {
    const base = model();
    const traderJoes = base.typicalPayees.find(payee => payee.label === 'Trader Joes')!;
    expect(traderJoes).toMatchObject({ flow: 'spending', counterpartyKey: 'trader joes' });
    const adjusted = model([adjustment({ key: 'trader joes', label: 'Trader Joes' })]);
    expect(base.typical.dailySpending - adjusted.typical.dailySpending).toBeCloseTo(traderJoes.daily, 6);
    expect(adjusted.typicalPayees.some(payee => payee.label === 'Trader Joes')).toBe(false);

    // Every typical dollar here comes from a named payee, largest first.
    const named = base.typicalPayees.filter(payee => payee.flow === 'spending').reduce((sum, payee) => sum + payee.daily, 0);
    expect(named).toBeCloseTo(base.typical.dailySpending, 6);
    const listed = buildCashFlowReport(base, { granularity: 'month', horizonMonths: 3 }).typicalPayees;
    expect(listed.map(payee => payee.monthlyAmount)).toEqual([...listed.map(payee => payee.monthlyAmount)].sort((a, b) => b - a));
    expect(listed[0]).toEqual(expect.objectContaining({ flow: 'spending', payeeKey: expect.any(String), monthlyAmount: expect.any(Number) }));
  });

  it('counts a one-off in the typical rate when the user says it belongs there', () => {
    const base = model();
    const flight = base.oneOffs.find(entry => entry.label === 'United Airlines')!;
    expect(flight.amount).toBe(2400);
    const adjusted = model([adjustment({ kind: 'include_one_off', key: flight.id, label: 'United Airlines' })]);
    expect(adjusted.oneOffs.some(entry => entry.id === flight.id)).toBe(false);
    expect(adjusted.typical.dailySpending - base.typical.dailySpending).toBeCloseTo(2400 / base.typical.basisDays, 6);
    const report = buildCashFlowReport(adjusted, { granularity: 'month', horizonMonths: 3 });
    expect(report.adjustments).toEqual([expect.objectContaining({ kind: 'include_one_off', date: flight.date, amount: 2400 })]);
  });

  it('keeps projecting a regular item that had stopped, and says the user kept it', () => {
    const base = model();
    const gym = base.streams.find(stream => stream.label === 'Harbor Bay Club')!;
    expect(gym.status).toBe('lapsed');
    expect(base.scheduled.some(item => item.streamId === gym.id)).toBe(false);

    const adjusted = model([adjustment({ kind: 'continue_stream', key: gym.counterpartyKey, label: 'Harbor Bay Club' })]);
    const scheduled = adjusted.scheduled.filter(item => item.streamId === gym.id);
    expect(scheduled.slice(0, 2).map(item => [item.date, item.amount])).toEqual([['2026-10-05', 40], ['2026-11-05', 40]]);
    const listed = buildCashFlowReport(adjusted, { granularity: 'month', horizonMonths: 3 }).recurring.find(item => item.id === gym.id)!;
    expect(listed).toMatchObject({ status: 'active', continuedByUser: true, nextDate: '2026-10-05', payeeKey: 'harbor bay club' });
  });

  it('leaves a transfer out of the cash position', () => {
    const base = model();
    const vanguard = base.transfers.streams.find(stream => stream.label === 'VANGUARD BUY TRANSFER')!;
    expect(vanguard).toBeDefined();
    const adjusted = model([adjustment({ kind: 'exclude_transfer', key: vanguard.counterpartyKey, label: 'VANGUARD BUY TRANSFER' })]);
    expect(adjusted.transfers.streams.some(stream => stream.label === 'VANGUARD BUY TRANSFER')).toBe(false);
    expect(adjusted.transfers.scheduled.some(item => item.streamId === vanguard.id)).toBe(false);
    // Savings never counted it: a transfer is neither income nor spending.
    expect(forecastTotals(adjusted, ...NEXT_12)).toEqual(forecastTotals(base, ...NEXT_12));
  });

  it('lists every one-off in the report, so each can be counted', () => {
    // Twelve large purchases from different stores in one week: each is a one-off,
    // and keeping them in one week leaves the typical week, and so the threshold, alone.
    const spree = Array.from({ length: 12 }, (_, index) =>
      tx('card', `2026-09-0${1 + (index % 7)}`, 'expense', 1500 + index, `Store ${String.fromCharCode(65 + index)}`, {
        merchant_name: `Store ${String.fromCharCode(65 + index)}`,
      }));
    const built = model([], { transactions: [...history, ...spree] });
    const listed = buildCashFlowReport(built, { granularity: 'month', horizonMonths: 3 }).oneOffs;
    expect(listed).toHaveLength(built.oneOffs.length);
    expect(listed.length).toBeGreaterThan(10);
  });

  it('ignores a choice whose item has gone from the data', () => {
    expect(forecastTotals(model([adjustment({ key: 'no such payee' })]), ...NEXT_12)).toEqual(forecastTotals(model(), ...NEXT_12));
  });
});

describe('forecastAdjustmentTarget', () => {
  const built = model();

  it('finds each kind of item in the user’s data, by the name it last had', () => {
    expect(forecastAdjustmentTarget(built, { kind: 'exclude_payee', flow: 'spending', key: 'oak street apartments' }))
      .toEqual({ label: 'Oak Street Apartments' });
    expect(forecastAdjustmentTarget(built, { kind: 'exclude_payee', flow: 'spending', key: 'trader joes' }))
      .toEqual({ label: 'Trader Joes' });
    const flight = built.oneOffs.find(entry => entry.label === 'United Airlines')!;
    expect(forecastAdjustmentTarget(built, { kind: 'include_one_off', flow: 'spending', key: flight.id })).toEqual({ label: 'United Airlines' });
    expect(forecastAdjustmentTarget(built, { kind: 'continue_stream', flow: 'spending', key: 'harbor bay club' })).toEqual({ label: 'Harbor Bay Club' });
    const vanguard = built.transfers.streams.find(stream => stream.label === 'VANGUARD BUY TRANSFER')!;
    expect(forecastAdjustmentTarget(built, { kind: 'exclude_transfer', flow: 'spending', key: vanguard.counterpartyKey }))
      .toEqual({ label: 'VANGUARD BUY TRANSFER' });
  });

  it('finds nothing that is not there, or not what the choice says it is', () => {
    expect(forecastAdjustmentTarget(built, { kind: 'exclude_payee', flow: 'spending', key: 'someone else' })).toBeNull();
    // Rent is spending, not income.
    expect(forecastAdjustmentTarget(built, { kind: 'exclude_payee', flow: 'income', key: 'oak street apartments' })).toBeNull();
    // An active stream has not stopped, so there is nothing to keep.
    expect(forecastAdjustmentTarget(built, { kind: 'continue_stream', flow: 'spending', key: 'oak street apartments' })).toBeNull();
    // A transaction that is not a one-off cannot be counted as one.
    const rent = built.ledger.entries.find(entry => entry.label === 'Oak Street Apartments')!;
    expect(forecastAdjustmentTarget(built, { kind: 'include_one_off', flow: 'spending', key: rent.id })).toBeNull();
  });
});
