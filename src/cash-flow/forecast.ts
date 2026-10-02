import {
  addDays,
  addMonths,
  daysBetween,
  maxDate,
  minDate,
  startOfMonth,
  type CalendarDate,
} from './calendar';
import {
  forecastAdjustmentSets,
  payeeKey,
  type ForecastAdjustment,
  type ForecastAdjustmentInput,
} from './adjustments';
import {
  buildCashFlowLedger,
  type CashFlowAccount,
  type CashFlowDirection,
  type CashFlowEntry,
  type CashFlowLedger,
} from './ledger';
import {
  cardBaseline,
  cardTermsFromAccount,
  canProjectCard,
  projectCard,
  type CardBaseline,
  type CardHistory,
  type CardProjection,
  type CardPurchases,
  type CardTerms,
} from './cards';
import {
  enumeratePeriods,
  nextPeriodStart,
  periodEndExclusive,
  periodStart,
  type CashFlowGranularity,
} from './periods';
import {
  expandPlannedEvent,
  type PlannedCashFlowEvent,
} from './planned-events';
import {
  buildCashPosition,
  cashMilestones,
  type CashPositionUnavailableReason,
} from './position';
import {
  detectRecurringStreams,
  scheduleStream,
  streamMonthlyAmount,
  type RecurringCadence,
  type RecurringStream,
} from './recurring';

/**
 * Deterministic cash-flow history and forecast for the savings view.
 *
 * Cash in is canonical income and cash out is canonical spending across cash
 * accounts and credit cards: card purchases count when they are made, and card
 * payments, transfers and trades are neither. Net is what the user kept.
 *
 * The forecast is three disclosed parts and nothing else:
 *   recurring -- streams recognized in the user's history, on their schedule;
 *   typical   -- everything else, as a daily rate over the recent basis window,
 *                with large one-off amounts left out and listed;
 *   planned   -- events the user saved.
 * A monthly income or expense override replaces the recurring and typical
 * parts of that side, because the user has said what the month looks like.
 * The user's adjustments (src/cash-flow/adjustments.ts) change what the
 * forecast learns from; the history shown is never adjusted.
 *
 * Every figure is computed here. Models and the frontend only present them.
 */
export const CASH_FLOW_ENGINE_VERSION = 1;

/** Longest a forecast may run, from its first day. */
export const FORECAST_MAX_MONTHS = 24;
/** Less history than this makes a daily rate meaningless. */
export const MIN_FORECAST_HISTORY_DAYS = 28;
/** Typical rates come from at most this many recent days. */
export const TYPICAL_BASIS_DAYS = 90;
/** A non-repeating amount this large or larger can be a one-off. */
export const ONE_OFF_FLOOR = 1_000;
/** ... once it is also this many typical weeks' worth. */
const ONE_OFF_TYPICAL_WEEKS = 2;
const DAYS_PER_MONTH = 365 / 12;

export interface CashFlowTotals {
  income: number;
  spending: number;
  net: number;
}

export interface ForecastComponents {
  recurringIncome: number;
  typicalIncome: number;
  plannedIncome: number;
  recurringSpending: number;
  typicalSpending: number;
  plannedSpending: number;
  /** Interest the card model projects, for cards whose APR and pace are known. */
  cardInterest: number;
}

export type ForecastTotals = CashFlowTotals & { components: ForecastComponents };

export type ForecastUnavailableReason = 'no_accounts' | 'no_history' | 'insufficient_history';

export interface CashFlowModelInput {
  transactions: readonly any[];
  accounts: readonly any[];
  plannedEvents: readonly PlannedCashFlowEvent[];
  /**
   * Last calendar day the transactions can cover: the snapshot's compute date
   * in the user's zone. The forecast starts the day after, so days the
   * snapshot has not seen yet are forecast rather than counted as empty.
   */
  dataThrough: CalendarDate;
  /** The user's calendar date, which decides "this month". */
  today: CalendarDate;
  overrides?: { monthlyIncome?: number | null; monthlyExpense?: number | null };
  /** The user's choices about what the forecast counts. */
  adjustments?: readonly ForecastAdjustment[];
  reportingCurrency?: string;
}

type FlowSource = 'transactions' | 'override';

export interface CashFlowModel {
  ledger: CashFlowLedger;
  streams: RecurringStream[];
  plannedEvents: readonly PlannedCashFlowEvent[];
  today: CalendarDate;
  dataThrough: CalendarDate;
  forecastStart: CalendarDate;
  forecastEndLimit: CalendarDate;
  coverageStart: CalendarDate | null;
  forecast: { available: true } | { available: false; reason: ForecastUnavailableReason };
  typical: {
    basisStart: CalendarDate | null;
    basisDays: number;
    dailyIncome: number;
    dailySpending: number;
    incomeSource: FlowSource;
    spendingSource: FlowSource;
    monthlyIncomeOverride: number | null;
    monthlyExpenseOverride: number | null;
  };
  oneOffs: CashFlowEntry[];
  /** The payees behind the typical rates, for the sides read from transactions. */
  typicalPayees: TypicalPayee[];
  /** How large a non-repeating amount must be to be left out as a one-off; null without a basis. */
  oneOffThresholds: Record<CashFlowDirection, number> | null;
  adjustments: readonly ForecastAdjustment[];
  /** Streams that had stopped and are projected because the user kept them. */
  continuedStreamIds: ReadonlySet<string>;
  /** Projected stream occurrences over the whole forecast limit. */
  scheduled: Array<{
    streamId: string;
    flow: CashFlowDirection;
    accountId: string;
    date: CalendarDate;
    amount: number;
    /** True when the stream was learned from card interest charges. */
    interest: boolean;
  }>;
  /** The typical spending rate that lands on each card, out of `typical.dailySpending`. */
  cardDailySpending: Map<string, number>;
  cards: CardModel[];
  /** Money moving in and out of the user's cash besides income, spending and card payments. */
  transfers: TransferModel;
}

export interface CardModel {
  account: CashFlowAccount;
  terms: CardTerms;
  history: CardHistory;
  baseline: CardBaseline;
  /**
   * Whether the card's payments come from the user's connected cash accounts.
   * Most payments matched to a connected cash account, or no payments to judge
   * by, say they do; otherwise the cash position leaves the card's payments out.
   */
  paymentSource: 'connected' | 'other';
  /** The user's card-payment events for this card. */
  plans: PlannedCashFlowEvent[];
  /** At the usual pace, with no plans; null when it cannot be projected. */
  currentPace: CardProjection | null;
  /** With the user's plans; the current pace when there are none. */
  projection: CardProjection | null;
  /** What the card is charged in the forecast: what its projections are given, and what the cash position adds to its balance. */
  purchases: CardPurchases;
  /** Projected interest replaces the card's historical interest in the forecast. */
  modelsInterest: boolean;
}

/** What one payee adds to a typical rate. */
export interface TypicalPayee {
  flow: CashFlowDirection;
  /** The ledger's key for the payee. */
  counterpartyKey: string;
  label: string;
  /** Per day, over the basis. */
  daily: number;
}

