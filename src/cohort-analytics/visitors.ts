import { addGrain, cohortLabel, cohortStarts, periodBounds } from './engine';
import { isIncludedByDefault } from '../marketing-analytics/traffic-quality';
import type { Ga4Visitor, Ga4VisitorSession } from '../marketing-analytics/adapters/ga4-visitors';
import {
  VISITOR_ACTIONS,
  VISITOR_METRICS,
  type CohortCell,
  type VisitorActionCounts,
  type VisitorChannel,
  type VisitorCohortRow,
  type VisitorExclusions,
  type VisitorLanding,
  type VisitorMember,
  type VisitorMetric,
  type VisitorOutcome,
  type VisitorReport,
  type VisitorTotals,
  type VisitorWindow,
} from './types';

/**
 * Visitors listed for the one cohort asked for, most active first. The counts
 * above them include everyone. Lists come one cohort at a time: every
 * cohort's visitors, with their sessions, would be megabytes per report.
 */
export const VISITOR_MEMBER_LIMIT = 1000;

const CHANNEL_KEYS: Record<string, VisitorChannel> = {
  Paid: 'paid',
  'Organic Search': 'organic_search',
  'Organic Social': 'organic_social',
  Direct: 'direct',
  Referral: 'referral',
};

/** The same page groups `getContentType` gives the calculators and the cash-flow page. */
export function landingFor(path: string): VisitorLanding {
  if (path.startsWith('/coast-fire')) return 'coast_fire_calculator';
  if (path === '/retirement-calculator' || path.startsWith('/retirement-calculator/')) return 'retirement_calculator';
  if (path === '/cash-flow-forecast' || path.startsWith('/cash-flow-forecast/')) return 'cash_flow_forecast';
  return 'other';
}

function zeroActions(): VisitorActionCounts {
  return { coast_fire_run: 0, retirement_run: 0, cash_flow_check: 0, coffee_widget: 0 };
}

function didAnything(actions: VisitorActionCounts): boolean {
  return VISITOR_ACTIONS.some(action => actions[action] > 0);
}

function emptyTotals(): VisitorTotals {
  return {
    actions: {
      coast_fire_run: { visitors: 0, count: 0 },
      retirement_run: { visitors: 0, count: 0 },
      cash_flow_check: { visitors: 0, count: 0 },
      coffee_widget: { visitors: 0, count: 0 },
    },
    anyAction: 0,
    returned: 0,
    signedUp: 0,
    signedIn: 0,
  };
}

function cell(count: number, eligible: number): CohortCell {
  return { rate: eligible > 0 ? count / eligible : null, count, eligible };
}

function emptyCells(periodCount: number): Record<VisitorMetric, CohortCell[]> {
  return Object.fromEntries(VISITOR_METRICS.map(metric => [
    metric,
    Array.from({ length: periodCount }, () => cell(0, 0)),
  ])) as Record<VisitorMetric, CohortCell[]>;
}

function matchesWindow(window: VisitorWindow, first: Ga4VisitorSession): boolean {
  if (window.landing !== 'all' && landingFor(first.landingPage) !== window.landing) return false;
  if (window.channel !== 'all' && (CHANNEL_KEYS[first.channel] ?? 'other') !== window.channel) return false;
  if (window.campaign && first.campaign !== window.campaign) return false;
  if (window.device !== 'all' && first.device.toLowerCase() !== window.device) return false;
  return true;
}

interface Placed {
  member: VisitorMember;
  startedAt: Date;
  sessions: Ga4VisitorSession[];
  signedUpAt: Date | null;
  /** One entry per column: null while the period is in progress. */
  periods: Array<Record<VisitorMetric, boolean> | null>;
}

function periodsFor(
  startedAt: Date,
  sessions: Ga4VisitorSession[],
  signedUpAt: Date | null,
  window: VisitorWindow,
  nowMs: number,
): Placed['periods'] {
  return Array.from({ length: window.periodCount }, (_, n) => {
    const { start, end } = periodBounds(startedAt, window.periodGrain, n);
    if (end.getTime() > nowMs) return null;
    const inPeriod = sessions.filter(session =>
      session.startedAt.getTime() >= start.getTime() && session.startedAt.getTime() < end.getTime());
    const did = (action: keyof VisitorActionCounts) => inPeriod.some(session => session.actions[action] > 0);
    return {
      any_action: inPeriod.some(session => didAnything(session.actions)),
      coast_fire_run: did('coast_fire_run'),
      retirement_run: did('retirement_run'),
      cash_flow_check: did('cash_flow_check'),
      coffee_widget: did('coffee_widget'),
      visited: inPeriod.length > 0,
      signed_up: signedUpAt !== null && signedUpAt.getTime() < end.getTime(),
    };
  });
}

