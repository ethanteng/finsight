import { trackContentsquareEvent } from '@/lib/contentsquare';
import { isAnalyticsHost } from '@/lib/analytics-host';
import { INTERNAL_ANALYTICS_BROWSER_KEY } from '@/lib/internal-analytics';
import {
  pushRetirementInteraction,
  pushRetirementModelRun,
  pushSignUp,
  pushStartFreeClick,
  pushTrialLoginError,
  pushTrialLoginSubmit,
  pushTrialLoginSuccess,
  pushTrialLoginViewed,
  pushTrialSignupRegistrationError,
  pushTrialSignupStarted,
  pushTrialSignupSubmit,
  pushTrialSignupValidationError,
  pushTrialSignupViewed,
  pushTrialVerifyError,
  pushTrialVerifySubmit,
  pushTrialVerifySuccess,
  pushTrialVerifyViewed,
} from '@/lib/dataLayer';

jest.mock('@/lib/analytics-host', () => ({ isAnalyticsHost: jest.fn() }));
const hostAllowed = jest.mocked(isAnalyticsHost);
const win = window as unknown as { _uxa?: unknown[][]; dataLayer?: unknown[] };

beforeEach(() => {
  window.localStorage.removeItem(INTERNAL_ANALYTICS_BROWSER_KEY);
  hostAllowed.mockReturnValue(true);
  delete win._uxa;
  win.dataLayer = [];
  window.history.replaceState({}, '', '/retirement-calculator');
});

it('does not queue Contentsquare events from an internal browser', () => {
  window.localStorage.setItem(INTERNAL_ANALYTICS_BROWSER_KEY, '1');
  trackContentsquareEvent('sign_up');
  expect(win._uxa).toBeUndefined();
});

it('queues events before the Contentsquare tag loads, without extra pageviews', () => {
  trackContentsquareEvent('retirement_calculator_started');
  expect(win._uxa).toEqual([['trackPageEvent', 'retirement_calculator_started']]);
});

it.each([
  'retirement_calculator_started', 'retirement_calculator_field_edited',
  'retirement_model_clicked', 'retirement_model_requested',
  'retirement_validation_error', 'retirement_api_error', 'retirement_request_error',
] as const)('sends %s once to each analytics destination', event => {
  pushRetirementInteraction(event);
  expect(win._uxa).toEqual([['trackPageEvent', event]]);
  expect(win.dataLayer).toEqual([{ event, source_page: '/retirement-calculator', content_type: 'retirement_calculator' }]);
});

it('names the field an error was about, without carrying what was typed in it', () => {
  pushRetirementInteraction('retirement_validation_error', {
    errorField: 'annualSpending',
    invalidFieldCount: 3,
  });
  expect(win.dataLayer).toEqual([{
    event: 'retirement_validation_error',
    source_page: '/retirement-calculator',
    content_type: 'retirement_calculator',
    error_field: 'annualSpending',
    invalid_field_count: 3,
  }]);
  // Contentsquare still receives the name only.
  expect(win._uxa).toEqual([['trackPageEvent', 'retirement_validation_error']]);
});

it('separates a rejected number from a rate-limited request', () => {
  pushRetirementInteraction('retirement_api_error', { errorField: 'currentAge', errorStatus: 400 });
  pushRetirementInteraction('retirement_api_error', { errorStatus: 429 });
  expect(win.dataLayer).toEqual([
    expect.objectContaining({ error_field: 'currentAge', error_status: 400 }),
    // No field: the limiter rejected the request, not one of the numbers.
    expect.not.objectContaining({ error_field: expect.anything() }),
  ]);
  expect(win.dataLayer?.[1]).toMatchObject({ error_status: 429 });
});

it('files a field name it does not recognise under one bucket rather than passing it through', () => {
  pushRetirementInteraction('retirement_api_error', { errorField: 'x-injected', errorStatus: 400 });
  expect(win.dataLayer?.[0]).toMatchObject({ error_field: 'unrecognized' });
});

it('does not queue production analytics on dev or preview hosts', () => {
  hostAllowed.mockReturnValue(false);
  trackContentsquareEvent('sign_up');
  expect(win._uxa).toBeUndefined();
});

it('keeps intent, successful model results, and registration distinct', () => {
  pushStartFreeClick('quickplan_cross_sell');
  pushRetirementModelRun(62);
  pushSignUp({ signupFlow: 'free_trial' });
  expect(win._uxa).toEqual([
    ['trackPageEvent', 'start_free_click'],
    ['trackPageEvent', 'retirement_model_run'],
    ['trackPageEvent', 'sign_up'],
    ['trackPageEvent', 'sign_up_free_trial'],
  ]);
  expect(win.dataLayer).toContainEqual(expect.objectContaining({
    event: 'retirement_model_run', content_type: 'retirement_calculator', retirement_age: 62,
  }));
  // Existing GA4 events retain their payload; Contentsquare receives names only.
  expect(JSON.stringify(win._uxa)).not.toContain('62');
});

it('does not classify paid or direct registrations as the no-card flow', () => {
  pushSignUp({ signupFlow: 'paid_checkout' });
  expect(win._uxa).toEqual([['trackPageEvent', 'sign_up']]);
});

it('sends every no-card funnel boundary to Contentsquare by fixed event name only', () => {
  pushTrialSignupViewed();
  pushTrialSignupStarted();
  pushTrialSignupSubmit();
  pushTrialSignupValidationError();
  pushTrialSignupRegistrationError('server_rejected');
  pushTrialVerifyViewed();
  pushTrialVerifySubmit();
  pushTrialVerifyError('network_error');
  pushTrialVerifySuccess();
  pushTrialLoginViewed();
  pushTrialLoginSubmit();
  pushTrialLoginError('unknown');
  pushTrialLoginSuccess();

  expect(win._uxa).toEqual([
    'trial_signup_viewed',
    'trial_signup_started',
    'trial_signup_submit',
    'trial_signup_validation_error',
    'trial_signup_registration_error',
    'trial_verify_viewed',
    'trial_verify_submit',
    'trial_verify_error',
    'trial_verify_success',
    'trial_login_viewed',
    'trial_login_submit',
    'trial_login_error',
    'trial_login_success',
  ].map(event => ['trackPageEvent', event]));
  expect(JSON.stringify(win._uxa)).not.toMatch(/server_rejected|network_error|unknown/);
});

it('never breaks the product when the analytics queue throws', () => {
  Object.defineProperty(win, '_uxa', { configurable: true, value: {
    push: () => { throw new Error('blocked'); },
  } });
  expect(() => pushStartFreeClick()).not.toThrow();
  expect(win.dataLayer).toHaveLength(1);
});
