import { aggregateTrialFunnel } from '../../marketing-analytics/funnel';
import type { AnalyticsSession, FunnelEventName } from '../../marketing-analytics/types';

function session(id: string, events: Partial<Record<FunnelEventName, number>>): AnalyticsSession {
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

  it('surfaces downstream re-entry separately from qualified funnel reach', () => {
    const reentry = session('reentry', { trial_verify_success: 3_000_000, trial_login_viewed: 4_000_000 });
    const funnel = aggregateTrialFunnel([reentry]);
    const verify = funnel.find(step => step.event === 'trial_verify_success');

    expect(verify).toMatchObject({ sessions: 0, rawEventSessions: 1 });
  });

  it('computes median seconds only for ordered qualifying sessions', () => {
    const first = session('first', { start_free_click: 1_000_000, trial_signup_viewed: 4_000_000 });
    const second = session('second', { start_free_click: 2_000_000, trial_signup_viewed: 7_000_000 });
    const viewed = aggregateTrialFunnel([first, second]).find(step => step.event === 'trial_signup_viewed');

    expect(viewed?.medianSecondsFromPrevious).toBe(4);
  });
});
