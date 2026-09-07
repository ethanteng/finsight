"use client";
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CircleAlert, CreditCard, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import AuthFlowShell from './auth/AuthFlowShell';
import { getBrowserTimeZone, setStoredUserTimeZone } from '@/lib/browser-time-zone';

/**
 * Free-trial signup, served at /getstarted.
 *
 * Deliberately separate from /register: this is the destination for the "Start
 * free trial" marketing CTA, so it is framed for someone who has never seen the
 * product, and it never touches Stripe. Registering with no checkout session
 * leaves the account at subscriptionStatus "inactive" with no subscription
 * records, which the backend grants full access to — the same shape as an
 * admin-created account. That is what makes "no credit card required" true.
 *
 * /register keeps handling the post-checkout path, where a Stripe session has
 * to be linked to the new account.
 */

const inputClasses =
  'w-full rounded-xl border border-[#123c2f]/20 bg-[#fffdf7] py-3 pl-11 pr-4 text-[#123c2f] shadow-sm outline-none placeholder:text-[#8a9b95] focus:border-[#123c2f] focus:ring-4 focus:ring-[#123c2f]/10';

function GetStartedFormContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  // Lets a marketing page hand over an address someone already typed there.
  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) setEmail(emailParam);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No tier and no Stripe session: the backend defaults the tier and
        // leaves the account without a subscription record, which is the
        // no-payment account shape.
        body: JSON.stringify({ email, password, timeZone: getBrowserTimeZone() }),
      });

      const data = await res.json();

      if (res.ok && data.token) {
        localStorage.setItem('auth_token', data.token);
        if (data.user?.timeZone) {
          setStoredUserTimeZone(data.user.timeZone);
        }
        router.push('/verify-email');
      } else {
        setError(data.error || 'We could not create your account. Please try again.');
      }
    } catch (_error) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthFlowShell
      eyebrow="Start your free trial"
      title="Try Ask Linc free for 30 days."
      description="Connect your accounts. Ask real questions. Get answers using your actual financial picture."
      asideEyebrow="Your financial decision workspace"
      asideTitle="Bring a real decision. Leave with a real answer."
      asideDescription="Connect your accounts once, then ask what you are actually trying to work out. Every answer is built from your own balances, holdings, and history."
      benefits={[
        'Full access for 30 days — no credit card',
        'Connect banks, brokerages, and property in minutes',
        'Every answer shows the math behind it',
      ]}
    >
      <div
        className="mb-6 flex items-center gap-3 rounded-2xl border border-[#719632]/25 bg-[#eaf5d5] px-4 py-3 text-sm font-semibold text-[#34551c]"
        data-cs-override-id="badge-no-credit-card-getstarted"
      >
        <CreditCard className="shrink-0" size={18} />
        No credit card required
      </div>

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
              aria-describedby="password-requirements"
              className={inputClasses}
              placeholder="Create a password"
            />
          </div>
          {/* Mirrors validatePassword() in src/auth/utils.ts, so the rules are
              visible before the server rejects the form. */}
          <p id="password-requirements" className="mt-2 text-xs leading-5 text-[#71857f]">
            At least 8 characters, with an uppercase letter, a lowercase letter, and a number.
          </p>
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
          data-cs-override-id="form-submit-start-free-trial"
          disabled={isLoading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#123c2f] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(18,60,47,.16)] transition hover:bg-[#1a5140] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <><LoaderCircle className="animate-spin" size={17} />Starting your trial…</>
          ) : (
            <>Start free trial <ArrowRight size={17} /></>
          )}
        </button>

        <p className="text-center text-xs leading-5 text-[#71857f]">
          By starting a trial you agree to our{' '}
          <Link href="/terms" className="font-semibold underline underline-offset-2">Terms</Link>
          {' '}and{' '}
          <Link href="/privacy" className="font-semibold underline underline-offset-2">Privacy Policy</Link>.
        </p>
      </form>

      <div className="mt-7 border-t border-[#123c2f]/10 pt-6 text-center">
        <p className="text-sm text-[#607b72]">
          Already have an account?{' '}
          <Link
            href="/login"
            data-cs-override-id="link-sign-in-getstarted"
            className="font-semibold text-[#123c2f] underline decoration-[#9bc444] decoration-2 underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthFlowShell>
  );
}

export default function GetStartedForm() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GetStartedFormContent />
    </Suspense>
  );
}
