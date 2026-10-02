import {
  CASH_FLOW_HIGHLIGHT_KEYS,
  buildCashFlowHighlights,
  summarizeCards,
  type CardOutcome,
  type CashFlowHighlight,
  type CashFlowHighlightKey,
  type CashFlowModel,
  type CashFlowTotals,
  type ForecastUnavailableReason,
} from '../cash-flow/forecast';
import type { ForecastAdjustmentKind } from '../cash-flow/adjustments';
import { addDays } from '../cash-flow/calendar';
import type { CardPaymentBehavior } from '../cash-flow/cards';
import { buildCashPosition, cashMilestones } from '../cash-flow/position';
import { expandPlannedEvent } from '../cash-flow/planned-events';
import { streamMonthlyAmount } from '../cash-flow/recurring';
import type { CanonicalFact } from './canonical-facts';
import type { FinancialContextSnapshot } from './types';

/**
 * The `cash_flow_forecast` data pack: the same engine and the same figures the
 * Cash flow page shows, projected onto fixed windows a question can name.
 *
 * Grounding checks every number an answer states against the fact pack by
 * value, and the model may not add or net facts. So every figure an answer
 * could need is computed here -- observed so far, still expected, projected
 * total, and the same without the user's planned events -- and published as
 * its own fact. The pack's details carry dates, cadences and names, and point
 * at fact ids instead of repeating amounts.
 */
export type CashFlowForecastUnavailableReason = ForecastUnavailableReason | 'no_snapshot' | 'error';

export interface CashFlowForecastContext {
  status: 'available' | 'unavailable';
  reason?: CashFlowForecastUnavailableReason;
  today?: string;
  dataThrough?: string;
  forecastStart?: string;
  coverageStart?: string | null;
  highlights?: CashFlowHighlight[];
  baseline?: {
    typicalBasisDays: number;
    typicalMonthlyIncome: number;
    typicalMonthlySpending: number;
    incomeSource: 'transactions' | 'override';
    spendingSource: 'transactions' | 'override';
  };
  recurring?: Array<{
    id: string;
    label: string;
    flow: 'income' | 'spending';
    cadence: string;
    amount: number;
    monthlyAmount: number;
    nextDate: string | null;
  }>;
  plannedEvents?: Array<{
    id: string;
    label: string;
    kind: 'income' | 'expense' | 'card_payment';
    amount: number;
    startDate: string;
    recurrence: string;
    endDate: string | null;
    nextDate: string | null;
    /** For a card payment: the card it pays and how it is sized. */
    accountId?: string | null;
    paymentMode?: 'full' | 'fixed' | null;
  }>;
  oneOffs?: Array<{ label: string; date: string; flow: 'income' | 'spending'; amount: number }>;
  cards?: Array<{
    accountId: string;
    name: string;
    mask: string | null;
    balance: number | null;
    apr: number | null;
    behavior: CardPaymentBehavior;
    usualMonthlyPayment: number | null;
    paymentDay: number;
    paymentSource: 'connected' | 'other';
    currentPace: CardPace | null;
    withPlans: CardPace | null;
  }>;
  position?: {
    available: boolean;
    reason?: string;
    startingCash: number | null;
    startingCardDebt: number | null;
    milestones: Array<{ key: string; date: string; cash: number; cardDebt: number }>;
    lowNext12Months: { date: string; cash: number } | null;
    /** Whether any card's balance is projected; card debt figures cover only those cards. */
    projectsCards: boolean;
    cardsLeftOut: Array<{ name: string; mask: string | null; reason: 'no_balance' | 'no_pace' }>;
    /**
     * Each cash account on its own, when there is more than one: what it holds
     * now and at the same milestones, and its lowest point. The primary
     * account (where paychecks land) comes first, then the largest.
     */
    accounts?: Array<{
      name: string;
      mask: string | null;
      primary: boolean;
      startingCash: number;
      milestones: Array<{ key: string; date: string; cash: number }>;
      lowNext12Months: { date: string; cash: number } | null;
    }>;
    /** Cash accounts left out of `accounts` by the cap; the whole still includes them. */
    accountsNotListed?: number;
  };
  /** The user's choices about what the forecast counts; the figures already reflect them. */
  adjustments?: Array<{ kind: ForecastAdjustmentKind; flow: 'income' | 'spending'; label: string }>;
}

type CardPace = Pick<CardOutcome, 'paidOffBy' | 'carryingBalanceNow' | 'interestTwelveMonths' | 'balanceInTwelveMonths'>;