function place(
  visitor: Ga4Visitor,
  sessions: Ga4VisitorSession[],
  window: VisitorWindow,
  now: Date,
): Placed {
  const nowMs = now.getTime();
  const first = sessions[0];
  const signedUpAt = visitor.signedUpAt && visitor.signedUpAt.getTime() < nowMs ? visitor.signedUpAt : null;
  const signedInAt = visitor.signedInAt && visitor.signedInAt.getTime() < nowMs ? visitor.signedInAt : null;
  // Whichever came first is when the browser became an account's.
  const outcome: VisitorOutcome | null = signedUpAt && (!signedInAt || signedUpAt <= signedInAt)
    ? 'signed_up'
    : signedInAt ? 'signed_in' : null;
  const outcomeAt = outcome === 'signed_up' ? signedUpAt : outcome === 'signed_in' ? signedInAt : null;
  const actions = zeroActions();
  for (const session of sessions) {
    for (const action of VISITOR_ACTIONS) actions[action] += session.actions[action];
  }
  const member: VisitorMember = {
    visitorId: visitor.visitorId,
    firstSeenAt: first.startedAt.toISOString(),
    landingPage: first.landingPage,
    landing: landingFor(first.landingPage),
    channel: first.channel,
    source: first.source,
    medium: first.medium,
    campaign: first.campaign,
    device: first.device,
    country: first.country,
    sessionCount: sessions.length,
    actions,
    outcome,
    outcomeAt: outcomeAt?.toISOString() ?? null,
    sessions: sessions.map(session => ({
      sessionId: session.sessionId,
      startedAt: session.startedAt.toISOString(),
      landingPage: session.landingPage,
      channel: session.channel,
      campaign: session.campaign,
      device: session.device,
      pageViews: session.pageViews,
      engagementSeconds: Math.round(session.engagementSeconds),
      actions: session.actions,
    })),
  };
  const signedUpForCells = outcome === 'signed_up' ? signedUpAt : null;
  return {
    member,
    startedAt: first.startedAt,
    sessions,
    signedUpAt: signedUpForCells,
    periods: periodsFor(first.startedAt, sessions, signedUpForCells, window, nowMs),
  };
}

function addToTotals(totals: VisitorTotals, member: VisitorMember): void {
  for (const action of VISITOR_ACTIONS) {
    if (member.actions[action] > 0) totals.actions[action].visitors += 1;
    totals.actions[action].count += member.actions[action];
  }
  if (didAnything(member.actions)) totals.anyAction += 1;
  if (member.sessionCount > 1) totals.returned += 1;
  if (member.outcome === 'signed_up') totals.signedUp += 1;
  if (member.outcome === 'signed_in') totals.signedIn += 1;
}

function mergeTotals(into: VisitorTotals, from: VisitorTotals): void {
  for (const action of VISITOR_ACTIONS) {
    into.actions[action].visitors += from.actions[action].visitors;
    into.actions[action].count += from.actions[action].count;
  }
  into.anyAction += from.anyAction;
  into.returned += from.returned;
  into.signedUp += from.signedUp;
  into.signedIn += from.signedIn;
}

function totalActions(member: VisitorMember): number {
  return VISITOR_ACTIONS.reduce((sum, action) => sum + member.actions[action], 0);
}

/** Signups first, then the most actions, the most sessions, and the earliest arrival. */
function byActivity(a: Placed, b: Placed): number {
  return Number(b.member.outcome === 'signed_up') - Number(a.member.outcome === 'signed_up')
    || totalActions(b.member) - totalActions(a.member)
    || b.member.sessionCount - a.member.sessionCount
    || a.startedAt.getTime() - b.startedAt.getTime()
    || a.member.visitorId.localeCompare(b.member.visitorId);
}

/**
 * The cohort starts, newest last. `now` is an exclusive cutoff (midnight after
 * the last complete export day), so the newest cohort is the one holding the
 * instant just before it, not the empty one that begins at it.
 */
export function visitorCohortStarts(now: Date, window: Pick<VisitorWindow, 'cohortGrain' | 'cohortCount'>): Date[] {
  return cohortStarts(new Date(now.getTime() - 1), window.cohortGrain, window.cohortCount);
}

