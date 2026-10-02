import type { PlannedCashFlowEvent as PlannedCashFlowEventRow } from '@prisma/client';
import { getPrismaClient } from '../prisma-client';
import { calendarDateInTimeZone } from '../domain/time-zone';
import { minDate } from '../cash-flow/calendar';
import {
  buildCashFlowModel,
  buildCashFlowReport,
  type CashFlowModel,
  type CashFlowReport,
  type CashFlowReportRequest,
} from '../cash-flow/forecast';
import type {
  PlannedCashFlowEvent,
  PlannedEventInput,
  PlannedEventKind,
  PlannedEventRecurrence,
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

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
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
  };
}

export async function listPlannedEvents(userId: string): Promise<PlannedCashFlowEvent[]> {
  const rows = await getPrismaClient().plannedCashFlowEvent.findMany({
    where: { userId },
    orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toPlannedEvent);
}

export async function countPlannedEvents(userId: string): Promise<number> {
  return getPrismaClient().plannedCashFlowEvent.count({ where: { userId } });
}

export async function createPlannedEvent(userId: string, input: PlannedEventInput): Promise<PlannedCashFlowEvent> {
  const row = await getPrismaClient().plannedCashFlowEvent.create({ data: { userId, ...toRowData(input) } });
  return toPlannedEvent(row);
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

/**
 * Build the user's cash-flow model from their latest snapshot, overrides and
 * planned events. Null when they have no snapshot yet.
 *
 * "Today" is the user's own calendar date. The data runs through the date the
 * snapshot was computed, never later than today; whatever lies between is
 * forecast, so a snapshot that is a few days old does not read as empty days.
 */
export async function loadCashFlowModel(userId: string, now = new Date()): Promise<LoadedCashFlowModel | null> {
  const prisma = getPrismaClient();
  const [snapshot, user, plannedEvents] = await Promise.all([
    prisma.financialSummarySnapshot.findUnique({
      where: { userId },
      select: { computedAt: true, asOf: true, status: true, accounts: true, transactions: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { timeZone: true, monthlyIncomeOverride: true, monthlyExpenseOverride: true },
    }),
    listPlannedEvents(userId),
  ]);
  if (!snapshot || !user) return null;

  const today = calendarDateInTimeZone(now, user.timeZone);
  const dataThrough = minDate(calendarDateInTimeZone(snapshot.computedAt, user.timeZone), today);
  const model = buildCashFlowModel({
    transactions: Array.isArray(snapshot.transactions) ? snapshot.transactions as any[] : [],
    accounts: Array.isArray(snapshot.accounts) ? snapshot.accounts as any[] : [],
    plannedEvents,
    dataThrough,
    today,
    overrides: {
      monthlyIncome: user.monthlyIncomeOverride,
      monthlyExpense: user.monthlyExpenseOverride,
    },
  });
  return {
    model,
    snapshot: {
      computedAt: snapshot.computedAt.toISOString(),
      asOf: snapshot.asOf ? snapshot.asOf.toISOString() : null,
      status: snapshot.status ?? null,
    },
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
