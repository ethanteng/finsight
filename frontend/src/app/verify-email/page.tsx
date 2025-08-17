"use client";
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface SubscriptionContext {
  subscription: string;
  tier: string;
  email: string | null;
  sessionId: string | null;
}

function VerifyEmailPageContent() {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [subscriptionContext, setSubscriptionContext] = useState<SubscriptionContext | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check if user came from subscription context
  useEffect(() => {
    const subscriptionParam = searchParams.get('subscription');
    const tierParam = searchParams.get('tier');
    const emailParam = searchParams.get('email');
    const sessionIdParam = searchParams.get('session_id');

    if (subscriptionParam && tierParam) {
      setSubscriptionContext({
        subscription: subscriptionParam,
        tier: tierParam,
        email: emailParam,
        sessionId: sessionIdParam
      });
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const token = localStorage.getItem('auth_token');
      
      const res = await fetch(`${API_URL}/auth/verify-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ code: code }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess('Email verified successfully! Redirecting to login...');
        
        // Clear the auth token
        localStorage.removeItem('auth_token');
        
        // Always redirect to login after email verification
        // Users must authenticate properly to access the app
        setTimeout(() => {
          if (subscriptionContext) {
            const loginUrl = `/login?subscription=${subscriptionContext.subscription}&tier=${subscriptionContext.tier}&email=${encodeURIComponent(subscriptionContext.email || '')}&session_id=${subscriptionContext.sessionId || ''}`;
            router.push(loginUrl);
          } else {
            router.push('/login');
          }
        }, 2000);
      } else {
        setError(data.error || 'Failed to verify email');
      }
    } catch (_error) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
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
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Verify Your Email</h1>
          <p className="text-gray-400 mt-2">Enter the verification code sent to your email</p>
          
          {subscriptionContext && (
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-md">
              <p className="text-green-400 text-sm">
                🎉 Your subscription is waiting!
              </p>
              <p className="text-green-400 text-xs mt-1">
                Verify your email to activate your subscription.
              </p>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-md p-3 text-green-400 text-sm">
              {success}
            </div>
          )}

          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-300 mb-2">
              Verification Code
            </label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              maxLength={6}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-center text-2xl tracking-widest"
              placeholder="000000"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            {isLoading ? 'Verifying...' : 'Verify Email'}
          </button>
        </form>

        <div className="space-y-4">
          <div className="text-center">
            <button
              onClick={handleResendCode}
              disabled={isResending}
              className="text-primary hover:text-primary/80 disabled:opacity-50 text-sm"
            >
              {isResending ? 'Sending...' : 'Resend Code'}
            </button>
          </div>

          <div className="text-center">
            <button
              onClick={handleSendCode}
              disabled={isResending}
              className="text-gray-400 hover:text-white disabled:opacity-50 text-sm"
            >
              {isResending ? 'Sending...' : 'Send New Code'}
            </button>
          </div>
        </div>

        <div className="text-center">
          <Link href="/login" className="text-gray-400 hover:text-white text-sm">
            Skip for now
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VerifyEmailPageContent />
    </Suspense>
  );
} 