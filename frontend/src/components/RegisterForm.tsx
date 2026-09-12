"use client";
import { useState, useEffect, useRef, Suspense } from 'react';
import { getBrowserTimeZone, setStoredUserTimeZone } from '@/lib/browser-time-zone';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Check, CircleAlert, CreditCard, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import AuthFlowShell from './auth/AuthFlowShell';
import {
  pushBeginCheckout,
  pushSignUp,
  pushTrialSignupRegistrationError,
  pushTrialSignupStarted,
  pushTrialSignupSubmit,
  pushTrialSignupValidationError,
  pushTrialSignupViewed,
} from '@/lib/dataLayer';
import { useDialog } from '@/components/ui/dialog';
import {
  hasRetirementSignupSource,
  readRetirementSignupContext,
  type RetirementSignupContext,
} from '@/lib/retirement-signup-context';
import {
  clearCoastFireSignupRef,
  coastFireSignupSummary,
  fetchCoastFireSignupContext,
  hasCoastFireSignupSource,
  readCoastFireSignupContext,
  readCoastFireSignupRef,
  storeCoastFireSignupContext,
  type CoastFireSignupContext,
} from '@/lib/coast-fire-signup-context';
import {
  beginFreeTrialSignupFlow,
  withFreeTrialSignupFlow,
} from '@/lib/trial-signup-flow';

interface SubscriptionContext {
  subscription: string;
  tier: string;
  sessionId: string | null;
}

/**
 * Which funnel this form is serving.
 *
 * - `checkout` (/register): the post-Stripe account-setup step. Reads the
 *   checkout session out of the URL and hands it to the backend so the paid
 *   subscription gets linked to the new account.
 * - `trial` (/getstarted): the "Start free trial" destination. Never touches
 *   Stripe. Registering with no tier and no checkout session leaves the account
 *   at subscriptionStatus "inactive" with no subscription records, which the
 *   backend grants full access to — the same shape as an admin-created account.
 *   That is what makes "no credit card required" true.
 *
 * Both variants submit through the same handler, so the account-creation path
 * cannot drift between the two pages.
 */
export type RegisterFormVariant = 'checkout' | 'trial';

const inputBaseClasses =
  'w-full rounded-xl border border-[#123c2f]/20 bg-[#fffdf7] py-3 pl-11 text-[#123c2f] shadow-sm outline-none placeholder:text-[#8a9b95] focus:border-[#123c2f] focus:ring-4 focus:ring-[#123c2f]/10';

const inputClasses = `${inputBaseClasses} pr-4`;
/** Wider right padding so typed characters clear the show/hide button. */
const passwordInputClasses = `${inputBaseClasses} pr-12`;

const TRIAL_COPY = {
  eyebrow: 'Start planning free',
  title: 'Build your plan free for 30 days.',
  description: 'Bring the decision you are weighing. Turn your real finances into a model you can stress-test and inspect.',
  asideEyebrow: 'Self-directed financial planning',
  asideTitle: 'From one question to a rigorous financial model.',
  asideDescription:
    'Ask in your own words. Linc brings in the relevant numbers, runs supported calculations, and keeps the assumptions and sources attached to the answer.',
  benefits: [
    'Full access for 30 days — no credit card',
    'Model what-if scenarios using your real financial state',
    'Inspect the numbers, assumptions, and math',
  ],
  submit: 'Start planning',
  submitting: 'Creating your planning workspace…',
};

const RETIREMENT_TRIAL_COPY = {
  eyebrow: 'Continue your retirement plan',
  title: 'Let’s make your retirement analysis more accurate.',
  description:
    'Create your account to keep this plan in view and replace the calculator’s estimates with your actual holdings, spending, and income.',
  asideEyebrow: 'From estimates to actuals',
  asideTitle: 'Keep the plan. Replace the assumptions.',
  asideDescription:
    'Ask Linc can rerun the decision with what you actually own, earn, and spend, then let you keep changing the scenario.',
  benefits: [
    'Continue from the retirement scenario you just modeled',
    'Replace estimated assets and allocation with real holdings',
    'Full access for 30 days — no credit card',
  ],
  submit: 'Create account and continue',
  submitting: 'Creating your account…',
};

