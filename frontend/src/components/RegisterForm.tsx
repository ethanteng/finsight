"use client";
import { useState, useEffect, Suspense } from 'react';
import { getBrowserTimeZone, setStoredUserTimeZone } from '@/lib/browser-time-zone';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Check, CircleAlert, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import AuthFlowShell from './auth/AuthFlowShell';
import { pushBeginCheckout } from '@/lib/dataLayer';
import { useDialog } from '@/components/ui/dialog';

interface SubscriptionContext {
  subscription: string;
  tier: string;
  sessionId: string | null;
}

const inputClasses =
  'w-full rounded-xl border border-[#123c2f]/20 bg-[#fffdf7] py-3 pl-11 pr-4 text-[#123c2f] shadow-sm outline-none placeholder:text-[#8a9b95] focus:border-[#123c2f] focus:ring-4 focus:ring-[#123c2f]/10';

function RegisterFormContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
    const subscriptionParam = searchParams.get('subscription');
    const tierParam = searchParams.get('tier');
    const sessionIdParam = searchParams.get('session_id');

    if (emailParam) {
      setEmail(emailParam);
    }

    if (subscriptionParam && tierParam) {
      setSubscriptionContext({
        subscription: subscriptionParam,
        tier: tierParam,
        sessionId: sessionIdParam
      });
    }
  }, [searchParams]);

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

    if (password !== confirmPassword) {
      setError('Passwords do not match');
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
      eyebrow={subscriptionContext ? 'Finish setting up' : 'Create your account'}
      title={subscriptionContext ? 'Your subscription is ready.' : 'Create your account.'}
      description={
        subscriptionContext
          ? 'Set a password to open your workspace. Verifying your email activates your subscription.'
          : 'Join Ask Linc and start working through your financial decisions with your own data.'
      }
      asideTitle="Start every answer with your full context."
      asideDescription="Connect your accounts once, and every question you ask is answered against your real balances, holdings, and history."
      benefits={[
        'Decision-ready answers grounded in your data',
        'Calculations and supporting evidence one click away',
        'Private, protected access to your financial context',
      ]}
    >
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
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className={inputClasses}
              placeholder="At least 8 characters"
            />
          </div>
        </div>

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

        <button
          type="submit"
          data-cs-override-id="form-submit-register"
          disabled={isLoading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#123c2f] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(18,60,47,.16)] transition hover:bg-[#1a5140] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <><LoaderCircle className="animate-spin" size={17} />Creating account…</>
          ) : (
            <>{subscriptionContext ? 'Create account and continue' : 'Create your account'} <ArrowRight size={17} /></>
          )}
        </button>
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
            link would only let them buy the same subscription twice. */}
        {!subscriptionContext && (
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

export default function RegisterForm() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RegisterFormContent />
    </Suspense>
  );
}
