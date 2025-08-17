"use client";
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface SubscriptionContext {
  subscription: string;
  tier: string;
  sessionId: string | null;
}

function RegisterPageContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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
      } = { email, password };
      
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
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Create Account</h1>
          <p className="text-gray-400 mt-2">Join Ask Linc to get started</p>
          
          {subscriptionContext && (
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-md">
              <p className="text-green-400 text-sm">
                🎉 Welcome! Your subscription is ready.
              </p>
              <p className="text-green-400 text-xs mt-1">
                Complete registration and verify your email to activate your subscription.
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

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Enter your email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Enter your password (min 8 characters)"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Confirm your password"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            {isLoading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="text-center">
          <p className="text-gray-400 text-sm">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:text-primary/80">
              Sign in
            </Link>
          </p>
        </div>

        <div className="text-center">
          <Link href="/demo" className="text-gray-400 hover:text-white text-sm">
            Or try the demo version
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RegisterPageContent />
    </Suspense>
  );
} 