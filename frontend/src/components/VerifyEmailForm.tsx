"use client";
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CircleAlert, CircleCheck, LoaderCircle, MailCheck, RefreshCw } from 'lucide-react';
import AuthFlowShell from './auth/AuthFlowShell';
import {
  pushTrialVerifyError,
  pushTrialVerifySkipped,
  pushTrialVerifySubmit,
  pushTrialVerifySuccess,
  pushTrialVerifyViewed,
} from '@/lib/dataLayer';
import {
  completeFreeTrialSignupFlow,
  isFreeTrialSignupContinuation,
} from '@/lib/trial-signup-flow';
import { DEFAULT_POST_LOGIN_DESTINATION } from '@/lib/post-login-redirect';

/*
 * Only what the "your subscription is ready" banner needs. The address and the
 * checkout session used to be carried on to the sign-in URL; verification now
 * opens the workspace directly, and the checkout was linked to the account at
 * registration, so neither has a reader here any more.
 */
interface SubscriptionContext {
  subscription: string;
  tier: string;
}

function VerifyEmailFormContent() {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [subscriptionContext, setSubscriptionContext] = useState<SubscriptionContext | null>(null);
  const [isFreeTrialFlow, setIsFreeTrialFlow] = useState(false);
  const trialViewedRef = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check if user came from subscription context
  useEffect(() => {
    const trialContinuation = isFreeTrialSignupContinuation(searchParams);
    setIsFreeTrialFlow(trialContinuation);
    if (trialContinuation && !trialViewedRef.current) {
      trialViewedRef.current = true;
      pushTrialVerifyViewed();
    }

    const subscriptionParam = searchParams.get('subscription');
    const tierParam = searchParams.get('tier');

    if (subscriptionParam && tierParam) {
      setSubscriptionContext({
        subscription: subscriptionParam,
        tier: tierParam,
      });
    }
  }, [searchParams]);

  /*
   * Calculator-lead signups can arrive already verified — the emailed link
   * proved the address, so registration never mailed a code. A stale frontend
   * build (backend deployed first) still sends every account here; without this
   * check the visitor waits for a code that will never arrive. Same bounce if
   * they bookmarked the page after a link-proved signup.
   *
   * The token that answered this call is the session, so the bounce goes to the
   * workspace rather than the sign-in form: there is no step left to perform.
   */
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    const controller = new AbortController();

    void (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as {
          user?: { emailVerified?: boolean };
        };
        if (data.user?.emailVerified !== true) return;

        if (isFreeTrialSignupContinuation(searchParams)) {
          completeFreeTrialSignupFlow();
        }
        router.push(DEFAULT_POST_LOGIN_DESTINATION);
      } catch {
        // Network blip or abort — leave them on the form; resend still works
        // for accounts that actually need a code.
      }
    })();

    return () => controller.abort();
  }, [router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isFreeTrialFlow) pushTrialVerifySubmit();
    setIsLoading(true);
    setError('');
    setSuccess('');

    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    const token = localStorage.getItem('auth_token');
    let res: Response;
    try {
      res = await fetch(`${API_URL}/auth/verify-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ code: code }),
      });
    } catch {
      if (isFreeTrialFlow) pushTrialVerifyError('network_error');
      setError('Network error. Please try again.');
      setIsLoading(false);
      return;
    }

    const data = await res.json().catch(() => ({})) as { error?: string };

    if (res.ok) {
      if (isFreeTrialFlow) pushTrialVerifySuccess();
      setSuccess('Email verified. Opening your workspace…');

      /*
       * The token that authorized this call is kept: it is the session the
       * account was created with, and it is still valid. Signing in again here
       * would only re-collect the password set a screen ago. /app re-verifies
       * the token and the subscription on mount, so this hands over a session
       * rather than granting access.
       */
      if (isFreeTrialFlow) {
        // This is where the no-card funnel ends now. Nothing downstream will
        // report its completion, and a stale record follows the tab for hours.
        completeFreeTrialSignupFlow();
      }

      setTimeout(() => {
        router.push(DEFAULT_POST_LOGIN_DESTINATION);
      }, 2000);
    } else {
      if (isFreeTrialFlow) pushTrialVerifyError('server_rejected');
      setError(data.error || 'Failed to verify email');
    }
    setIsLoading(false);
  };

  const handleResendCode = async () => {
    setIsResending(true);
    setError('');

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const token = localStorage.getItem('auth_token');
      
      const res = await fetch(`${API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess('Verification code resent to your email');
      } else {
        setError(data.error || 'Failed to resend verification code');
      }
    } catch (_error) {
      setError('Network error. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  const handleSendCode = async () => {
    setIsResending(true);
    setError('');

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const token = localStorage.getItem('auth_token');
      
      const res = await fetch(`${API_URL}/auth/send-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess('Verification code sent to your email');
      } else {
        setError(data.error || 'Failed to send verification code');
      }
    } catch (_error) {
      setError('Network error. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <AuthFlowShell
      eyebrow="One last step"
      title="Verify your email."
      description="Enter the six-digit code we sent to your inbox to activate your Ask Linc account."
      asideTitle="Your financial context stays yours."
      asideDescription="Email verification helps keep your private workspace and connected financial information in the right hands."
      benefits={[
        'A short-lived code protects account activation',
        'Your workspace remains private and encrypted',
        'Verification takes less than a minute',
      ]}
    >
          {subscriptionContext && (
            <div className="mb-5 flex gap-3 rounded-2xl border border-[#719632]/25 bg-[#eaf5d5] p-4 text-sm text-[#34551c]" role="status">
              <CircleCheck className="mt-0.5 shrink-0" size={18} />
              <div>
                <strong className="block">Your subscription is ready.</strong>
                <span className="mt-1 block text-[#4d6a35]">Verify your email to open your workspace.</span>
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

          {success && (
            <div role="status" className="flex gap-3 rounded-2xl border border-[#719632]/25 bg-[#eaf5d5] p-4 text-sm leading-6 text-[#34551c]">
              <CircleCheck className="mt-0.5 shrink-0" size={18} />
              <span>{success}</span>
            </div>
          )}

          <div>
            <label htmlFor="code" className="mb-2 block text-sm font-semibold text-[#29483f]">
              Verification Code
            </label>
            <div className="relative">
              <MailCheck className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#71857f]" size={19} />
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                maxLength={6}
                className="h-14 w-full rounded-xl border border-[#123c2f]/20 bg-[#fffdf7] py-3 pl-12 pr-4 text-center font-mono text-2xl font-semibold tracking-[0.3em] text-[#123c2f] shadow-sm outline-none placeholder:text-[#a6b0ac] focus:border-[#123c2f] focus:ring-4 focus:ring-[#123c2f]/10"
                placeholder="000000"
                aria-describedby="code-help"
              />
            </div>
            <p id="code-help" className="mt-2 text-xs leading-5 text-[#71857f]">The code expires 15 minutes after it is sent.</p>
          </div>

          <button
            type="submit"
            data-cs-override-id="form-submit-verify-email"
            disabled={isLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#123c2f] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(18,60,47,.16)] transition hover:bg-[#1a5140] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <><LoaderCircle className="animate-spin" size={17} />Verifying…</> : <>Verify email <ArrowRight size={17} /></>}
          </button>
        </form>

        <div className="mt-7 border-t border-[#123c2f]/10 pt-6">
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-5">
            <button
              type="button"
              onClick={handleResendCode}
              disabled={isResending}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#175cce] hover:underline disabled:opacity-50"
            >
              <RefreshCw className={isResending ? 'animate-spin' : ''} size={15} />
              {isResending ? 'Sending…' : 'Resend code'}
            </button>
            <button
              type="button"
              onClick={handleSendCode}
              disabled={isResending}
              className="text-sm font-semibold text-[#34594e] hover:text-[#123c2f] disabled:opacity-50"
            >
              Send a new code
            </button>
          </div>
        </div>

        <div className="mt-5 text-center">
          <Link
            href={DEFAULT_POST_LOGIN_DESTINATION}
            onClick={() => {
              if (!isFreeTrialFlow) return;
              // Report before clearing: the event reads the attribution this
              // call is about to drop, and a skip is a completion too.
              pushTrialVerifySkipped();
              completeFreeTrialSignupFlow();
            }}
            className="text-sm text-[#71857f] hover:text-[#123c2f]"
          >
            Skip for now
          </Link>
        </div>
    </AuthFlowShell>
  );
}

export default function VerifyEmailForm() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VerifyEmailFormContent />
    </Suspense>
  );
}
