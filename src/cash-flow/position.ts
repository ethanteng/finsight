import { addDays, addMonths, daysBetween, minDate, startOfMonth, type CalendarDate } from './calendar';
import type { CashFlowModel } from './forecast';
import { amountMatches, occurrenceKey, postedSince, type HappenedMark, type OccurrenceRef } from './happened';
import type { CashFlowEntry, CashFlowMovement } from './ledger';
import { expandPlannedEvent } from './planned-events';

/**
 * Cash position: what the user's cash accounts and credit cards will hold, day
 * by day, from the balances the providers last reported.
 *
 * Cash moves with income, spending paid from cash, the user's planned income,
 * expenses and transfers, transfers in and out, and the card payments the
 * card model schedules. A card's balance moves with its purchases, those
 * payments and the interest projected on it. Everything comes from the same
 * forecast as the savings view, so the two never disagree about a flow; they
 * only count different things -- savings counts a card purchase when it is
 * made, cash when the card is paid.
 *
 * Every flow lands in one cash account, so the position can be read for any
 * of them, or any set, as well as for all together: income and bills in the
 * account they were seen in, transfers likewise, planned income and expenses
 * in the account the user chose, a planned transfer out of the account it
 * leaves and into the one it goes to, and a card's payments in the account
 * that has paid it. What has no account goes to the primary account (see
 * `primaryAccountId`). The accounts' positions therefore always add up to the
 * whole one. A card's payments come from the connected cash accounts unless
 * its history says otherwise. A card that cannot be projected is left out of
 * card balances.
 *
 * An item the user marked as already happened (src/cash-flow/happened.ts)
 * moves to the first forecast day, in cash and on the card it pays: it has
 * happened since the balance was reported. Where the data already shows it
 * posted, the reported balance has it, and it is not counted again.
 */

export type CashPositionUnavailableReason = 'forecast_unavailable' | 'no_cash_accounts' | 'unknown_balance';

/** A dated amount entering or leaving the accounts, for the list of what's coming up. */
export interface CashPositionItem {
  date: CalendarDate;
  label: string;
  kind:
    | 'income' | 'bill' | 'transfer_in' | 'transfer_out' | 'card_payment'
    | 'planned_income' | 'planned_expense' | 'planned_transfer' | 'planned_transfer_in' | 'planned_transfer_out';
  /**
   * Signed: positive into the accounts, negative out of them. Zero for a
   * planned transfer between two accounts the position covers, which moves
   * money without changing what they hold together.
   */
  amount: number;
  /** Cash at the end of the item's day, everything else that day included. */
  balanceAfter: number;
  /** For a planned transfer: the accounts it moves money between, as the position places them, and how much. */
  transfer?: { fromAccountId: string | null; toAccountId: string | null; amount: number };
  /** How a mark that it has already happened names it. */
  ref: OccurrenceRef;
}

/** An item the user marked as already happened, as the position counts it. */
export interface CashPositionHappenedItem {
  markId: string;
  /** The item, and the day it was expected. */
  ref: OccurrenceRef;
  label: string;
  kind: CashPositionItem['kind'];
  /** Signed, as the coming-up list would show it: zero for a planned transfer between two accounts in view. */
  amount: number;
  /**
   * Signed: what it moves the cash by on the first forecast day. Its amount,
   * or nothing once the data shows it posted, since the reported balance then
   * has it; for a planned transfer, the legs that have not posted.
   */
  counted: number;
  /** The data shows it posted on every side in view, so the reported balance already counts it. */
  inBalance: boolean;
  transfer?: CashPositionItem['transfer'];
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
      /** What arrives in `[from, toExclusive)`: income, transfers in, planned income and planned transfers in. */
      moneyInBetween(from: CalendarDate, toExclusive: CalendarDate): number;
      /** What leaves in `[from, toExclusive)` besides card payments: spending, transfers out, planned expenses and planned transfers out. */
      moneyOutBetween(from: CalendarDate, toExclusive: CalendarDate): number;
      /** The lowest end-of-day cash in `[from, toExclusive)`. */
      lowPoint(from: CalendarDate, toExclusive: CalendarDate): { date: CalendarDate; cash: number } | null;
      /**
       * Dated amounts in `[from, toExclusive)`, in date order. Everyday
       * spending runs as a daily rate and is not listed, and neither is what
       * the user marked as already happened, which is in `happened`.
       */
      itemsBetween(from: CalendarDate, toExclusive: CalendarDate): CashPositionItem[];
      /** What the user marked as already happened, counted on the first forecast day, in the order the items were due. */
      happened: CashPositionHappenedItem[];
      /**
       * What arrives and leaves every day without being listed: the typical
       * rates and the transfers that run as a rate. With the dated items, it
       * is everything that moves the cash.
       */
      spreadPerDay: { in: number; out: number };
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

