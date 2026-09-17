import { aggregateTrialFunnel, signupCompletionAt } from './funnel';
import type { AnalyticsSession, SignupOutcomeRow } from './types';

/** Distinct sessions, never sums of overlapping completion events. */
export function buildSignupOutcomes(sessions: AnalyticsSession[], fullCoverage: boolean): SignupOutcomeRow[] {
  const groups = new Map<string, AnalyticsSession[]>();
  for (const session of sessions) {
    if (!['trial_signup_viewed', 'sign_up', 'trial_signup_completed', 'trial_verify_success',
      'trial_verify_skipped', 'trial_login_success'].some(event => session.firstEventAt[event] !== undefined)) continue;
    const key = JSON.stringify([session.device, session.signupOrigin || 'unknown', session.signupEntry || 'unknown']);
    const group = groups.get(key);
    if (group) group.push(session);
    else groups.set(key, [session]);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const [device, origin, entry] = JSON.parse(key) as string[];
    const count = (event: string) => rows.filter(row => (row.eventCounts[event] || 0) > 0).length;
    const funnel = aggregateTrialFunnel(rows, fullCoverage ? 'complete' : 'partial');
    const viewed = count('trial_signup_viewed');
    const createdAfterView = funnel.find(step => step.event === 'sign_up')?.sessions || 0;
    return {
      device, origin, entry, viewed,
      accountsCreated: count('sign_up'),
      handoffs: rows.filter(row => signupCompletionAt(row) !== undefined).length,
      emailLink: count('signup_completed_email_link'),
      verificationCode: count('signup_completed_verification_code'),
      verificationSkipped: rows.filter(row => (row.eventCounts.signup_completed_verification_skipped || 0) > 0
        || (row.eventCounts.trial_verify_skipped || 0) > 0).length,
      alreadyVerified: count('signup_completed_already_verified'),
      legacyLogin: count('trial_login_success'),
      signupAbandonmentRate: fullCoverage && viewed > 0 ? 1 - createdAfterView / viewed : null,
    };
  }).sort((a, b) => b.viewed - a.viewed || a.device.localeCompare(b.device));
}