function pace(outcome: CardOutcome | null): CardPace | null {
  if (!outcome) return null;
  return {
    paidOffBy: outcome.paidOffBy,
    carryingBalanceNow: outcome.carryingBalanceNow,
    interestTwelveMonths: outcome.interestTwelveMonths,
    balanceInTwelveMonths: outcome.balanceInTwelveMonths,
  };
}

/** The pack names at most this many recurring items, largest monthly weight first. */
const MAX_RECURRING_ITEMS = 12;
const MAX_ONE_OFFS = 5;
const MAX_PLANNED_EVENTS = 25;
/** The pack covers at most this many cards. */
const MAX_CARDS = 6;
/** ...and at most this many cash accounts on their own. */
const MAX_CASH_ACCOUNTS = 4;
const DAYS_PER_MONTH = 365 / 12;

export function buildCashFlowForecastContext(model: CashFlowModel): CashFlowForecastContext {
  const scheduledNext = new Map<string, string>();
  for (const occurrence of model.scheduled) {
    const existing = scheduledNext.get(occurrence.streamId);
    if (!existing || occurrence.date < existing) scheduledNext.set(occurrence.streamId, occurrence.date);
  }
  const recurring = model.streams
    .filter(stream => scheduledNext.has(stream.id))
    .map(stream => ({
      id: stream.id,
      label: stream.label,
      flow: stream.flow,
      cadence: stream.cadence,
      amount: Math.round(stream.amount * 100) / 100,
      monthlyAmount: Math.round(streamMonthlyAmount(stream) * 100) / 100,
      nextDate: scheduledNext.get(stream.id) ?? null,
    }))
    .sort((left, right) => right.monthlyAmount - left.monthlyAmount)
    .slice(0, MAX_RECURRING_ITEMS);

  return {
    status: model.forecast.available ? 'available' : 'unavailable',
    ...(!model.forecast.available && { reason: model.forecast.reason }),
    today: model.today,
    dataThrough: model.dataThrough,
    forecastStart: model.forecastStart,
    coverageStart: model.coverageStart,
    highlights: buildCashFlowHighlights(model),
    baseline: {
      typicalBasisDays: model.typical.basisDays,
      typicalMonthlyIncome: Math.round(model.typical.dailyIncome * DAYS_PER_MONTH * 100) / 100,
      typicalMonthlySpending: Math.round(model.typical.dailySpending * DAYS_PER_MONTH * 100) / 100,
      incomeSource: model.typical.incomeSource,
      spendingSource: model.typical.spendingSource,
    },
    recurring,
    plannedEvents: model.plannedEvents.slice(0, MAX_PLANNED_EVENTS).map(event => ({
      id: event.id,
      label: event.label,
      kind: event.kind,
      amount: event.amount,
      startDate: event.startDate,
      recurrence: event.recurrence,
      endDate: event.endDate,
      nextDate: expandPlannedEvent(event, model.forecastStart, model.forecastEndLimit)[0] ?? null,
      ...(event.kind === 'card_payment' && { accountId: event.accountId, paymentMode: event.paymentMode }),
    })),
    oneOffs: model.oneOffs.slice(0, MAX_ONE_OFFS).map(entry => ({
      label: entry.label,
      date: entry.date,
      flow: entry.flow,
      amount: Math.round(entry.amount * 100) / 100,
    })),
    cards: summarizeCards(model).slice(0, MAX_CARDS).map(card => ({
      accountId: card.accountId,
      name: card.name,
      mask: card.mask,
      balance: card.balance,
      apr: card.apr,
      behavior: card.behavior,
      usualMonthlyPayment: card.usualMonthlyPayment,
      paymentDay: card.paymentDay,
      paymentSource: card.paymentSource,
      currentPace: pace(card.currentPace),
      withPlans: pace(card.withPlans),
    })),
    position: positionContext(model),
    adjustments: model.adjustments.map(adjustment => ({ kind: adjustment.kind, flow: adjustment.flow, label: adjustment.label })),
  };
}

