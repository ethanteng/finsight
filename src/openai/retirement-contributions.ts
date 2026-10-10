/**
 * What the user adds to their investments each year, for the holdings-based
 * projection.
 *
 * The projection used to assume nothing more went in before withdrawals began,
 * whatever the user had said or saved, so a saver years from retirement read a
 * projection of the portfolio they have, not the one they are building. The
 * figure resolves like every other planning input: what the user said in this
 * decision, then what they saved in Your numbers, then what their linked
 * investment accounts show, then none -- each named in the answer.
 *
 * From linked accounts it is a typical month, not a total. The median of each
 * complete month's contributions less withdrawals, times twelve, never below
 * zero: one transfer in (an inheritance, savings moved over) or one withdrawal
 * barely moves it, where a twelve-month sum would assume that transfer again
 * every year until retirement. A deposit made once a year, like an IRA
 * contribution, is missed; the answer says the figure is a typical month's, and
 * the user's own figure replaces it.
 */

import { savedNumber, type StatedFigures } from '../services/stated-figures';

/** The complete months a linked figure reads, at most. */
export const LINKED_CONTRIBUTION_MONTHS = 12;
/** Fewer complete months than this is too little history to call typical. */
export const MINIMUM_LINKED_CONTRIBUTION_MONTHS = 3;

export type ContributionOrigin = 'stated' | 'saved' | 'linked' | 'none';

export interface LinkedContributions {
  /** The typical month's net times twelve, never below zero, in whole dollars. */
  annualAmount: number;
  /** The median month's contributions less withdrawals; can be negative. */
  typicalMonthlyNet: number;
  /** Complete calendar months read, oldest and newest as YYYY-MM. */
  months: number;
  firstMonth: string;
  lastMonth: string;
  /** Totals over those months, for the answer to cite beside the typical month. */
  contributed: number;
  withdrawn: number;
}

export interface RetirementContributionOrigin {
  origin: ContributionOrigin;
  /** For a `saved` figure: when it was saved in Your numbers. */
  savedAt?: string;
  /** For a `linked` figure: what it was read from. */
  linked?: LinkedContributions;
}

export interface ResolvedRetirementContribution {
  /** A year, in today's dollars, until withdrawals begin. */
  annualAmount: number;
  origin: RetirementContributionOrigin;
}

type Direction = 'in' | 'out';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Money the user put in or took out, from the provider's own type, never from
 * the amount's sign: the two providers sign cash in opposite ways, and
 * normalization signs it a third. Transfers between institutions (a rollover
 * or an account moved over) are neither: they move savings, not add to them,
 * and a distribution can be a fund's payout as easily as a withdrawal.
 */
function directionOf(activity: Record<string, any>): Direction | null {
  const snapTradeType = text(activity.snapTradeData?.type);
  const isSnapTrade = activity.source === 'snaptrade' || Boolean(activity.snapTradeData);
  if (isSnapTrade) {
    const type = snapTradeType || text(activity.type);
    if (type === 'contribution' || type === 'deposit') return 'in';
    if (type === 'withdrawal') return 'out';
    return null;
  }
  // Plaid: the subtype carries it, whether the type is cash, transfer or a buy
  // made with the contribution.
  const subtype = text(activity.subtype);
  if (subtype === 'contribution' || subtype === 'deposit') return 'in';
  if (subtype === 'withdrawal') return 'out';
  return null;
}

function amountOf(activity: Record<string, any>): number | null {
  const raw = activity.source_amount ?? activity.amount;
  const amount = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(amount) && amount !== 0 ? Math.abs(amount) : null;
}

function monthOf(activity: Record<string, any>): string | null {
  const raw = activity.date ?? activity.tradeDate ?? activity.settlementDate ?? activity.snapTradeData?.trade_date;
  if (typeof raw !== 'string' && !(raw instanceof Date)) return null;
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 7);
}

function addMonths(month: string, count: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + count, 1));
  return date.toISOString().slice(0, 7);
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The typical month's contributions to the accounts the projection models, or
 * null when the history cannot say: too few complete months, or no
 * contribution or withdrawal at all (silence from an institution that reports
 * contributions only as purchases is not evidence of saving nothing).
 *
 * Only complete months count -- the month in progress never does -- and none
 * before the first activity on record for those accounts, since months before
 * the connected history begins are unknown, not empty.
 */
export function linkedContributions(
  activities: readonly unknown[] | undefined,
  options: { accountIds: ReadonlySet<string>; asOf: Date }
): LinkedContributions | null {
  if (!activities?.length || options.accountIds.size === 0 || Number.isNaN(options.asOf.getTime())) return null;
  const currentMonth = options.asOf.toISOString().slice(0, 7);
  const windowStart = addMonths(currentMonth, -LINKED_CONTRIBUTION_MONTHS);

  let earliest: string | null = null;
  const byMonth = new Map<string, { in: number; out: number }>();
  let sawMovement = false;
  for (const value of activities) {
    if (!value || typeof value !== 'object') continue;
    const activity = value as Record<string, any>;
    if (!options.accountIds.has(String(activity.account_id ?? ''))) continue;
    const month = monthOf(activity);
    if (!month || month >= currentMonth) continue;
    if (earliest === null || month < earliest) earliest = month;
    if (month < windowStart) continue;
    const direction = directionOf(activity);
    const amount = amountOf(activity);
    if (!direction || amount === null) continue;
    sawMovement = true;
    const totals = byMonth.get(month) ?? { in: 0, out: 0 };
    totals[direction] += amount;
    byMonth.set(month, totals);
  }
  if (!sawMovement || earliest === null) return null;

  const firstMonth = earliest > windowStart ? earliest : windowStart;
  const months: string[] = [];
  for (let month = firstMonth; month < currentMonth; month = addMonths(month, 1)) months.push(month);
  if (months.length < MINIMUM_LINKED_CONTRIBUTION_MONTHS) return null;

  const nets = months.map((month) => {
    const totals = byMonth.get(month);
    return totals ? totals.in - totals.out : 0;
  });
  const typicalMonthlyNet = Math.round(median(nets) * 100) / 100;
  const sum = (key: 'in' | 'out') => Math.round(
    months.reduce((total, month) => total + (byMonth.get(month)?.[key] ?? 0), 0) * 100
  ) / 100;
  return {
    annualAmount: Math.round(Math.max(0, typicalMonthlyNet) * 12),
    typicalMonthlyNet,
    months: months.length,
    firstMonth: months[0],
    lastMonth: months[months.length - 1],
    contributed: sum('in'),
    withdrawn: sum('out'),
  };
}

/**
 * The contribution the projection runs: what the user said in this decision
 * (a stated zero included), then Your numbers, then linked accounts, then none.
 */
export function resolveRetirementContribution(args: {
  stated?: number;
  statedFigures?: StatedFigures;
  linked: LinkedContributions | null;
}): ResolvedRetirementContribution {
  if (args.stated !== undefined) return { annualAmount: args.stated, origin: { origin: 'stated' } };
  const saved = savedNumber(args.statedFigures, 'annualContribution');
  if (saved) return { annualAmount: saved.value, origin: { origin: 'saved', savedAt: saved.savedAt } };
  if (args.linked) return { annualAmount: args.linked.annualAmount, origin: { origin: 'linked', linked: args.linked } };
  return { annualAmount: 0, origin: { origin: 'none' } };
}