export interface TransferModel {
  streams: RecurringStream[];
  /** Signed: positive into the user's cash, negative out of it. */
  scheduled: Array<{ streamId: string; date: CalendarDate; amount: number }>;
  /** Net typical transfers per day; negative when more leaves than arrives. */
  dailyNet: number;
  oneOffs: CashFlowEntry[];
}

export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function totals(income: number, spending: number): CashFlowTotals {
  const roundedIncome = roundCents(income);
  const roundedSpending = roundCents(spending);
  return { income: roundedIncome, spending: roundedSpending, net: roundCents(roundedIncome - roundedSpending) };
}

function addTotals(left: CashFlowTotals, right: CashFlowTotals): CashFlowTotals {
  return totals(left.income + right.income, left.spending + right.spending);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function positiveOverride(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Median of complete 7-day totals across the basis, per flow. */
function typicalWeeklyTotals(
  entries: readonly CashFlowEntry[],
  basisStart: CalendarDate,
  basisEndExclusive: CalendarDate
): Record<CashFlowDirection, number> {
  const weeks = Math.floor(daysBetween(basisStart, basisEndExclusive) / 7);
  const result: Record<CashFlowDirection, number> = { income: 0, spending: 0 };
  if (weeks === 0) return result;
  for (const flow of ['income', 'spending'] as const) {
    const buckets = new Array<number>(weeks).fill(0);
    for (const entry of entries) {
      if (entry.flow !== flow) continue;
      const week = Math.floor(daysBetween(basisStart, entry.date) / 7);
      if (week >= 0 && week < weeks) buckets[week] += entry.amount;
    }
    result[flow] = median(buckets);
  }
  return result;
}

interface LearnedFlows {
  streams: RecurringStream[];
  oneOffs: CashFlowEntry[];
  /** Typical daily amount per account and flow, one-offs left out. */
  dailyByAccount: Map<string, Record<CashFlowDirection, number>>;
  /** The part of each account's typical daily spending that is card interest charges. */
  interestDailyByAccount: Map<string, number>;
  /** The named payees behind the typical rates, largest first. */
  typicalPayees: TypicalPayee[];
  /** How large a non-repeating amount must be to be left out as a one-off; null without a basis. */
  oneOffThresholds: Record<CashFlowDirection, number> | null;
}

/**
 * Learn recurring streams and typical daily rates from a set of entries:
 * streams on their schedule, everything else as a daily rate over the basis,
 * with large amounts from payees that do not repeat left out as one-offs.
 */
function learnFlows(
  entries: readonly CashFlowEntry[],
  dataThrough: CalendarDate,
  basisStart: CalendarDate | null,
  basisEndExclusive: CalendarDate,
  /** Transactions the user chose to count, however large. */
  countedOneOffs: ReadonlySet<string> = new Set()
): LearnedFlows {
  const streams = detectRecurringStreams(entries, dataThrough);
  const dailyByAccount = new Map<string, Record<CashFlowDirection, number>>();
  const interestDailyByAccount = new Map<string, number>();
  const empty = { streams, oneOffs: [], dailyByAccount, interestDailyByAccount, typicalPayees: [], oneOffThresholds: null };
  if (!basisStart) return empty;
  const basisDays = daysBetween(basisStart, basisEndExclusive);
  if (basisDays <= 0) return empty;

  const inStream = new Set(streams.flatMap(stream => stream.entryIds));
  const basisEntries = entries.filter(entry => entry.date >= basisStart && entry.date < basisEndExclusive);
  const residual = basisEntries.filter(entry => !inStream.has(entry.id));
  const typicalWeek = typicalWeeklyTotals(residual, basisStart, basisEndExclusive);
  const oneOffThresholds: Record<CashFlowDirection, number> = {
    income: Math.max(ONE_OFF_FLOOR, ONE_OFF_TYPICAL_WEEKS * typicalWeek.income),
    spending: Math.max(ONE_OFF_FLOOR, ONE_OFF_TYPICAL_WEEKS * typicalWeek.spending),
  };

  // A one-off is large for this user and does not repeat: a payee seen more
  // than once in the basis is part of how they live, however large.
  const payeeCounts = new Map<string, number>();
  for (const entry of basisEntries) {
    if (!entry.counterpartyKey) continue;
    const key = `${entry.flow}|${entry.counterpartyKey}`;
    payeeCounts.set(key, (payeeCounts.get(key) ?? 0) + 1);
  }
  const isOneOff = (entry: CashFlowEntry) => {
    if (countedOneOffs.has(entry.id)) return false;
    const repeats = entry.counterpartyKey
      ? (payeeCounts.get(`${entry.flow}|${entry.counterpartyKey}`) ?? 0) > 1
      : false;
    return !repeats && Math.abs(entry.amount) >= oneOffThresholds[entry.flow];
  };

  const oneOffs = residual.filter(isOneOff);
  const oneOffIds = new Set(oneOffs.map(entry => entry.id));
  const totalsByAccount = new Map<string, Record<CashFlowDirection, number>>();
  const byPayee = new Map<string, TypicalPayee & { latest: CalendarDate }>();
  for (const entry of residual) {
    if (oneOffIds.has(entry.id)) continue;
    const account = totalsByAccount.get(entry.accountId) ?? { income: 0, spending: 0 };
    account[entry.flow] += entry.amount;
    totalsByAccount.set(entry.accountId, account);
    if (entry.interest && entry.flow === 'spending') {
      interestDailyByAccount.set(entry.accountId, (interestDailyByAccount.get(entry.accountId) ?? 0) + entry.amount / basisDays);
    }
    if (!entry.counterpartyKey) continue;
    const key = payeeKey(entry.flow, entry.counterpartyKey);
    const payee = byPayee.get(key) ?? { flow: entry.flow, counterpartyKey: entry.counterpartyKey, label: entry.label, daily: 0, latest: entry.date };
    payee.daily += entry.amount / basisDays;
    if (entry.date >= payee.latest) {
      payee.latest = entry.date;
      payee.label = entry.label;
    }
    byPayee.set(key, payee);
  }
  for (const [accountId, account] of totalsByAccount) {
    dailyByAccount.set(accountId, {
      income: Math.max(0, account.income / basisDays),
      spending: Math.max(0, account.spending / basisDays),
    });
  }
  const typicalPayees = [...byPayee.values()]
    .filter(payee => payee.daily > 0)
    .sort((left, right) => right.daily - left.daily)
    .map(payee => ({ flow: payee.flow, counterpartyKey: payee.counterpartyKey, label: payee.label, daily: payee.daily }));
  return { streams, oneOffs, dailyByAccount, interestDailyByAccount, typicalPayees, oneOffThresholds };
}

function sumDaily(dailyByAccount: ReadonlyMap<string, Record<CashFlowDirection, number>>, flow: CashFlowDirection): number {
  let total = 0;
  for (const account of dailyByAccount.values()) total += account[flow];
  return total;
}

/** A card's payments and interest over the basis window. */
function cardHistory(
  ledger: CashFlowLedger,
  accountId: string,
  basisStart: CalendarDate | null,
  basisEndExclusive: CalendarDate
): CardHistory {
  const inBasis = (date: CalendarDate) => basisStart !== null && date >= basisStart && date < basisEndExclusive;
  const history: CardHistory = {
    paymentsReceived: 0,
    paymentCount: 0,
    pairedPaymentCount: 0,
    interestCharged: 0,
    basisDays: basisStart ? daysBetween(basisStart, basisEndExclusive) : 0,
    lastPaymentDate: null,
  };
  for (const movement of ledger.movements) {
    if (movement.accountId !== accountId || !movement.cardPayment || movement.amount <= 0) continue;
    if (movement.date < basisEndExclusive && (!history.lastPaymentDate || movement.date > history.lastPaymentDate)) {
      history.lastPaymentDate = movement.date;
    }
    if (!inBasis(movement.date)) continue;
    history.paymentsReceived += movement.amount;
    history.paymentCount += 1;
    if (movement.pairedWith) history.pairedPaymentCount += 1;
  }
  for (const entry of ledger.entries) {
    if (entry.accountId === accountId && entry.interest && inBasis(entry.date)) history.interestCharged += entry.amount;
  }
  return history;
}

export function buildCashFlowModel(input: CashFlowModelInput): CashFlowModel {
  const ledger = buildCashFlowLedger(input.transactions, input.accounts, input.reportingCurrency);
  const forecastStart = addDays(input.dataThrough, 1);
  const forecastEndLimit = addMonths(forecastStart, FORECAST_MAX_MONTHS);
  const coverageStart = ledger.coverageStart && ledger.coverageStart <= input.dataThrough
    ? ledger.coverageStart
    : null;
  const observed = ledger.entries.filter(entry => entry.date <= input.dataThrough);

  const monthlyIncomeOverride = positiveOverride(input.overrides?.monthlyIncome);
  const monthlyExpenseOverride = positiveOverride(input.overrides?.monthlyExpense);
  const incomeSource: FlowSource = monthlyIncomeOverride !== null ? 'override' : 'transactions';
  const spendingSource: FlowSource = monthlyExpenseOverride !== null ? 'override' : 'transactions';

  const basisStart = coverageStart
    ? maxDate(coverageStart, addDays(forecastStart, -TYPICAL_BASIS_DAYS))
    : null;
  const basisDays = basisStart ? daysBetween(basisStart, forecastStart) : 0;

  // Every reason below is about history. Overrides on both sides say what the
  // month looks like, so the forecast needs none: accounts, coverage and basis
  // only matter for a side that is read from transactions.
  const needsHistory = incomeSource === 'transactions' || spendingSource === 'transactions';
  let reason: ForecastUnavailableReason | null = null;
  if (needsHistory) {
    if (ledger.accounts.length === 0) reason = 'no_accounts';
    else if (!coverageStart) reason = 'no_history';
    else if (basisDays < MIN_FORECAST_HISTORY_DAYS) reason = 'insufficient_history';
  }

  // Cards first: a card whose interest the model can project from its APR and
  // pace has that interest taken out of the history the forecast learns from,
  // so it is counted once, as the projection.
  const rawAccounts = new Map<string, any>();
  for (const account of input.accounts) {
    const id = typeof account?.account_id === 'string' ? account.account_id : account?.id;
    if (typeof id === 'string') rawAccounts.set(id, account);
  }
  const cardSetups = ledger.accounts
    .filter(account => account.kind === 'credit')
    .map(account => {
      const history = cardHistory(ledger, account.id, basisStart, forecastStart);
      const terms = cardTermsFromAccount(rawAccounts.get(account.id), history.lastPaymentDate);
      const baseline = cardBaseline(terms, history);
      const plans = input.plannedEvents.filter(
        event => event.kind === 'card_payment' && event.accountId === account.id
      );
      // Interest is modelled only from a usual pace. A card projected from a
      // monthly plan alone keeps its past interest in what the savings forecast
      // learns: with no usual pace there is no plan-free projection to carry
      // that interest, and the forecast without plans must not lose it.
      const modelsInterest = !reason && terms.apr !== null && terms.balance !== null && baseline.behavior !== 'unknown';
      // projectCard posts APR interest whenever it can project the card (with
      // the user's plans, which the cash position runs on) and the APR is
      // known, including from a monthly plan alone. Only then is learned
      // interest safe to take off what the card is charged, or out of an
      // override; otherwise it would vanish with no APR posting to replace it.
      // The same check projectCard makes, so the two cannot disagree.
      const postsAprInterest = !reason && terms.apr !== null
        && canProjectCard({ terms, baseline, plans, forecastStart, forecastEndLimit });
      return { account, history, terms, baseline, plans, modelsInterest, postsAprInterest };
    });
  // What the user left out of the forecast. Only what the forecast learns from
  // leaves it out; the history the report shows still has it.
  const adjustments = input.adjustments ?? [];
  const adjustmentSets = forecastAdjustmentSets(adjustments);
  const counted = observed.filter(entry =>
    !(entry.counterpartyKey && adjustmentSets.excludedPayees.has(payeeKey(entry.flow, entry.counterpartyKey))));
  const modeledInterestCards = new Set(cardSetups.filter(card => card.modelsInterest).map(card => card.account.id));
  const entries = counted.filter(entry => !(entry.interest && modeledInterestCards.has(entry.accountId)));
  // Streams learned from interest charges (kept when modelsInterest is false)
  // must still be identifiable so a projected APR card does not also treat
  // them as purchases on top of interestPostings.
  const interestEntryIds = new Set(observed.filter(entry => entry.interest).map(entry => entry.id));

  const learned = learnFlows(entries, input.dataThrough, basisStart, forecastStart, adjustmentSets.includedOneOffs);
  // A stopped stream the user kept is projected on its cadence like an active one.
  const continuedStreamIds = new Set<string>();
  const streams = learned.streams.map(stream => {
    if (stream.status !== 'lapsed' || !adjustmentSets.continuedStreams.has(payeeKey(stream.flow, stream.counterpartyKey))) return stream;
    continuedStreamIds.add(stream.id);
    return { ...stream, status: 'active' as const };
  });
  let dailyIncome = sumDaily(learned.dailyByAccount, 'income');
  let dailySpending = sumDaily(learned.dailyByAccount, 'spending');
  const cardDailySpending = new Map<string, number>();
  for (const card of cardSetups) {
    cardDailySpending.set(card.account.id, learned.dailyByAccount.get(card.account.id)?.spending ?? 0);
  }
  // The part of each card's typical spending that is interest charges. A card
  // whose projection posts interest from its APR is not charged it again.
  let typicalInterestDaily = learned.interestDailyByAccount;
  if (monthlyIncomeOverride !== null) dailyIncome = monthlyIncomeOverride / DAYS_PER_MONTH;
  if (monthlyExpenseOverride !== null) {
    // An override says how much is spent in all, card interest included, but
    // not where. The interest the history charged on cards that post APR
    // interest comes out first, at the rate it was charged, because their
    // projections post interest of their own; the rest is spread across the
    // cards in the proportion the history spent on them. Each of those cards
    // keeps its interest in what lands on it, so none of it is counted as
    // cash spending. Interest on cards that are not projected stays in the
    // spread — stripping it would drop it with nothing to replace it.
    dailySpending = monthlyExpenseOverride / DAYS_PER_MONTH;
    const inBasis = (entry: CashFlowEntry) => entry.flow === 'spending' && basisStart !== null && basisDays > 0
      && entry.date >= basisStart && entry.date < forecastStart;
    const aprInterestCards = new Set(cardSetups.filter(card => card.postsAprInterest).map(card => card.account.id));
    const isReplacedInterest = (entry: CashFlowEntry) => Boolean(entry.interest) && aprInterestCards.has(entry.accountId);
    const interestByCard = new Map<string, number>();
    for (const entry of counted) {
      if (inBasis(entry) && isReplacedInterest(entry)) {
        interestByCard.set(entry.accountId, (interestByCard.get(entry.accountId) ?? 0) + entry.amount / basisDays);
      }
    }
    // Never more interest than the override itself.
    const historicalInterest = [...interestByCard.values()].reduce((sum, daily) => sum + daily, 0);
    const scale = historicalInterest > dailySpending ? dailySpending / historicalInterest : 1;
    typicalInterestDaily = new Map([...interestByCard].map(([accountId, daily]) => [accountId, daily * scale]));
    const spread = dailySpending - historicalInterest * scale;
    const basisSpending = counted.filter(entry => inBasis(entry) && !isReplacedInterest(entry));
    const total = basisSpending.reduce((sum, entry) => sum + entry.amount, 0);
    for (const card of cardSetups) {
      const onCard = basisSpending.filter(entry => entry.accountId === card.account.id).reduce((sum, entry) => sum + entry.amount, 0);
      cardDailySpending.set(
        card.account.id,
        (total > 0 ? spread * Math.max(0, onCard / total) : 0) + (typicalInterestDaily.get(card.account.id) ?? 0)
      );
    }
  }

  const scheduled = reason
    ? []
    : streams
      .filter(stream => (stream.flow === 'income' ? incomeSource : spendingSource) === 'transactions')
      .flatMap(stream => scheduleStream(stream, forecastStart, forecastEndLimit)
        .map(occurrence => ({
          streamId: stream.id,
          flow: stream.flow,
          accountId: stream.accountId,
          interest: stream.entryIds.some(id => interestEntryIds.has(id)),
          ...occurrence,
        })));

  const cards: CardModel[] = cardSetups.map(card => {
    // projectCard posts APR interest itself, so a card that will be projected
    // with an APR is charged without the interest its history learned: as a
    // stream or inside the typical rate. A card that is not projected keeps
    // those charges; stripping them would drop them with no APR posting.
    const learnedInterestDaily = card.postsAprInterest ? typicalInterestDaily.get(card.account.id) ?? 0 : 0;
    const purchases: CardPurchases = {
      dailyRate: Math.max(0, (cardDailySpending.get(card.account.id) ?? 0) - learnedInterestDaily),
      dated: scheduled
        .filter(item => item.flow === 'spending' && item.accountId === card.account.id && !(card.postsAprInterest && item.interest))
        .map(item => ({ date: item.date, amount: item.amount })),
    };
    const projectWith = (cardPlans: PlannedCashFlowEvent[]) => reason ? null : projectCard({
      terms: card.terms,
      baseline: card.baseline,
      purchases,
      plans: cardPlans,
      forecastStart,
      forecastEndLimit,
    });
    const currentPace = projectWith([]);
    return {
      account: card.account,
      terms: card.terms,
      history: card.history,
      baseline: card.baseline,
      paymentSource: card.history.paymentCount === 0 || card.history.pairedPaymentCount * 2 >= card.history.paymentCount
        ? 'connected'
        : 'other',
      plans: card.plans,
      currentPace,
      projection: card.plans.length > 0 ? projectWith(card.plans) : currentPace,
      purchases,
      modelsInterest: card.modelsInterest,
    };
  });

  // Transfers on cash accounts, learned like spending. A card payment matched
  // to a projected card is the card's own payment and is left to the card.
  const cashIds = new Set(ledger.accounts.filter(account => account.kind === 'cash').map(account => account.id));
  const projectedCards = new Set(cards.filter(card => card.projection && card.paymentSource === 'connected').map(card => card.account.id));
  const pairedToProjectedCard = new Set(
    ledger.movements
      .filter(movement => movement.cardPayment && movement.pairedWith && projectedCards.has(movement.accountId))
      .map(movement => movement.pairedWith as string)
  );
  const transferEntries: CashFlowEntry[] = ledger.movements
    .filter(movement => cashIds.has(movement.accountId) && movement.date <= input.dataThrough && !pairedToProjectedCard.has(movement.id))
    .map((movement): CashFlowEntry => ({
      id: movement.id,
      accountId: movement.accountId,
      date: movement.date,
      flow: movement.amount > 0 ? 'income' : 'spending',
      amount: Math.abs(movement.amount),
      counterpartyKey: movement.counterpartyKey,
      label: movement.label,
      category: 'Transfer',
    }))
    .filter(entry => !(entry.counterpartyKey && adjustmentSets.excludedTransfers.has(payeeKey(entry.flow, entry.counterpartyKey))));
  const learnedTransfers = learnFlows(transferEntries, input.dataThrough, basisStart, forecastStart);
  const transfers: TransferModel = {
    streams: learnedTransfers.streams,
    scheduled: reason
      ? []
      : learnedTransfers.streams.flatMap(stream => scheduleStream(stream, forecastStart, forecastEndLimit)
        .map(occurrence => ({
          streamId: stream.id,
          date: occurrence.date,
          amount: stream.flow === 'income' ? occurrence.amount : -occurrence.amount,
        }))),
    dailyNet: sumDaily(learnedTransfers.dailyByAccount, 'income') - sumDaily(learnedTransfers.dailyByAccount, 'spending'),
    oneOffs: learnedTransfers.oneOffs,
  };

  return {
    ledger,
    streams,
    plannedEvents: input.plannedEvents,
    today: input.today,
    dataThrough: input.dataThrough,
    forecastStart,
    forecastEndLimit,
    coverageStart,
    forecast: reason ? { available: false, reason } : { available: true },
    typical: {
      basisStart,
      basisDays,
      dailyIncome,
      dailySpending,
      incomeSource,
      spendingSource,
      monthlyIncomeOverride,
      monthlyExpenseOverride,
    },
    oneOffs: learned.oneOffs.sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount)),
    typicalPayees: learned.typicalPayees.filter(payee => (payee.flow === 'income' ? incomeSource : spendingSource) === 'transactions'),
    oneOffThresholds: learned.oneOffThresholds,
    adjustments,
    continuedStreamIds,
    scheduled,
    cardDailySpending,
    cards,
    transfers,
  };
}

