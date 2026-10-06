import {
  RETIREMENT_REF_COOKIE,
  RETIREMENT_SIGNUP_SOURCE,
  RETIREMENT_SIGNUP_STORAGE_KEY,
  clearRetirementSignupContext,
  hasRetirementSignupSource,
  readRetirementSignupContext,
  readRetirementSignupRef,
  storeRetirementSignupContext,
  type RetirementSignupInputs,
} from '@/lib/retirement-signup-context';
import { writeHandoverToken } from '@/lib/calculator-handover';

const INPUTS: RetirementSignupInputs = {
  currentAge: 48,
  retirementAge: 60,
  investableAssets: 1_200_000,
  annualSpending: 95_000,
  annualContributions: 35_000,
  socialSecurityAnnual: 36_000,
  socialSecurityStartAge: 67,
  lifeExpectancy: 95,
  allocation: 'balanced',
};

describe('retirement signup context', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('round-trips the complete scenario within the current browser session', () => {
    expect(storeRetirementSignupContext(INPUTS, { now: 1_000 })).toBe(true);
    expect(readRetirementSignupContext(2_000)).toEqual({
      version: 1,
      savedAt: 1_000,
      inputs: INPUTS,
    });
  });

  /*
   * The calculator's own CTA carries no run. Signup keeps the handover cookie
   * for a retry when a lookup fails, so a click inside its lifetime would
   * otherwise spend the old token and count as a results-email return.
   */
  it('drops a retained handover token along with the stored run', () => {
    const token = 'c'.repeat(48);
    // The cookie is scoped to the page that spends it.
    window.history.pushState({}, '', '/getstarted');
    try {
      writeHandoverToken(RETIREMENT_REF_COOKIE, token);
      storeRetirementSignupContext(INPUTS);
      expect(readRetirementSignupRef()).toBe(token);

      clearRetirementSignupContext();

      expect(readRetirementSignupRef()).toBeNull();
      expect(readRetirementSignupContext()).toBeNull();
    } finally {
      window.history.pushState({}, '', '/');
    }
  });

  it('rejects and removes expired context', () => {
    storeRetirementSignupContext(INPUTS, { now: 1_000 });

    expect(readRetirementSignupContext(3 * 60 * 60 * 1_000)).toBeNull();
    expect(window.sessionStorage.getItem(RETIREMENT_SIGNUP_STORAGE_KEY)).toBeNull();
  });

  it.each([
    ['malformed JSON', '{'],
    ['an invalid financial value', JSON.stringify({ version: 1, savedAt: 1_000, inputs: { ...INPUTS, annualSpending: -1 } })],
    ['an unknown schema version', JSON.stringify({ version: 2, savedAt: 1_000, inputs: INPUTS })],
  ])('rejects %s from untrusted session storage', (_label, value) => {
    window.sessionStorage.setItem(RETIREMENT_SIGNUP_STORAGE_KEY, value);

    expect(readRetirementSignupContext(2_000)).toBeNull();
    expect(window.sessionStorage.getItem(RETIREMENT_SIGNUP_STORAGE_KEY)).toBeNull();
  });

  it('requires the exact, non-sensitive source marker', () => {
    expect(hasRetirementSignupSource(new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}`))).toBe(true);
    expect(hasRetirementSignupSource(new URLSearchParams('source=pricing'))).toBe(false);
    expect(hasRetirementSignupSource(new URLSearchParams())).toBe(false);
  });
});
