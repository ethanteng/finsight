import {
  cardName,
  cardsLeftOutText,
  cashAccountName,
  coversAllCash,
  describeCardPlan,
  describeSchedule,
  monthLabel,
  paceDescription,
  formatCalendarDate,
  formatCompactMoney,
  formatMoney,
  formatSignedMoney,
  lastIncludedDay,
  periodLabel,
  positionScope,
  projectsCardDebt,
  shortPeriodLabel,
} from '../cash-flow-format';
import type { CashFlowReport } from '../../types/cash-flow';

const period = (key: string, start: string, endExclusive: string, clipped = false) => ({ key, start, endExclusive, clipped });

describe('cash flow formatting', () => {
  it('formats calendar dates without shifting them across time zones', () => {
    expect(formatCalendarDate('2026-01-01')).toBe('Jan 1, 2026');
    expect(formatCalendarDate('2026-12-31', false)).toBe('Dec 31');
    expect(lastIncludedDay('2026-03-01')).toBe('2026-02-28');
    expect(lastIncludedDay('2027-01-01')).toBe('2026-12-31');
  });

  it('names periods by granularity, and by their dates when clipped', () => {
    expect(periodLabel(period('2026-10', '2026-10-01', '2026-11-01'), 'month')).toBe('Oct 2026');
    expect(periodLabel(period('2026-Q4', '2026-10-01', '2027-01-01'), 'quarter')).toBe('Q4 2026');
    expect(periodLabel(period('2026', '2026-01-01', '2027-01-01'), 'year')).toBe('2026');
    expect(periodLabel(period('2026-09-28', '2026-09-28', '2026-10-05'), 'week')).toBe('Week of Sep 28, 2026');
    expect(periodLabel(period('2026-08', '2026-08-15', '2026-09-01', true), 'month')).toBe('Aug 15 – Aug 31, 2026');
    expect(periodLabel(period('2026', '2026-12-15', '2027-01-03', true), 'year')).toBe('Dec 15, 2026 – Jan 2, 2027');
  });

  it('keeps axis labels short but marks a new year', () => {
    expect(shortPeriodLabel({ start: '2026-10-01' }, 'month')).toBe('Oct');
    expect(shortPeriodLabel({ start: '2027-01-01' }, 'month')).toBe("Jan '27");
    expect(shortPeriodLabel({ start: '2026-10-01' }, 'quarter')).toBe("Q4 '26");
    expect(shortPeriodLabel({ start: '2026-09-28' }, 'week')).toBe('9/28');
  });

  it('formats money with a true minus sign and an explicit plus for gains', () => {
    expect(formatMoney(1234.5)).toBe('$1,235');
    expect(formatMoney(1234.5, true)).toBe('$1,234.50');
    expect(formatMoney(-320)).toBe('−$320');
    expect(formatSignedMoney(1240.4)).toBe('+$1,240');
    expect(formatSignedMoney(-320)).toBe('−$320');
    expect(formatSignedMoney(0.4)).toBe('$0');
    expect(formatCompactMoney(1250)).toBe('$1.3K');
    expect(formatCompactMoney(15000)).toBe('$15K');
    expect(formatCompactMoney(-2000000)).toBe('−$2M');
    expect(formatCompactMoney(800)).toBe('$800');
  });

  it('describes when a planned event happens', () => {
    expect(describeSchedule({ recurrence: 'once', startDate: '2026-12-15', endDate: null })).toBe('Once on Dec 15, 2026');
    expect(describeSchedule({ recurrence: 'monthly', startDate: '2027-01-01', endDate: '2027-06-01' }))
      .toBe('Every month from Jan 1, 2027 until Jun 1, 2027');
    expect(describeSchedule({ recurrence: 'biweekly', startDate: '2026-10-02', endDate: null })).toBe('Every 2 weeks from Oct 2, 2026');
  });
});

