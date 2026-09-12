import { aggregateTrialFunnel } from './funnel';
import type {
  AnalyticsSession,
  BeachheadScorecard,
  BeachheadLeadCaptureMetric,
  BeachheadStageMetric,
  FirstPartySummary,
  MetricValue,
} from './types';
import type { CalculatorLeadSummary } from '../services/calculator-lead-report';

const COAST_FIRE_PATTERN = /\bcoast\s*fire\b/i;

/**
 * Launched: /coast-fire-calculator is public, in the sitemap, and in the
 * primary nav. Keeping launch state explicit is what makes zero qualified
 * visits meaningful now rather than ambiguous, and is what kept a stray
 * campaign name from turning the experiment on before the page existed.
 *
 * Setting this back to false does not unpublish anything. It only returns the
 * scorecard to a blank prelaunch journey, which is the honest reading if the
 * page is pulled.
 */
export const COAST_FIRE_EXPERIMENT = {
  live: true,
  pagePrefix: '/coast-fire',
  contentType: 'coast_fire_calculator',
  planCtaLocation: 'coast_fire_plan_cta',
  /**
   * The Coast FIRE page runs its own formula in the browser, so it never emits
   * `retirement_model_run`. The journey has to read its own result event or
   * every stage below "Qualified visits" reports zero once the experiment is
   * live, plan CTA clicks included: they are counted only among result
   * sessions.
   */
  resultEvent: 'coast_fire_calculated',
} as const;

/** The retirement calculator's result event, and the baseline journey's. */
const RETIREMENT_RESULT_EVENT = 'retirement_model_run';
export const CALCULATOR_EMAIL_TRACKING_STARTED_AT = '2026-09-12';

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function hasEvent(session: AnalyticsSession, event: string): boolean {
  return (session.eventCounts[event] || 0) > 0;
}

/**
 * The classifier intentionally requires an explicit Coast FIRE signal. Generic
 * retirement traffic belongs to the comparison baseline until the beachhead
 * experience exists; relabeling it would make a pre-launch period look live.
 */
export function isCoastFireSession(session: AnalyticsSession): boolean {
  if (hasEvent(session, 'coast_fire_touch')) return true;
  const acquisition = session.acquisition;
  return [
    acquisition.landingPage,
    acquisition.campaign,
    acquisition.searchTerm,
    acquisition.creative,
  ].some(value => COAST_FIRE_PATTERN.test((value || '').replace(/[_-]+/g, ' ')));
}

function isCurrentCalculatorSession(session: AnalyticsSession): boolean {
  return !isCoastFireSession(session) && (
    session.acquisition.landingPage === '/retirement-calculator'
    || hasEvent(session, 'retirement_model_run')
    || hasEvent(session, 'quickplan_cross_sell_click')
  );
}

function completedTrialSessions(
  sessions: AnalyticsSession[],
  ctaEvent: string,
  coverageComplete: boolean,
): number | null {
  if (!coverageComplete) return null;

  // The journey-specific CTA is a scoped start_free_click. Anchor the strict
  // funnel to that timestamp so an earlier generic signup path cannot receive
  // credit for a later calculator CTA. With only first-event timestamps, a
  // session is counted only when the full downstream order can be proved.
  const anchoredSessions = sessions.flatMap(session => {
    const ctaAt = session.firstEventAt[ctaEvent];
    if (ctaAt === undefined) return [];
    return [{
      ...session,
      firstEventAt: {
        ...session.firstEventAt,
        start_free_click: ctaAt,
      },
    }];
  });

  return aggregateTrialFunnel(anchoredSessions, 'complete')
    .find(step => step.event === 'trial_login_success')?.sessions ?? 0;
}

function hasResultThenPlanCta(
  session: AnalyticsSession,
  ctaEvent: string,
  resultEvent: string,
): boolean {
  if (!hasEvent(session, resultEvent) || !hasEvent(session, ctaEvent)) return false;
  const resultAt = session.firstEventAt[resultEvent];
  const ctaAt = session.firstEventAt[ctaEvent];
  // Without both timestamps we cannot prove the advertised handoff order.
  if (resultAt === undefined || ctaAt === undefined) return false;
  return ctaAt > resultAt;
}