function positionContext(model: CashFlowModel): CashFlowForecastContext['position'] {
  const position = buildCashPosition(model);
  if (!position.available) {
    return {
      available: false,
      reason: position.reason,
      startingCash: null,
      startingCardDebt: null,
      milestones: [],
      lowNext12Months: null,
      projectsCards: false,
      cardsLeftOut: [],
    };
  }
  const milestones = cashMilestones(model, position);
  const masks = new Map(model.cards.map(card => [card.account.id, card.terms.mask]));
  // Each account on its own, from the same simulation: the accounts add up to
  // the whole. With one account the whole already is that account. Every cash
  // account has a balance here, or the whole would be unavailable.
  const cashAccounts = model.ledger.accounts
    .filter(account => account.kind === 'cash')
    .sort((left, right) => Number(right.id === model.primaryAccountId) - Number(left.id === model.primaryAccountId)
      || (right.balance ?? 0) - (left.balance ?? 0));
  const accounts = cashAccounts.length > 1
    ? cashAccounts.slice(0, MAX_CASH_ACCOUNTS).flatMap(account => {
        const own = buildCashPosition(model, [account.id]);
        if (!own.available) return [];
        const ownMilestones = cashMilestones(model, own);
        return [{
          name: account.name,
          mask: account.mask,
          primary: account.id === model.primaryAccountId,
          startingCash: own.startingCash,
          milestones: ownMilestones.points.map(point => ({ key: point.key, date: point.date, cash: point.cash })),
          lowNext12Months: ownMilestones.lowNext12Months,
        }];
      })
    : undefined;
  return {
    available: true,
    startingCash: position.startingCash,
    startingCardDebt: position.startingCardDebt,
    milestones: milestones.points,
    lowNext12Months: milestones.lowNext12Months,
    projectsCards: model.cards.some(card => card.projection),
    cardsLeftOut: position.cardsLeftOut.map(card => ({ name: card.name, mask: masks.get(card.accountId) ?? null, reason: card.reason })),
    ...(accounts && accounts.length > 0 && {
      accounts,
      ...(cashAccounts.length > accounts.length && { accountsNotListed: cashAccounts.length - accounts.length }),
    }),
  };
}

const WINDOW_NAMES: Record<CashFlowHighlightKey, string> = {
  this_month: 'this month',
  next_month: 'next month',
  this_quarter: 'this quarter',
  next_quarter: 'next quarter',
  this_year: 'this calendar year',
  next_3_months: 'the next 3 months',
  next_6_months: 'the next 6 months',
  next_12_months: 'the next 12 months',
};

const FLOW_WORDS: Record<keyof CashFlowTotals, string> = {
  income: 'income (cash in)',
  spending: 'spending (cash out)',
  net: 'net cash flow (income minus spending; positive is a surplus, negative a shortfall)',
};

export function cashFlowWindowLabel(highlight: Pick<CashFlowHighlight, 'key' | 'start' | 'endExclusive'>): string {
  return `${WINDOW_NAMES[highlight.key]} (${highlight.start} to ${addDays(highlight.endExclusive, -1)})`;
}

export function cashFlowFactId(key: CashFlowHighlightKey, part: string, measure: keyof CashFlowTotals): string {
  return `cash_flow_${key}_${part}_${measure}`;
}

/**
 * Canonical facts for the forecast pack. Observed amounts are snapshot facts;
 * everything projected carries `forecast` provenance and a caveat that says
 * what it is built from, so it cannot be quoted as an observed result.
 */