/** Observed income and spending in `[start, endExclusive)`, limited to covered, observed days. */
export function actualTotals(
  model: CashFlowModel,
  start: CalendarDate,
  endExclusive: CalendarDate
): CashFlowTotals | null {
  if (!model.coverageStart) return null;
  const from = maxDate(start, model.coverageStart);
  const to = minDate(endExclusive, model.forecastStart);
  if (from >= to) return null;
  let income = 0;
  let spending = 0;
  for (const entry of model.ledger.entries) {
    if (entry.date < from || entry.date >= to) continue;
    if (entry.flow === 'income') income += entry.amount;
    else spending += entry.amount;
  }
  return totals(income, spending);
}

/** How much of `[start, endExclusive)` before the forecast is covered by history. */
export function actualCoverage(
  model: CashFlowModel,
  start: CalendarDate,
  endExclusive: CalendarDate
): 'full' | 'partial' | 'none' {
  const observedEnd = minDate(endExclusive, model.forecastStart);
  if (!model.coverageStart || model.coverageStart >= observedEnd) return 'none';
  return model.coverageStart <= start ? 'full' : 'partial';
}

function plannedTotals(model: CashFlowModel, from: CalendarDate, to: CalendarDate): { income: number; spending: number } {
  let income = 0;
  let spending = 0;
  for (const event of model.plannedEvents) {
    // A card payment is a transfer between the user's accounts; its effect
    // reaches savings only through the card interest it changes.
    if (event.kind === 'card_payment') continue;
    const count = expandPlannedEvent(event, from, to).length;
    if (event.kind === 'income') income += count * event.amount;
    else spending += count * event.amount;
  }
  return { income, spending };
}