/**
 * The Coast FIRE arrival, from the page's own CTA or from the link in a
 * results email. The free number is already theirs; what they came for is the
 * question it raised, so the page continues that rather than restating it.
 */
const COAST_FIRE_TRIAL_COPY = {
  eyebrow: 'Continue your Coast FIRE plan',
  title: 'Now find out what coasting would actually cost you.',
  description:
    'Create your account to replace the calculator’s flat return and withdrawal rate with your real holdings, spending, and income.',
  asideEyebrow: 'The number is the easy part',
  asideTitle: 'Know what reaching it lets you change.',
  asideDescription:
    'Ask Linc runs the change you are weighing — stopping contributions, a pay cut, one income instead of two — against your actual finances and a century of market history.',
  benefits: [
    'Continue from the Coast FIRE scenario you just ran',
    'Stress-test it against real market sequences, not one flat return',
    'Full access for 30 days — no credit card',
  ],
  submit: 'Create account and continue',
  submitting: 'Creating your account…',
};

const ACCOUNT_COPY = {
  asideTitle: 'Keep every decision in one planning model.',
  asideDescription:
    'Your balances, holdings, history, goals, and assumptions stay available as inputs to the next decision you model.',
  benefits: [
    'Decision-ready answers grounded in your data',
    'Calculations and supporting evidence one click away',
    'Private, protected access to your financial context',
  ],
};