export function cashFlowForecastFacts(context: CashFlowForecastContext | undefined): CanonicalFact[] {
  if (!context?.highlights) return [];
  const facts = new Map<string, CanonicalFact>();
  const asOf = context.dataThrough;
  const basisDays = context.baseline?.typicalBasisDays ?? 0;
  const method = [
    'recurring income and bills found in the user’s transaction history, on their schedule',
    context.baseline?.incomeSource === 'override' || context.baseline?.spendingSource === 'override'
      ? 'the user’s own monthly income or spending figure where they set one'
      : null,
    basisDays > 0 ? `typical other spending over the last ${basisDays} days` : null,
    'the user’s saved planned events',
  ].filter(Boolean).join(', ');
  // One caveat is shared by every projection, so an answer can state it once.
  const caveat =
    `Projection, not an observed amount and not a guarantee. Built from ${method}; ` +
    'large one-off amounts in the history are not assumed to repeat.' +
    (context.cards?.length
      ? ' Card interest is estimated monthly at each card’s purchase APR on the part of each statement left unpaid.'
      : '');

  const add = (fact: CanonicalFact) => {
    if (Number.isFinite(fact.value)) facts.set(fact.id, fact);
  };
  const observed = (id: string, label: string, value: number | null, source: string, unit: CanonicalFact['unit'] = 'usd') => {
    if (value === null) return;
    add({ id, label, value, unit, provenance: { kind: 'snapshot', source, ...(asOf && { asOf }) } });
  };
  const forecast = (
    id: string,
    label: string,
    value: number | null,
    source: string,
    inputFactIds?: string[],
    unit: CanonicalFact['unit'] = 'usd',
    formula = 'sum(inputs)'
  ) => {
    if (value === null) return;
    add({
      id,
      label,
      value,
      unit,
      caveat,
      provenance: {
        kind: 'forecast',
        source,
        ...(asOf && { asOf }),
        ...(inputFactIds && inputFactIds.every(inputId => facts.has(inputId)) && { formula, inputFactIds }),
      },
    });
  };

  const measures: Array<keyof CashFlowTotals> = ['income', 'spending', 'net'];
  for (const highlight of context.highlights) {
    if (!(CASH_FLOW_HIGHLIGHT_KEYS as readonly string[]).includes(highlight.key)) continue;
    const window = cashFlowWindowLabel(highlight);
    const source = `cashFlowForecast.highlights.${highlight.key}`;
    // In-progress windows start before the forecast; "still expected" is for
    // those even when history is missing (actualToDate null) so an override-only
    // forecast can still ground "how much can I expect this month?".
    const forecastStart = context.forecastStart;
    const windowInProgress = typeof forecastStart === 'string' && highlight.start < forecastStart;
    const hasObserved = highlight.actualToDate !== null;
    const partial = highlight.actualCoverage === 'partial';

    for (const measure of measures) {
      if (highlight.actualToDate) {
        observed(
          cashFlowFactId(highlight.key, 'so_far', measure),
          `Observed ${FLOW_WORDS[measure]} so far in ${window}, through ${asOf}` +
            (partial ? `; history starts ${context.coverageStart}, so this covers only part of the window` : ''),
          highlight.actualToDate[measure],
          `${source}.actualToDate.${measure}`
        );
      }
      if (highlight.remaining && windowInProgress) {
        forecast(
          cashFlowFactId(highlight.key, 'still_expected', measure),
          `Forecast ${FLOW_WORDS[measure]} still expected for the rest of ${window}, from ${context.forecastStart}`,
          highlight.remaining[measure],
          `${source}.remaining.${measure}`
        );
      }
      if (highlight.projected) {
        forecast(
          cashFlowFactId(highlight.key, 'projected', measure),
          hasObserved
            ? `Projected total ${FLOW_WORDS[measure]} for ${window}: observed so far plus forecast for the rest`
            : `Forecast ${FLOW_WORDS[measure]} for ${window}`,
          highlight.projected[measure],
          `${source}.projected.${measure}`,
          hasObserved
            ? [cashFlowFactId(highlight.key, 'so_far', measure), cashFlowFactId(highlight.key, 'still_expected', measure)]
            : undefined
        );
      }
    }

    // Planned events are reported apart from the baseline so an answer can say
    // what the user's own plans add or take away. Only windows they touch.
    if (Math.round(highlight.planned.net * 100) !== 0 || Math.round(highlight.planned.spending * 100) !== 0) {
      forecast(
        cashFlowFactId(highlight.key, 'planned_events', 'net'),
        `Net effect of the user’s saved planned events in ${window} (included in the forecast above)`,
        highlight.planned.net,
        `${source}.planned.net`
      );
      if (highlight.projectedWithoutPlanned) {
        forecast(
          cashFlowFactId(highlight.key, 'without_planned_events', 'net'),
          `Projected net cash flow for ${window} if none of the user’s planned events happened`,
          highlight.projectedWithoutPlanned.net,
          `${source}.projectedWithoutPlanned.net`
        );
      }
    }
  }

  if (context.status === 'available' && context.baseline) {
    if (context.baseline.spendingSource === 'transactions') {
      forecast(
        'cash_flow_typical_monthly_other_spending',
        `Typical monthly spending outside recurring bills, from the last ${basisDays} days, as the forecast spreads it`,
        context.baseline.typicalMonthlySpending,
        'cashFlowForecast.baseline.typicalMonthlySpending'
      );
    }
    if (context.baseline.incomeSource === 'transactions' && context.baseline.typicalMonthlyIncome >= 1) {
      forecast(
        'cash_flow_typical_monthly_other_income',
        `Typical monthly income outside recurring paychecks, from the last ${basisDays} days, as the forecast spreads it`,
        context.baseline.typicalMonthlyIncome,
        'cashFlowForecast.baseline.typicalMonthlyIncome'
      );
    }
  }

  (context.recurring ?? []).forEach((item, index) => {
    forecast(
      `cash_flow_recurring_${index + 1}_amount`,
      `Typical amount of recurring ${item.flow === 'income' ? 'income' : 'bill'} “${item.label}” each time (${item.cadence})`,
      item.amount,
      `cashFlowForecast.recurring.${index}.amount`
    );
  });

  const cardNames = new Map((context.cards ?? []).map(card => [card.accountId, cardLabel(card)]));
  (context.plannedEvents ?? []).forEach((event, index) => {
    // A full card payment is sized by the balance, so it has no amount of its own to state.
    if (event.kind === 'card_payment' && event.paymentMode === 'full') return;
    const when = event.recurrence === 'once' ? `once on ${event.startDate}` : `${event.recurrence} from ${event.startDate}`;
    const what = event.kind === 'card_payment'
      ? `payment to ${cardNames.get(event.accountId ?? '') ?? 'a credit card'}`
      : event.kind === 'income' ? 'income (money in)' : 'expense (money out)';
    add({
      id: `cash_flow_planned_event_${index + 1}_amount`,
      label: `User-entered planned ${what} “${event.label}”, ${when}`,
      value: event.amount,
      unit: 'usd',
      provenance: { kind: 'user_input', source: `cashFlowForecast.plannedEvents.${index}.amount` },
    });
  });

  // Credit cards: what each owes, its terms, and what the usual pace and the
  // user's plans do to it. Interest saved is checked as the difference of the
  // two interest figures it comes from.
  (context.cards ?? []).forEach((card, index) => {
    const id = `cash_flow_card_${index + 1}`;
    const name = cardLabel(card);
    const source = `cashFlowForecast.cards.${index}`;
    observed(`${id}_balance`, `Balance owed now on ${name}, as last reported`, card.balance, `${source}.balance`);
    observed(`${id}_apr`, `Purchase APR on ${name}`, card.apr, `${source}.apr`, 'percent');
    if (card.usualMonthlyPayment !== null) {
      observed(
        `${id}_usual_payment`,
        card.behavior === 'minimum_payment'
          ? `Minimum monthly payment on ${name}, which the forecast assumes the user pays`
          : `Usual monthly payment to ${name}, averaged over the last ${basisDays} days`,
        card.usualMonthlyPayment,
        `${source}.usualMonthlyPayment`
      );
    }
    const paceFacts = (key: 'current_pace' | 'with_plans', words: string, outcome: CardPace | null) => {
      if (!outcome) return;
      forecast(`${id}_${key}_interest_12_months`, `Projected interest charged on ${name} over the next 12 months ${words}`,
        outcome.interestTwelveMonths, `${source}.${key}.interestTwelveMonths`);
      forecast(`${id}_${key}_balance_in_12_months`, `Projected balance owed on ${name} in 12 months ${words}`,
        outcome.balanceInTwelveMonths, `${source}.${key}.balanceInTwelveMonths`);
      if (outcome.carryingBalanceNow && outcome.paidOffBy && context.today) {
        forecast(`${id}_${key}_months_to_payoff`, `Months until ${name} stops carrying a balance ${words} (from ${outcome.paidOffBy})`,
          monthsFrom(context.today, outcome.paidOffBy), `${source}.${key}.paidOffBy`, undefined, 'months');
      }
    };
    paceFacts('current_pace', 'at the user’s usual pace', card.currentPace);
    paceFacts('with_plans', 'with the user’s saved payment plan', card.withPlans);
    const usual = card.currentPace?.interestTwelveMonths;
    const planned = card.withPlans?.interestTwelveMonths;
    if (typeof usual === 'number' && typeof planned === 'number' && Math.round(usual * 100) !== Math.round(planned * 100)) {
      const saves = usual > planned;
      forecast(
        `${id}_interest_${saves ? 'saved' : 'added'}_12_months`,
        `Interest the user’s saved payment plan ${saves ? 'saves' : 'adds'} on ${name} over the next 12 months, compared with the usual pace`,
        Math.round(Math.abs(usual - planned) * 100) / 100,
        `${source}.interestSaved`,
        [`${id}_current_pace_interest_12_months`, `${id}_with_plans_interest_12_months`],
        'usd',
        'abs(input[0] - input[1])'
      );
    }
  });

  // Cash position: what the cash accounts hold now and at fixed points ahead.
  const position = context.position;
  if (position?.available) {
    observed('cash_flow_cash_now', 'Cash across the user’s connected checking and savings accounts now, as last reported',
      position.startingCash, 'cashFlowForecast.position.startingCash');
    if (position.projectsCards) {
      observed('cash_flow_card_debt_now', 'Total owed now on the credit cards the forecast covers, as last reported',
        position.startingCardDebt, 'cashFlowForecast.position.startingCardDebt');
    }
    for (const milestone of position.milestones) {
      const words = MILESTONE_WORDS[milestone.key] ?? milestone.key.replace(/_/g, ' ');
      forecast(`cash_flow_cash_${milestone.key}`, `Projected cash ${words} (${milestone.date})`,
        milestone.cash, `cashFlowForecast.position.milestones.${milestone.key}.cash`);
      if (position.projectsCards) {
        forecast(`cash_flow_card_debt_${milestone.key}`, `Projected total owed on the credit cards the forecast covers ${words} (${milestone.date})`,
          milestone.cardDebt, `cashFlowForecast.position.milestones.${milestone.key}.cardDebt`);
      }
    }
    if (position.lowNext12Months) {
      forecast('cash_flow_cash_low_point_next_12_months',
        `Lowest projected cash in the next 12 months, on ${position.lowNext12Months.date}`,
        position.lowNext12Months.cash, 'cashFlowForecast.position.lowNext12Months.cash');
    }
    // Each cash account on its own: the figures above are their sum.
    (position.accounts ?? []).forEach((account, index) => {
      const id = `cash_flow_account_${index + 1}`;
      const name = cashAccountLabel(account);
      const source = `cashFlowForecast.position.accounts.${index}`;
      observed(`${id}_cash_now`, `Cash in ${name} now, as last reported`, account.startingCash, `${source}.startingCash`);
      for (const milestone of account.milestones) {
        const words = MILESTONE_WORDS[milestone.key] ?? milestone.key.replace(/_/g, ' ');
        forecast(`${id}_cash_${milestone.key}`, `Projected cash in ${name} ${words} (${milestone.date})`,
          milestone.cash, `${source}.milestones.${milestone.key}.cash`);
      }
      if (account.lowNext12Months) {
        forecast(`${id}_cash_low_point_next_12_months`,
          `Lowest projected cash in ${name} in the next 12 months, on ${account.lowNext12Months.date}`,
          account.lowNext12Months.cash, `${source}.lowNext12Months.cash`);
      }
    });
  }

  (context.oneOffs ?? []).forEach((item, index) => {
    observed(
      `cash_flow_one_off_${index + 1}_amount`,
      `One-off ${item.flow === 'income' ? 'income' : 'spending'} “${item.label}” on ${item.date}, left out of the forecast as non-recurring`,
      item.amount,
      `cashFlowForecast.oneOffs.${index}.amount`
    );
  });

  return Array.from(facts.values());
}

