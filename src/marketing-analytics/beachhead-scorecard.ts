import { aggregateTrialFunnel } from './funnel';
import type {
  AnalyticsSession,
  BeachheadScorecard,
  BeachheadStageMetric,
  FirstPartySummary,
  MetricValue,
} from './types';

const COAST_FIRE_PATTERN = /\bcoast\s*fire\b/i;

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

function completedTrialSessions(sessions: AnalyticsSession[], coverageComplete: boolean): number | null {
  if (!coverageComplete) return null;
  return aggregateTrialFunnel(sessions, 'complete')
    .find(step => step.event === 'trial_login_success')?.sessions ?? 0;
}

function buildJourney(
  current: AnalyticsSession[],
  previous: AnalyticsSession[],
  ctaEvent: string,
  coverageComplete: boolean,
  previousCoverageComplete: boolean,
): BeachheadStageMetric[] {
  const values = (sessions: AnalyticsSession[], hasCoverage: boolean) => {
    const results = sessions.filter(session => hasEvent(session, 'retirement_model_run'));
    // A CTA click only proves the calculator-to-plan handoff when the result was
    // shown in the same session. The cross-sell can also be clicked before a run.
    const planCtas = results.filter(session => hasEvent(session, ctaEvent));
    return [
      sessions.length,
      results.length,
      planCtas.length,
      completedTrialSessions(planCtas, hasCoverage),
    ];
  };
  const currentValues = values(current, coverageComplete);
  const previousValues = values(previous, previousCoverageComplete);
  const labels = [
    ['qualified_visit', 'Qualified visits', 'Sessions with an explicit page, campaign, query, or tracking signal for this journey.'],
    ['calculator_result', 'Result shown', 'Sessions that reached retirement_model_run. Calculator reliability lives in the separate calculator dashboard.'],
    ['plan_cta', 'Actual-plan CTA', 'Result sessions that clicked the journey-specific plan CTA in the same session.'],
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
  return buildJourney([], [], 'coast_fire_plan_cta_click', false, false)
    .map(stage => ({ ...stage, value: null, previous: null }));
}

function metric(
  value: number | null,
  unit: MetricValue['unit'],
  source: string,
  note: string,
): MetricValue {
  return { value, previous: null, unit, source, note };
}

export function buildBeachheadScorecard(args: {
  current: AnalyticsSession[];
  previous: AnalyticsSession[];
  ga4Live: boolean;
  funnelCoverageComplete: boolean;
  previousFunnelCoverageComplete: boolean;
  firstParty: FirstPartySummary;
}): BeachheadScorecard {
  const {
    current,
    previous,
    ga4Live,
    funnelCoverageComplete,
    previousFunnelCoverageComplete,
    firstParty,
  } = args;
  const currentCoast = current.filter(isCoastFireSession);
  const previousCoast = previous.filter(isCoastFireSession);
  const coastSignalObserved = currentCoast.length > 0 || previousCoast.length > 0;
  const state: BeachheadScorecard['state'] = !ga4Live
    ? 'collecting'
    : coastSignalObserved ? 'measuring' : 'prelaunch';
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
        funnelCoverageComplete,
        previousFunnelCoverageComplete,
      )
      : unavailableJourney(),
    currentCalculatorBaseline: ga4Live
      ? buildJourney(
        currentBaseline,
        previousBaseline,
        'quickplan_cross_sell_click',
        funnelCoverageComplete,
        previousFunnelCoverageComplete,
      )
      : unavailableJourney(),
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
        ? ['No dedicated Coast FIRE page, campaign, or content signal has reached GA4 yet. The Coast FIRE journey is intentionally blank, not zero.']
        : []),
      'Marketing attribution is not persisted on the first-party user record, so financial connection, activation, and payment cannot yet be joined back to the Coast FIRE cohort.',
      'A paid conversion matures after the 30-day trial. Read paid rate only for cohorts old enough to have been charged.',
    ],
  };
}
