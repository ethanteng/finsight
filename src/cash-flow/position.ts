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
 * Every flow lands in one cash account, so the position can be read for any
 * of them, or any set, as well as for all together: income and bills in the
 * account they were seen in, transfers likewise, planned income and expenses
 * in the account the user chose, and a card's payments in the account that
 * has paid it. What has no account goes to the primary account (see
 * `primaryAccountId`). The accounts' positions therefore always add up to the
 * whole one. A card's payments come from the connected cash accounts unless
 * its history says otherwise. A card that cannot be projected is left out of
 * card balances.
 */

export type CashPositionUnavailableReason = 'forecast_unavailable' | 'no_cash_accounts' | 'unknown_balance';

/** A dated amount entering or leaving the accounts, for the list of what's coming up. */
export interface CashPositionItem {
  date: CalendarDate;
  label: string;
  kind: 'income' | 'bill' | 'transfer_in' | 'transfer_out' | 'card_payment' | 'planned_income' | 'planned_expense';
  /** Signed: positive into the accounts, negative out of them. */
  amount: number;
  /** Cash at the end of the item's day, everything else that day included. */
  balanceAfter: number;
}

export type CashPosition =
  | { available: false; reason: CashPositionUnavailableReason }
  | {
      available: true;
      /** The cash accounts this position covers. */
      accountIds: string[];
      /** The cards whose balances it covers: every projected card for the whole, those paid from a chosen set for a part. */
      cardIds: string[];
      startingCash: number;
      startingCardDebt: number;
      /** Cash at the end of the day before `date`: everything before it has happened. */
      cashBefore(date: CalendarDate): number;
      cardDebtBefore(date: CalendarDate): number;
      /** What the cash accounts pay the cards in `[from, toExclusive)`: exactly the payments that move the cash. */
      cardPaymentsBetween(from: CalendarDate, toExclusive: CalendarDate): number;
      /** What arrives in `[from, toExclusive)`: income, transfers in and planned income. */
      moneyInBetween(from: CalendarDate, toExclusive: CalendarDate): number;
      /** What leaves in `[from, toExclusive)` besides card payments: spending, transfers out and planned expenses. */
      moneyOutBetween(from: CalendarDate, toExclusive: CalendarDate): number;
      /** The lowest end-of-day cash in `[from, toExclusive)`. */
      lowPoint(from: CalendarDate, toExclusive: CalendarDate): { date: CalendarDate; cash: number } | null;
      /** Dated amounts in `[from, toExclusive)`, in date order. Everyday spending runs as a daily rate and is not listed. */
      itemsBetween(from: CalendarDate, toExclusive: CalendarDate): CashPositionItem[];
      /** Cards whose balances are not projected, and why. */
      cardsLeftOut: Array<{ accountId: string; name: string; reason: 'no_balance' | 'no_pace' }>;
    };

function round(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  // A balance that rounds to nothing is 0, never -0 (which formats as "-$0.00").
  return rounded === 0 ? 0 : rounded;
}

/**
 * The position of the chosen cash accounts; all of them when `accountIds` is
 * empty or left out. Ids that are not cash accounts are ignored. Cards count
 * toward a chosen set when they are paid from it; all of them count toward
 * the whole.
 */
