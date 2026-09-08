import { trackContentsquareEvent } from '@/lib/contentsquare';
import { isAnalyticsHost } from '@/lib/analytics-host';
import { pushRetirementInteraction, pushRetirementModelRun, pushSignUp, pushStartFreeClick } from '@/lib/dataLayer';

jest.mock('@/lib/analytics-host', () => ({ isAnalyticsHost: jest.fn() }));
const hostAllowed = jest.mocked(isAnalyticsHost);
const win = window as unknown as { _uxa?: unknown[][]; dataLayer?: unknown[] };

beforeEach(() => {
  hostAllowed.mockReturnValue(true);
  delete win._uxa;
  win.dataLayer = [];
  window.history.replaceState({}, '', '/retirement-calculator');
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

it('never breaks the product when the analytics queue throws', () => {
  Object.defineProperty(win, '_uxa', { configurable: true, value: {
    push: () => { throw new Error('blocked'); },
  } });
  expect(() => pushStartFreeClick()).not.toThrow();
  expect(win.dataLayer).toHaveLength(1);
});
