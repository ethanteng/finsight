import type {
  ActivationCohortRow,
  ActivationMember,
  ActivationReport,
  CohortCell,
  CohortExclusions,
  CohortGrain,
  CohortMember,
  CohortRow,
  CohortWindow,
  EngagementMember,
  EngagementReport,
  EngagementRule,
  FirstLink,
  MemberEngagementPeriod,
  MemberSummary,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
/** Mean Gregorian month, used only to compare a month against days or weeks. */
const AVERAGE_MONTH_MS = (365.2425 / 12) * DAY_MS;

/** Cohorts are bucketed on UTC calendar dates; weeks start on Monday. */
export function startOfGrain(date: Date, grain: CohortGrain): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  if (grain === 'day') return new Date(Date.UTC(year, month, day));
  if (grain === 'week') return new Date(Date.UTC(year, month, day - ((date.getUTCDay() + 6) % 7)));
  return new Date(Date.UTC(year, month, 1));
}

/**
 * Moves `n` grains from `date`. Months keep the day of month, clamped to the
 * target month's length (Jan 31 + 1 month is the last day of February), and are
 * always counted from the original date so the clamp never accumulates.
 */
export function addGrain(date: Date, grain: CohortGrain, n: number): Date {
  if (grain === 'day') return new Date(date.getTime() + n * DAY_MS);
  if (grain === 'week') return new Date(date.getTime() + n * WEEK_MS);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    Math.min(date.getUTCDate(), lastDay),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ));
}

/** Period `n` of a member's life: `[start + n grains, start + n+1 grains)`. */
export function periodBounds(startedAt: Date, grain: CohortGrain, n: number): { start: Date; end: Date } {
  return { start: addGrain(startedAt, grain, n), end: addGrain(startedAt, grain, n + 1) };
}

function grainMs(grain: CohortGrain): number {
  if (grain === 'day') return DAY_MS;
  if (grain === 'week') return WEEK_MS;
  return AVERAGE_MONTH_MS;
}

/**
 * Whole questions a period must hold to average `rule.questions` per
 * `rule.per`. When the rule and the column share a grain this is exactly
 * `rule.questions`, so "4 per month" in monthly columns never becomes 4.07 in a
 * 31-day month.
 */
export function requiredQuestions(rule: EngagementRule, periodGrain: CohortGrain, start: Date, end: Date): number {
  if (rule.per === periodGrain) return rule.questions;
  // The epsilon keeps float noise (3 * 7 / 7 = 3.0000000000000004) from
  // rounding a whole requirement up by one.
  return Math.ceil((rule.questions * (end.getTime() - start.getTime())) / grainMs(rule.per) - 1e-9);
}

export function requiredQuestionsRange(rule: EngagementRule, periodGrain: CohortGrain): { min: number; max: number } {
  if (periodGrain !== 'month') {
    const length = grainMs(periodGrain);
    const required = requiredQuestions(rule, periodGrain, new Date(0), new Date(length));
    return { min: required, max: required };
  }
  if (rule.per === 'month') return { min: rule.questions, max: rule.questions };
  return {
    min: requiredQuestions(rule, periodGrain, new Date(0), new Date(28 * DAY_MS)),
    max: requiredQuestions(rule, periodGrain, new Date(0), new Date(31 * DAY_MS)),
  };
}

const LABEL_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
const LABEL_MONTH = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });

export function cohortLabel(start: Date, grain: CohortGrain): string {
  if (grain === 'day') return LABEL_DAY.format(start);
  if (grain === 'week') return `Week of ${LABEL_DAY.format(start)}`;
  return LABEL_MONTH.format(start);
}

/** The `count` cohort start dates ending with the cohort `now` falls in, oldest first. */
export function cohortStarts(now: Date, grain: CohortGrain, count: number): Date[] {
  const current = startOfGrain(now, grain);
  return Array.from({ length: count }, (_, index) => addGrain(current, grain, index - (count - 1)));
}

/** The earliest moment any member of the window can have started. */
export function windowStart(window: Pick<CohortWindow, 'cohortGrain' | 'cohortCount'>, now: Date): Date {
  return cohortStarts(now, window.cohortGrain, window.cohortCount)[0];
}

interface Bucket {
  start: Date;
  end: Date;
  members: CohortMember[];
}

function bucketMembers(members: CohortMember[], window: CohortWindow, now: Date): Bucket[] {
  const buckets = cohortStarts(now, window.cohortGrain, window.cohortCount).map(start => ({
    start,
    end: addGrain(start, window.cohortGrain, 1),
    members: [] as CohortMember[],
  }));
  for (const member of members) {
    const time = member.startedAt.getTime();
    if (time > now.getTime()) continue;
    const bucket = buckets.find(candidate => time >= candidate.start.getTime() && time < candidate.end.getTime());
    if (bucket) bucket.members.push(member);
  }
  for (const bucket of buckets) {
    bucket.members.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime() || a.email.localeCompare(b.email));
  }
  return buckets;
}

function summarize(member: CohortMember): MemberSummary {
  return {
    userId: member.userId,
    email: member.email,
    startedAt: member.startedAt.toISOString(),
    signedUpAt: member.signedUpAt.toISOString(),
    trialStartedAt: member.trialStartedAt?.toISOString() ?? null,
    firstChargeAt: member.firstChargeAt?.toISOString() ?? null,
    subscriptionStatus: member.subscriptionStatus,
    tier: member.tier,
    lastLoginAt: member.lastLoginAt?.toISOString() ?? null,
  };
}

function cell(count: number, eligible: number): CohortCell {
  return { rate: eligible > 0 ? count / eligible : null, count, eligible };
}