/** Interest the card model posts in `[from, to)`, with or without the user's plans. */
function cardInterestTotal(model: CashFlowModel, from: CalendarDate, to: CalendarDate, includePlans: boolean): number {
  let interest = 0;
  for (const card of model.cards) {
    if (!card.modelsInterest) continue;
    const projection = includePlans ? card.projection : card.currentPace;
    for (const posting of projection?.interestPostings ?? []) {
      if (posting.date >= from && posting.date < to) interest += posting.amount;
    }
  }
  return interest;
}

export interface ForecastOptions {
  /**
   * Leave the user's planned events out: no planned income or spending, and
   * every card at its usual pace. Default true.
   */
  includePlans?: boolean;
}

/** Forecast for the part of `[start, endExclusive)` that lies in the forecast window. */
export function forecastTotals(
  model: CashFlowModel,
  start: CalendarDate,
  endExclusive: CalendarDate,
  options: ForecastOptions = {}
): ForecastTotals | null {
  if (!model.forecast.available) return null;
  const includePlans = options.includePlans ?? true;
  const from = maxDate(start, model.forecastStart);
  const to = minDate(endExclusive, model.forecastEndLimit);
  if (from >= to) return null;

  let recurringIncome = 0;
  let recurringSpending = 0;
  for (const occurrence of model.scheduled) {
    if (occurrence.date < from || occurrence.date >= to) continue;
    if (occurrence.flow === 'income') recurringIncome += occurrence.amount;
    else recurringSpending += occurrence.amount;
  }
  const days = daysBetween(from, to);
  const typicalIncome = model.typical.dailyIncome * days;
  const typicalSpending = model.typical.dailySpending * days;
  const planned = includePlans ? plannedTotals(model, from, to) : { income: 0, spending: 0 };
  // A Finances spending override already replaces all spending, including
  // interest. Projected card interest must not be stacked on top of it.
  const cardInterest = model.typical.spendingSource === 'override'
    ? 0
    : cardInterestTotal(model, from, to, includePlans);

  const components: ForecastComponents = {
    recurringIncome: roundCents(recurringIncome),
    typicalIncome: roundCents(typicalIncome),
    plannedIncome: roundCents(planned.income),
    recurringSpending: roundCents(recurringSpending),
    typicalSpending: roundCents(typicalSpending),
    plannedSpending: roundCents(planned.spending),
    cardInterest: roundCents(cardInterest),
  };
  return {
    ...totals(
      components.recurringIncome + components.typicalIncome + components.plannedIncome,
      components.recurringSpending + components.typicalSpending + components.plannedSpending + components.cardInterest
    ),
    components,
  };
}


