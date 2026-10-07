import type {
  CashFlowForecastAdjustment as CashFlowForecastAdjustmentRow,
  PlannedCashFlowEvent as PlannedCashFlowEventRow,
} from '@prisma/client';
import { getPrismaClient } from '../prisma-client';
import { calendarDateInTimeZone } from '../domain/time-zone';
import { calendarDateFrom, minDate } from '../cash-flow/calendar';
import { cashFlowAccounts } from '../cash-flow/ledger';
import {
  buildCashFlowModel,
  buildCashFlowReport,
  expectedMonthly,
  type CashFlowModel,
  type CashFlowModelInput,
  type CashFlowReport,
  type CashFlowReportRequest,
  type ExpectedMonthly,
} from '../cash-flow/forecast';
import type {
  ForecastAdjustment,
  ForecastAdjustmentInput,
  ForecastAdjustmentKind,
} from '../cash-flow/adjustments';
import type {
  CardPaymentMode,
  PlannedCashFlowEvent,
  PlannedEventInput,
  PlannedEventKind,
  PlannedEventRecurrence,
  RepeatUnit,
} from '../cash-flow/planned-events';

export interface CashFlowSnapshotMeta {
  computedAt: string;
  asOf: string | null;
  status: string | null;
}

export interface LoadedCashFlowModel {
  model: CashFlowModel;
  snapshot: CashFlowSnapshotMeta;
}

/**
 * Prisma reads and writes a PostgreSQL DATE as UTC midnight, which is how the
 * truth contract reads a date-only value too, so the calendar date is the UTC
 * date. Going through the engine's one Date-to-calendar-date reader keeps that
 * rule in a single place.
 */
function dateOnly(value: Date): string {
  const date = calendarDateFrom(value);
  if (!date) throw new Error('Planned cash-flow event has an unreadable date');
  return date;
}

function toPlannedEvent(row: PlannedCashFlowEventRow): PlannedCashFlowEvent {
  return {
    id: row.id,
    label: row.label,
    kind: row.kind as PlannedEventKind,
    amount: row.amount,
    startDate: dateOnly(row.startDate),
    recurrence: row.recurrence as PlannedEventRecurrence,
    endDate: row.endDate ? dateOnly(row.endDate) : null,
    repeatEvery: row.repeatEvery ?? null,
    repeatUnit: (row.repeatUnit as RepeatUnit | null) ?? null,
    accountId: row.accountId ?? null,
    toAccountId: row.toAccountId ?? null,
    paymentMode: (row.paymentMode as CardPaymentMode | null) ?? null,
  };
}

function toRowData(input: PlannedEventInput) {
  return {
    label: input.label,
    kind: input.kind,
    amount: input.amount,
    startDate: new Date(`${input.startDate}T00:00:00.000Z`),
    recurrence: input.recurrence,
    endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null,
    repeatEvery: input.repeatEvery,
    repeatUnit: input.repeatUnit,
    accountId: input.accountId,
    toAccountId: input.toAccountId,
    paymentMode: input.paymentMode,
  };
}

export async function listPlannedEvents(userId: string): Promise<PlannedCashFlowEvent[]> {
  const rows = await getPrismaClient().plannedCashFlowEvent.findMany({
    where: { userId },
    orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toPlannedEvent);
}

/**
 * Which of the user's connected accounts `accountId` is: a credit card, a cash
 * account, or none of theirs. A planned event names its account by provider
 * account id -- the card a payment pays, the cash accounts a transfer moves
 * between, or the cash account income or an expense lands in -- so the id is
 * checked against the user's own accounts before it is stored.
 */
export async function userCashFlowAccountKind(userId: string, accountId: string): Promise<'cash' | 'credit' | null> {
  const snapshot = await getPrismaClient().financialSummarySnapshot.findUnique({
    where: { userId },
    select: { accounts: true },
  });
  const accounts = Array.isArray(snapshot?.accounts) ? snapshot.accounts as any[] : [];
  return cashFlowAccounts(accounts).find(account => account.id === accountId)?.kind ?? null;
}

/**
 * Create an event unless the user already has `limit` of them; null when they
 * do. The count and the insert run under a per-user advisory lock (namespace
 * 872014272, beside the Stripe trial lock's 872014271), so two simultaneous
 * creates cannot both see room for one more and both land.
 */
export async function createPlannedEventWithinLimit(
  userId: string,
  input: PlannedEventInput,
  limit: number
): Promise<PlannedCashFlowEvent | null> {
  return getPrismaClient().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(872014272, hashtext(${userId}))`;
    if (await tx.plannedCashFlowEvent.count({ where: { userId } }) >= limit) return null;
    const row = await tx.plannedCashFlowEvent.create({ data: { userId, ...toRowData(input) } });
    return toPlannedEvent(row);
  });
}

/** Null when the event does not exist or belongs to someone else. */
export async function updatePlannedEvent(
  userId: string,
  id: string,
  input: PlannedEventInput
): Promise<PlannedCashFlowEvent | null> {
  const prisma = getPrismaClient();
  const result = await prisma.plannedCashFlowEvent.updateMany({ where: { id, userId }, data: toRowData(input) });
  if (result.count === 0) return null;
  const row = await prisma.plannedCashFlowEvent.findFirst({ where: { id, userId } });
  return row ? toPlannedEvent(row) : null;
}

export async function deletePlannedEvent(userId: string, id: string): Promise<boolean> {
  const result = await getPrismaClient().plannedCashFlowEvent.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

/** Longest label an adjustment is stored under; transaction descriptions can run long. */
const ADJUSTMENT_LABEL_MAX_LENGTH = 120;

function toAdjustment(row: CashFlowForecastAdjustmentRow): ForecastAdjustment {
  return {
    id: row.id,
    kind: row.kind as ForecastAdjustmentKind,
    flow: row.flow === 'income' ? 'income' : 'spending',
    key: row.key,
    label: row.label,
  };
}

export async function listForecastAdjustments(userId: string): Promise<ForecastAdjustment[]> {
  const rows = await getPrismaClient().cashFlowForecastAdjustment.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toAdjustment);
}

/**
 * Save an adjustment under `label` unless the user already has `limit` of
 * them; null when they do. Making the same choice twice returns the one
 * already saved. The lookup, count and insert run under a per-user advisory
 * lock (namespace 872014273, beside the planned-event lock's 872014272), so
 * simultaneous saves cannot pass the cap or race the unique key.
 */
export async function saveForecastAdjustmentWithinLimit(
  userId: string,
  input: ForecastAdjustmentInput,
  label: string,
  limit: number
): Promise<{ adjustment: ForecastAdjustment; created: boolean } | null> {
  return getPrismaClient().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(872014273, hashtext(${userId}))`;
    const existing = await tx.cashFlowForecastAdjustment.findFirst({
      where: { userId, kind: input.kind, flow: input.flow, key: input.key },
    });
    if (existing) return { adjustment: toAdjustment(existing), created: false };
    if (await tx.cashFlowForecastAdjustment.count({ where: { userId } }) >= limit) return null;
    const row = await tx.cashFlowForecastAdjustment.create({
      data: { userId, kind: input.kind, flow: input.flow, key: input.key, label: label.slice(0, ADJUSTMENT_LABEL_MAX_LENGTH) },
    });
    return { adjustment: toAdjustment(row), created: true };
  });
}

