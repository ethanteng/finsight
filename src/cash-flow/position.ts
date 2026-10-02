import { addDays, addMonths, daysBetween, minDate, startOfMonth, type CalendarDate } from './calendar';
import type { CashFlowModel } from './forecast';
import { expandPlannedEvent } from './planned-events';

/**
 * Cash position: what the user's cash accounts and credit cards will hold, day
 * by day, from the balances the providers last reported.
 *
 * Cash moves with income, spending paid from cash, the user's planned income
 * and expenses, transfers in and out, and the card payments the card model
 * schedules. A card's balance moves with its purchases, those payments and the
 * interest projected on it. Everything comes from the same forecast as the
 * savings view, so the two never disagree about a flow; they only count
 * different things -- savings counts a card purchase when it is made, cash
 * when the card is paid.
 *
 * Planned income and expenses are assumed to move through cash, and a card's
 * payments to come from the connected cash accounts unless its history says
 * otherwise. A card that cannot be projected is left out of card balances.
 */

export type CashPositionUnavailableReason = 'forecast_unavailable' | 'no_cash_accounts' | 'unknown_balance';

export type CashPosition =
  | { available: false; reason: CashPositionUnavailableReason }
  | {
      available: true;
      startingCash: number;
      startingCardDebt: number;
      /** Cash at the end of the day before `date`: everything before it has happened. */
      cashBefore(date: CalendarDate): number;
      cardDebtBefore(date: CalendarDate): number;
      /** What the cash accounts pay the cards in `[from, toExclusive)`: exactly the payments that move the cash. */
      cardPaymentsBetween(from: CalendarDate, toExclusive: CalendarDate): number;
      /** The lowest end-of-day cash in `[from, toExclusive)`. */
      lowPoint(from: CalendarDate, toExclusive: CalendarDate): { date: CalendarDate; cash: number } | null;
      /** Cards whose balances are not projected, and why. */
      cardsLeftOut: Array<{ accountId: string; name: string; reason: 'no_balance' | 'no_pace' }>;
    };

function round(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  // A balance that rounds to nothing is 0, never -0 (which formats as "-$0.00").
  return rounded === 0 ? 0 : rounded;
}

