"use client";
import { useState, useEffect, Suspense } from 'react';
import { getBrowserTimeZone, setStoredUserTimeZone } from '@/lib/browser-time-zone';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Check, CircleAlert, CreditCard, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import AuthFlowShell from './auth/AuthFlowShell';
import { pushBeginCheckout, pushSignUp } from '@/lib/dataLayer';
import { useDialog } from '@/components/ui/dialog';

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
  eyebrow: 'Start your free trial',
  title: 'Try free for 30 days.',
  description: 'Connect your accounts. Ask real questions. Get answers using your actual financial picture.',
  asideEyebrow: 'Your financial decision workspace',
  asideTitle: 'Bring a real decision. Leave with a real answer.',
  asideDescription:
    'Connect your accounts once, then ask what you are actually trying to work out. Every answer is built from your own balances, holdings, and history.',
  benefits: [
    'Full access for 30 days — no credit card',
    'Connect banks, brokerages, and property in minutes',
    'Every answer shows the math behind it',
  ],
  submit: 'Start free trial',
  submitting: 'Starting your trial…',
};

const ACCOUNT_COPY = {
  asideTitle: 'Start every answer with your full context.',
  asideDescription:
    'Connect your accounts once, and every question you ask is answered against your real balances, holdings, and history.',
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
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read URL parameters on component mount
  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    }

    // The trial page promises no payment, so it never adopts checkout context
    // even if a stray link carries it — that would silently put the visitor on
    // the paid path behind a "no credit card required" headline.
    if (isTrial) return;

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
      setError('Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.');
      setIsLoading(false);
      return;
    }

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;

      // Prepare registration data
      const registrationData: {
        email: string;
        password: string;
        tier?: string;
        stripeSessionId?: string;
        timeZone: string;
      } = { email, password, timeZone: getBrowserTimeZone() };

      // If coming from successful subscription, include tier and session info
      if (subscriptionContext) {
        registrationData.tier = subscriptionContext.tier;
        if (subscriptionContext.sessionId) {
          registrationData.stripeSessionId = subscriptionContext.sessionId;
        }
      }

      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registrationData),
      });

      const data = await res.json();

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

        // Always go through email verification for security
        // The subscription context will be preserved in the URL for after verification
        if (subscriptionContext) {
          const verifyUrl = `/verify-email?subscription=${subscriptionContext.subscription}&tier=${subscriptionContext.tier}&email=${encodeURIComponent(email)}&session_id=${subscriptionContext.sessionId || ''}`;
          router.push(verifyUrl);
        } else {
          router.push('/verify-email');
        }
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch (_error) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthFlowShell
      eyebrow={
        isTrial
          ? TRIAL_COPY.eyebrow
          : subscriptionContext
            ? 'Finish setting up'
            : 'Create your account'
      }
      title={
        isTrial
          ? TRIAL_COPY.title
          : subscriptionContext
            ? 'Your subscription is ready.'
            : 'Create your account.'
      }
      description={
        isTrial
          ? TRIAL_COPY.description
          : subscriptionContext
            ? 'Set a password to open your workspace. Verifying your email activates your subscription.'
            : 'Join Ask Linc and start working through your financial decisions with your own data.'
      }
      asideEyebrow={isTrial ? TRIAL_COPY.asideEyebrow : undefined}
      asideTitle={isTrial ? TRIAL_COPY.asideTitle : ACCOUNT_COPY.asideTitle}
      asideDescription={isTrial ? TRIAL_COPY.asideDescription : ACCOUNT_COPY.asideDescription}
      benefits={isTrial ? TRIAL_COPY.benefits : ACCOUNT_COPY.benefits}
    >
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
              onChange={(e) => setEmail(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
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
            <><LoaderCircle className="animate-spin" size={17} />{isTrial ? TRIAL_COPY.submitting : 'Creating account…'}</>
          ) : (
            <>
              {isTrial
                ? TRIAL_COPY.submit
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

export default function RegisterForm({ variant = 'checkout' }: { variant?: RegisterFormVariant } = {}) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RegisterFormContent variant={variant} />
    </Suspense>
  );
}