export async function deleteForecastAdjustment(userId: string, id: string): Promise<boolean> {
  const result = await getPrismaClient().cashFlowForecastAdjustment.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

interface LoadedCashFlowInput {
  input: CashFlowModelInput;
  snapshot: CashFlowSnapshotMeta;
}

/**
 * Everything the user's cash-flow model is built from: their latest snapshot,
 * overrides, planned events and adjustments. Null when they have no snapshot yet.
 *
 * "Today" is the user's own calendar date. The data runs through the date the
 * snapshot was computed, never later than today; whatever lies between is
 * forecast, so a snapshot that is a few days old does not read as empty days.
 */
async function loadCashFlowInput(userId: string, now: Date): Promise<LoadedCashFlowInput | null> {
  const prisma = getPrismaClient();
  const [snapshot, user, plannedEvents, adjustments] = await Promise.all([
    prisma.financialSummarySnapshot.findUnique({
      where: { userId },
      select: { computedAt: true, asOf: true, status: true, accounts: true, transactions: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { timeZone: true, monthlyIncomeOverride: true, monthlyExpenseOverride: true },
    }),
    listPlannedEvents(userId),
    listForecastAdjustments(userId),
  ]);
  if (!snapshot || !user) return null;

  const today = calendarDateInTimeZone(now, user.timeZone);
  const dataThrough = minDate(calendarDateInTimeZone(snapshot.computedAt, user.timeZone), today);
  return {
    input: {
      transactions: Array.isArray(snapshot.transactions) ? snapshot.transactions as any[] : [],
      accounts: Array.isArray(snapshot.accounts) ? snapshot.accounts as any[] : [],
      plannedEvents,
      dataThrough,
      today,
      overrides: {
        monthlyIncome: user.monthlyIncomeOverride,
        monthlyExpense: user.monthlyExpenseOverride,
      },
      adjustments,
    },
    snapshot: {
      computedAt: snapshot.computedAt.toISOString(),
      asOf: snapshot.asOf ? snapshot.asOf.toISOString() : null,
      status: snapshot.status ?? null,
    },
  };
}

/** Build the user's cash-flow model. Null when they have no snapshot yet. */
export async function loadCashFlowModel(userId: string, now = new Date()): Promise<LoadedCashFlowModel | null> {
  const loaded = await loadCashFlowInput(userId, now);
  return loaded ? { model: buildCashFlowModel(loaded.input), snapshot: loaded.snapshot } : null;
}

export interface ExpectedMonthlySummary extends ExpectedMonthly {
  forecast: CashFlowModel['forecast'];
  /**
   * What the forecast expects from the transactions alone, with no override:
   * present only while an override replaces a side, so the user can see what
   * the override stands in for.
   */
  learned: Pick<ExpectedMonthly, 'income' | 'spending'> | null;
  snapshot: CashFlowSnapshotMeta;
}

/** The user's expected month, as the Finances page shows it. Null when they have no snapshot yet. */
export async function getExpectedMonthly(userId: string, now = new Date()): Promise<ExpectedMonthlySummary | null> {
  const loaded = await loadCashFlowInput(userId, now);
  if (!loaded) return null;
  const model = buildCashFlowModel(loaded.input);
  const expected = expectedMonthly(model);
  const overridden = expected.incomeSource === 'override' || expected.spendingSource === 'override';
  const learned = overridden ? expectedMonthly(buildCashFlowModel({ ...loaded.input, overrides: undefined })) : null;
  return {
    ...expected,
    forecast: model.forecast,
    learned: learned && { income: learned.income, spending: learned.spending },
    snapshot: loaded.snapshot,
  };
}

export async function getCashFlowReport(
  userId: string,
  request: CashFlowReportRequest,
  now = new Date()
): Promise<(CashFlowReport & { snapshot: CashFlowSnapshotMeta }) | null> {
  const loaded = await loadCashFlowModel(userId, now);
  if (!loaded) return null;
  return { ...buildCashFlowReport(loaded.model, request), snapshot: loaded.snapshot };
}