function overallCells(rows: Array<{ cells: CohortCell[] }>, periodCount: number): CohortCell[] {
  return Array.from({ length: periodCount }, (_, period) => {
    let count = 0;
    let eligible = 0;
    for (const row of rows) {
      count += row.cells[period].count;
      eligible += row.cells[period].eligible;
    }
    return cell(count, eligible);
  });
}

/** Number of sorted timestamps in `[start, end)`. */
function countInRange(sorted: number[], start: number, end: number): number {
  return lowerBound(sorted, end) - lowerBound(sorted, start);
}

function lowerBound(sorted: number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (sorted[middle] < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function rowBase(bucket: Bucket, grain: CohortGrain) {
  return {
    key: bucket.start.toISOString().slice(0, 10),
    label: cohortLabel(bucket.start, grain),
    startsAt: bucket.start.toISOString(),
    endsAt: bucket.end.toISOString(),
    size: bucket.members.length,
  };
}

export interface EngagementInput {
  members: CohortMember[];
  /** Question timestamps (ms) per user, in any order. */
  questionTimes: Map<string, number[]>;
  window: CohortWindow;
  rule: EngagementRule;
  now: Date;
  excluded: CohortExclusions;
  notes?: string[];
}

export function buildEngagementReport(input: EngagementInput): EngagementReport {
  const { window, rule, now } = input;
  const nowMs = now.getTime();
  const sortedTimes = new Map<string, number[]>();
  for (const [userId, times] of input.questionTimes) {
    sortedTimes.set(userId, [...times].sort((a, b) => a - b));
  }

  const cohorts: Array<CohortRow<EngagementMember>> = bucketMembers(input.members, window, now).map(bucket => {
    const members: EngagementMember[] = bucket.members.map(member => {
      const times = sortedTimes.get(member.userId) ?? [];
      const periods: Array<MemberEngagementPeriod | null> = Array.from({ length: window.periodCount }, (_, n) => {
        const { start, end } = periodBounds(member.startedAt, window.periodGrain, n);
        if (end.getTime() > nowMs) return null;
        const questions = countInRange(times, start.getTime(), end.getTime());
        const required = requiredQuestions(rule, window.periodGrain, start, end);
        return { questions, required, engaged: questions >= required };
      });
      return {
        ...summarize(member),
        totalQuestions: countInRange(times, member.startedAt.getTime(), nowMs + 1),
        periods,
      };
    });
    const cells = Array.from({ length: window.periodCount }, (_, n) => {
      const eligible = members.filter(member => member.periods[n] !== null);
      return cell(eligible.filter(member => member.periods[n]?.engaged).length, eligible.length);
    });
    return { ...rowBase(bucket, window.cohortGrain), cells, members };
  });

  return {
    kind: 'engagement',
    ...window,
    generatedAt: now.toISOString(),
    timeZone: 'UTC',
    rule: { ...rule, requiredPerPeriod: requiredQuestionsRange(rule, window.periodGrain) },
    cohorts,
    overall: overallCells(cohorts, window.periodCount),
    excluded: input.excluded,
    notes: input.notes ?? [],
  };
}

export interface ActivationInput {
  members: CohortMember[];
  firstLinks: Map<string, FirstLink>;
  window: CohortWindow;
  now: Date;
  excluded: CohortExclusions;
  notes?: string[];
}

/** The period a link at `at` falls in; a link before the member started counts as period 0. */
export function activationPeriod(startedAt: Date, grain: CohortGrain, at: Date): number {
  if (at.getTime() < startedAt.getTime()) return 0;
  let n = 0;
  while (addGrain(startedAt, grain, n + 1).getTime() <= at.getTime()) n += 1;
  return n;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildActivationReport(input: ActivationInput): ActivationReport {
  const { window, now } = input;
  const nowMs = now.getTime();

  const cohorts: ActivationCohortRow[] = bucketMembers(input.members, window, now).map(bucket => {
    const members: ActivationMember[] = bucket.members.map(member => {
      const link = input.firstLinks.get(member.userId);
      if (!link || link.at.getTime() > nowMs) {
        return { ...summarize(member), firstLinkedAt: null, linkSources: [], activatedInPeriod: null, daysToFirstLink: null };
      }
      return {
        ...summarize(member),
        firstLinkedAt: link.at.toISOString(),
        linkSources: link.sources,
        activatedInPeriod: activationPeriod(member.startedAt, window.periodGrain, link.at),
        daysToFirstLink: roundTenth(Math.max(0, link.at.getTime() - member.startedAt.getTime()) / DAY_MS),
      };
    });
    const cells = Array.from({ length: window.periodCount }, (_, n) => {
      const eligible = bucket.members
        .map((member, index) => ({ member, row: members[index] }))
        .filter(({ member }) => periodBounds(member.startedAt, window.periodGrain, n).end.getTime() <= nowMs);
      const activated = eligible.filter(({ row }) => row.activatedInPeriod !== null && row.activatedInPeriod <= n);
      return cell(activated.length, eligible.length);
    });
    const activatedMembers = members.filter(member => member.daysToFirstLink !== null);
    const medianDays = median(activatedMembers.map(member => member.daysToFirstLink as number));
    return {
      ...rowBase(bucket, window.cohortGrain),
      cells,
      members,
      activatedToDate: activatedMembers.length,
      medianDaysToFirstLink: medianDays === null ? null : roundTenth(medianDays),
    };
  });

  return {
    kind: 'activation',
    ...window,
    generatedAt: now.toISOString(),
    timeZone: 'UTC',
    cohorts,
    overall: overallCells(cohorts, window.periodCount),
    excluded: input.excluded,
    notes: input.notes ?? [],
  };
}
