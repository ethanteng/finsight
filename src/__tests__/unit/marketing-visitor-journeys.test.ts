import { buildVisitorJourneys } from '../../marketing-analytics/visitor-journeys';
import type { AnalyticsSession } from '../../marketing-analytics/types';

const options = { available: true, ratesAvailable: true, period: { start: '2026-09-18', end: '2026-09-24' } };
const signup = { trial_signup_viewed: 4, trial_signup_started: 5, trial_signup_submit: 6, sign_up: 7, trial_signup_completed: 8 };
function session(id: string, events: AnalyticsSession['firstEventAt'], overrides: Partial<AnalyticsSession> = {}): AnalyticsSession {
  return {
    id, userId: id, sessionDate: '2026-09-20',
    acquisition: { source: 'google', medium: 'cpc', channel: 'Paid Search', campaign: '', landingPage: '/retirement-calculator', searchTerm: '', creative: '', adId: '', referrer: '' },
    hostname: 'asklinc.com', device: 'mobile', browser: 'Chrome', operatingSystem: '', country: '', region: '', city: '',
    visitorType: 'new', trafficQuality: 'human', exclusionReasons: [], engaged: true, engagementSeconds: 10,
    pageViews: 1, eventCount: Object.keys(events).length, scrollEvents: 0,
    eventCounts: Object.fromEntries(Object.keys(events).map(key => [key, 1])), firstEventAt: events,
    signupOrigin: 'retirement_calculator', signupEntry: 'results_page', ...overrides,
  };
}
const path = (sessions: AnalyticsSession[], id = 'retirement', device = 'all') =>
  buildVisitorJourneys(sessions, options).rows.find(row => row.id === id && row.device === device)!;