function RegisterFormContent({ variant }: { variant: RegisterFormVariant }) {
  const isTrial = variant === 'trial';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // The trial form asks for the password once, so revealing it is the only
  // way to catch a typo before it becomes an account you cannot sign into.
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { showError, dialog } = useDialog();
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [error, setError] = useState('');
  const [subscriptionContext, setSubscriptionContext] = useState<SubscriptionContext | null>(null);
  const [retirementContext, setRetirementContext] = useState<RetirementSignupContext | null>(null);
  const [coastFireContext, setCoastFireContext] = useState<CoastFireSignupContext | null>(null);
  const trialViewedRef = useRef(false);
  const trialStartedRef = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isTrial || trialViewedRef.current) return;
    trialViewedRef.current = true;
    beginFreeTrialSignupFlow();
    pushTrialSignupViewed();
  }, [isTrial]);

  // Read URL parameters on component mount
  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    }

    // A retirement continuation is recognized only when both pieces are
    // present: a non-sensitive URL marker and a recent, validated scenario in
    // this tab. Stale storage must not change a later generic /getstarted visit.
    // Every trial path returns here, before reading checkout parameters, so a
    // stray Stripe URL still cannot turn the no-card signup into a paid flow.
    if (isTrial) {
      setRetirementContext(
        hasRetirementSignupSource(searchParams)
          ? readRetirementSignupContext()
          : null,
      );
      // An emailed token is authoritative for this landing. Skip painting any
      // same-tab CTA scenario from sessionStorage while the token exchange runs,
      // so a prior calculator click cannot flash the wrong numbers.
      const emailedRef = hasCoastFireSignupSource(searchParams)
        ? readCoastFireSignupRef()
        : null;
      setCoastFireContext(
        hasCoastFireSignupSource(searchParams) && !emailedRef
          ? readCoastFireSignupContext()
          : null,
      );
      return;
    }

    const subscriptionParam = searchParams.get('subscription');
    const tierParam = searchParams.get('tier');
    const sessionIdParam = searchParams.get('session_id');

    if (subscriptionParam && tierParam) {
      setSubscriptionContext({
        subscription: subscriptionParam,
        tier: tierParam,
        sessionId: sessionIdParam
      });
    }
  }, [searchParams, isTrial]);

  /*
   * The emailed link. A visitor arriving from their results email has no
   * sessionStorage to read — they may be on a different device days later — so
   * the token `/coast-fire/continue` left in a cookie is exchanged for the
   * same seven numbers. Nothing blocks on it: until it resolves, and forever
   * if it fails, the page is the ordinary /getstarted.
   */
  useEffect(() => {
    if (!isTrial || !hasCoastFireSignupSource(searchParams)) return;
    // Handed over in a cookie by `/coast-fire/continue`, never read off the
    // URL: the token resolves to an address and seven figures, and this page
    // loads Google Tag Manager.
    const token = readCoastFireSignupRef();
    if (!token) return;

    // Prefer the emailed token over any cached same-tab scenario. A visitor who
    // stress-tested one run and later opens a different results email in this
    // tab must see the emailed figures, not the older sessionStorage copy.
    const existing = readCoastFireSignupContext();
    if (existing?.sourceToken === token) {
      clearCoastFireSignupRef();
      setCoastFireContext(existing);
      if (existing.email) setEmail((current) => current || existing.email!);
      return;
    }

    const controller = new AbortController();
    void (async () => {
      const resolved = await fetchCoastFireSignupContext(token, controller.signal);
      if (controller.signal.aborted) return;
      // Spent either way: a token that did not resolve will not resolve on a
      // reload, and leaving it would retry the lookup on every visit.
      clearCoastFireSignupRef();
      if (!resolved) return;

      // Kept for the rest of this tab, so a reload or a step backwards in the
      // flow does not lose the scenario and re-ask the backend for it.
      storeCoastFireSignupContext(resolved.inputs, {
        email: resolved.email,
        sourceToken: token,
        emailedOutcome: resolved.emailedOutcome,
      });
      setCoastFireContext(readCoastFireSignupContext());
      // Their own address, from the link we sent them. Prefilled, not locked:
      // they can sign up under a different one.
      if (resolved.email) setEmail((current) => current || resolved.email!);
    })();

    return () => controller.abort();
  }, [isTrial, searchParams]);

  const coastFireSummary = coastFireContext
    ? coastFireSignupSummary(coastFireContext.inputs, coastFireContext.emailedOutcome)
    : null;

  /*
   * Coast FIRE wins when both are somehow present: it is the more specific
   * arrival, and the two sources are mutually exclusive in the URL anyway.
   */
  const trialCopy = coastFireContext
    ? COAST_FIRE_TRIAL_COPY
    : retirementContext
      ? RETIREMENT_TRIAL_COPY
      : TRIAL_COPY;

  const trackTrialStart = (value: string) => {
    if (!isTrial || trialStartedRef.current || value.length === 0) return;
    trialStartedRef.current = true;
    pushTrialSignupStarted();
  };

  const handleBuyClick = async () => {
    pushBeginCheckout();
    setIsCheckoutLoading(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: 'premium',
          successUrl: `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&tier=premium`,
          cancelUrl: `${window.location.origin}/`,
        }),
      });

      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
        return;
      }

      const err = await response.json();
      void showError(err.error || 'Failed to create checkout session. Please try again.');
    } catch (err) {
      console.error(err);
      void showError('An error occurred. Please try again.');
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isTrial) pushTrialSignupSubmit();
    setIsLoading(true);
    setError('');

    // The trial form drops the confirmation field to shorten signup, so there
    // is nothing to compare against there.
    if (!isTrial && password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    // Mirror validatePassword() in src/auth/utils.ts so weak passwords fail
    // before the round-trip — same rules the help text advertises.
    if (
      password.length < 8 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password)
    ) {
      if (isTrial) pushTrialSignupValidationError();
      setError('Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.');
      setIsLoading(false);
      return;
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL;

    // Prepare registration data. These values go only to the auth API, never
    // to either analytics destination.
    const registrationData: {
      email: string;
      password: string;
      tier?: string;
      stripeSessionId?: string;
      timeZone: string;
    } = { email, password, timeZone: getBrowserTimeZone() };

    // If coming from successful subscription, include tier and session info.
    if (subscriptionContext) {
      registrationData.tier = subscriptionContext.tier;
      if (subscriptionContext.sessionId) {
        registrationData.stripeSessionId = subscriptionContext.sessionId;
      }
    }

    let res: Response;
    try {
      res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registrationData),
      });
    } catch {
      if (isTrial) pushTrialSignupRegistrationError('network_error');
      setError('Network error. Please try again.');
      setIsLoading(false);
      return;
    }

    let data: {
      token?: string;
      user?: { timeZone?: string };
      error?: string;
    };
    try {
      data = await res.json();
    } catch {
      if (isTrial) {
        pushTrialSignupRegistrationError(res.ok ? 'unknown' : 'server_rejected');
      }
      setError('Registration failed. Please try again.');
      setIsLoading(false);
      return;
    }

    if (res.ok && data.token) {
      // Registration is the conversion boundary: a form submit or an API
      // error is intent, but only this response confirms a new account.
      pushSignUp({
        signupFlow: isTrial
          ? 'free_trial'
          : subscriptionContext
            ? 'paid_checkout'
            : 'direct',
      });
      localStorage.setItem('auth_token', data.token);
      if (data.user) {
        if (data.user.timeZone) {
          setStoredUserTimeZone(data.user.timeZone);
        }
      }

      // Always go through email verification for security. The no-card flow
      // carries only a fixed attribution flag; no email or form value enters
      // its URL or analytics payload.
      if (isTrial) {
        router.push(withFreeTrialSignupFlow('/verify-email'));
      } else if (subscriptionContext) {
        const verifyUrl = `/verify-email?subscription=${subscriptionContext.subscription}&tier=${subscriptionContext.tier}&email=${encodeURIComponent(email)}&session_id=${subscriptionContext.sessionId || ''}`;
        router.push(verifyUrl);
      } else {
        router.push('/verify-email');
      }
    } else {
      if (isTrial) {
        pushTrialSignupRegistrationError(res.ok ? 'unknown' : 'server_rejected');
      }
      setError(data.error || 'Registration failed');
    }
    setIsLoading(false);
  };

  return (
    <AuthFlowShell
      eyebrow={
        isTrial
          ? trialCopy.eyebrow
          : subscriptionContext
            ? 'Finish setting up'
            : 'Create your account'
      }
      title={
        isTrial
          ? trialCopy.title
          : subscriptionContext
            ? 'Your subscription is ready.'
            : 'Create your account.'
      }
      description={
        isTrial
          ? trialCopy.description
          : subscriptionContext
            ? 'Set a password to open your workspace. Verifying your email activates your subscription.'
            : 'Join Ask Linc and start working through your financial decisions with your own data.'
      }
      asideEyebrow={isTrial ? trialCopy.asideEyebrow : undefined}
      asideTitle={isTrial ? trialCopy.asideTitle : ACCOUNT_COPY.asideTitle}
      asideDescription={isTrial ? trialCopy.asideDescription : ACCOUNT_COPY.asideDescription}
      benefits={isTrial ? trialCopy.benefits : ACCOUNT_COPY.benefits}
    >
      {coastFireSummary && (
        <section
          aria-label="Your Coast FIRE scenario"
          data-cs-mask
          className="mb-5 rounded-2xl border border-[#123c2f]/15 bg-[#fffdf7] p-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#477064]">
              Your Coast FIRE scenario
            </p>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                coastFireSummary.hasReachedCoastFire
                  ? 'bg-[#eaf5d5] text-[#34551c]'
                  : 'bg-[#f7e5c6] text-[#6b4a12]'
              }`}
            >
              {coastFireSummary.hasReachedCoastFire ? 'Reached' : 'Not yet'}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            <ScenarioValue label="Coast FIRE number" value={compactMoney(coastFireSummary.coastFireNumber)} />
            <ScenarioValue label="Saved today" value={compactMoney(coastFireSummary.currentSavings)} />
            <ScenarioValue label="Retire at" value={String(coastFireSummary.retirementAge)} />
          </dl>
        </section>
      )}

      {retirementContext && (
        <section
          aria-label="Your modeled retirement scenario"
          data-cs-mask
          className="mb-5 rounded-2xl border border-[#123c2f]/15 bg-[#fffdf7] p-4 shadow-sm"
        >
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#477064]">
            Your modeled scenario
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            <ScenarioValue label="Retire at" value={String(retirementContext.inputs.retirementAge)} />
            <ScenarioValue label="Assets today" value={compactMoney(retirementContext.inputs.investableAssets)} />
            <ScenarioValue label="Annual spending" value={compactMoney(retirementContext.inputs.annualSpending)} />
          </dl>
        </section>
      )}

      {isTrial && (
        <div
          className="mb-6 flex items-center gap-3 rounded-2xl border border-[#719632]/25 bg-[#eaf5d5] px-4 py-3 text-sm font-semibold text-[#34551c]"
          data-cs-override-id="badge-no-credit-card-getstarted"
        >
          <CreditCard className="shrink-0" size={18} />
          No credit card required
        </div>
      )}

      {subscriptionContext && (
        <div
          role="status"
          className="mb-6 flex gap-3 rounded-2xl border border-[#719632]/25 bg-[#eaf5d5] p-4 text-sm text-[#34551c]"
        >
          <Check className="mt-0.5 shrink-0" size={18} />
          <div>
            <strong className="block">Payment received.</strong>
            <span className="mt-1 block text-[#4d6a35]">
              Complete registration and verify your email to activate your subscription.
            </span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div role="alert" className="flex gap-3 rounded-2xl border border-[#b84a3d]/25 bg-[#fff2ed] p-4 text-sm leading-6 text-[#8b3027]">
            <CircleAlert className="mt-0.5 shrink-0" size={18} />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-semibold text-[#29483f]">
            Email address
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#71857f]" size={18} />
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                trackTrialStart(e.target.value);
              }}
              required
              className={inputClasses}
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-semibold text-[#29483f]">
            Password
          </label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#71857f]" size={18} />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                trackTrialStart(e.target.value);
              }}
              required
              minLength={8}
              aria-describedby="password-requirements"
              className={passwordInputClasses}
              placeholder="Create a password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#71857f] transition hover:text-[#123c2f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#123c2f]/30"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {/* Mirrors validatePassword() in src/auth/utils.ts, so the rules are
              visible before the server rejects the form. */}
          <p id="password-requirements" className="mt-2 text-xs leading-5 text-[#71857f]">
            At least 8 characters, with an uppercase letter, a lowercase letter, and a number.
          </p>
        </div>

        {!isTrial && (
          <div>
            <label htmlFor="confirmPassword" className="mb-2 block text-sm font-semibold text-[#29483f]">
              Confirm password
            </label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#71857f]" size={18} />
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className={inputClasses}
                placeholder="Re-enter your password"
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          data-cs-override-id={isTrial ? 'form-submit-start-free-trial' : 'form-submit-register'}
          disabled={isLoading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#123c2f] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(18,60,47,.16)] transition hover:bg-[#1a5140] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <><LoaderCircle className="animate-spin" size={17} />{isTrial ? trialCopy.submitting : 'Creating account…'}</>
          ) : (
            <>
              {isTrial
                ? trialCopy.submit
                : subscriptionContext
                  ? 'Create account and continue'
                  : 'Create your account'}{' '}
              <ArrowRight size={17} />
            </>
          )}
        </button>

        {isTrial && (
          <p className="text-center text-xs leading-5 text-[#71857f]">
            By starting a trial you agree to our{' '}
            <Link href="/terms" className="font-semibold underline underline-offset-2">Terms</Link>
            {' '}and{' '}
            <Link href="/privacy" className="font-semibold underline underline-offset-2">Privacy Policy</Link>.
          </p>
        )}
      </form>

      <div className="mt-7 border-t border-[#123c2f]/10 pt-6 text-center">
        <p className="text-sm text-[#607b72]">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-semibold text-[#123c2f] underline decoration-[#9bc444] decoration-2 underline-offset-4"
          >
            Sign in
          </Link>
        </p>
        {/* Someone who arrived from Stripe has already paid; a second checkout
            link would only let them buy the same subscription twice. The trial
            page offers no checkout at all. */}
        {!isTrial && !subscriptionContext && (
          <button
            type="button"
            data-cs-override-id="cta-start-free-trial-register-inline"
            onClick={handleBuyClick}
            disabled={isCheckoutLoading}
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#175cce] hover:underline disabled:opacity-50"
          >
            {isCheckoutLoading ? 'Opening checkout…' : 'Get started'}
          </button>
        )}
      </div>
      {dialog}
    </AuthFlowShell>
  );
}

function compactMoney(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `$${millions.toFixed(millions >= 10 || Number.isInteger(millions) ? 0 : 1)}M`;
  }
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}

function ScenarioValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-[#edf1e9] px-3 py-3">
      <dt className="text-[11px] font-semibold leading-4 text-[#607b72]">{label}</dt>
      <dd className="mt-1 truncate text-base font-bold text-[#123c2f]">{value}</dd>
    </div>
  );
}

export default function RegisterForm({ variant = 'checkout' }: { variant?: RegisterFormVariant } = {}) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RegisterFormContent variant={variant} />
    </Suspense>
  );
}
