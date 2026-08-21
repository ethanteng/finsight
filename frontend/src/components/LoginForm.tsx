"use client";
import { useState, useEffect, Suspense } from 'react';
import { pushBeginCheckout } from '@/lib/dataLayer';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Brain, Check, CircleAlert, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import SiteFooter from './SiteFooter';
import { getBrowserTimeZone, setStoredUserTimeZone } from '@/lib/browser-time-zone';
import { useDialog } from '@/components/ui/dialog';

interface SubscriptionContext {
  subscription: string;
  tier: string;
  email: string | null;
  sessionId: string | null;
}

function LoginFormContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { showError, dialog } = useDialog();
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [error, setError] = useState('');
  const [subscriptionContext, setSubscriptionContext] = useState<SubscriptionContext | null>(null);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);
  // Kept in memory (never in localStorage) purely so a lapsed subscriber can
  // start checkout as themselves: the backend reuses their existing Stripe
  // customer instead of creating a second one for the same person.
  const [lapsedToken, setLapsedToken] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check if user came from subscription context or has access denied message
  useEffect(() => {
    // Only run on client side to avoid hydration mismatches
    if (typeof window === 'undefined') return;

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
    }

    // Prefill from any payment-success redirect, including the
    // ACCOUNT_ALREADY_SUBSCRIBED path that only carries email + message.
    if (emailParam) {
      setEmail(emailParam);
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

  const handleBuyClick = async (planId: string, authToken?: string | null) => {
    pushBeginCheckout();
    setIsCheckoutLoading(true);
    
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      
      // Create checkout session for anyone (new or existing users)
      const response = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          tier: planId,
          successUrl: `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&tier=${planId}`,
          cancelUrl: `${window.location.origin}/login`
        })
      });

      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
      } else {
        const error = await response.json();
        console.error('Failed to create checkout session:', error);
        void showError('Failed to create checkout session. Please try again.');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      void showError('An error occurred. Please try again.');
    } finally {
      setIsCheckoutLoading(false);
    }
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
        body: JSON.stringify({ email, password, timeZone: getBrowserTimeZone() }),
      });

      const data = await res.json();

      if (res.ok && data.token) {
        // Check subscription status before redirecting - show expiry message immediately if needed
        const API_URL = process.env.NEXT_PUBLIC_API_URL;
        const statusRes = await fetch(`${API_URL}/api/stripe/subscription-status`, {
          headers: { 'Authorization': `Bearer ${data.token}` }
        });

        if (statusRes.status === 401) {
          const errorData = await statusRes.json().catch(() => ({}));
          const errorMessage = errorData.error || '';
          if (errorMessage.toLowerCase().includes('subscription') && errorMessage.toLowerCase().includes('expired')) {
            setLapsedToken(data.token);
            setSubscriptionExpired(true);
            setError('');
            return;
          }
          setError(errorMessage || 'Your session could not be verified.');
          return;
        }

        if (statusRes.ok) {
          const statusData = await statusRes.json();
          // Only show subscription expired for canceled subscriptions, not inactive (e.g. admin-created accounts)
          if (statusData.status === 'canceled' && statusData.accessLevel !== 'full') {
            setLapsedToken(data.token);
            setSubscriptionExpired(true);
            setError('');
            return;
          }
        }

        localStorage.setItem('auth_token', data.token);
        if (data.user) {
          if (data.user.timeZone) {
            setStoredUserTimeZone(data.user.timeZone);
          }
        }
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
    <div className="flex min-h-screen flex-col bg-[#f5f1e8] text-[#123c2f]">
      <header className="border-b border-[#123c2f]/10 bg-[#f5f1e8]">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight" aria-label="Ask Linc home">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#123c2f] text-[#c9f46b]"><Brain size={20} /></span>
            <span className="text-xl">Ask Linc</span>
          </Link>
          <button type="button" onClick={() => handleBuyClick('premium')} disabled={isCheckoutLoading} className="hidden items-center gap-2 text-sm font-semibold text-[#34594e] hover:text-[#123c2f] sm:inline-flex disabled:opacity-50">{isCheckoutLoading ? 'Loading...' : 'Get started'}</button>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,.95fr)]">
          <section className="relative hidden overflow-hidden bg-[#123c2f] px-12 py-16 text-[#f8f4e9] lg:flex lg:flex-col lg:justify-between" aria-labelledby="login-value-heading">
            <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full border border-[#c9f46b]/20" />
            <div className="absolute -right-10 top-10 h-80 w-80 rounded-full border border-[#c9f46b]/10" />
            <div className="relative max-w-xl">
              <p className="mb-6 text-xs font-bold uppercase tracking-[0.2em] text-[#c9f46b]">Your financial decision workspace</p>
              <h1 id="login-value-heading" className="text-5xl font-semibold leading-[1.04] tracking-[-0.045em]">Pick up where your last decision left off.</h1>
              <p className="mt-6 max-w-lg text-lg leading-8 text-white/65">Your accounts, assumptions, calculations, and prior questions stay connected—so every answer starts with context.</p>
            </div>
            <ul className="relative space-y-5 text-sm text-white/80" aria-label="Workspace benefits">
              {['Decision-ready answers grounded in your data', 'Calculations and supporting evidence one click away', 'Private, protected access to your financial context'].map(item => <li key={item} className="flex items-center gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#c9f46b]/15 text-[#c9f46b]"><Check size={15} /></span>{item}</li>)}
            </ul>
          </section>

          <section className="flex items-center justify-center px-5 py-12 sm:px-10 lg:px-16" aria-labelledby="login-heading">
            <div className="w-full max-w-md">
              <div className="mb-9">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-[#477064]">Secure sign in</p>
                <h1 id="login-heading" className="text-4xl font-semibold tracking-[-0.04em] text-[#123c2f]">Welcome back.</h1>
                <p className="mt-3 text-base leading-7 text-[#607b72]">Continue working through the decisions that matter to you.</p>
                {subscriptionContext && <div className="mt-5 flex gap-3 rounded-2xl border border-[#719632]/25 bg-[#eaf5d5] p-4 text-sm text-[#34551c]" role="status"><Check className="mt-0.5 shrink-0" size={18} /><div><strong className="block">Your subscription is ready.</strong><span className="mt-1 block text-[#4d6a35]">Sign in to open your workspace.</span></div></div>}
              </div>

              {subscriptionExpired ? (
                <div className="rounded-3xl border border-[#d49c3b]/30 bg-[#fff8e8] p-6">
                  <div className="flex gap-3"><CircleAlert className="mt-0.5 shrink-0 text-[#a96d0f]" /><div><h2 className="font-semibold text-[#764c0d]">Subscription expired</h2><p className="mt-2 text-sm leading-6 text-[#765c32]">Renew your subscription to continue using your Ask Linc workspace.</p></div></div>
                  <button type="button" onClick={() => handleBuyClick('premium', lapsedToken)} disabled={isCheckoutLoading} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#123c2f] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1a5140] disabled:cursor-not-allowed disabled:opacity-60">{isCheckoutLoading ? <><LoaderCircle className="animate-spin" size={17} />Opening checkout…</> : <>Start a new subscription <ArrowRight size={17} /></>}</button>
                  <a href={process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL || '#'} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-[#123c2f]/20 px-5 py-3 text-sm font-semibold text-[#123c2f] hover:bg-[#123c2f]/5">Manage billing</a>
                  <p className="mt-4 text-center text-sm text-[#765c32]">Need help? <Link href="/contact" className="font-semibold underline">Contact us</Link>.</p>
                </div>
              ) : (
                <>
                  <form onSubmit={handleSubmit} className="space-y-5" suppressHydrationWarning>
                    {error && <div role="alert" className="flex gap-3 rounded-2xl border border-[#b84a3d]/25 bg-[#fff2ed] p-4 text-sm leading-6 text-[#8b3027]"><CircleAlert className="mt-0.5 shrink-0" size={18} /><span>{error}</span></div>}
                    {error && isPaymentRelatedError(error) && <div className="rounded-2xl border border-[#175cce]/20 bg-[#eaf2ff] p-4 text-sm text-[#254b75]"><strong className="block">Having payment issues?</strong><p className="mt-1 leading-6">Resolve billing securely through Stripe.</p><a href={process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL || '#'} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex font-semibold text-[#175cce] hover:underline">Resolve payment issues <ArrowRight className="ml-1" size={16} /></a></div>}

                    <div suppressHydrationWarning>
                      <label htmlFor="email" className="mb-2 block text-sm font-semibold text-[#29483f]">Email address</label>
                      <input id="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required className="h-13 w-full rounded-xl border border-[#123c2f]/20 bg-[#fffdf7] px-4 py-3 text-[#123c2f] shadow-sm outline-none placeholder:text-[#8a9b95] focus:border-[#123c2f] focus:ring-4 focus:ring-[#123c2f]/10" placeholder="you@example.com" />
                    </div>
                    <div suppressHydrationWarning>
                      <div className="mb-2 flex items-center justify-between"><label htmlFor="password" className="text-sm font-semibold text-[#29483f]">Password</label><Link href="/forgot-password" className="text-sm font-semibold text-[#175cce] hover:underline">Forgot password?</Link></div>
                      <div className="relative"><LockKeyhole className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#71857f]" size={18} /><input id="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required className="h-13 w-full rounded-xl border border-[#123c2f]/20 bg-[#fffdf7] py-3 pl-11 pr-4 text-[#123c2f] shadow-sm outline-none placeholder:text-[#8a9b95] focus:border-[#123c2f] focus:ring-4 focus:ring-[#123c2f]/10" placeholder="Enter your password" /></div>
                    </div>
                    <button type="submit" disabled={isLoading} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#123c2f] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(18,60,47,.16)] transition hover:bg-[#1a5140] disabled:cursor-not-allowed disabled:opacity-60">{isLoading ? <><LoaderCircle className="animate-spin" size={17} />Signing in…</> : <>Sign in to your workspace <ArrowRight size={17} /></>}</button>
                  </form>

                  <div className="mt-7 border-t border-[#123c2f]/10 pt-6 text-center">
                    <p className="text-sm text-[#607b72]">New to Ask Linc? <button onClick={() => handleBuyClick('premium')} disabled={isCheckoutLoading} className="font-semibold text-[#123c2f] underline decoration-[#9bc444] decoration-2 underline-offset-4 disabled:opacity-50">{isCheckoutLoading ? 'Opening checkout…' : 'Get started'}</button></p>
                    <button type="button" onClick={() => handleBuyClick('premium')} disabled={isCheckoutLoading} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#175cce] hover:underline sm:hidden disabled:opacity-50">{isCheckoutLoading ? 'Loading...' : 'Get started'}</button>
                  </div>
                  <div className="mt-8 flex items-center justify-center gap-2 text-xs text-[#71857f]"><ShieldCheck size={16} />Encrypted access. Your financial data stays protected.</div>
                </>
              )}
            </div>
          </section>
        </div>
      </main>
      <SiteFooter variant="auth" />
      {dialog}
    </div>
  );
}

export default function LoginForm() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginFormContent />
    </Suspense>
  );
}
