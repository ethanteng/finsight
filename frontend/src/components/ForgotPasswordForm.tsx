"use client";
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, LoaderCircle, Mail } from 'lucide-react';
import AuthFlowShell from './auth/AuthFlowShell';

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(data.message);
      } else {
        setError(data.error || 'Failed to send reset email');
      }
    } catch (_error) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthFlowShell
      eyebrow="Account recovery"
      title="Reset your password."
      description="Enter the email connected to your Ask Linc account and we’ll send you a secure reset link."
      asideTitle="Get back to the decisions that matter."
      asideDescription="Your account recovery is designed to be simple, secure, and private."
      benefits={[
        'Reset links expire automatically after one hour',
        'Your existing financial connections remain protected',
        'Only the account owner can create a new password',
      ]}
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
                className="h-13 w-full rounded-xl border border-[#123c2f]/20 bg-[#fffdf7] py-3 pl-11 pr-4 text-[#123c2f] shadow-sm outline-none placeholder:text-[#8a9b95] focus:border-[#123c2f] focus:ring-4 focus:ring-[#123c2f]/10"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#123c2f] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(18,60,47,.16)] transition hover:bg-[#1a5140] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <><LoaderCircle className="animate-spin" size={17} />Sending link…</> : <>Send reset link <ArrowRight size={17} /></>}
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