function buildJourney(
  current: AnalyticsSession[],
  previous: AnalyticsSession[],
  ctaEvent: string,
  resultEvent: string,
  coverageComplete: boolean,
  previousCoverageComplete: boolean,
): BeachheadStageMetric[] {
  const values = (sessions: AnalyticsSession[], hasCoverage: boolean) => {
    const results = sessions.filter(session => hasEvent(session, resultEvent));
    // Count only CTAs that follow a result in the same session. The cross-sell is
    // rendered before a run, so co-occurrence alone overstates the handoff.
    const planCtas = results.filter(session => hasResultThenPlanCta(session, ctaEvent, resultEvent));
    return [
      sessions.length,
      results.length,
      planCtas.length,
      completedTrialSessions(planCtas, ctaEvent, hasCoverage),
    ];
  };
  const currentValues = values(current, coverageComplete);
  const previousValues = values(previous, previousCoverageComplete);
  const labels = [
    ['qualified_visit', 'Qualified visits', 'Sessions with an explicit page, campaign, query, or tracking signal for this journey.'],
    ['calculator_result', 'Result shown', `Sessions that reached ${resultEvent}. Calculator reliability lives in the separate calculator dashboard.`],
    ['plan_cta', 'Actual-plan CTA', 'Result sessions that clicked the journey-specific plan CTA after the result in the same session.'],
    ['trial_complete', 'Trial completed', 'CTA sessions that completed every tracked signup, verification, and first-login step in order.'],
  ] as const;

  return labels.map(([id, label, note], index) => ({
    id,
    label,
    value: currentValues[index],
    previous: previousValues[index],
    conversionRate: index === 0 || currentValues[index] === null
      ? null
      : ratio(currentValues[index] as number, currentValues[index - 1] as number),
    previousConversionRate: index === 0 || previousValues[index] === null
      ? null
      : ratio(previousValues[index] as number, previousValues[index - 1] as number),
    note,
  }));
}

function unavailableJourney(): BeachheadStageMetric[] {
  return buildJourney(
    [],
    [],
    'coast_fire_plan_cta_click',
    COAST_FIRE_EXPERIMENT.resultEvent,
    false,
    false,
  ).map(stage => ({ ...stage, value: null, previous: null }));
}

function metric(
  value: number | null,
  unit: MetricValue['unit'],
  source: string,
  note: string,
): MetricValue {
  return { value, previous: null, unit, source, note };
}

function buildLeadCapture(args: {
  current: AnalyticsSession[];
  previous: AnalyticsSession[];
  currentAll: AnalyticsSession[];
  previousAll: AnalyticsSession[];
  resultEvent: string;
  emailedEvent: string;
  emailCtaEvent: string;
  emailTrialEvent: string;
  ga4Live: boolean;
  firstParty: CalculatorLeadSummary;
}): BeachheadLeadCaptureMetric {
  const eligible = (sessions: AnalyticsSession[]) => sessions.filter(
    session => session.sessionDate >= CALCULATOR_EMAIL_TRACKING_STARTED_AT,
  );
  const values = (cohortSessions: AnalyticsSession[], allSessions: AnalyticsSession[]) => {
    const trackedCohort = eligible(cohortSessions);
    const trackedAll = eligible(allSessions);
    const results = trackedCohort.filter(session => hasEvent(session, args.resultEvent));
    const emailed = results.filter(session =>
      hasResultThenPlanCta(session, args.emailedEvent, args.resultEvent));
    return {
      results: results.length,
      emailed: emailed.length,
      opened: trackedAll.filter(session => hasEvent(session, args.emailCtaEvent)).length,
      completed: trackedAll.filter(session => hasEvent(session, args.emailTrialEvent)).length,
    };
  };
  const current = values(args.current, args.currentAll);
  const previous = values(args.previous, args.previousAll);
  const source = args.ga4Live ? 'GA4 BigQuery · post-instrumentation only' : 'Collecting';
  const value = (currentValue: number, previousValue: number, note: string): MetricValue => ({
    value: args.ga4Live ? currentValue : null,
    previous: args.ga4Live ? previousValue : null,
    unit: 'count',
    source,
    note,
  });

  return {
    resultsEmailedSessions: value(
      current.emailed,
      previous.emailed,
      'Successful email requests that followed a result in the same session; no address or financial value is sent to GA4.',
    ),
    captureRate: {
      value: args.ga4Live ? ratio(current.emailed, current.results) : null,
      previous: args.ga4Live ? ratio(previous.emailed, previous.results) : null,
      unit: 'percent',
      source,
      note: `Email-request sessions divided by result sessions since ${CALCULATOR_EMAIL_TRACKING_STARTED_AT}.`,
    },
    emailCtaOpenedSessions: value(
      current.opened,
      previous.opened,
      'Sessions where an emailed token successfully restored its saved calculator scenario.',
    ),
    emailTrialCompletedSessions: value(
      current.completed,
      previous.completed,
      'Email-attributed sessions that completed signup, verification, and first login.',
    ),
    firstParty: args.firstParty,
  };
}