export function buildCashPosition(model: CashFlowModel): CashPosition {
  if (!model.forecast.available) return { available: false, reason: 'forecast_unavailable' };
  const cashAccounts = model.ledger.accounts.filter(account => account.kind === 'cash');
  if (cashAccounts.length === 0) return { available: false, reason: 'no_cash_accounts' };
  // Cash summed over accounts with a missing balance would be a wrong number,
  // not a smaller one: income keeps landing in the account it cannot see.
  if (cashAccounts.some(account => account.balance === null)) return { available: false, reason: 'unknown_balance' };

  const start = model.forecastStart;
  const days = daysBetween(start, model.forecastEndLimit);
  const cashDelta = new Float64Array(days);
  const cardDelta = new Float64Array(days);
  // What cash pays the cards each day. It is recorded where it leaves the
  // cash, so a sum of it always agrees with the cash it moved.
  const paidToCards = new Float64Array(days);
  const indexOf = (date: CalendarDate) => daysBetween(start, date);
  const inWindow = (date: CalendarDate) => date >= start && date < model.forecastEndLimit;
  const addCash = (date: CalendarDate, amount: number) => { if (inWindow(date)) cashDelta[indexOf(date)] += amount; };
  const addCard = (date: CalendarDate, amount: number) => { if (inWindow(date)) cardDelta[indexOf(date)] += amount; };
  const payCardFromCash = (date: CalendarDate, amount: number) => {
    if (!inWindow(date)) return;
    cashDelta[indexOf(date)] -= amount;
    paidToCards[indexOf(date)] += amount;
  };

  const cardIds = new Set(model.cards.map(card => card.account.id));
  const projected = model.cards.filter(card => card.projection);

  // Income lands in cash, and spending on a cash account leaves it. A
  // projected card is charged exactly what its projection was given, so its
  // balance here and in the card model agree.
  for (const item of model.scheduled) {
    if (item.flow === 'income') addCash(item.date, item.amount);
    else if (!cardIds.has(item.accountId)) addCash(item.date, -item.amount);
  }
  let cardDaily = 0;
  let allCardsDaily = 0;
  for (const card of model.cards) allCardsDaily += model.cardDailySpending.get(card.account.id) ?? 0;
  for (const card of projected) {
    cardDaily += card.purchases.dailyRate;
    for (const item of card.purchases.dated) addCard(item.date, item.amount);
  }
  const cashDaily = model.typical.dailyIncome - Math.max(0, model.typical.dailySpending - allCardsDaily) + model.transfers.dailyNet;
  for (let index = 0; index < days; index += 1) {
    cashDelta[index] += cashDaily;
    cardDelta[index] += cardDaily;
  }

  for (const event of model.plannedEvents) {
    if (event.kind === 'card_payment') continue;
    for (const date of expandPlannedEvent(event, start, model.forecastEndLimit)) {
      addCash(date, event.kind === 'income' ? event.amount : -event.amount);
    }
  }
  for (const transfer of model.transfers.scheduled) addCash(transfer.date, transfer.amount);

  for (const card of projected) {
    for (const payment of card.projection!.payments) {
      addCard(payment.date, -payment.amount);
      if (card.paymentSource === 'connected') payCardFromCash(payment.date, payment.amount);
    }
    for (const posting of card.projection!.interestPostings) addCard(posting.date, posting.amount);
  }

  const startingCash = cashAccounts.reduce((total, account) => total + (account.balance ?? 0), 0);
  const startingCardDebt = projected.reduce((total, card) => total + (card.terms.balance ?? 0), 0);
  // cash[i] is the balance at the end of day i; cashBefore(day i) is cash[i - 1].
  const cash = new Float64Array(days);
  const debt = new Float64Array(days);
  let runningCash = startingCash;
  let runningDebt = startingCardDebt;
  for (let index = 0; index < days; index += 1) {
    runningCash += cashDelta[index];
    runningDebt += cardDelta[index];
    cash[index] = runningCash;
    debt[index] = runningDebt;
  }
  const valueBefore = (series: Float64Array, initial: number, date: CalendarDate) => {
    const index = Math.min(indexOf(date), days) - 1;
    return round(index < 0 ? initial : series[index]);
  };

  return {
    available: true,
    startingCash: round(startingCash),
    startingCardDebt: round(startingCardDebt),
    cashBefore: date => valueBefore(cash, startingCash, date),
    cardDebtBefore: date => valueBefore(debt, startingCardDebt, date),
    cardPaymentsBetween: (from, toExclusive) => {
      const first = Math.max(0, indexOf(from));
      const last = Math.min(days, indexOf(toExclusive));
      let total = 0;
      for (let index = first; index < last; index += 1) total += paidToCards[index];
      return round(total);
    },
    lowPoint: (from, toExclusive) => {
      const first = Math.max(0, indexOf(from));
      const last = Math.min(days, indexOf(toExclusive));
      let lowest: { date: CalendarDate; cash: number } | null = null;
      for (let index = first; index < last; index += 1) {
        if (!lowest || cash[index] < lowest.cash) lowest = { date: addDays(start, index), cash: cash[index] };
      }
      return lowest ? { date: lowest.date, cash: round(lowest.cash) } : null;
    },
    cardsLeftOut: model.cards
      .filter(card => !card.projection)
      .map(card => ({
        accountId: card.account.id,
        name: card.account.name,
        reason: card.terms.balance === null ? 'no_balance' as const : 'no_pace' as const,
      })),
  };
}

/** Fixed points a question can name: month ends ahead, and spans from the forecast start. */
export function cashMilestones(model: CashFlowModel, position: Extract<CashPosition, { available: true }>) {
  const thisMonthEnd = addMonths(startOfMonth(model.today), 1, 1);
  const point = (key: string, before: CalendarDate) => {
    const date = minDate(before, model.forecastEndLimit);
    return { key, date: addDays(date, -1), cash: position.cashBefore(date), cardDebt: position.cardDebtBefore(date) };
  };
  return {
    points: [
      point('end_of_this_month', thisMonthEnd),
      point('end_of_next_month', addMonths(thisMonthEnd, 1, 1)),
      point('in_3_months', addMonths(model.forecastStart, 3)),
      point('in_6_months', addMonths(model.forecastStart, 6)),
      point('in_12_months', addMonths(model.forecastStart, 12)),
    ],
    lowNext12Months: position.lowPoint(model.forecastStart, addMonths(model.forecastStart, 12)),
  };
}
