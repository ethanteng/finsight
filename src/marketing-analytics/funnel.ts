import { FUNNEL_EVENT_NAMES, type AnalyticsSession, type FunnelEventName, type FunnelStepMetric } from './types';

const LABELS: Record<FunnelEventName, string> = {
  start_free_click: 'Start free clicked',
  trial_signup_viewed: 'Signup viewed',
  trial_signup_started: 'Signup started',
  trial_signup_submit: 'Signup submitted',
  sign_up: 'Account created',
  trial_verify_viewed: 'Verification viewed',
  trial_verify_submit: 'Verification submitted',
  trial_verify_success: 'Email verified',
  trial_login_viewed: 'First login viewed',
  trial_login_submit: 'First login submitted',
  trial_login_success: 'Trial path completed',
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * A strict same-session funnel. A session qualifies for a step only when every
 * earlier boundary exists in order. Raw step reach is retained so re-entry or
 * missing-upstream instrumentation can be shown instead of mislabeled as drop-off.
 */
export function aggregateTrialFunnel(
  sessions: AnalyticsSession[],
  coverage: FunnelStepMetric['coverage'] = 'complete',
): FunnelStepMetric[] {
  let previousQualified = sessions;
  let previousEvent: FunnelEventName | null = null;

  return FUNNEL_EVENT_NAMES.map((event, index) => {
    const priorEvent = previousEvent;
    const rawReached = sessions.filter(session => session.firstEventAt[event] !== undefined);
    const qualified = previousQualified.filter(session => {
      const at = session.firstEventAt[event];
      if (at === undefined) return false;
      if (!priorEvent) return true;
      const previousAt = session.firstEventAt[priorEvent];
      return previousAt !== undefined && at >= previousAt;
    });
    const previousCount = index === 0 ? sessions.length : previousQualified.length;
    const elapsed = priorEvent
      ? qualified.map(session => (session.firstEventAt[event]! - session.firstEventAt[priorEvent]!) / 1_000_000)
      : [];
    const step: FunnelStepMetric = {
      event,
      label: LABELS[event],
      sessions: qualified.length,
      users: new Set(qualified.map(session => session.userId)).size,
      previousStepRate: index === 0 ? null : previousCount > 0 ? qualified.length / previousCount : null,
      abandonmentRate: index === 0 ? null : previousCount > 0 ? 1 - qualified.length / previousCount : null,
      medianSecondsFromPrevious: median(elapsed),
      coverage,
      rawEventSessions: rawReached.length,
    };
    previousQualified = qualified;
    previousEvent = event;
    return step;
  });
}
