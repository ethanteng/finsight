import {
  beginFreeTrialSignupFlow,
  completeFreeTrialSignupFlow,
  isFreeTrialSignupContinuation,
  TRIAL_SIGNUP_FLOW_STORAGE_KEY,
  withFreeTrialSignupFlow,
} from '@/lib/trial-signup-flow';

describe('free-trial signup attribution', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('requires both the explicit URL marker and recent same-tab state', () => {
    const markedUrl = new URLSearchParams('signup_flow=free_trial');

    expect(isFreeTrialSignupContinuation(markedUrl, 1000)).toBe(false);
    expect(beginFreeTrialSignupFlow(1000)).toBe(true);
    expect(isFreeTrialSignupContinuation(new URLSearchParams(), 1001)).toBe(false);
    expect(isFreeTrialSignupContinuation(markedUrl, 1001)).toBe(true);
  });

  it('expires attribution after two hours and discards malformed state', () => {
    const markedUrl = new URLSearchParams('signup_flow=free_trial');

    beginFreeTrialSignupFlow(1000);
    expect(isFreeTrialSignupContinuation(markedUrl, 1000 + 2 * 60 * 60 * 1000 + 1)).toBe(false);
    expect(sessionStorage.getItem(TRIAL_SIGNUP_FLOW_STORAGE_KEY)).toBeNull();

    sessionStorage.setItem(TRIAL_SIGNUP_FLOW_STORAGE_KEY, JSON.stringify({ email: 'person@example.com' }));
    expect(isFreeTrialSignupContinuation(markedUrl, 2000)).toBe(false);
    expect(sessionStorage.getItem(TRIAL_SIGNUP_FLOW_STORAGE_KEY)).toBeNull();
  });

  it('uses only a fixed query value and clears state after authenticated login', () => {
    const href = withFreeTrialSignupFlow('/login?from=verify');
    expect(href).toBe('/login?from=verify&signup_flow=free_trial');
    expect(href).not.toMatch(/email|password|code/);

    beginFreeTrialSignupFlow(1000);
    completeFreeTrialSignupFlow();
    expect(sessionStorage.getItem(TRIAL_SIGNUP_FLOW_STORAGE_KEY)).toBeNull();
  });
});
