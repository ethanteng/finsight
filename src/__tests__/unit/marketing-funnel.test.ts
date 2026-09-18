import { aggregateSignupConversionFunnel, aggregateTrialFunnel } from '../../marketing-analytics/funnel';
import { buildSignupOutcomes } from '../../marketing-analytics/signup-outcomes';
import type { AnalyticsSession } from '../../marketing-analytics/types';

function session(id: string, events: Record<string, number>): AnalyticsSession {
  return {
    id,
    userId: `user-${id}`,
    sessionDate: '2026-09-10',
    acquisition: {
      source: 'google', medium: 'organic', channel: 'Organic Search', campaign: '(not set)',
      landingPage: '/', searchTerm: '(not set)', creative: '(not set)', adId: '', referrer: '',
    },
    hostname: 'asklinc.com',
    device: 'desktop',
    browser: 'Chrome',
    operatingSystem: 'Macintosh',
    country: 'United States',
    region: 'California',
    city: 'San Francisco',
    visitorType: 'new',
    trafficQuality: 'human',
    exclusionReasons: [],
    engaged: true,
    engagementSeconds: 20,
    pageViews: 2,
    eventCount: 2,
    scrollEvents: 0,
    eventCounts: Object.fromEntries(Object.keys(events).map(event => [event, 1])),
    firstEventAt: events,
  };
}

describe('trial funnel aggregation', () => {
  it('requires every earlier step in order for strict funnel counts', () => {
    const complete = session('complete', {
      start_free_click: 1_000_000,
      trial_signup_viewed: 2_000_000,
      trial_signup_started: 3_000_000,
      trial_signup_submit: 4_000_000,
      sign_up: 5_000_000,
      trial_verify_viewed: 6_000_000,
      trial_verify_submit: 7_000_000,
      trial_verify_success: 8_000_000,
      trial_login_viewed: 9_000_000,
      trial_login_submit: 10_000_000,
      trial_login_success: 11_000_000,
    });
    const abandoned = session('abandoned', {
      start_free_click: 1_000_000,
      trial_signup_viewed: 2_000_000,
      trial_signup_started: 3_000_000,
    });
    const funnel = aggregateTrialFunnel([complete, abandoned]);

    expect(funnel.find(step => step.event === 'trial_signup_started')).toMatchObject({ sessions: 2, previousStepRate: 1 });
    expect(funnel.find(step => step.event === 'trial_signup_submit')).toMatchObject({ sessions: 1, previousStepRate: 0.5, abandonmentRate: 0.5 });
    expect(funnel[funnel.length - 1]).toMatchObject({ sessions: 1, users: 1 });
  });

  it('surfaces a handoff without upstream steps as raw reach, not qualified progress', () => {
    const handoff = aggregateTrialFunnel([
      session('handoff-only', { trial_signup_completed: 3_000_000 }),
    ]).slice(-1)[0];

    expect(handoff).toMatchObject({ sessions: 0, rawEventSessions: 1 });
  });

  it('computes median seconds only for ordered qualifying sessions', () => {
    const first = session('first', { start_free_click: 1_000_000, trial_signup_viewed: 4_000_000 });
    const second = session('second', { start_free_click: 2_000_000, trial_signup_viewed: 7_000_000 });
    first.firstEventAt.trial_signup_started = 7_000_000;
    second.firstEventAt.trial_signup_started = 12_000_000;
    const viewed = aggregateTrialFunnel([first, second]).find(step => step.event === 'trial_signup_started');

    expect(viewed?.medianSecondsFromPrevious).toBe(4);
  });

  const core = { trial_signup_viewed: 1, trial_signup_started: 2, trial_signup_submit: 3, sign_up: 4 };
  it.each(['trial_signup_completed', 'trial_verify_skipped', 'trial_login_success'])(
    'accepts %s without requiring optional verification screens or a CTA', completion => {
      const rows = aggregateTrialFunnel([session('direct', { ...core, [completion]: 5 })]);
      expect(rows.slice(-1)[0]).toMatchObject({ event: 'trial_signup_completed', sessions: 1 });
    },
  );
  it('does not infer a handoff from account creation or legacy verification alone', () => {
    expect(aggregateTrialFunnel([session('abandoned', { ...core, trial_verify_success: 5 })]).slice(-1)[0]?.sessions).toBe(0);
  });
  it('deduplicates overlapping terminal events and rejects reversed order', () => {
    const done = session('done', { ...core, trial_verify_skipped: 5, trial_signup_completed: 5, trial_login_success: 6 });
    const invalid = session('invalid', { ...core, trial_signup_completed: 2 });
    expect(aggregateTrialFunnel([done, invalid]).slice(-1)[0]?.sessions).toBe(1);
    expect(aggregateTrialFunnel([done], 'complete', 'start_free_click').slice(-1)[0]?.sessions).toBe(0);
  });
  it('reports devices, verified branches and skips without double counting or false abandonment', () => {
    const skipped = session('skipped', { ...core, trial_verify_skipped: 5, trial_signup_completed: 5 });
    skipped.eventCounts.signup_completed_verification_skipped = 1;
    const linked = session('linked', { ...core, trial_signup_completed: 5 });
    linked.device = 'mobile';
    linked.signupOrigin = 'retirement_calculator';
    linked.signupEntry = 'results_email';
    linked.eventCounts.signup_completed_email_link = 1;
    expect(buildSignupOutcomes([skipped, linked], false)).toEqual(expect.arrayContaining([
      expect.objectContaining({ device: 'mobile', emailLink: 1, verificationSkipped: 0, handoffs: 1, signupAbandonmentRate: null }),
      expect.objectContaining({ device: 'desktop', emailLink: 0, verificationSkipped: 1, handoffs: 1 }),
    ]));
    expect(aggregateTrialFunnel([linked], 'partial').slice(-1)[0]?.abandonmentRate).toBeNull();
  });
});

