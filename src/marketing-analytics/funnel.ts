import { FUNNEL_EVENT_NAMES, type AnalyticsSession, type FunnelEventName, type FunnelStepMetric } from './types';

export const FUNNEL_LABELS: Record<FunnelEventName, string> = {
  trial_signup_viewed: 'Signup viewed',
  trial_signup_started: 'Signup started',
  trial_signup_submit: 'Signup submitted',
  sign_up: 'Account created',
  trial_signup_completed: 'Signup handoff to app',
};

/** Do not infer success from sign_up alone: code verification may be abandoned.
 * Keep legacy login completions, but never require that removed step for v2.
 * An old verify-success event is not proof of handoff in the former login flow.
 */
export function signupCompletionAt(session: AnalyticsSession): number | undefined {
  const times = ['trial_signup_completed', 'trial_verify_skipped', 'trial_login_success']
    .map(event => session.firstEventAt[event]).filter((at): at is number => at !== undefined);
  return times.length ? Math.min(...times) : undefined;
}

export function withSignupCompletion(session: AnalyticsSession): AnalyticsSession {
  const at = signupCompletionAt(session);
  return at === undefined ? session : {
    ...session, firstEventAt: { ...session.firstEventAt, trial_signup_completed: at },
  };
}

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
 * Entry is /getstarted, not a mandatory CTA: email links and direct visits skip it.
 * Verification screens are branches, not compulsory steps. `ctaEvent` optionally
 * scopes the funnel to a proven earlier CTA for calculator/click conversion rates.
 */
export function aggregateTrialFunnel(
  sessions: AnalyticsSession[],
  coverage: FunnelStepMetric['coverage'] = 'complete',
  ctaEvent?: string,
): FunnelStepMetric[] {
  const normalized = sessions.map(withSignupCompletion);
  let previousQualified = normalized.filter(session => !ctaEvent || (
    session.firstEventAt[ctaEvent] !== undefined
    && session.firstEventAt.trial_signup_viewed !== undefined
    && session.firstEventAt.trial_signup_viewed >= session.firstEventAt[ctaEvent]!
  ));
  let previousEvent: FunnelEventName | null = null;

  return FUNNEL_EVENT_NAMES.map((event, index) => {
    const priorEvent = previousEvent;
    const rawReached = normalized.filter(session => session.firstEventAt[event] !== undefined);
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
      label: FUNNEL_LABELS[event],
      sessions: qualified.length,
      users: new Set(qualified.map(session => session.userId)).size,
      previousStepRate: index === 0 || coverage !== 'complete' ? null : previousCount > 0 ? qualified.length / previousCount : null,
      abandonmentRate: index === 0 || coverage !== 'complete' ? null : previousCount > 0 ? 1 - qualified.length / previousCount : null,
      medianSecondsFromPrevious: median(elapsed),
      coverage,
      rawEventSessions: rawReached.length,
    };
    previousQualified = qualified;
    previousEvent = event;
    return step;
  });
}