  // What the user marked as already happened, by the item it names. A marked
  // item moves to the first forecast day unless the data already shows it
  // posted: then the reported balance has it, and it is not counted again.
  const marks = new Map(model.happened.map(mark => [occurrenceKey(mark), mark]));
  const happened: CashPositionHappenedItem[] = [];
  const markFor = (ref: OccurrenceRef) => marks.get(occurrenceKey(ref));
  type Row = CashFlowEntry | CashFlowMovement;
  const effectOf = (row: Row) => ('flow' in row ? (row.flow === 'income' ? row.amount : -row.amount) : row.amount);
  /** Whether a posted transaction in the account moves about `signed` since the mark allows, and is the item by `matches`. */
  const posted = (mark: HappenedMark, accountId: string | null, signed: number, matches: (row: Row) => boolean = () => true) => {
    if (!accountId) return false;
    const since = postedSince(mark);
    const fits = (row: Row) => row.accountId === accountId && row.date >= since && amountMatches(effectOf(row), signed) && matches(row);
    return model.ledger.entries.some(fits) || model.ledger.movements.some(fits);
  };
  const fromPayee = (counterpartyKey: string | undefined) => (row: Row) => Boolean(counterpartyKey) && row.counterpartyKey === counterpartyKey;
  const isCardPayment = (row: Row) => 'cardPayment' in row && row.cardPayment;
  type Listed = Omit<CashPositionItem, 'balanceAfter' | 'date' | 'amount'>;
  /** Count a marked item on the first day, unless it is in the balance; list it either way. */
  const happen = (mark: HappenedMark, signed: number, inBalance: boolean, item: Listed) => {
    if (!inBalance) {
      if (signed > 0) moneyIn[0] += signed;
      else moneyOut[0] += -signed;
    }
    happened.push({ markId: mark.id, ...item, amount: signed, counted: inBalance ? 0 : signed, inBalance });
  };
  /** A dated item that moves one account: on its day, or on the first day once it has happened. */
  const move = (date: CalendarDate, signed: number, accountId: string | null, item: Listed, matches?: (row: Row) => boolean) => {
    if (!inWindow(date)) return;
    const mark = markFor(item.ref);
    if (mark) {
      // What happened is the amount the user marked, whatever it is projected at now.
      const marked = signed < 0 ? -mark.amount : mark.amount;
      happen(mark, marked, posted(mark, accountId, marked, matches), item);
      return;
    }
    if (signed > 0) into(date, signed, item);
    else outOf(date, -signed, item);
  };