export const EXPECTED_MONTHLY_INCOME = 'expected_monthly_income';
export const EXPECTED_MONTHLY_EXPENSES = 'expected_monthly_expenses';
export const EXPECTED_MONTHLY_SURPLUS = 'expected_monthly_surplus';
export const EXPECTED_SAVINGS_RATE = 'expected_savings_rate';

/**
 * The month the forecast expects, as facts every question carries rather than
 * only those that ask for the forecast pack: expected income and expenses, and
 * the surplus and savings rate they make. A side the forecast learned is a
 * projection, with a caveat that says what it is built from; a side the user
 * set is their own figure. The surplus and rate are given as facts because the
 * model may not net two facts itself.
 */
export function expectedMonthlyFacts(expected: FinancialContextSnapshot['expectedMonthly'] | undefined): CanonicalFact[] {
  if (!expected) return [];
  const asOf = expected.dataThrough ?? undefined;
  const basis = expected.typicalBasisDays > 0
    ? ` and their typical other spending over the last ${expected.typicalBasisDays} days`
    : '';
  const caveat =
    'Projection, not an observed amount and not a guarantee: the month the cash-flow forecast expects from the ' +
    `regular income and bills in the user’s transaction history${basis}. Large one-off amounts, anything the ` +
    'user left out of the forecast, and their planned events are not counted.';

  const facts = new Map<string, CanonicalFact>();
  const side = (
    id: string,
    value: number | null,
    source: 'transactions' | 'override',
    labels: { learned: string; own: string }
  ) => {
    if (value === null || !Number.isFinite(value)) return;
    const path = `contextSnapshot.expectedMonthly.${id === EXPECTED_MONTHLY_INCOME ? 'income' : 'spending'}`;
    facts.set(id, source === 'override'
      ? { id, label: labels.own, value, unit: 'usd', provenance: { kind: 'user_input', source: path } }
      : { id, label: labels.learned, value, unit: 'usd', caveat, provenance: { kind: 'forecast', source: path, ...(asOf && { asOf }) } });
  };
  side(EXPECTED_MONTHLY_INCOME, expected.income, expected.incomeSource, {
    learned: 'Expected monthly income: what the cash-flow forecast expects in a typical month, regular income at its usual monthly rate plus typical other income, before planned events',
    own: 'Expected monthly income: the user’s own monthly income figure, which the cash-flow forecast uses in place of their transactions',
  });
  side(EXPECTED_MONTHLY_EXPENSES, expected.spending, expected.spendingSource, {
    learned: 'Expected monthly expenses: what the cash-flow forecast expects in a typical month, regular bills at their monthly rate plus typical other spending and card interest at the usual pace, before planned events',
    own: 'Expected monthly expenses: the user’s own monthly spending figure, which the cash-flow forecast uses in place of their transactions',
  });

  const income = facts.get(EXPECTED_MONTHLY_INCOME);
  const expenses = facts.get(EXPECTED_MONTHLY_EXPENSES);
  if (income && expenses) {
    // A figure made from a projection is a projection too, and keeps its caveat.
    const projected = income.provenance.kind === 'forecast' || expenses.provenance.kind === 'forecast';
    const derived = (id: string, label: string, value: number, unit: CanonicalFact['unit'], formula: string, inputFactIds: string[]) => {
      facts.set(id, {
        id,
        label,
        value,
        unit,
        ...(projected && { caveat }),
        provenance: {
          kind: projected ? 'forecast' : 'calculation',
          source: `calculation.${id}`,
          formula,
          inputFactIds,
          ...(asOf && { asOf }),
        },
      });
    };
    const surplus = income.value - expenses.value;
    derived(
      EXPECTED_MONTHLY_SURPLUS,
      'Expected monthly surplus: expected monthly income minus expected monthly expenses (negative is a shortfall)',
      surplus,
      'usd',
      `${EXPECTED_MONTHLY_INCOME} - ${EXPECTED_MONTHLY_EXPENSES}`,
      [EXPECTED_MONTHLY_INCOME, EXPECTED_MONTHLY_EXPENSES]
    );
    if (income.value > 0) {
      derived(
        EXPECTED_SAVINGS_RATE,
        'Expected savings rate: the expected monthly surplus as a share of expected monthly income',
        (surplus / income.value) * 100,
        'percent',
        `(${EXPECTED_MONTHLY_SURPLUS} / ${EXPECTED_MONTHLY_INCOME}) * 100`,
        [EXPECTED_MONTHLY_SURPLUS, EXPECTED_MONTHLY_INCOME]
      );
    }
  }
  return Array.from(facts.values());
}