describe('card formatting', () => {
  it('names cards and months', () => {
    expect(cardName({ name: 'Rewards Card', mask: '9876' })).toBe('Rewards Card ••9876');
    expect(cardName({ name: 'Store Card', mask: null })).toBe('Store Card');
    expect(monthLabel('2027-03')).toBe('Mar 2027');
  });

  it('describes how a card is paid', () => {
    expect(paceDescription({ behavior: 'pays_in_full', usualMonthlyPayment: null })).toBe('You’ve been paying this card in full');
    expect(paceDescription({ behavior: 'average_payment', usualMonthlyPayment: 1520.83 })).toBe('You’ve been paying about $1,521 a month');
    expect(paceDescription({ behavior: 'minimum_payment', usualMonthlyPayment: 80 })).toBe('Assuming the minimum payment of $80 a month');
    expect(paceDescription({ behavior: 'unknown', usualMonthlyPayment: null })).toBe('Not enough payment history to know what you usually pay');
  });

  it('names the cards the cash position leaves out, and says whether it carries any', () => {
    // The engine says which cards the position covers; those it leaves out are named.
    const view = (cards: Array<{ accountId: string; mask: string | null }>, cardsLeftOut: CashFlowReport['position']['cardsLeftOut']) => {
      const leftOutIds = new Set(cardsLeftOut.map(card => card.accountId));
      const cardIds = cards.map(card => card.accountId).filter(id => !leftOutIds.has(id));
      return ({ cards, position: { cardsLeftOut, cardIds } }) as unknown as Pick<CashFlowReport, 'cards' | 'position'>;
    };
    const cards = [
      { accountId: 'rewards', mask: '9876' },
      { accountId: 'store', mask: '1234' },
      { accountId: 'travel', mask: null },
    ];
    const leftOut: CashFlowReport['position']['cardsLeftOut'] = [
      { accountId: 'store', name: 'Store Card', reason: 'no_balance' },
      { accountId: 'travel', name: 'Travel Card', reason: 'no_pace' },
    ];
    expect(cardsLeftOutText(view(cards, leftOut))).toBe(
      'Store Card ••1234 (its balance isn’t reported), Travel Card (there’s no usual payment to project from)'
    );
    expect(projectsCardDebt(view(cards, leftOut))).toBe(true);
    expect(cardsLeftOutText(view(cards, []))).toBeNull();
    expect(projectsCardDebt(view(cards.slice(1), leftOut))).toBe(false);
  });

  it('says which cash accounts the position covers', () => {
    const accounts = [
      { id: 'checking', name: 'Everyday Checking', institution: null, subtype: 'checking', mask: '1234', balance: 5200, primary: true },
      { id: 'savings', name: 'High Yield Savings', institution: null, subtype: 'savings', mask: '5678', balance: 10000, primary: false },
      { id: 'cash', name: 'Cash Box', institution: null, subtype: null, mask: null, balance: 40, primary: false },
    ];
    const covering = (accountIds: string[]) =>
      ({ position: { accounts, accountIds } }) as unknown as Pick<CashFlowReport, 'position'>;
    expect(coversAllCash(covering(['checking', 'savings', 'cash']))).toBe(true);
    expect(positionScope(covering(['checking', 'savings', 'cash']))).toBe('your checking and savings');
    expect(coversAllCash(covering(['checking']))).toBe(false);
    expect(positionScope(covering(['checking']))).toBe('Everyday Checking ••1234');
    expect(positionScope(covering(['cash']))).toBe('Cash Box');
    expect(positionScope(covering(['checking', 'savings']))).toBe('2 accounts');
    expect(cashAccountName(accounts[1])).toBe('High Yield Savings ••5678');
  });

  it('describes each kind of card plan', () => {
    const base = { startDate: '2026-11-01', endDate: null, amount: 0 };
    expect(describeCardPlan({ ...base, recurrence: 'once', paymentMode: 'full' })).toBe('Pay off in full on Nov 1, 2026');
    expect(describeCardPlan({ ...base, recurrence: 'monthly', paymentMode: 'full', endDate: '2027-06-01' }))
      .toBe('Pay the statement in full every month from Nov 1, 2026 until Jun 1, 2027');
    expect(describeCardPlan({ ...base, recurrence: 'once', paymentMode: 'fixed', amount: 500 })).toBe('Pay an extra $500 on Nov 1, 2026');
    expect(describeCardPlan({ ...base, recurrence: 'monthly', paymentMode: 'fixed', amount: 750 })).toBe('Pay $750 every month from Nov 1, 2026');
  });
});