describe('visitor journeys', () => {
  it('shows nested landing, result, alternative continuation, signup, and handoff cohorts', () => {
    const rows = [
      session('bounce', {}),
      session('result-only', { retirement_model_run: 1 }),
      session('save', { retirement_model_run: 1, retirement_results_emailed: 2 }),
      session('signup', { retirement_model_run: 1, quickplan_cross_sell_click: 2, trial_signup_viewed: 4 }, { signupEntry: 'calculator_cta' }),
      session('account', { retirement_model_run: 1, retirement_results_emailed: 2, ...signup, trial_signup_completed: 0 }),
      session('complete', { retirement_model_run: 1, retirement_results_emailed: 2, quickplan_cross_sell_click: 3, ...signup }),
    ];
    const steps = path(rows).steps;
    expect(steps.map(step => step.sessions)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(steps[1]).toMatchObject({ continuedRate: 5 / 6, droppedSessions: 1, dropoffRate: 1 / 6 });
    expect(steps[5]).toMatchObject({ continuedRate: 0.5, droppedSessions: 1, dropoffRate: 0.5 });
    expect(steps[0].dropoffRate).toBeNull();
  });

  it('does not treat email returns or the other calculator as same-path handoffs', () => {
    const events = { retirement_model_run: 1, retirement_results_emailed: 2, ...signup };
    const sessions = [session('email', events, { signupEntry: 'results_email' }), session('other', events, { signupOrigin: 'coast_fire_calculator' })];
    expect(path(sessions).steps.map(step => step.sessions)).toEqual([2, 2, 2, 0, 0, 0]);
    expect(path(sessions, 'signup_retirement_results_email').steps.map(step => step.sessions)).toEqual([1, 1, 1, 1, 1]);
    expect(path(sessions, 'signup_retirement_results_page').steps[0].sessions).toBe(0);
  });

  it('requires same-session ordered events and the full signup chain', () => {
    const sessions = [
      session('before-result', { retirement_model_run: 3, quickplan_cross_sell_click: 2, ...signup }, { signupEntry: 'calculator_cta' }),
      session('before-continue', { retirement_model_run: 1, retirement_results_emailed: 5, ...signup }),
      session('missing-start', { retirement_model_run: 1, retirement_results_emailed: 2, trial_signup_viewed: 4, sign_up: 7, trial_signup_completed: 8 }),
      session('account-only', { sign_up: 7, trial_signup_completed: 8 }),
    ];
    expect(path(sessions).steps.map(step => step.sessions)).toEqual([4, 3, 2, 1, 0, 0]);
  });

  it('accepts a later alternative continuation when the other first event is too early', () => {
    const row = session('alternative', { retirement_model_run: 3, quickplan_cross_sell_click: 2, retirement_results_emailed: 3, ...signup });
    expect(path([row]).steps.slice(-1)[0].sessions).toBe(1);
  });

  it('breaks the compact signup span into the same ordered calculator/device cohort', () => {
    const reached = { retirement_model_run: 1, retirement_results_emailed: 2, trial_signup_viewed: 4 };
    const rows = [
      session('viewed', reached),
      session('started', { ...reached, trial_signup_started: 5 }),
      session('submitted', { ...reached, trial_signup_started: 5, trial_signup_submit: 6 }),
      session('completed', { ...reached, ...signup }),
      session('email-return', { ...reached, ...signup }, { signupEntry: 'results_email' }),
      session('desktop', { ...reached, ...signup }, { device: 'desktop' }),
    ];
    const account = path(rows).steps[4];
    expect(account).toMatchObject({ sessions: 2, droppedSessions: 3 });
    expect(account.breakdown?.map(step => [step.id, step.sessions, step.droppedSessions])).toEqual([
      ['trial_signup_viewed', 5, null], ['trial_signup_started', 4, 1], ['trial_signup_submit', 3, 1], ['sign_up', 2, 1],
    ]);
    expect(account.breakdown?.slice(1).reduce((total, step) => total + step.droppedSessions!, 0)).toBe(account.droppedSessions);
    expect(path(rows, 'retirement', 'mobile').steps[4].breakdown?.map(step => step.sessions)).toEqual([4, 3, 2, 1]);
    expect(path(rows, 'retirement', 'desktop').steps[4].breakdown?.map(step => step.sessions)).toEqual([1, 1, 1, 1]);
    expect(path(rows, 'signup').steps.every(step => step.breakdown === undefined)).toBe(true);
  });

  it('keeps devices separate and landing cohorts exact, including a trailing slash', () => {
    const complete = session('m', { retirement_model_run: 1, retirement_results_emailed: 2, ...signup });
    const desktop = session('d', { retirement_model_run: 1 }, { device: 'desktop' });
    const elsewhere = session('elsewhere', complete.firstEventAt, { acquisition: { ...complete.acquisition, landingPage: '/features' } });
    const trailing = session('trailing', {}, { acquisition: { ...complete.acquisition, landingPage: '/retirement-calculator/' } });
    expect(path([complete, desktop, elsewhere, trailing]).steps.map(step => step.sessions)).toEqual([3, 2, 1, 1, 1, 1]);
    expect(path([complete, desktop], 'retirement', 'mobile').steps.slice(-1)[0].sessions).toBe(1);
    expect(path([complete, desktop], 'retirement', 'desktop').steps[0].sessions).toBe(1);
    expect(path([elsewhere], 'signup').steps.slice(-1)[0].sessions).toBe(1);
  });

  it('uses Coast FIRE result and continuation events, not retirement events', () => {
    const coast = session('coast', { coast_fire_calculated: 1, coast_fire_plan_cta_click: 2, ...signup }, {
      acquisition: { ...session('base', {}).acquisition, landingPage: '/coast-fire-calculator' },
      signupOrigin: 'coast_fire_calculator', signupEntry: 'calculator_cta',
    });
    expect(path([coast], 'coast_fire').steps.map(step => step.sessions)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(path([coast]).steps.map(step => step.sessions)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('withholds losses and rates, but retains observed counts when coverage is incomplete', () => {
    const data = buildVisitorJourneys([session('no-form', { retirement_model_run: 1, retirement_results_emailed: 2, trial_signup_viewed: 4 })], { ...options, ratesAvailable: false });
    expect(data.rows[0].steps[0].sessions).toBe(1);
    expect(data.rows.every(row => row.steps.every(step => step.dropoffRate === null && step.droppedSessions === null && step.continuedRate === null))).toBe(true);
    expect(data.rows[0].steps[4].breakdown?.map(step => step.sessions)).toEqual([1, 0, 0, 0]);
    expect(data.rows[0].steps[4].breakdown?.every(step => step.dropoffRate === null && step.droppedSessions === null && step.continuedRate === null)).toBe(true);
  });

  it('does not fabricate zeroes for unavailable data; zero denominators have no rates', () => {
    expect(buildVisitorJourneys([], { ...options, available: false })).toMatchObject({ state: 'unavailable', ratesAvailable: false, rows: [] });
    expect(path([]).steps.every(step => step.dropoffRate === null)).toBe(true);
    const zero = path([session('bounce', {})]).steps[1];
    expect(zero).toMatchObject({ sessions: 0, droppedSessions: 1, dropoffRate: 1 });
  });
});