export interface CashFlowPeriod {
  key: string;
  start: CalendarDate;
  endExclusive: CalendarDate;
  clipped: boolean;
  phase: 'past' | 'current' | 'future';
  /** How much of the period's observed part has history behind it. */
  coverage: 'full' | 'partial' | 'none';
  actual: CashFlowTotals | null;
  forecast: ForecastTotals | null;
  total: CashFlowTotals | null;
}

function combine(actual: CashFlowTotals | null, forecast: CashFlowTotals | null): CashFlowTotals | null {
  if (actual && forecast) return addTotals(actual, forecast);
  // Rebuild rather than pass through, so a forecast's breakdown never rides along.
  const only = actual ?? forecast;
  return only ? totals(only.income, only.spending) : null;
}

export function buildPeriod(
  model: CashFlowModel,
  bounds: { key: string; start: CalendarDate; endExclusive: CalendarDate; clipped: boolean }
): CashFlowPeriod {
  const phase = bounds.endExclusive <= model.forecastStart
    ? 'past'
    : bounds.start >= model.forecastStart ? 'future' : 'current';
  const actual = phase === 'future' ? null : actualTotals(model, bounds.start, bounds.endExclusive);
  const forecast = phase === 'past' ? null : forecastTotals(model, bounds.start, bounds.endExclusive);
  return {
    ...bounds,
    phase,
    coverage: phase === 'future' ? 'none' : actualCoverage(model, bounds.start, bounds.endExclusive),
    actual,
    forecast,
    total: combine(actual, forecast),
  };
}

export const CASH_FLOW_HIGHLIGHT_KEYS = [
  'this_month',
  'next_month',
  'this_quarter',
  'next_quarter',
  'this_year',
  'next_3_months',
  'next_6_months',
  'next_12_months',
] as const;
export type CashFlowHighlightKey = (typeof CASH_FLOW_HIGHLIGHT_KEYS)[number];

export interface CashFlowHighlight {
  key: CashFlowHighlightKey;
  start: CalendarDate;
  endExclusive: CalendarDate;
  /** Observed so far; null for windows that start in the future. */
  actualToDate: CashFlowTotals | null;
  actualCoverage: 'full' | 'partial' | 'none' | null;
  /** Forecast for the rest of the window. */
  remaining: ForecastTotals | null;
  /**
   * Observed plus forecast, when both halves are whole: null when history
   * does not reach the window's start or the forecast is unavailable.
   */
  projected: CashFlowTotals | null;
  /** What the user's plans change inside the forecast part, card interest included. */
  planned: CashFlowTotals;
  /** `projected` without the planned events; null whenever `projected` is. */
  projectedWithoutPlanned: CashFlowTotals | null;
}

function highlightWindows(model: CashFlowModel): Array<{ key: CashFlowHighlightKey; start: CalendarDate; endExclusive: CalendarDate }> {
  const monthStart = startOfMonth(model.today);
  const quarterStart = periodStart(model.today, 'quarter');
  const yearStart = periodStart(model.today, 'year');
  const nextQuarterStart = nextPeriodStart(quarterStart, 'quarter');
  return [
    { key: 'this_month', start: monthStart, endExclusive: addMonths(monthStart, 1, 1) },
    { key: 'next_month', start: addMonths(monthStart, 1, 1), endExclusive: addMonths(monthStart, 2, 1) },
    { key: 'this_quarter', start: quarterStart, endExclusive: nextQuarterStart },
    { key: 'next_quarter', start: nextQuarterStart, endExclusive: nextPeriodStart(nextQuarterStart, 'quarter') },
    { key: 'this_year', start: yearStart, endExclusive: nextPeriodStart(yearStart, 'year') },
    { key: 'next_3_months', start: model.forecastStart, endExclusive: addMonths(model.forecastStart, 3) },
    { key: 'next_6_months', start: model.forecastStart, endExclusive: addMonths(model.forecastStart, 6) },
    { key: 'next_12_months', start: model.forecastStart, endExclusive: addMonths(model.forecastStart, 12) },
  ];
}