export function buildBeachheadScorecard(args: {
  current: AnalyticsSession[];
  previous: AnalyticsSession[];
  ga4State: 'live' | 'collecting' | 'needs_configuration' | 'error';
  funnelCoverageComplete: boolean;
  previousFunnelCoverageComplete: boolean;
  firstParty: FirstPartySummary;
  coastFireLeads?: CalculatorLeadSummary;
  retirementLeads?: CalculatorLeadSummary;
  experimentLive?: boolean;
}): BeachheadScorecard {
  const {
    current,
    previous,
    ga4State,
    funnelCoverageComplete,
    previousFunnelCoverageComplete,
    firstParty,
    coastFireLeads = {
      state: 'live', periodStart: '', periodEnd: '', requests: 0, emailsSent: 0,
      uniqueEmails: 0, mailerliteSynced: 0, continuedToSignup: 0, matchedAccounts: 0,
      deliveryRate: null, continuationRate: null, accountMatchRate: null, note: 'No lead fixture supplied.',
    },
    retirementLeads = {
      state: 'live', periodStart: '', periodEnd: '', requests: 0, emailsSent: 0,
      uniqueEmails: 0, mailerliteSynced: 0, continuedToSignup: 0, matchedAccounts: 0,
      deliveryRate: null, continuationRate: null, accountMatchRate: null, note: 'No lead fixture supplied.',
    },
    experimentLive = COAST_FIRE_EXPERIMENT.live,
  } = args;
  const currentCoast = current.filter(isCoastFireSession);
  const previousCoast = previous.filter(isCoastFireSession);
  const ga4Live = ga4State === 'live';
  const state: BeachheadScorecard['state'] = !experimentLive
    ? 'prelaunch'
    : ga4Live ? 'measuring' : ga4State;
  const currentBaseline = current.filter(isCurrentCalculatorSession);
  const previousBaseline = previous.filter(isCurrentCalculatorSession);
  const accounts = firstParty.accountsCreated;
  const downstreamNote = 'All accounts created in the selected window; not yet attributable to a Coast FIRE visitor.';

  return {
    state,
    cohortLabel: 'Coast FIRE planners',
    cohortDefinition: 'Explicit /coast-fire* page activity, a coast_fire_calculator content signal, or “Coast FIRE” in campaign, keyword, or creative metadata.',
    coastFireJourney: state === 'measuring'
      ? buildJourney(
        currentCoast,
        previousCoast,
        'coast_fire_plan_cta_click',
        COAST_FIRE_EXPERIMENT.resultEvent,
        funnelCoverageComplete,
        previousFunnelCoverageComplete,
      )
      : unavailableJourney(),
    currentCalculatorBaseline: ga4Live
      ? buildJourney(
        currentBaseline,
        previousBaseline,
        'quickplan_cross_sell_click',
        RETIREMENT_RESULT_EVENT,
        funnelCoverageComplete,
        previousFunnelCoverageComplete,
      )
      : unavailableJourney(),
    leadCapture: {
      coastFire: buildLeadCapture({
        current: currentCoast,
        previous: previousCoast,
        currentAll: current,
        previousAll: previous,
        resultEvent: COAST_FIRE_EXPERIMENT.resultEvent,
        emailedEvent: 'coast_fire_results_emailed',
        emailCtaEvent: 'coast_fire_email_cta_opened',
        emailTrialEvent: 'coast_fire_email_trial_complete',
        ga4Live,
        firstParty: coastFireLeads,
      }),
      retirement: buildLeadCapture({
        current: currentBaseline,
        previous: previousBaseline,
        currentAll: current,
        previousAll: previous,
        resultEvent: RETIREMENT_RESULT_EVENT,
        emailedEvent: 'retirement_results_emailed',
        emailCtaEvent: 'retirement_email_cta_opened',
        emailTrialEvent: 'retirement_email_trial_complete',
        ga4Live,
        firstParty: retirementLeads,
      }),
    },
    downstream: {
      financialConnectionRate: metric(
        accounts === null || firstParty.createdAccountsWithFinancialConnection === null
          ? null
          : ratio(firstParty.createdAccountsWithFinancialConnection, accounts),
        'percent',
        'First-party accounts',
        downstreamNote,
      ),
      activationRate: metric(
        accounts === null || firstParty.createdAccountsWithConversation === null
          ? null
          : ratio(firstParty.createdAccountsWithConversation, accounts),
        'percent',
        'First-party accounts',
        `${downstreamNote} Activation means the account has asked at least one question.`,
      ),
      paidRate: metric(
        accounts === null || firstParty.createdAccountsCurrentlyPaid === null
          ? null
          : ratio(firstParty.createdAccountsCurrentlyPaid, accounts),
        'percent',
        'First-party accounts',
        `${downstreamNote} Paid now means current subscriptionStatus is active; recent 30-day trial cohorts have not matured.`,
      ),
    },
    evidenceGaps: [
      ...(state === 'prelaunch'
        ? ['This journey is reported as prelaunch, so it is intentionally blank rather than zero. The Coast FIRE experience has shipped, so reaching this state means COAST_FIRE_EXPERIMENT.live was set back to false or a caller passed experimentLive: false.']
        : []),
      'Marketing attribution is not persisted on the first-party user record, so financial connection, activation, and payment cannot yet be joined back to the Coast FIRE cohort.',
      `Results-email GA4 events are measured only from ${CALCULATOR_EMAIL_TRACKING_STARTED_AT}; earlier absence cannot be backfilled. Live Postgres lead totals remain available without the GA4 daily-export lag.`,
      'A paid conversion matures after the 30-day trial. Read paid rate only for cohorts old enough to have been charged.',
    ],
  };
}