export interface VisitorReportInput {
  visitors: Ga4Visitor[];
  window: VisitorWindow;
  /** Where the export's complete days end; periods after it are in progress. */
  now: Date;
  generatedAt: Date;
  reportEnd: string;
  detail: string;
  notes?: string[];
  /** The cohort (its `key`) whose visitors to list; the others list none. */
  membersFor?: string | null;
}

export function buildVisitorReport(input: VisitorReportInput): VisitorReport {
  const { window, now } = input;
  const nowMs = now.getTime();
  const starts = visitorCohortStarts(now, window);
  const windowStartMs = starts[0].getTime();
  const excluded: VisitorExclusions = { operatorBrowsers: 0, automatedSessions: 0, seenBeforeWindow: 0 };
  const placed: Placed[] = [];

  for (const visitor of input.visitors) {
    if (visitor.operator) {
      excluded.operatorBrowsers += 1;
      continue;
    }
    const observed = visitor.sessions.filter(session => session.startedAt.getTime() < nowMs);
    // A browser first seen before the window belongs to an earlier cohort.
    if (observed.length === 0 || observed[0].startedAt.getTime() < windowStartMs) continue;
    const sessions = observed.filter(session => isIncludedByDefault(session.quality));
    excluded.automatedSessions += observed.length - sessions.length;
    if (sessions.length === 0) continue;
    // GA4 numbers a browser's sessions from its first ever, so a first session
    // here that is not number 1 means an earlier visit before the window.
    const firstNumber = observed[0].sessionNumber;
    if (firstNumber !== null && firstNumber > 1) {
      excluded.seenBeforeWindow += 1;
      continue;
    }
    if (!matchesWindow(window, sessions[0])) continue;
    placed.push(place(visitor, sessions, window, now));
  }

  const overallTotals = emptyTotals();
  const overallCells = emptyCells(window.periodCount);
  let overallSize = 0;

  const cohorts: VisitorCohortRow[] = starts.map(start => {
    const end = addGrain(start, window.cohortGrain, 1);
    const members = placed
      .filter(visitor => visitor.startedAt.getTime() >= start.getTime() && visitor.startedAt.getTime() < end.getTime())
      .sort(byActivity);
    const totals = emptyTotals();
    for (const visitor of members) addToTotals(totals, visitor.member);
    const cells = Object.fromEntries(VISITOR_METRICS.map(metric => [
      metric,
      Array.from({ length: window.periodCount }, (_, n) => {
        const eligible = members.filter(visitor => visitor.periods[n] !== null);
        return cell(eligible.filter(visitor => visitor.periods[n]?.[metric]).length, eligible.length);
      }),
    ])) as Record<VisitorMetric, CohortCell[]>;

    mergeTotals(overallTotals, totals);
    overallSize += members.length;
    for (const metric of VISITOR_METRICS) {
      cells[metric].forEach((value, n) => {
        const sum = overallCells[metric][n];
        overallCells[metric][n] = cell(sum.count + value.count, sum.eligible + value.eligible);
      });
    }

    const key = start.toISOString().slice(0, 10);
    return {
      key,
      label: cohortLabel(start, window.cohortGrain),
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      size: members.length,
      totals,
      cells,
      members: key === input.membersFor ? members.slice(0, VISITOR_MEMBER_LIMIT).map(visitor => visitor.member) : [],
    };
  });

  return {
    kind: 'visitors',
    state: 'live',
    detail: input.detail,
    reportEnd: input.reportEnd,
    dataThrough: now.toISOString(),
    ...window,
    generatedAt: input.generatedAt.toISOString(),
    timeZone: 'UTC',
    memberLimit: VISITOR_MEMBER_LIMIT,
    membersFor: input.membersFor ?? null,
    cohorts,
    overall: { size: overallSize, totals: overallTotals, cells: overallCells },
    excluded,
    notes: input.notes ?? [],
  };
}

/** A report with nothing in it, for when GA4 cannot answer. */
export function unavailableVisitorReport(
  window: VisitorWindow,
  state: Exclude<VisitorReport['state'], 'live'>,
  detail: string,
  reportEnd: string | null,
  generatedAt: Date,
): VisitorReport {
  return {
    kind: 'visitors',
    state,
    detail,
    reportEnd,
    dataThrough: null,
    ...window,
    generatedAt: generatedAt.toISOString(),
    timeZone: 'UTC',
    memberLimit: VISITOR_MEMBER_LIMIT,
    membersFor: null,
    cohorts: [],
    overall: { size: 0, totals: emptyTotals(), cells: emptyCells(window.periodCount) },
    excluded: { operatorBrowsers: 0, automatedSessions: 0, seenBeforeWindow: 0 },
    notes: [],
  };
}