export function buildCashFlowHighlights(model: CashFlowModel): CashFlowHighlight[] {
  return highlightWindows(model).map(({ key, start, endExclusive }) => {
    const startsObserved = start < model.forecastStart;
    const coverage = startsObserved ? actualCoverage(model, start, endExclusive) : null;
    // With no history behind the observed part, what happened is unknown, not
    // zero: no "so far" figure exists to report, or to publish as a fact.
    const actualToDate = startsObserved && coverage !== 'none'
      ? actualTotals(model, start, endExclusive)
      : null;
    const remaining = forecastTotals(model, start, endExclusive);
    // Without the plans: no planned income or spending, every card at its usual
    // pace. The difference is everything the plans change, card interest included.
    const remainingWithoutPlans = forecastTotals(model, start, endExclusive, { includePlans: false });
    const wholeHistory = !startsObserved || coverage === 'full';
    const projected = remaining && wholeHistory ? combine(actualToDate, remaining) : null;
    const planned = remaining && remainingWithoutPlans
      ? totals(remaining.income - remainingWithoutPlans.income, remaining.spending - remainingWithoutPlans.spending)
      : totals(0, 0);
    return {
      key,
      start,
      endExclusive,
      actualToDate,
      actualCoverage: coverage,
      remaining,
      projected,
      planned,
      projectedWithoutPlanned: projected && remainingWithoutPlans ? combine(actualToDate, remainingWithoutPlans) : null,
    };
  });
}

export interface CashFlowReportRequest {
  granularity: CashFlowGranularity;
  /** Months after the current one to forecast; the last period is completed. */
  horizonMonths: number;
  /** Optional custom range, inclusive on both ends. */
  from?: CalendarDate;
  to?: CalendarDate;
}

export interface CashFlowRecurringSummary {
  id: string;
  /** The ledger's key for the payee, which an adjustment names it by. */
  payeeKey: string;
  label: string;
  flow: CashFlowDirection;
  cadence: RecurringCadence;
  amount: number;
  monthlyAmount: number;
  occurrences: number;
  lastDate: CalendarDate;
  nextDate: CalendarDate | null;
  status: 'active' | 'lapsed';
  category: string;
  /** The user's monthly override replaces this side of the forecast. */
  replacedByOverride: boolean;
  /** It had stopped, and is projected because the user kept it. */
  continuedByUser: boolean;
}

/** A payee behind a typical rate, and what it adds to it a month. */
export interface CashFlowTypicalPayeeSummary {
  flow: CashFlowDirection;
  payeeKey: string;
  label: string;
  monthlyAmount: number;
}

export interface CashFlowAdjustmentSummary extends ForecastAdjustment {
  /** For a counted one-off: when it happened and how much it was; otherwise null. */
  date: CalendarDate | null;
  amount: number | null;
  /** The payee the change is about: its key, or a counted one-off's payee; null if that transaction is gone. */
  payeeKey: string | null;
}

/** The report lists at most this many typical payees in each direction. */
const TYPICAL_PAYEES_LISTED = 25;

export interface CashFlowPlannedEventSummary extends PlannedCashFlowEvent {
  nextDate: CalendarDate | null;
  occurrencesInRange: number;
}

export interface CashFlowReport {
  version: number;
  currency: string;
  today: CalendarDate;
  dataThrough: CalendarDate;
  forecastStart: CalendarDate;
  granularity: CashFlowGranularity;
  range: { from: CalendarDate; toExclusive: CalendarDate };
  coverageStart: CalendarDate | null;
  forecast: CashFlowModel['forecast'];
  periods: CashFlowPeriod[];
  totals: {
    /** How much of the range's observed part has history; `partial` withholds the totals. */
    coverage: 'full' | 'partial' | 'none';
    actual: CashFlowTotals | null;
    forecast: CashFlowTotals | null;
    total: CashFlowTotals | null;
  };
  highlights: CashFlowHighlight[];
  baseline: {
    typicalBasisStart: CalendarDate | null;
    typicalBasisDays: number;
    typicalMonthlyIncome: number;
    typicalMonthlySpending: number;
    incomeSource: FlowSource;
    spendingSource: FlowSource;
    monthlyIncomeOverride: number | null;
    monthlyExpenseOverride: number | null;
  };
  recurring: CashFlowRecurringSummary[];
  /** Every one-off in the basis, largest first, so each can be counted. */
  oneOffs: Array<{ id: string; date: CalendarDate; label: string; flow: CashFlowDirection; amount: number }>;
  /** How large a non-repeating amount must be to be a one-off, by direction; null without a basis. */
  oneOffThresholds: Record<CashFlowDirection, number> | null;
  /** Largest first, for the sides read from transactions. */
  typicalPayees: CashFlowTypicalPayeeSummary[];
  /** The user's choices about what the forecast counts. */
  adjustments: CashFlowAdjustmentSummary[];
  plannedEvents: CashFlowPlannedEventSummary[];
  accounts: CashFlowAccount[];
  excluded: CashFlowLedger['excluded'];
  cards: CashFlowCardSummary[];
  position: CashFlowPositionSummary;
}

/** What a card does over the projection at one pace. */
export interface CardOutcome {
  /** The month from which no balance is carried for the rest of the projection; null if it never stops. */
  paidOffBy: string | null;
  carryingBalanceNow: boolean;
  /** Null when the card's APR is unknown. */
  interestTwelveMonths: number | null;
  interestTotal: number | null;
  /** What the card owes at the end of the twelfth month. */
  balanceInTwelveMonths: number | null;
  months: Array<{ month: string; payment: number; interest: number | null; endBalance: number }>;
}

export interface CashFlowCardSummary {
  accountId: string;
  name: string;
  mask: string | null;
  institution: string | null;
  balance: number | null;
  apr: number | null;
  minimumPayment: number | null;
  paymentDay: number;
  behavior: CardBaseline['behavior'];
  usualMonthlyPayment: number | null;
  paymentSource: 'connected' | 'other';
  currentPace: CardOutcome | null;
  /** Null when no plan pays this card. */
  withPlans: CardOutcome | null;
  /** The usual pace's interest less the plans'; null without plans or an APR. */
  interestSaved: { twelveMonths: number; total: number } | null;
  planIds: string[];
}