describe('confirmed signup conversions', () => {
  const core = { trial_signup_viewed: 2_000_000, sign_up: 4_000_000, trial_signup_completed: 5_000_000 };
  it('counts confirmed accounts and handoffs without inventing missing form interactions', () => {
    const rows = [session('complete', core), session('view-only', { trial_signup_viewed: 2_000_000 })];
    const funnel = aggregateSignupConversionFunnel(rows);
    expect(funnel.map(step => step.sessions)).toEqual([2, 1, 1]);
    expect(funnel[1]).toMatchObject({ previousStepRate: .5, abandonmentRate: .5, medianSecondsFromPrevious: 2 });
    expect(funnel[2]).toMatchObject({ previousStepRate: 1, abandonmentRate: 0, medianSecondsFromPrevious: 1 });
    expect(aggregateTrialFunnel(rows).map(step => step.sessions)).toEqual([2, 0, 0, 0, 0]);
    expect(rows[0].firstEventAt.trial_signup_started).toBeUndefined();
    expect(buildSignupOutcomes(rows, true)[0]).toMatchObject({ viewed: 2, accountsCreated: 1, handoffs: 1, signupAbandonmentRate: .5 });
    expect(buildSignupOutcomes([rows[0]], true)[0].signupAbandonmentRate).toBe(0);
  });

  it('does not infer missing core events or join conversions across sessions', () => {
    const rows = [
      session('submit-only', { trial_signup_viewed: 1, trial_signup_submit: 2 }),
      session('missing-view', { sign_up: 4, trial_signup_completed: 5 }),
      session('missing-account', { trial_signup_viewed: 1, trial_signup_completed: 5 }),
      session('reversed-account', { trial_signup_viewed: 2, sign_up: 1, trial_signup_completed: 5 }),
      session('reversed-handoff', { trial_signup_viewed: 1, sign_up: 4, trial_signup_completed: 3 }),
    ];
    expect(aggregateSignupConversionFunnel(rows).map(step => step.sessions)).toEqual([4, 1, 0]);
    expect(aggregateSignupConversionFunnel(rows)[2].rawEventSessions).toBe(4);
  });

  it('preserves CTA order, legacy completion deduplication, and partial-coverage gates', () => {
    const rows = [
      session('anchored', { ...core, start_free_click: 1, trial_verify_skipped: 5_000_000, trial_login_success: 6_000_000 }),
      session('late-cta', { ...core, start_free_click: 3_000_000 }),
      session('no-cta', core),
    ];
    expect(aggregateSignupConversionFunnel(rows, 'complete', 'start_free_click').map(step => step.sessions)).toEqual([1, 1, 1]);
    expect(aggregateSignupConversionFunnel(rows, 'partial').every(step => step.previousStepRate === null && step.abandonmentRate === null)).toBe(true);
    expect(buildSignupOutcomes(rows, false)[0].signupAbandonmentRate).toBeNull();
  });
});
