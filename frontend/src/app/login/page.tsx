"use client";
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface SubscriptionContext {
  subscription: string;
  tier: string;
  email: string | null;
  sessionId: string | null;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [subscriptionContext, setSubscriptionContext] = useState<SubscriptionContext | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check if user came from subscription context or has access denied message
  useEffect(() => {
    const subscriptionParam = searchParams.get('subscription');
    const tierParam = searchParams.get('tier');
    const emailParam = searchParams.get('email');
    const sessionIdParam = searchParams.get('session_id');
    const messageParam = searchParams.get('message');
    const accessDeniedParam = searchParams.get('access_denied');

    if (subscriptionParam && tierParam) {
      setSubscriptionContext({
        subscription: subscriptionParam,
        tier: tierParam,
        email: emailParam,
        sessionId: sessionIdParam
      });
      
      // Pre-fill email if provided
      if (emailParam) {
        setEmail(emailParam);
      }
    }

          // Show subscription access denied message if present
      if (messageParam) {
        setError(messageParam);
        
        // Clear the message parameter to prevent showing it again on refresh
        const url = new URL(window.location.href);
        url.searchParams.delete('message');
        window.history.replaceState({}, '', url.toString());
      }

    // Handle access denied redirects (prevents app screen flash)
    if (accessDeniedParam) {
      const reason = searchParams.get('reason') || 'Access denied';
      setError(`Access denied: ${reason}. Please resolve any payment issues to continue.`);
      
      // Clear the URL parameters to prevent showing the error again on refresh
      const url = new URL(window.location.href);
      url.searchParams.delete('access_denied');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.toString());
    }

    // Check if user was redirected back from app due to access issues
    // This prevents the brief flash of the app screen
    const redirectedFromApp = searchParams.get('redirected') === 'true';
    if (redirectedFromApp) {
      const redirectReason = searchParams.get('reason') || 'access issues';
      setError(`You were redirected back to login due to ${redirectReason}. Please resolve any payment or subscription issues to continue.`);
      
      // Clear the redirect parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('redirected');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.toString());
    }


  }, [searchParams]);

  // Helper function to detect payment-related errors
  const isPaymentRelatedError = (errorMessage: string): boolean => {
    const paymentKeywords = [
      'payment',
      'subscription',
      'billing',
      'card',
      'stripe',
      'past due',
      'incomplete',
      'canceled',
      'unpaid',
      'payment method',
      'credit card',
      'debit card'
    ];
    
    const lowerError = errorMessage.toLowerCase();
    return paymentKeywords.some(keyword => lowerError.includes(keyword));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok && data.token) {
        localStorage.setItem('auth_token', data.token);
        
        // Always redirect to /app after successful login
        // Users can access their profile from within the app
        router.push('/app');
      } else {
        setError(data.error || 'Login failed');
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
          <h1 className="text-3xl font-bold">Welcome Back</h1>
          <p className="text-gray-400 mt-2">Sign in to your Ask Linc account</p>
          
          {subscriptionContext && (
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-md">
              <p className="text-green-400 text-sm">
                🎉 Your subscription is ready!
              </p>
              <p className="text-green-400 text-xs mt-1">
                Sign in to access your subscription.
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
          
          {/* Payment Issues Help Section - Only show for payment-related errors */}
          {error && isPaymentRelatedError(error) && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-4">
              <div className="flex items-start space-x-3">
                <div className="text-blue-400 text-lg">💳</div>
                <div className="flex-1">
                  <h3 className="text-blue-400 font-medium text-sm mb-2">Having payment issues?</h3>
                  <p className="text-blue-300 text-xs mb-3">
                    If you're locked out due to payment problems, you can resolve them directly with Stripe.
                  </p>
                  <a
                    href={process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-colors"
                  >
                    Resolve Payment Issues →
                  </a>
                </div>
              </div>
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
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Enter your password"
            />
            <div className="text-right mt-2">
              <Link href="/forgot-password" className="text-primary hover:text-primary/80 text-sm">
                Forgot password?
              </Link>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="text-center">
          <p className="text-gray-400 text-sm">
            Don't have an account?{' '}
            <Link href="/register" className="text-primary hover:text-primary/80">
              Sign up
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