export interface CashFlowPositionSummary {
  available: boolean;
  reason?: CashPositionUnavailableReason;
  startingCash: number | null;
  startingCardDebt: number | null;
  /** In step with `periods`: balances at each period's end; null for a period over before the forecast. */
  periods: Array<{ key: string; cash: number | null; cardDebt: number | null }>;
  /** The lowest end-of-day cash within the range's forecast part. */
  lowPoint: { date: CalendarDate; cash: number } | null;
  milestones: Array<{ key: string; date: CalendarDate; cash: number; cardDebt: number }>;
  lowNext12Months: { date: CalendarDate; cash: number } | null;
  transfers: {
    typicalMonthlyNet: number;
    recurring: Array<{
      id: string;
      payeeKey: string;
      label: string;
      cadence: RecurringCadence;
      amount: number;
      direction: 'in' | 'out';
      nextDate: CalendarDate | null;
    }>;
  };
  cardsLeftOut: Array<{ accountId: string; name: string; reason: 'no_balance' | 'no_pace' }>;
}

function cardOutcome(projection: CardProjection | null): CardOutcome | null {
  if (!projection) return null;
  return {
    paidOffBy: projection.paidOffBy,
    carryingBalanceNow: projection.carryingBalanceNow,
    interestTwelveMonths: projection.interestTwelveMonths,
    interestTotal: projection.interestTotal,
    balanceInTwelveMonths: projection.months[11]?.endBalance ?? projection.months[projection.months.length - 1]?.endBalance ?? null,
    months: projection.months.map(month => ({
      month: month.month,
      payment: month.payment,
      interest: month.interest,
      endBalance: month.endBalance,
    })),
  };
}

export function summarizeCards(model: CashFlowModel): CashFlowCardSummary[] {
  return model.cards.map(cardSummary);
}

function cardSummary(card: CardModel): CashFlowCardSummary {
  const hasPlans = card.plans.length > 0;
  const current = card.currentPace;
  const planned = hasPlans ? card.projection : null;
  // "Now" is today's state whatever the plans: a plan that clears the card this
  // month still starts from a carried balance. With no usual pace to say
  // otherwise, a card that owes anything is carrying it.
  const withPlans = cardOutcome(planned);
  if (withPlans) withPlans.carryingBalanceNow = current ? current.carryingBalanceNow : (card.terms.balance ?? 0) > 0;
  const saved = current && planned && current.interestTwelveMonths !== null && planned.interestTwelveMonths !== null
    && current.interestTotal !== null && planned.interestTotal !== null
    ? {
        twelveMonths: roundCents(current.interestTwelveMonths - planned.interestTwelveMonths),
        total: roundCents(current.interestTotal - planned.interestTotal),
      }
    : null;
  return {
    accountId: card.account.id,
    name: card.terms.name,
    mask: card.terms.mask,
    institution: card.terms.institution,
    balance: card.terms.balance,
    apr: card.terms.apr,
    minimumPayment: card.terms.minimumPayment,
    paymentDay: card.terms.paymentDay,
    behavior: card.baseline.behavior,
    usualMonthlyPayment: card.baseline.monthlyPayment,
    paymentSource: card.paymentSource,
    currentPace: cardOutcome(current),
    withPlans,
    interestSaved: saved,
    planIds: card.plans.map(plan => plan.id),
  };
}

function positionSummary(model: CashFlowModel, range: { from: CalendarDate; toExclusive: CalendarDate }, periods: readonly CashFlowPeriod[]): CashFlowPositionSummary {
  const position = buildCashPosition(model);
  const nextDates = new Map<string, CalendarDate>();
  for (const item of model.transfers.scheduled) {
    const existing = nextDates.get(item.streamId);
    if (!existing || item.date < existing) nextDates.set(item.streamId, item.date);
  }
  const transfers = {
    typicalMonthlyNet: roundCents(model.transfers.dailyNet * DAYS_PER_MONTH),
    recurring: model.transfers.streams
      .filter(stream => stream.status === 'active')
      .map(stream => ({
        id: stream.id,
        payeeKey: stream.counterpartyKey,
        label: stream.label,
        cadence: stream.cadence,
        amount: roundCents(stream.amount),
        direction: stream.flow === 'income' ? 'in' as const : 'out' as const,
        nextDate: nextDates.get(stream.id) ?? null,
      })),
  };
  if (!position.available) {
    return {
      available: false,
      reason: position.reason,
      startingCash: null,
      startingCardDebt: null,
      periods: periods.map(period => ({ key: period.key, cash: null, cardDebt: null })),
      lowPoint: null,
      milestones: [],
      lowNext12Months: null,
      transfers,
      cardsLeftOut: [],
    };
  }
  const milestones = cashMilestones(model, position);
  return {
    available: true,
    startingCash: position.startingCash,
    startingCardDebt: position.startingCardDebt,
    periods: periods.map(period => period.endExclusive <= model.forecastStart
      ? { key: period.key, cash: null, cardDebt: null }
      : { key: period.key, cash: position.cashBefore(period.endExclusive), cardDebt: position.cardDebtBefore(period.endExclusive) }),
    lowPoint: position.lowPoint(maxDate(range.from, model.forecastStart), range.toExclusive),
    milestones: milestones.points,
    lowNext12Months: milestones.lowNext12Months,
    transfers,
    cardsLeftOut: position.cardsLeftOut,
  };
}

const DEFAULT_LOOKBACK_MONTHS: Record<CashFlowGranularity, number> = {
  week: 3,
  month: 12,
  quarter: 12,
  year: 24,
};

/**
 * The default range: recent history through the requested horizon, on period
 * boundaries -- except that it never starts before the history does. Rounding
 * the first day back to its period boundary would count the days before the
 * connection's history as days with no activity; the first period is clipped
 * to the history instead.
 */
export function defaultReportRange(
  model: CashFlowModel,
  granularity: CashFlowGranularity,
  horizonMonths: number
): { from: CalendarDate; toExclusive: CalendarDate } {
  const lookbackStart = addMonths(model.today, -DEFAULT_LOOKBACK_MONTHS[granularity]);
  const historyStart = model.coverageStart ? maxDate(model.coverageStart, lookbackStart) : model.forecastStart;
  const horizonEnd = minDate(
    addMonths(startOfMonth(model.forecastStart), horizonMonths + 1, 1),
    model.forecastEndLimit
  );
  // Finish the period the horizon lands in, so the last bar is never a stub.
  const toExclusive = minDate(periodEndExclusive(addDays(horizonEnd, -1), granularity), model.forecastEndLimit);
  const firstPeriod = periodStart(minDate(historyStart, model.forecastStart), granularity);
  // Clip to where known days begin: the history's first day or, with no
  // history (a forecast built only on overrides), the forecast's first day.
  // Clipping to the lookback instead would cut a period the history covers
  // in full, turning the first bar into a stub on most days of the month.
  const knownFrom = minDate(model.coverageStart ?? model.forecastStart, model.forecastStart);
  const from = maxDate(firstPeriod, knownFrom);
  return { from, toExclusive };
}

/**
 * A custom range, as asked for, within the forecast limit. With history, days
 * before it stay in the range as unknown and totals.coverage reports 'partial'.
 * With no history at all -- a forecast built only on overrides -- a range that
 * reaches into the forecast is clipped to its first day, as the default range
 * is, so a mid-month stub is never labelled as a whole calendar period. A range
 * entirely before the forecast keeps its dates and shows no history. The end
 * is never before the start.
 */