export function buildCashPosition(model: CashFlowModel, accountIds?: readonly string[]): CashPosition {
  if (!model.forecast.available) return { available: false, reason: 'forecast_unavailable' };
  const allCash = model.ledger.accounts.filter(account => account.kind === 'cash');
  if (allCash.length === 0) return { available: false, reason: 'no_cash_accounts' };
  const wanted = accountIds && accountIds.length > 0 ? new Set(accountIds) : null;
  const cashAccounts = wanted ? allCash.filter(account => wanted.has(account.id)) : allCash;
  if (cashAccounts.length === 0) return { available: false, reason: 'no_cash_accounts' };
  // Cash summed over accounts with a missing balance would be a wrong number,
  // not a smaller one: income keeps landing in the account it cannot see.
  if (cashAccounts.some(account => account.balance === null)) return { available: false, reason: 'unknown_balance' };
  const whole = cashAccounts.length === allCash.length;

  const start = model.forecastStart;
  const days = daysBetween(start, model.forecastEndLimit);
  const moneyIn = new Float64Array(days);
  const moneyOut = new Float64Array(days);
  // What cash pays the cards each day. It is recorded where it leaves the
  // cash, so a sum of it always agrees with the cash it moved.
  const paidToCards = new Float64Array(days);
  const cardDelta = new Float64Array(days);
  const items: Array<Omit<CashPositionItem, 'balanceAfter'>> = [];
  const indexOf = (date: CalendarDate) => daysBetween(start, date);
  const inWindow = (date: CalendarDate) => date >= start && date < model.forecastEndLimit;

  const cashIds = new Set(allCash.map(account => account.id));
  const selected = new Set(cashAccounts.map(account => account.id));
  // The account a flow lands in: its own when it is a cash account, else the primary one.
  const place = (accountId: string | null | undefined) =>
    (accountId && cashIds.has(accountId) ? accountId : model.primaryAccountId);
  const counts = (accountId: string | null | undefined) => {
    const target = place(accountId);
    return target !== null && selected.has(target);
  };
  const into = (date: CalendarDate, amount: number, item?: Omit<CashPositionItem, 'balanceAfter' | 'date' | 'amount'>) => {
    if (!inWindow(date)) return;
    moneyIn[indexOf(date)] += amount;
    if (item) items.push({ date, amount, ...item });
  };
  const outOf = (date: CalendarDate, amount: number, item?: Omit<CashPositionItem, 'balanceAfter' | 'date' | 'amount'>) => {
    if (!inWindow(date)) return;
    moneyOut[indexOf(date)] += amount;
    if (item) items.push({ date, amount: -amount, ...item });
  };
  const addCard = (date: CalendarDate, amount: number) => { if (inWindow(date)) cardDelta[indexOf(date)] += amount; };

  // Cards: all of them for the whole, and those paid from the chosen accounts
  // for a part. A card paid from elsewhere has no account here to count toward.
  const cardIds = new Set(model.cards.map(card => card.account.id));
  const paysFromChosen = (card: CashFlowModel['cards'][number]) => card.paymentSource === 'connected' && counts(card.paidFrom);
  const projected = model.cards.filter(card => card.projection && (whole || paysFromChosen(card)));

  // Income lands in cash, and spending on a cash account leaves it. A
  // projected card is charged exactly what its projection was given, so its
  // balance here and in the card model agree.
  const streamLabels = new Map(model.streams.map(stream => [stream.id, stream.label]));
  for (const item of model.scheduled) {
    const label = streamLabels.get(item.streamId) ?? 'Regular item';
    if (item.flow === 'income') {
      if (counts(item.accountId)) into(item.date, item.amount, { label, kind: 'income' });
    } else if (!cardIds.has(item.accountId) && counts(item.accountId)) {
      outOf(item.date, item.amount, { label, kind: 'bill' });
    }
  }
  let cardDaily = 0;
  for (const card of projected) {
    cardDaily += card.purchases.dailyRate;
    for (const item of card.purchases.dated) addCard(item.date, item.amount);
  }
  let dailyIn = 0;
  let dailyOut = 0;
  for (const accountId of selected) {
    const typical = model.accountTypical.get(accountId);
    const transfers = model.transfers.dailyByAccount.get(accountId);
    dailyIn += (typical?.income ?? 0) + (transfers?.in ?? 0);
    dailyOut += (typical?.spending ?? 0) + (transfers?.out ?? 0);
  }
  for (let index = 0; index < days; index += 1) {
    moneyIn[index] += dailyIn;
    moneyOut[index] += dailyOut;
    cardDelta[index] += cardDaily;
  }

  for (const event of model.plannedEvents) {
    if (event.kind === 'card_payment' || !counts(event.accountId)) continue;
    for (const date of expandPlannedEvent(event, start, model.forecastEndLimit)) {
      if (event.kind === 'income') into(date, event.amount, { label: event.label, kind: 'planned_income' });
      else outOf(date, event.amount, { label: event.label, kind: 'planned_expense' });
    }
  }
  const transferLabels = new Map(model.transfers.streams.map(stream => [stream.id, stream.label]));
  for (const transfer of model.transfers.scheduled) {
    if (!counts(transfer.accountId)) continue;
    const label = transferLabels.get(transfer.streamId) ?? 'Regular transfer';
    if (transfer.amount > 0) into(transfer.date, transfer.amount, { label, kind: 'transfer_in' });
    else outOf(transfer.date, -transfer.amount, { label, kind: 'transfer_out' });
  }

  for (const card of projected) {
    const fromCash = paysFromChosen(card);
    for (const payment of card.projection!.payments) {
      addCard(payment.date, -payment.amount);
      if (fromCash && inWindow(payment.date)) {
        paidToCards[indexOf(payment.date)] += payment.amount;
        items.push({ date: payment.date, amount: -payment.amount, label: card.account.name, kind: 'card_payment' });
      }
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
    runningCash += moneyIn[index] - moneyOut[index] - paidToCards[index];
    runningDebt += cardDelta[index];
    cash[index] = runningCash;
    debt[index] = runningDebt;
  }
  const valueBefore = (series: Float64Array, initial: number, date: CalendarDate) => {
    const index = Math.min(indexOf(date), days) - 1;
    return round(index < 0 ? initial : series[index]);
  };
  const sumBetween = (series: Float64Array, from: CalendarDate, toExclusive: CalendarDate) => {
    const first = Math.max(0, indexOf(from));
    const last = Math.min(days, indexOf(toExclusive));
    let total = 0;
    for (let index = first; index < last; index += 1) total += series[index];
    return round(total);
  };
  const itemOrder = (left: Omit<CashPositionItem, 'balanceAfter'>, right: Omit<CashPositionItem, 'balanceAfter'>) =>
    left.date.localeCompare(right.date) || right.amount - left.amount || left.label.localeCompare(right.label);
  items.sort(itemOrder);

  return {
    available: true,
    accountIds: cashAccounts.map(account => account.id),
    cardIds: projected.map(card => card.account.id),
    startingCash: round(startingCash),
    startingCardDebt: round(startingCardDebt),
    cashBefore: date => valueBefore(cash, startingCash, date),
    cardDebtBefore: date => valueBefore(debt, startingCardDebt, date),
    cardPaymentsBetween: (from, toExclusive) => sumBetween(paidToCards, from, toExclusive),
    moneyInBetween: (from, toExclusive) => sumBetween(moneyIn, from, toExclusive),
    moneyOutBetween: (from, toExclusive) => sumBetween(moneyOut, from, toExclusive),
    lowPoint: (from, toExclusive) => {
      const first = Math.max(0, indexOf(from));
      const last = Math.min(days, indexOf(toExclusive));
      let lowest: { date: CalendarDate; cash: number } | null = null;
      for (let index = first; index < last; index += 1) {
        if (!lowest || cash[index] < lowest.cash) lowest = { date: addDays(start, index), cash: cash[index] };
      }
      return lowest ? { date: lowest.date, cash: round(lowest.cash) } : null;
    },
    itemsBetween: (from, toExclusive) => items
      .filter(item => item.date >= from && item.date < toExclusive)
      .map(item => ({ ...item, amount: round(item.amount), balanceAfter: round(cash[indexOf(item.date)]) })),
    cardsLeftOut: model.cards
      .filter(card => !card.projection && (whole || paysFromChosen(card)))
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