  // Income lands in cash, and spending on a cash account leaves it. A
  // projected card is charged exactly what its projection was given, so its
  // balance here and in the card model agree.
  const streams = new Map(model.streams.map(stream => [stream.id, stream]));
  for (const item of model.scheduled) {
    const stream = streams.get(item.streamId);
    const listed = (kind: 'income' | 'bill'): Listed => ({
      label: stream?.label ?? 'Regular item',
      kind,
      ref: { source: 'stream', sourceId: item.streamId, date: item.dueDate },
    });
    if (item.flow === 'income') {
      if (counts(item.accountId)) move(item.date, item.amount, place(item.accountId), listed('income'), fromPayee(stream?.counterpartyKey));
    } else if (!cardIds.has(item.accountId) && counts(item.accountId)) {
      move(item.date, -item.amount, place(item.accountId), listed('bill'), fromPayee(stream?.counterpartyKey));
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
    if (event.kind === 'transfer') {
      // Each side counts in its own account, so for the whole the two cancel.
      // An account no longer connected falls to the primary one, and a
      // transfer that would leave and land there moves nothing.
      if (place(event.accountId) === place(event.toAccountId)) continue;
      const leaves = counts(event.accountId);
      const arrives = counts(event.toAccountId);
      if (!leaves && !arrives) continue;
      const transfer = { fromAccountId: place(event.accountId), toAccountId: place(event.toAccountId), amount: event.amount };
      const kind = leaves && arrives ? 'planned_transfer' : leaves ? 'planned_transfer_out' : 'planned_transfer_in';
      for (const date of expandPlannedEvent(event, start, model.forecastEndLimit)) {
        const ref: OccurrenceRef = { source: 'planned', sourceId: event.id, date };
        const mark = markFor(ref);
        if (mark) {
          // Each leg is in its own account's balance once it posts.
          const moved = mark.amount;
          const leftInBalance = leaves && posted(mark, transfer.fromAccountId, -moved);
          const arrivedInBalance = arrives && posted(mark, transfer.toAccountId, moved);
          const out = leaves && !leftInBalance ? moved : 0;
          const inward = arrives && !arrivedInBalance ? moved : 0;
          moneyOut[0] += out;
          moneyIn[0] += inward;
          happened.push({
            markId: mark.id,
            ref,
            label: event.label,
            kind,
            amount: (arrives ? moved : 0) - (leaves ? moved : 0),
            counted: inward - out,
            inBalance: (!leaves || leftInBalance) && (!arrives || arrivedInBalance),
            transfer: { ...transfer, amount: moved },
          });
        } else if (leaves && arrives) {
          // Both sides are in view: one item, since the two legs would list
          // the same move twice with the same balance after each.
          outOf(date, event.amount);
          into(date, event.amount);
          if (inWindow(date)) items.push({ date, amount: 0, label: event.label, kind, transfer, ref });
        } else if (leaves) {
          outOf(date, event.amount, { label: event.label, kind, transfer, ref });
        } else {
          into(date, event.amount, { label: event.label, kind, transfer, ref });
        }
      }
      continue;
    }
    if (event.kind === 'card_payment' || !counts(event.accountId)) continue;
    for (const date of expandPlannedEvent(event, start, model.forecastEndLimit)) {
      const ref: OccurrenceRef = { source: 'planned', sourceId: event.id, date };
      if (event.kind === 'income') move(date, event.amount, place(event.accountId), { label: event.label, kind: 'planned_income', ref });
      else move(date, -event.amount, place(event.accountId), { label: event.label, kind: 'planned_expense', ref });
    }
  }
  const transferStreams = new Map(model.transfers.streams.map(stream => [stream.id, stream]));
  for (const transfer of model.transfers.scheduled) {
    if (!counts(transfer.accountId)) continue;
    const stream = transferStreams.get(transfer.streamId);
    move(transfer.date, transfer.amount, place(transfer.accountId), {
      label: stream?.label ?? 'Regular transfer',
      kind: transfer.amount > 0 ? 'transfer_in' : 'transfer_out',
      ref: { source: 'transfer', sourceId: transfer.streamId, date: transfer.dueDate },
    }, fromPayee(stream?.counterpartyKey));
  }

  for (const card of projected) {
    const fromCash = paysFromChosen(card);
    // Everything a card is paid on one day is one item: a regular payment and
    // a planned extra are one trip to the card.
    const byDay = new Map<CalendarDate, number>();
    for (const payment of card.projection!.payments) byDay.set(payment.date, (byDay.get(payment.date) ?? 0) + payment.amount);
    for (const [date, amount] of byDay) {
      const ref: OccurrenceRef = { source: 'card', sourceId: card.account.id, date };
      const mark = inWindow(date) ? markFor(ref) : undefined;
      if (!mark) {
        addCard(date, -amount);
        if (fromCash && inWindow(date)) {
          paidToCards[indexOf(date)] += amount;
          items.push({ date, amount: -amount, label: card.account.name, kind: 'card_payment', ref });
        }
        continue;
      }
      // The payment that happened is the one the user marked. Once it posts,
      // the card's lower balance projects a smaller payment for this day,
      // which the mark replaces rather than counting as a second payment.
      // The card and the account that paid it each have the payment in their
      // reported balance once their own side posts.
      const paid = mark.amount;
      if (!posted(mark, card.account.id, paid, isCardPayment)) addCard(start, -paid);
      if (!fromCash) continue;
      const inBalance = posted(mark, place(card.paidFrom), -paid, isCardPayment);
      if (!inBalance) paidToCards[0] += paid;
      happened.push({ markId: mark.id, ref, label: card.account.name, kind: 'card_payment', amount: -paid, counted: inBalance ? 0 : -paid, inBalance });
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
    happened: happened
      .sort((left, right) => left.ref.date.localeCompare(right.ref.date) || left.label.localeCompare(right.label))
      .map(item => ({ ...item, amount: round(item.amount), counted: round(item.counted) })),
    spreadPerDay: { in: round(dailyIn), out: round(dailyOut) },
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

/**
 * The upcoming item a mark would name, if the cash position lists it: in the
 * whole position, or in one account's when the whole cannot be added up. Its
 * label and amount are what the mark is stored under, so the server names the
 * item and what it moved, not the client. The amount is positive: a planned
 * transfer's is what it moves between the accounts. An item already marked is
 * still found, so marking it again returns the mark already saved.
 */
export function happenedTarget(model: CashFlowModel, ref: OccurrenceRef): { label: string; amount: number } | null {
  const key = occurrenceKey(ref);
  const find = (position: CashPosition) => {
    if (!position.available) return null;
    const item = position.itemsBetween(model.forecastStart, model.forecastEndLimit).find(candidate => occurrenceKey(candidate.ref) === key)
      ?? position.happened.find(candidate => occurrenceKey(candidate.ref) === key);
    if (!item) return null;
    return { label: item.label, amount: Math.abs(item.transfer ? item.transfer.amount : item.amount) };
  };
  const whole = buildCashPosition(model);
  if (whole.available || whole.reason !== 'unknown_balance') return find(whole);
  for (const account of model.ledger.accounts) {
    if (account.kind !== 'cash' || account.balance === null) continue;
    const found = find(buildCashPosition(model, [account.id]));
    if (found) return found;
  }
  return null;
}