function customReportRange(
  model: CashFlowModel,
  from: CalendarDate,
  to: CalendarDate
): { from: CalendarDate; toExclusive: CalendarDate } {
  const toExclusive = minDate(addDays(to, 1), model.forecastEndLimit);
  const reachesForecast = toExclusive > model.forecastStart;
  const start = !model.coverageStart && reachesForecast ? maxDate(from, model.forecastStart) : from;
  return { from: start, toExclusive: maxDate(toExclusive, start) };
}

function summarizeAdjustments(model: CashFlowModel): CashFlowAdjustmentSummary[] {
  const entries = new Map(model.ledger.entries.map(entry => [entry.id, entry]));
  return model.adjustments.map(adjustment => {
    if (adjustment.kind !== 'include_one_off') return { ...adjustment, date: null, amount: null, payeeKey: adjustment.key };
    const entry = entries.get(adjustment.key);
    return {
      ...adjustment,
      date: entry?.date ?? null,
      amount: entry ? roundCents(entry.amount) : null,
      payeeKey: entry?.counterpartyKey || null,
    };
  });
}

/**
 * The item an adjustment would change, if the user's data has it: a payee
 * with history in that direction, a current one-off, a stopped stream, or a
 * payee with transfers in or out of a cash account. Its label is what the
 * adjustment is stored under, so the server names the item, not the client.
 */
export function forecastAdjustmentTarget(model: CashFlowModel, input: ForecastAdjustmentInput): { label: string } | null {
  const latestLabel = (items: ReadonlyArray<{ date: CalendarDate; label: string }>) =>
    items.reduce<{ date: CalendarDate; label: string } | null>((latest, item) => (!latest || item.date >= latest.date ? item : latest), null)?.label ?? null;
  const found = (label: string | null) => (label ? { label } : null);
  switch (input.kind) {
    case 'exclude_payee':
      return found(latestLabel(model.ledger.entries.filter(entry =>
        entry.date <= model.dataThrough && entry.flow === input.flow && entry.counterpartyKey === input.key)));
    case 'include_one_off':
      return found(model.oneOffs.find(entry => entry.id === input.key && entry.flow === input.flow)?.label ?? null);
    case 'continue_stream':
      return found(model.streams.find(stream =>
        stream.status === 'lapsed' && stream.flow === input.flow && stream.counterpartyKey === input.key)?.label ?? null);
    case 'exclude_transfer': {
      const cash = new Set(model.ledger.accounts.filter(account => account.kind === 'cash').map(account => account.id));
      return found(latestLabel(model.ledger.movements.filter(movement =>
        cash.has(movement.accountId) && movement.date <= model.dataThrough && movement.counterpartyKey === input.key
        && (movement.amount > 0 ? 'income' : 'spending') === input.flow)));
    }
  }
}

export function buildCashFlowReport(model: CashFlowModel, request: CashFlowReportRequest): CashFlowReport {
  const range = request.from && request.to
    ? customReportRange(model, request.from, request.to)
    : defaultReportRange(model, request.granularity, request.horizonMonths);
  const periods = enumeratePeriods(range.from, range.toExclusive, request.granularity)
    .map(bounds => buildPeriod(model, bounds));
  // A range that reaches back before the history cannot be totalled: the
  // uncovered days are unknown, so a sum would pass them off as zero.
  const coverage = actualCoverage(model, range.from, range.toExclusive);
  const actual = coverage === 'partial' ? null : actualTotals(model, range.from, range.toExclusive);
  const forecast = forecastTotals(model, range.from, range.toExclusive);

  const scheduledByStream = new Map<string, CalendarDate>();
  for (const occurrence of model.scheduled) {
    const existing = scheduledByStream.get(occurrence.streamId);
    if (!existing || occurrence.date < existing) scheduledByStream.set(occurrence.streamId, occurrence.date);
  }

  return {
    version: CASH_FLOW_ENGINE_VERSION,
    currency: 'USD',
    today: model.today,
    dataThrough: model.dataThrough,
    forecastStart: model.forecastStart,
    granularity: request.granularity,
    range,
    coverageStart: model.coverageStart,
    forecast: model.forecast,
    periods,
    totals: {
      coverage,
      actual,
      forecast: forecast ? totals(forecast.income, forecast.spending) : null,
      total: coverage === 'partial' ? null : combine(actual, forecast),
    },
    highlights: buildCashFlowHighlights(model),
    baseline: {
      typicalBasisStart: model.typical.basisStart,
      typicalBasisDays: model.typical.basisDays,
      typicalMonthlyIncome: roundCents(model.typical.dailyIncome * DAYS_PER_MONTH),
      typicalMonthlySpending: roundCents(model.typical.dailySpending * DAYS_PER_MONTH),
      incomeSource: model.typical.incomeSource,
      spendingSource: model.typical.spendingSource,
      monthlyIncomeOverride: model.typical.monthlyIncomeOverride,
      monthlyExpenseOverride: model.typical.monthlyExpenseOverride,
    },
    recurring: model.streams.map(stream => ({
      id: stream.id,
      payeeKey: stream.counterpartyKey,
      label: stream.label,
      flow: stream.flow,
      cadence: stream.cadence,
      amount: roundCents(stream.amount),
      monthlyAmount: roundCents(streamMonthlyAmount(stream)),
      occurrences: stream.occurrences,
      lastDate: stream.lastDate,
      nextDate: scheduledByStream.get(stream.id) ?? null,
      status: stream.status,
      category: stream.category,
      replacedByOverride: (stream.flow === 'income' ? model.typical.incomeSource : model.typical.spendingSource) === 'override',
      continuedByUser: model.continuedStreamIds.has(stream.id),
    })),
    oneOffs: model.oneOffs.map(entry => ({
      id: entry.id,
      date: entry.date,
      label: entry.label,
      flow: entry.flow,
      amount: roundCents(entry.amount),
    })),
    oneOffThresholds: model.oneOffThresholds && {
      income: roundCents(model.oneOffThresholds.income),
      spending: roundCents(model.oneOffThresholds.spending),
    },
    typicalPayees: (['income', 'spending'] as const).flatMap(flow => model.typicalPayees
      .filter(payee => payee.flow === flow)
      .slice(0, TYPICAL_PAYEES_LISTED)
      .map(payee => ({
        flow,
        payeeKey: payee.counterpartyKey,
        label: payee.label,
        monthlyAmount: roundCents(payee.daily * DAYS_PER_MONTH),
      }))),
    adjustments: summarizeAdjustments(model),
    plannedEvents: model.plannedEvents.map(event => {
      const upcoming = expandPlannedEvent(event, model.forecastStart, model.forecastEndLimit);
      return {
        ...event,
        nextDate: upcoming[0] ?? null,
        occurrencesInRange: expandPlannedEvent(
          event,
          maxDate(range.from, model.forecastStart),
          range.toExclusive
        ).length,
      };
    }),
    accounts: model.ledger.accounts,
    excluded: model.ledger.excluded,
    cards: summarizeCards(model),
    position: positionSummary(model, range, periods),
  };
}
