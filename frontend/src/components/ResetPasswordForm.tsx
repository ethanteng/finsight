"use client";
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, LoaderCircle, LockKeyhole } from 'lucide-react';
import AuthFlowShell from './auth/AuthFlowShell';

const RESET_BENEFITS = [
  'Reset links expire automatically after one hour',
  'Your existing financial connections remain protected',
  'Only the account owner can create a new password',
];

const inputClasses =
  'w-full rounded-xl border border-[#123c2f]/20 bg-[#fffdf7] py-3 pl-11 pr-4 text-[#123c2f] shadow-sm outline-none placeholder:text-[#8a9b95] focus:border-[#123c2f] focus:ring-4 focus:ring-[#123c2f]/10';

function ResetPasswordFormContent() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [token, setToken] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      setIsLoading(false);
      return;
    }

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess('Password reset successfully! Redirecting to login...');
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else {
        setError(data.error || 'Failed to reset password');
      }
    } catch (_error) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthFlowShell
        eyebrow="Account recovery"
        title="This link is no longer valid."
        description="Reset links expire after one hour and can only be used once. Request a new one and we’ll email it to you."
        asideTitle="Get back to the decisions that matter."
        asideDescription="Your account recovery is designed to be simple, secure, and private."
        benefits={RESET_BENEFITS}
      >
        <div className="flex gap-3 rounded-2xl border border-[#d49c3b]/30 bg-[#fff8e8] p-4 text-sm leading-6 text-[#765c32]">
          <CircleAlert className="mt-0.5 shrink-0 text-[#a96d0f]" size={18} />
          <span>This reset link is invalid or has expired.</span>
        </div>

        <Link
          href="/forgot-password"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#123c2f] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(18,60,47,.16)] transition hover:bg-[#1a5140]"
        >
          Request a new reset link <ArrowRight size={17} />
        </Link>

        <div className="mt-7 border-t border-[#123c2f]/10 pt-6 text-center">
          <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-[#34594e] hover:text-[#123c2f]">
            <ArrowLeft size={16} /> Back to sign in
          </Link>
        </div>
      </AuthFlowShell>
    );
  }

  return (
    <AuthFlowShell
      eyebrow="Account recovery"
      title="Choose a new password."
      description="Pick a password you don’t use anywhere else. You’ll sign in with it right after."
      asideTitle="Get back to the decisions that matter."
      asideDescription="Your account recovery is designed to be simple, secure, and private."
      benefits={RESET_BENEFITS}
    >
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
          <label htmlFor="password" className="mb-2 block text-sm font-semibold text-[#29483f]">
            New password
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
            Confirm new password
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
              placeholder="Re-enter your new password"
            />
          </div>
        </div>

        <button
          type="submit"
          data-cs-override-id="form-submit-reset-password"
          disabled={isLoading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#123c2f] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(18,60,47,.16)] transition hover:bg-[#1a5140] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? <><LoaderCircle className="animate-spin" size={17} />Resetting…</> : <>Reset password <ArrowRight size={17} /></>}
        </button>
      </form>

      <div className="mt-7 border-t border-[#123c2f]/10 pt-6 text-center">
        <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-[#34594e] hover:text-[#123c2f]">
          <ArrowLeft size={16} /> Back to sign in
        </Link>
      </div>
    </AuthFlowShell>
  );
}

export default function ResetPasswordForm() {
  return (
    <Suspense
      fallback={
        <AuthFlowShell
          eyebrow="Account recovery"
          title="Loading your reset link…"
          description="One moment while we check the link you followed."
          asideTitle="Get back to the decisions that matter."
          asideDescription="Your account recovery is designed to be simple, secure, and private."
          benefits={RESET_BENEFITS}
        >
          <div className="flex items-center gap-3 rounded-2xl border border-[#123c2f]/15 bg-[#fffdf7] p-4 text-sm text-[#607b72]">
            <LoaderCircle className="animate-spin" size={18} />
            Please wait…
          </div>
        </AuthFlowShell>
      }
    >
      <ResetPasswordFormContent />
    </Suspense>
  );
}
