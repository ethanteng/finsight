/**
 * @jest-environment-options {"url": "http://localhost/getstarted"}
 *
 * The document URL matters here: `/coast-fire/continue` hands the emailed
 * token over in a cookie scoped to /getstarted, and jsdom applies cookie path
 * matching, so at the default "/" URL that cookie would be invisible.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RegisterForm from '@/components/RegisterForm';
import { PENDING_FIRST_DECISION_STORAGE_KEY } from '@/lib/pending-first-decision';
import { USER_TIME_ZONE_KEY } from '@/lib/browser-time-zone';
import {
  pushSignUp,
  pushTrialSignupCompleted,
  pushCalculatorResultsEmailCtaOpened,
  pushCalculatorResultsPageCtaOpened,
  pushTrialSignupRegistrationError,
  pushTrialSignupStarted,
  pushTrialSignupSubmit,
  pushTrialSignupValidationError,
  pushTrialSignupViewed,
} from '@/lib/dataLayer';
import {
  RETIREMENT_REF_COOKIE,
  RETIREMENT_SIGNUP_SOURCE,
  storeRetirementSignupContext,
} from '@/lib/retirement-signup-context';
import {
  COAST_FIRE_REF_COOKIE,
  COAST_FIRE_SIGNUP_SOURCE,
  storeCoastFireSignupContext,
} from '@/lib/coast-fire-signup-context';

const push = jest.fn();
let searchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));
jest.mock('@/lib/dataLayer', () => ({
  pushBeginCheckout: jest.fn(),
  pushCalculatorResultsEmailCtaOpened: jest.fn(),
  pushCalculatorResultsPageCtaOpened: jest.fn(),
  pushSignUp: jest.fn(),
  pushTrialSignupCompleted: jest.fn(),
  pushTrialSignupRegistrationError: jest.fn(),
  pushTrialSignupStarted: jest.fn(),
  pushTrialSignupSubmit: jest.fn(),
  pushTrialSignupValidationError: jest.fn(),
  pushTrialSignupViewed: jest.fn(),
}));

const mockPushSignUp = jest.mocked(pushSignUp);
const mockPushCalculatorResultsEmailCtaOpened = jest.mocked(pushCalculatorResultsEmailCtaOpened);
const mockPushCalculatorResultsPageCtaOpened = jest.mocked(pushCalculatorResultsPageCtaOpened);
const mockPushTrialSignupRegistrationError = jest.mocked(pushTrialSignupRegistrationError);
const mockPushTrialSignupStarted = jest.mocked(pushTrialSignupStarted);
const mockPushTrialSignupSubmit = jest.mocked(pushTrialSignupSubmit);
const mockPushTrialSignupValidationError = jest.mocked(pushTrialSignupValidationError);
const mockPushTrialSignupViewed = jest.mocked(pushTrialSignupViewed);

function fillForm(password = 'Password1', confirm = password) {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'new@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  // Only the checkout variant asks for confirmation.
  const confirmField = screen.queryByLabelText('Confirm password');
  if (confirmField) {
    fireEvent.change(confirmField, { target: { value: confirm } });
  }
}

describe('RegisterForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    // Cookies survive between cases in jsdom; a leftover handover token would
    // make the next case look like an arrival from an email.
    for (const entry of document.cookie.split(';')) {
      const name = entry.trim().split('=')[0];
      if (name) document.cookie = `${name}=; Path=/getstarted; Max-Age=0`;
    }
    searchParams = new URLSearchParams();
  });

  describe('trial variant (/getstarted)', () => {
    it('frames the page around starting a free trial rather than signing back in', () => {
      render(<RegisterForm variant="trial" />);

      expect(screen.getByRole('heading', { name: 'Build your plan free for 30 days.' })).toBeInTheDocument();
      expect(screen.getByText('No credit card required')).toBeInTheDocument();
      expect(screen.queryByText('Welcome back.')).not.toBeInTheDocument();
      // Both the header and the form footer offer the existing-account escape hatch.
      const signIn = screen.getAllByRole('link', { name: 'Sign in' });
      expect(signIn).toHaveLength(2);
      signIn.forEach((link) => expect(link).toHaveAttribute('href', '/login'));
      expect(mockPushTrialSignupViewed).toHaveBeenCalledTimes(1);
    });

    it('tracks the first meaningful form edit once without identifying the field or value', () => {
      const { rerender } = render(<RegisterForm variant="trial" />);

      fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'new@example.com' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password1' } });
      rerender(<RegisterForm variant="trial" />);

      expect(mockPushTrialSignupViewed).toHaveBeenCalledTimes(1);
      expect(mockPushTrialSignupStarted).toHaveBeenCalledTimes(1);
      expect(mockPushTrialSignupStarted).toHaveBeenCalledWith();
    });

    it('continues a valid retirement scenario without exposing its values to Contentsquare', async () => {
      searchParams = new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}`);
      expect(storeRetirementSignupContext({
        currentAge: 48,
        retirementAge: 60,
        investableAssets: 1_200_000,
        annualSpending: 95_000,
        annualContributions: 35_000,
        socialSecurityAnnual: 36_000,
        socialSecurityStartAge: 67,
        lifeExpectancy: 95,
        allocation: 'balanced',
      })).toBe(true);

      render(<RegisterForm variant="trial" />);

      expect(await screen.findByRole('heading', {
        name: 'Let’s make your retirement analysis more accurate.',
      })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Try free for 30 days.' })).not.toBeInTheDocument();

      const summary = screen.getByRole('region', { name: 'Your modeled retirement scenario' });
      expect(summary).toHaveAttribute('data-cs-mask');
      expect(within(summary).getByText('60')).toBeInTheDocument();
      expect(within(summary).getByText('$1.2M')).toBeInTheDocument();
      expect(within(summary).getByText('$95K')).toBeInTheDocument();
      expect(screen.getByText('No credit card required')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Create account and continue/i })).toBeInTheDocument();
    });

    /** What `/coast-fire/continue` leaves behind after stripping the URL. */
    function handOverRef(token: string) {
      document.cookie = `${COAST_FIRE_REF_COOKIE}=${token}; Path=/getstarted`;
    }

    const COAST_FIRE_SCENARIO = {
      currentAge: 48,
      retirementAge: 65,
      currentSavings: 400_000,
      annualRetirementSpending: 80_000,
      annualRetirementIncome: 30_000,
      realReturnRate: 5,
      withdrawalRate: 4,
    };

    it('continues a Coast FIRE scenario clicked through in the same tab', async () => {
      searchParams = new URLSearchParams(`source=${COAST_FIRE_SIGNUP_SOURCE}`);
      expect(storeCoastFireSignupContext(COAST_FIRE_SCENARIO)).toBe(true);

      render(<RegisterForm variant="trial" />);

      expect(await screen.findByRole('heading', {
        name: 'Now find out what coasting would actually cost you.',
      })).toBeInTheDocument();

      const summary = screen.getByRole('region', { name: 'Your Coast FIRE scenario' });
      expect(summary).toHaveAttribute('data-cs-mask');
      // $545,371 on these inputs — derived from the seven numbers, not stored
      // alongside them, so the page cannot disagree with the calculator.
      expect(within(summary).getByText('$545K')).toBeInTheDocument();
      expect(within(summary).getByText('$400K')).toBeInTheDocument();
      expect(within(summary).getByText('Not yet')).toBeInTheDocument();
    });

    it('exchanges an emailed token for the scenario and prefills that address', async () => {
      const token = 'a'.repeat(48);
      searchParams = new URLSearchParams(`source=${COAST_FIRE_SIGNUP_SOURCE}`);
      handOverRef(token);
      const fetchMock = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          email: 'reader@example.com',
          inputs: COAST_FIRE_SCENARIO,
          coastFireNumber: 545_371,
          hasReachedCoastFire: false,
        }),
      })) as unknown as typeof fetch;
      global.fetch = fetchMock;

      render(<RegisterForm variant="trial" />);

      expect(await screen.findByRole('region', { name: 'Your Coast FIRE scenario' })).toBeInTheDocument();
      expect(screen.getByLabelText('Email address')).toHaveValue('reader@example.com');
      expect(String((fetchMock as unknown as jest.Mock).mock.calls[0][0]))
        .toContain(`/api/coast-fire/signup-context/${token}`);
      expect(mockPushCalculatorResultsEmailCtaOpened)
        .toHaveBeenCalledWith('coast_fire_calculator');
      /*
       * The token is a 90-day bearer credential for this address and these
       * seven figures, and this page loads Google Tag Manager in <head>, which
       * records the URL of every pageview. So it arrives in a cookie that
       * `/coast-fire/continue` set, and never in the address bar.
       */
      expect(window.location.search).not.toContain(token);
      // Spent, so a reload is an ordinary visit rather than a replay.
      await waitFor(() => expect(document.cookie).not.toContain(COAST_FIRE_REF_COOKIE));
    });

    it('lets an emailed ref override a different scenario left in sessionStorage', async () => {
      const token = 'c'.repeat(48);
      // Stale same-tab CTA scenario that must not win over the email link.
      expect(storeCoastFireSignupContext({
        ...COAST_FIRE_SCENARIO,
        currentSavings: 50_000,
      })).toBe(true);
      searchParams = new URLSearchParams(`source=${COAST_FIRE_SIGNUP_SOURCE}`);
      handOverRef(token);
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          email: 'from-email@example.com',
          inputs: COAST_FIRE_SCENARIO,
          coastFireNumber: 545_371,
          hasReachedCoastFire: false,
        }),
      })) as unknown as typeof fetch;

      render(<RegisterForm variant="trial" />);

      const summary = await screen.findByRole('region', { name: 'Your Coast FIRE scenario' });
      expect(within(summary).getByText('$400K')).toBeInTheDocument();
      expect(within(summary).queryByText('$50K')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Email address')).toHaveValue('from-email@example.com');
      expect(global.fetch).toHaveBeenCalled();
    });

    /*
     * A link that has expired, or a lookup that fails, still has to land the
     * visitor on a working signup page rather than an error.
     */
    it('falls back to the generic page when the emailed token no longer resolves', async () => {
      searchParams = new URLSearchParams(`source=${COAST_FIRE_SIGNUP_SOURCE}`);
      handOverRef('b'.repeat(48));
      global.fetch = jest.fn(async () => ({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      })) as unknown as typeof fetch;

      render(<RegisterForm variant="trial" />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(screen.getByRole('heading', { name: 'Build your plan free for 30 days.' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Your Coast FIRE scenario' })).not.toBeInTheDocument();
    });

    const RETIREMENT_SCENARIO = {
      currentAge: 48,
      retirementAge: 60,
      investableAssets: 1_200_000,
      annualSpending: 95_000,
      annualContributions: 35_000,
      socialSecurityAnnual: 36_000,
      socialSecurityStartAge: 67,
      lifeExpectancy: 95,
      allocation: 'balanced' as const,
    };

    /** What `/retirement/continue` leaves behind after stripping the URL. */
    function handOverRetirementRef(token: string) {
      document.cookie = `${RETIREMENT_REF_COOKIE}=${token}; Path=/getstarted`;
    }

    /*
     * The token says a run was carried here; it does not say from where. The
     * straight-from-the-page route carries the same token in the same cookie,
     * so without the marker every later event — started, submitted, completed
     * — files under the email funnel and the comparison this entry exists to
     * make is quietly wrong. The stored flow is what all of them read.
     */
    it('attributes a run carried straight from the page to its own entry', async () => {
      const token = 'e'.repeat(48);
      searchParams = new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}&entry=results_page`);
      handOverRetirementRef(token);
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          email: 'reader@example.com',
          inputs: RETIREMENT_SCENARIO,
          outcome: { survivalRate: 0.92, sequencesTested: 800, sequencesSurvived: 736 },
        }),
      })) as unknown as typeof fetch;

      render(<RegisterForm variant="trial" />);
      await screen.findByLabelText('Email address');

      const stored = JSON.parse(
        window.sessionStorage.getItem('asklinc.trial-signup-flow.v1')!,
      );
      expect(stored.signupEntry).toBe('results_page');
      expect(stored.signupOrigin).toBe('retirement_calculator');
      // Its own event fires, and the email funnel's key event stays out of it.
      expect(mockPushCalculatorResultsPageCtaOpened).toHaveBeenCalledWith('retirement_calculator');
      expect(mockPushCalculatorResultsEmailCtaOpened).not.toHaveBeenCalled();
    });

    /*
     * The capture writes the cookie and the stored run together, and only one
     * of them can be refused. When it is the cookie, the run still paints from
     * session storage — so the funnel that measures this route must not lose
     * exactly the visitors whose handover half-failed.
     */
    it('reports the page entry when the cookie was refused but the run survived', async () => {
      searchParams = new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}&entry=results_page`);
      storeRetirementSignupContext(RETIREMENT_SCENARIO, {
        email: 'reader@example.com',
        sourceToken: 'b'.repeat(48),
      });

      render(<RegisterForm variant="trial" />);
      await screen.findByLabelText('Email address');

      expect(mockPushCalculatorResultsPageCtaOpened)
        .toHaveBeenCalledWith('retirement_calculator');
      // Once, however many effects looked.
      expect(mockPushCalculatorResultsPageCtaOpened).toHaveBeenCalledTimes(1);
      expect(mockPushCalculatorResultsEmailCtaOpened).not.toHaveBeenCalled();
    });

    /* The same landing without the marker is still the emailed funnel. */
    it('still attributes an emailed token to the email entry', async () => {
      const token = 'd'.repeat(48);
      searchParams = new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}`);
      handOverRetirementRef(token);
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          email: 'reader@example.com',
          inputs: RETIREMENT_SCENARIO,
          outcome: { survivalRate: 0.92, sequencesTested: 800, sequencesSurvived: 736 },
        }),
      })) as unknown as typeof fetch;

      render(<RegisterForm variant="trial" />);
      await screen.findByLabelText('Email address');

      const stored = JSON.parse(
        window.sessionStorage.getItem('asklinc.trial-signup-flow.v1')!,
      );
      expect(stored.signupEntry).toBe('results_email');
    });

    it('exchanges an emailed retirement token and prefills that address', async () => {
      const token = 'f'.repeat(48);
      searchParams = new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}`);
      handOverRetirementRef(token);
      const fetchMock = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          email: 'reader@example.com',
          inputs: RETIREMENT_SCENARIO,
          outcome: { survivalRate: 0.92, sequencesTested: 800, sequencesSurvived: 736 },
        }),
      })) as unknown as typeof fetch;
      global.fetch = fetchMock;

      render(<RegisterForm variant="trial" />);

      const summary = await screen.findByRole('region', { name: 'Your modeled retirement scenario' });
      expect(within(summary).getByText('$1.2M')).toBeInTheDocument();
      expect(screen.getByLabelText('Email address')).toHaveValue('reader@example.com');
      expect(String((fetchMock as unknown as jest.Mock).mock.calls[0][0]))
        .toContain(`/api/retirement-quickplan/signup-context/${token}`);
      expect(mockPushCalculatorResultsEmailCtaOpened)
        .toHaveBeenCalledWith('retirement_calculator');
      // The token is a bearer credential and this page loads Google Tag
      // Manager, so it arrives in a cookie and never in the address bar.
      expect(window.location.search).not.toContain(token);
      await waitFor(() => expect(document.cookie).not.toContain(RETIREMENT_REF_COOKIE));
    });

    /*
     * The registration body is what turns the emailed run into the account's
     * first decision. Without `calculatorRef`, the backend has nothing to seed.
     */
    it('sends the emailed retirement token with registration as calculatorRef', async () => {
      const token = 'f'.repeat(48);
      searchParams = new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}`);
      handOverRetirementRef(token);
      const fetchMock = jest.fn(async (url: RequestInfo | URL) => {
        if (String(url).includes('/auth/register')) {
          return {
            ok: true,
            json: async () => ({
              token: 'trial-token',
              user: { email: 'reader@example.com', timeZone: 'America/New_York' },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            email: 'reader@example.com',
            inputs: RETIREMENT_SCENARIO,
            outcome: { survivalRate: 0.92, sequencesTested: 800, sequencesSurvived: 736 },
          }),
        };
      }) as unknown as typeof fetch;
      global.fetch = fetchMock;

      render(<RegisterForm variant="trial" />);
      await screen.findByRole('region', { name: 'Your modeled retirement scenario' });

      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password1' } });
      fireEvent.click(screen.getByRole('button', { name: /Create account and continue/i }));

      await waitFor(() => expect(push).toHaveBeenCalledWith('/verify-email?signup_flow=free_trial'));
      const registerCall = (fetchMock as unknown as jest.Mock).mock.calls.find(
        ([url]) => String(url).includes('/auth/register'),
      );
      expect(registerCall).toBeDefined();
      const body = JSON.parse(registerCall![1].body as string);
      expect(body.calculatorRef).toBe(token);
      expect(body.email).toBe('reader@example.com');
      // Which calculator this continued from, so the new account joins that
      // calculator's marketing group alongside the trial one.
      expect(body.signupOrigin).toBe('retirement_calculator');
    });

    /*
     * The field is prefilled but editable, and the server refuses to seed a run
     * onto an address its lead was never sent to. That refusal is right, but it
     * is silent: the email and this page both said the run would be waiting, so
     * a changed address would deliver an empty app and no explanation.
     */
    it('says where a saved run is attached when the address is changed away from it', async () => {
      const token = 'e'.repeat(48);
      searchParams = new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}`);
      handOverRetirementRef(token);
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          email: 'reader@example.com',
          inputs: RETIREMENT_SCENARIO,
          outcome: { survivalRate: 0.92, sequencesTested: 800, sequencesSurvived: 736 },
        }),
      })) as unknown as typeof fetch;

      render(<RegisterForm variant="trial" />);
      await screen.findByRole('region', { name: 'Your modeled retirement scenario' });

      // Prefilled and matching: nothing to warn about.
      expect(screen.queryByText(/saved retirement run is attached/i)).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Email address'), {
        target: { value: 'work@example.com' },
      });

      const note = await screen.findByText(/saved retirement run is attached/i);
      expect(note).toHaveTextContent('reader@example.com');

      // Changing back clears it; the mismatch is the only reason it is there.
      fireEvent.change(screen.getByLabelText('Email address'), {
        target: { value: 'READER@example.com ' },
      });
      await waitFor(() =>
        expect(screen.queryByText(/saved retirement run is attached/i)).not.toBeInTheDocument(),
      );
    });

    it('says where a saved Coast FIRE run is attached when the address is changed away from it', async () => {
      const token = 'f'.repeat(48);
      searchParams = new URLSearchParams(`source=${COAST_FIRE_SIGNUP_SOURCE}`);
      handOverRef(token);
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          email: 'reader@example.com',
          inputs: COAST_FIRE_SCENARIO,
          coastFireNumber: 545_371,
          hasReachedCoastFire: false,
        }),
      })) as unknown as typeof fetch;

      render(<RegisterForm variant="trial" />);
      await screen.findByRole('region', { name: 'Your Coast FIRE scenario' });

      expect(screen.queryByText(/saved Coast FIRE run is attached/i)).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Email address'), {
        target: { value: 'work@example.com' },
      });

      const note = await screen.findByText(/saved Coast FIRE run is attached/i);
      expect(note).toHaveTextContent('reader@example.com');

      fireEvent.change(screen.getByLabelText('Email address'), {
        target: { value: 'READER@example.com ' },
      });
      await waitFor(() =>
        expect(screen.queryByText(/saved Coast FIRE run is attached/i)).not.toBeInTheDocument(),
      );
    });

    /*
     * Following a link sent to an address proves the same thing a mailed code
     * proves, so a signup that arrived holding a matching lead token skips the
     * verification screen — and the sign-in form with it, since the
     * registration response already carries a usable session.
     *
     * The decision is the server's, and these two cases are the whole of it:
     * the client reads `user.emailVerified` off the response and never infers
     * it from the token it sent. Nothing a client can put in the request body
     * skips the step on its own.
     */
    it('skips verification when the server says the link already proved the address', async () => {
      const token = 'd'.repeat(48);
      searchParams = new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}`);
      handOverRetirementRef(token);
      global.fetch = jest.fn(async (url: RequestInfo | URL) => {
        if (String(url).includes('/auth/register')) {
          return {
            ok: true,
            json: async () => ({
              token: 'trial-token',
              user: { email: 'reader@example.com', emailVerified: true },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            email: 'reader@example.com',
            inputs: RETIREMENT_SCENARIO,
            outcome: { survivalRate: 0.92, sequencesTested: 800, sequencesSurvived: 736 },
          }),
        };
      }) as unknown as typeof fetch;

      render(<RegisterForm variant="trial" />);
      await screen.findByRole('region', { name: 'Your modeled retirement scenario' });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password1' } });
      fireEvent.click(screen.getByRole('button', { name: /Create account and continue/i }));

      await waitFor(() => expect(push).toHaveBeenCalledWith('/app'));
      expect(push).not.toHaveBeenCalledWith('/verify-email?signup_flow=free_trial');
      expect(push).not.toHaveBeenCalledWith(expect.stringContaining('/login'));
      // The session minted by registration is what opens the workspace; the
      // visitor never re-enters the password they just set.
      expect(localStorage.getItem('auth_token')).toBe('trial-token');
      expect(pushTrialSignupCompleted).toHaveBeenCalledTimes(1);
      expect(pushTrialSignupCompleted).toHaveBeenCalledWith('email_link');
      /*
       * Registration answers before the first decision is written, and the
       * navigation no longer waits behind a sign-in form. Signup does not stall
       * to cover that — it hands the workspace the fact that a decision is
       * coming, and /app resolves it there.
       */
      expect(sessionStorage.getItem(PENDING_FIRST_DECISION_STORAGE_KEY)).not.toBeNull();
      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/conversations'),
        expect.anything(),
      );
    });

    it('still verifies when the server does not say the address was proved', async () => {
      const token = 'd'.repeat(48);
      searchParams = new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}`);
      handOverRetirementRef(token);
      global.fetch = jest.fn(async (url: RequestInfo | URL) => {
        if (String(url).includes('/auth/register')) {
          // A token went up, but the server did not accept it as proof — a
          // lead sent to a different address, or an expired one.
          return {
            ok: true,
            json: async () => ({
              token: 'trial-token',
              user: { email: 'reader@example.com', emailVerified: false },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            email: 'reader@example.com',
            inputs: RETIREMENT_SCENARIO,
            outcome: { survivalRate: 0.92, sequencesTested: 800, sequencesSurvived: 736 },
          }),
        };
      }) as unknown as typeof fetch;

      render(<RegisterForm variant="trial" />);
      await screen.findByRole('region', { name: 'Your modeled retirement scenario' });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password1' } });
      fireEvent.click(screen.getByRole('button', { name: /Create account and continue/i }));

      await waitFor(() => expect(push).toHaveBeenCalledWith('/verify-email?signup_flow=free_trial'));
    });

    /*
     * The exchange spends the cookie as soon as the lookup settles, and every
     * later read of the token goes through sessionStorage. Storage can be
     * refused outright by a privacy setting, and the stored scenario expires
     * after two hours while the token is good for ninety days — so with only
     * those two copies, someone who followed a link from their own inbox gets
     * sent through verification anyway and silently loses the first decision
     * both the email and this page promised them.
     */
    it('keeps the run usable when browser storage refuses to hold it', async () => {
      const token = 'f'.repeat(48);
      searchParams = new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}`);
      handOverRetirementRef(token);

      // Exactly what a blocked storage partition does: writes are accepted and
      // nothing comes back. Restored in `finally`, because a spy on
      // Storage.prototype that outlives a failing assertion breaks every case
      // after this one.
      const setItem = jest
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => undefined);
      const getItem = jest
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => null);

      try {
        const fetchMock = jest.fn(async (url: RequestInfo | URL) => {
          if (String(url).includes('/auth/register')) {
            return {
              ok: true,
              json: async () => ({
                token: 'trial-token',
                user: { email: 'reader@example.com', timeZone: 'America/New_York' },
              }),
            };
          }
          return {
            ok: true,
            json: async () => ({
              email: 'reader@example.com',
              inputs: RETIREMENT_SCENARIO,
              outcome: { survivalRate: 0.92, sequencesTested: 800, sequencesSurvived: 736 },
            }),
          };
        }) as unknown as typeof fetch;
        global.fetch = fetchMock;

        render(<RegisterForm variant="trial" />);

        // Rendered from the lookup rather than from what came back out of
        // storage, so the scenario and the address are both on the page.
        await screen.findByRole('region', { name: 'Your modeled retirement scenario' });
        expect(screen.getByLabelText('Email address')).toHaveValue('reader@example.com');

        // And the mismatch warning still works, which is the thing worth
        // protecting: it is all that stands between changing this address and a
        // silently empty account.
        fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'work@example.com' } });
        expect(await screen.findByText(/reader@example\.com/)).toBeInTheDocument();

        // The token survives independently of storage, so the run is still
        // claimed for whichever address is finally submitted.
        fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'reader@example.com' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password1' } });
        fireEvent.click(screen.getByRole('button', { name: /Create account and continue/i }));

        await waitFor(() => expect(push).toHaveBeenCalled());
        const registerCall = (fetchMock as unknown as jest.Mock).mock.calls.find(
          ([url]) => String(url).includes('/auth/register'),
        );
        expect(JSON.parse(registerCall![1].body as string).calculatorRef).toBe(token);
      } finally {
        setItem.mockRestore();
        getItem.mockRestore();
      }
    });

    /*
     * The exchange paints the scenario; the cookie is what still holds the
     * bearer while that request is in flight. A submit that wins the race must
     * still carry the token, or the account is created without its first decision.
     */
    it('still sends calculatorRef when registration beats the emailed-token exchange', async () => {
      const token = 'c'.repeat(48);
      searchParams = new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}`);
      handOverRetirementRef(token);
      // Never settles: the cookie is still the only copy of the bearer.
      const fetchMock = jest.fn(async (url: RequestInfo | URL) => {
        if (String(url).includes('/auth/register')) {
          return {
            ok: true,
            json: async () => ({
              token: 'trial-token',
              user: { email: 'reader@example.com', timeZone: 'America/New_York' },
            }),
          };
        }
        return new Promise(() => undefined);
      }) as unknown as typeof fetch;
      global.fetch = fetchMock;

      const { unmount } = render(<RegisterForm variant="trial" />);
      // Exchange still pending — no scenario painted, cookie still present.
      expect(screen.queryByRole('region', { name: 'Your modeled retirement scenario' })).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'reader@example.com' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password1' } });
      fireEvent.click(screen.getByRole('button', { name: /Start planning/i }));

      await waitFor(() => expect(push).toHaveBeenCalledWith('/verify-email?signup_flow=free_trial'));
      const registerCall = (fetchMock as unknown as jest.Mock).mock.calls.find(
        ([url]) => String(url).includes('/auth/register'),
      );
      expect(JSON.parse(registerCall![1].body as string).calculatorRef).toBe(token);
      unmount();
    });

    /*
     * The email stated a survival figure. Both the engine and the market
     * dataset change inside the token's 90 days, so the page shows what was
     * sent rather than anything recomputed.
     */
    /*
     * Whole-percent rounding turned a 99.6% survival rate into "100% lasted"
     * while the email said 99.6%. The figure is stored precisely so the page
     * and the inbox agree; rounding it here gave that away.
     */
    it('never rounds the emailed verdict up to a stronger claim', async () => {
      searchParams = new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}`);
      handOverRetirementRef('c'.repeat(48));
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          email: 'reader@example.com',
          inputs: RETIREMENT_SCENARIO,
          outcome: { survivalRate: 0.996, sequencesTested: 685, sequencesSurvived: 682 },
        }),
      })) as unknown as typeof fetch;

      render(<RegisterForm variant="trial" />);

      const summary = await screen.findByRole('region', { name: 'Your modeled retirement scenario' });
      expect(within(summary).getByText('99.6% lasted')).toBeInTheDocument();
      expect(within(summary).queryByText('100% lasted')).not.toBeInTheDocument();
    });

    it('shows the verdict the email stated', async () => {
      searchParams = new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}`);
      handOverRetirementRef('e'.repeat(48));
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          email: 'reader@example.com',
          inputs: RETIREMENT_SCENARIO,
          outcome: { survivalRate: 0.62, sequencesTested: 800, sequencesSurvived: 496 },
        }),
      })) as unknown as typeof fetch;

      render(<RegisterForm variant="trial" />);

      const summary = await screen.findByRole('region', { name: 'Your modeled retirement scenario' });
      expect(within(summary).getByText('62.0% lasted')).toBeInTheDocument();
    });

    /* A same-tab click-through has no emailed verdict, so it claims none. */
    it('shows no verdict badge for a scenario carried in the same tab', async () => {
      searchParams = new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}`);
      storeRetirementSignupContext(RETIREMENT_SCENARIO);

      render(<RegisterForm variant="trial" />);

      const summary = await screen.findByRole('region', { name: 'Your modeled retirement scenario' });
      expect(within(summary).queryByText(/lasted/)).not.toBeInTheDocument();
    });

    it('falls back to the generic page when the emailed retirement token no longer resolves', async () => {
      searchParams = new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}`);
      handOverRetirementRef('d'.repeat(48));
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      })) as unknown as typeof fetch;

      render(<RegisterForm variant="trial" />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(screen.getByRole('heading', { name: 'Build your plan free for 30 days.' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Your modeled retirement scenario' })).not.toBeInTheDocument();
    });

    /*
     * The cookie is the only surviving copy of the token once `/continue` has
     * stripped it from the URL. A backend that was briefly unreachable is not
     * a verdict on the token, so dropping it there would lose the emailed
     * personalization with no way to reload into a retry.
     */
    it.each([
      ['a server error', { ok: false, status: 502 }],
      ['a rate limit', { ok: false, status: 429 }],
    ])('keeps the emailed token after %s so a reload can retry', async (_label, response) => {
      searchParams = new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}`);
      handOverRetirementRef('a'.repeat(48));
      global.fetch = jest.fn(async () => ({
        ...response,
        json: async () => ({ error: 'nope' }),
      })) as unknown as typeof fetch;

      render(<RegisterForm variant="trial" />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(document.cookie).toContain(RETIREMENT_REF_COOKIE);
      // And the page is still an ordinary, working signup.
      expect(screen.getByRole('heading', { name: 'Build your plan free for 30 days.' })).toBeInTheDocument();
    });

    /* A 404 is the endpoint saying it has no such token; retrying cannot help. */
    it('spends the emailed token when the backend definitively does not know it', async () => {
      searchParams = new URLSearchParams(`source=${RETIREMENT_SIGNUP_SOURCE}`);
      handOverRetirementRef('a'.repeat(48));
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      })) as unknown as typeof fetch;

      render(<RegisterForm variant="trial" />);

      await waitFor(() => expect(document.cookie).not.toContain(RETIREMENT_REF_COOKIE));
    });

    it('keeps generic /getstarted unchanged when the retirement source or scenario is missing', async () => {
      storeRetirementSignupContext({
        currentAge: 48,
        retirementAge: 60,
        investableAssets: 1_200_000,
        annualSpending: 95_000,
        annualContributions: 35_000,
        socialSecurityAnnual: 36_000,
        socialSecurityStartAge: 67,
        lifeExpectancy: 95,
        allocation: 'balanced',
      });

      render(<RegisterForm variant="trial" />);

      expect(screen.getByRole('heading', { name: 'Build your plan free for 30 days.' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Your modeled retirement scenario' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Start planning/i })).toBeInTheDocument();
    });

    it('offers no route to Stripe checkout', () => {
      render(<RegisterForm variant="trial" />);

      expect(screen.queryByRole('button', { name: 'Get started' })).not.toBeInTheDocument();
    });

    it('creates the account with no Stripe session so no payment details are collected', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          token: 'trial-token',
          user: { email: 'new@example.com', timeZone: 'America/New_York' },
        }),
      });

      render(<RegisterForm variant="trial" />);
      fillForm();
      fireEvent.click(screen.getByRole('button', { name: /Start planning/i }));

      await waitFor(() => expect(push).toHaveBeenCalledWith('/verify-email?signup_flow=free_trial'));

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('/auth/register');
      const body = JSON.parse(init.body as string);
      expect(body.email).toBe('new@example.com');
      // A tier or checkout session would put the account on the paid path.
      expect(body).not.toHaveProperty('tier');
      expect(body).not.toHaveProperty('stripeSessionId');
      // Nothing on this page may reach Stripe.
      expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);

      expect(localStorage.getItem('auth_token')).toBe('trial-token');
      expect(localStorage.getItem(USER_TIME_ZONE_KEY)).toBe('America/New_York');
      expect(mockPushSignUp).toHaveBeenCalledWith({ signupFlow: 'free_trial' });
      expect(mockPushTrialSignupSubmit).toHaveBeenCalledTimes(1);
      expect(mockPushTrialSignupRegistrationError).not.toHaveBeenCalled();
    });

    /*
     * The calculator page's own CTA, which carries no token — nothing was
     * emailed, so nothing has put this address on that calculator's list yet.
     * The source parameter is the only attribution the arrival has, and these
     * are the signups the calculator groups otherwise never see.
     */
    it.each([
      [RETIREMENT_SIGNUP_SOURCE, 'retirement_calculator'],
      [COAST_FIRE_SIGNUP_SOURCE, 'coast_fire_calculator'],
    ])('reports %s as the calculator a click-through continued from', async (source, origin) => {
      searchParams = new URLSearchParams(`source=${source}`);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'trial-token', user: { email: 'new@example.com' } }),
      });

      render(<RegisterForm variant="trial" />);
      fillForm();
      fireEvent.click(screen.getByRole('button', { name: /Create account and continue|Start planning/i }));

      await waitFor(() => expect(push).toHaveBeenCalledWith('/verify-email?signup_flow=free_trial'));
      const registerCall = (global.fetch as jest.Mock).mock.calls.find(
        ([url]) => String(url).includes('/auth/register'),
      );
      const body = JSON.parse(registerCall![1].body as string);
      expect(body.signupOrigin).toBe(origin);
      // A click-through has no emailed token to send.
      expect(body).not.toHaveProperty('calculatorRef');
    });

    it('claims no calculator for a signup that reached the page any other way', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'trial-token', user: { email: 'new@example.com' } }),
      });

      render(<RegisterForm variant="trial" />);
      fillForm();
      fireEvent.click(screen.getByRole('button', { name: /Start planning/i }));

      await waitFor(() => expect(push).toHaveBeenCalledWith('/verify-email?signup_flow=free_trial'));
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
      expect(body).not.toHaveProperty('signupOrigin');
    });

    it('ignores checkout context on the URL rather than quietly charging a trial signup', async () => {
      searchParams = new URLSearchParams('subscription=active&tier=premium&session_id=cs_test_123');
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'trial-token', user: { email: 'new@example.com' } }),
      });

      render(<RegisterForm variant="trial" />);
      expect(screen.queryByText('Payment received.')).not.toBeInTheDocument();

      fillForm();
      fireEvent.click(screen.getByRole('button', { name: /Start planning/i }));

      await waitFor(() => expect(push).toHaveBeenCalledWith('/verify-email?signup_flow=free_trial'));
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
      expect(body).not.toHaveProperty('stripeSessionId');
    });

    it('asks for the password once, with no confirmation field', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'trial-token', user: { email: 'new@example.com' } }),
      });

      render(<RegisterForm variant="trial" />);
      expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument();

      // A single password field is still enough to submit.
      fillForm();
      fireEvent.click(screen.getByRole('button', { name: /Start planning/i }));

      await waitFor(() => expect(push).toHaveBeenCalledWith('/verify-email?signup_flow=free_trial'));
    });

    it('reveals the password on request, so a typo is catchable without a confirm field', () => {
      global.fetch = jest.fn();

      render(<RegisterForm variant="trial" />);
      const field = screen.getByLabelText('Password');
      expect(field).toHaveAttribute('type', 'password');

      fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
      expect(field).toHaveAttribute('type', 'text');

      fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
      expect(field).toHaveAttribute('type', 'password');

      // A bare <button> inside a form defaults to type="submit"; toggling
      // visibility must not fire the registration request.
      expect(global.fetch).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      expect(mockPushTrialSignupSubmit).not.toHaveBeenCalled();
      expect(mockPushTrialSignupValidationError).not.toHaveBeenCalled();
    });

    it('rejects passwords that fail the advertised complexity rules without calling the API', async () => {
      global.fetch = jest.fn();

      render(<RegisterForm variant="trial" />);
      fillForm('password');
      fireEvent.click(screen.getByRole('button', { name: /Start planning/i }));

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.',
        ),
      );
      expect(global.fetch).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      expect(mockPushTrialSignupSubmit).toHaveBeenCalledTimes(1);
      expect(mockPushTrialSignupValidationError).toHaveBeenCalledTimes(1);
    });

    it('surfaces a rejected registration instead of routing onward', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'User with this email already exists' }),
      });

      render(<RegisterForm variant="trial" />);
      fillForm();
      fireEvent.click(screen.getByRole('button', { name: /Start planning/i }));

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('User with this email already exists'),
      );
      expect(push).not.toHaveBeenCalled();
      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(mockPushSignUp).not.toHaveBeenCalled();
      expect(mockPushTrialSignupSubmit).toHaveBeenCalledTimes(1);
      expect(mockPushTrialSignupRegistrationError).toHaveBeenCalledWith('server_rejected');
    });

    it('classifies a failed registration request without exposing the thrown error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('new@example.com Password1'));

      render(<RegisterForm variant="trial" />);
      fillForm();
      fireEvent.click(screen.getByRole('button', { name: /Start planning/i }));

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('Network error. Please try again.'),
      );
      expect(mockPushTrialSignupRegistrationError).toHaveBeenCalledWith('network_error');
      expect(mockPushTrialSignupRegistrationError).not.toHaveBeenCalledWith(
        expect.stringContaining('new@example.com'),
      );
    });
  });

  describe('checkout variant (/register)', () => {
    it('still confirms the password, and blocks a mismatch', async () => {
      global.fetch = jest.fn();

      render(<RegisterForm />);
      expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();

      fillForm('Password1', 'Password2');
      fireEvent.click(screen.getByRole('button', { name: /Create your account/i }));

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match'));
      expect(global.fetch).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
    });

    it('keeps the plain account-creation framing by default', () => {
      render(<RegisterForm />);

      expect(screen.getByRole('heading', { name: 'Create your account.' })).toBeInTheDocument();
      expect(screen.queryByText('No credit card required')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Get started' })).toBeInTheDocument();
    });

    it('links a completed checkout session to the new account', async () => {
      searchParams = new URLSearchParams('subscription=active&tier=premium&session_id=cs_test_123');
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'paid-token', user: { email: 'new@example.com' } }),
      });

      render(<RegisterForm />);
      expect(screen.getByText('Payment received.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Your subscription is ready.' })).toBeInTheDocument();

      fillForm();
      fireEvent.click(screen.getByRole('button', { name: /Create account and continue/i }));

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
      expect(body.tier).toBe('premium');
      expect(body.stripeSessionId).toBe('cs_test_123');

      await waitFor(() =>
        expect(push).toHaveBeenCalledWith(
          '/verify-email?subscription=active&tier=premium',
        ),
      );
      expect(push).not.toHaveBeenCalledWith(expect.stringContaining('email='));
      expect(push).not.toHaveBeenCalledWith(expect.stringContaining('session_id='));
      expect(mockPushSignUp).toHaveBeenCalledWith({ signupFlow: 'paid_checkout' });
    });

    it('attributes a plain /register success as a direct signup', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          token: 'direct-token',
          user: { email: 'new@example.com', timeZone: 'America/New_York' },
        }),
      });

      render(<RegisterForm />);
      fillForm();
      fireEvent.click(screen.getByRole('button', { name: /Create your account/i }));

      await waitFor(() => expect(push).toHaveBeenCalledWith('/verify-email'));

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
      expect(body.email).toBe('new@example.com');
      expect(body).not.toHaveProperty('tier');
      expect(body).not.toHaveProperty('stripeSessionId');
      expect(mockPushSignUp).toHaveBeenCalledWith({ signupFlow: 'direct' });
    });
  });
});