const MILESTONE_WORDS: Record<string, string> = {
  end_of_this_month: 'at the end of this month',
  end_of_next_month: 'at the end of next month',
  in_3_months: 'in 3 months',
  in_6_months: 'in 6 months',
  in_12_months: 'in 12 months',
};

function cashAccountLabel(account: { name: string; mask: string | null }): string {
  return `account “${account.name}${account.mask ? ` ending ${account.mask}` : ''}”`;
}

function cardLabel(card: { name: string; mask: string | null }): string {
  return `credit card “${card.name}${card.mask ? ` ending ${card.mask}` : ''}”`;
}

/** Whole months from the month of `today` to `month` (YYYY-MM). */
function monthsFrom(today: string, month: string): number {
  const [fromYear, fromMonth] = today.split('-').map(Number);
  const [toYear, toMonth] = month.split('-').map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

/**
 * The pack's details: what the forecast is built from and when things happen.
 * Amounts are given as the ids of the facts that hold them.
 */
export function compactCashFlowForecastDetails(context: CashFlowForecastContext): Record<string, unknown> {
  if (context.status === 'unavailable' && !context.highlights) {
    return { status: context.status, reason: context.reason };
  }
  return {
    status: context.status,
    ...(context.reason && { reason: context.reason }),
    today: context.today,
    transactionsThrough: context.dataThrough,
    forecastFrom: context.forecastStart,
    historyStarts: context.coverageStart,
    scope: 'Checking, savings and credit card accounts. Investment accounts and loans are excluded.',
    windows: (context.highlights ?? []).map(highlight => ({
      window: cashFlowWindowLabel(highlight),
      factIdPrefix: `cash_flow_${highlight.key}_`,
      ...(highlight.actualCoverage === 'partial' && { historyCoversOnlyPartOfWindow: true }),
    })),
    recurring: (context.recurring ?? []).map((item, index) => ({
      label: item.label,
      kind: item.flow === 'income' ? 'income' : 'bill',
      cadence: item.cadence,
      nextDate: item.nextDate,
      amountFactId: `cash_flow_recurring_${index + 1}_amount`,
    })),
    plannedEvents: (context.plannedEvents ?? []).map((event, index) => ({
      label: event.label,
      kind: event.kind,
      recurrence: event.recurrence,
      startDate: event.startDate,
      endDate: event.endDate,
      nextDate: event.nextDate,
      // A full card payment is sized by the balance, so there is no amount fact to point at.
      ...(event.kind === 'card_payment' && event.paymentMode === 'full'
        ? { paysCardInFull: true }
        : { amountFactId: `cash_flow_planned_event_${index + 1}_amount` }),
    })),
    oneOffsLeftOut: (context.oneOffs ?? []).map((item, index) => ({
      label: item.label,
      date: item.date,
      amountFactId: `cash_flow_one_off_${index + 1}_amount`,
    })),
    ...((context.cards ?? []).length > 0 && {
      creditCards: (context.cards ?? []).map((card, index) => {
        const id = `cash_flow_card_${index + 1}`;
        const plans = (context.plannedEvents ?? []).filter(event => event.kind === 'card_payment' && event.accountId === card.accountId);
        return {
          card: cardLabel(card),
          usualPace: PACE_WORDS[card.behavior],
          dueDay: card.paymentDay,
          ...(card.paymentSource === 'other' && { paidFromAccountsNotConnected: true }),
          factIdPrefix: `${id}_`,
          currentPace: paceDetails(card.currentPace),
          ...(card.withPlans && {
            withPlans: paceDetails(card.withPlans),
            plans: plans.map(plan => ({
              label: plan.label,
              paysInFull: plan.paymentMode === 'full',
              recurrence: plan.recurrence,
              startDate: plan.startDate,
              endDate: plan.endDate,
            })),
          }),
          ...(!card.currentPace && (card.withPlans
            ? { usualPaceUnknown: 'no payment history or minimum payment, so the plan projection counts only the payments the user planned' }
            : { notProjected: card.balance === null ? 'no balance reported' : 'no payment history or minimum payment' })),
        };
      }),
    }),
    ...(context.position && {
      cashPosition: context.position.available
        ? {
            scope: 'Cash across connected checking and savings accounts, from the balances last reported. Card payments come out of cash on their due days.',
            factIdPrefix: 'cash_flow_cash_',
            milestones: context.position.milestones.map(milestone => ({ key: milestone.key, date: milestone.date })),
            lowestPointDate: context.position.lowNext12Months?.date ?? null,
            ...((context.position.accounts ?? []).length > 0 && {
              accounts: (context.position.accounts ?? []).map((account, index) => ({
                account: cashAccountLabel(account),
                ...(account.primary && { primary: 'most historical income; planned income and expenses without an account land here' }),
                factIdPrefix: `cash_flow_account_${index + 1}_`,
                lowestPointDate: account.lowNext12Months?.date ?? null,
              })),
              accountsNote: context.position.accountsNotListed
                ? `Each listed account on its own. ${context.position.accountsNotListed} more cash account${context.position.accountsNotListed === 1 ? ' is' : 's are'} not listed but included in the cash figures above, so the listed accounts do not add up to them. Card payments come out of the account that pays each card.`
                : 'Each account on its own; the cash figures above are their sum. Card payments come out of the account that pays each card.',
            }),
            ...(context.position.cardsLeftOut.length > 0 && {
              cardDebtLeavesOut: context.position.cardsLeftOut.map(card => ({
                card: cardLabel(card),
                reason: card.reason === 'no_balance' ? 'no balance reported' : 'no usual payment to project from',
              })),
            }),
          }
        : { unavailable: context.position.reason },
    }),
    ...((context.adjustments ?? []).length > 0 && {
      userAdjustments: {
        note: 'The user chose what the forecast counts; every figure already reflects these choices, and past months are unchanged.',
        changes: (context.adjustments ?? []).map(adjustment => ({
          item: adjustment.label,
          change: adjustmentWords(adjustment.kind, adjustment.flow),
        })),
      },
    }),
  };
}

/** What an adjustment did, in words the model can repeat. */
function adjustmentWords(kind: ForecastAdjustmentKind, flow: 'income' | 'spending'): string {
  switch (kind) {
    case 'exclude_payee': return `left out of the forecast: not projected as ${flow}`;
    case 'include_one_off': return `counted in typical ${flow} although it looked like a one-off`;
    case 'continue_stream': return `still projected as regular ${flow} although it had stopped`;
    case 'exclude_transfer': return `left out of the cash position's transfers ${flow === 'income' ? 'in' : 'out'}`;
  }
}

const PACE_WORDS: Record<CardPaymentBehavior, string> = {
  pays_in_full: 'pays the statement in full each month (no interest charged lately)',
  average_payment: 'pays about the same amount each month while carrying a balance',
  minimum_payment: 'pays the minimum payment',
  unknown: 'not enough payment history to tell',
};

function paceDetails(outcome: CardPace | null): Record<string, unknown> | null {
  if (!outcome) return null;
  return {
    carryingBalanceNow: outcome.carryingBalanceNow,
    stopsCarryingABalance: !outcome.carryingBalanceNow
      ? 'not carrying a balance'
      : outcome.paidOffBy ?? 'not within the 24-month projection',
  };
}
