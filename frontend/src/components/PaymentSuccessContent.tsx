"use client";
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import SiteFooter from './SiteFooter';
import { pushPurchase } from '@/lib/dataLayer';

function PaymentSuccessContentInner() {
  const [error, setError] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [isTrialing, setIsTrialing] = useState(false);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const processPaymentSuccess = async () => {
      try {
        const sessionId = searchParams.get('session_id');
        const customerEmail = searchParams.get('customer_email');

        if (!sessionId) {
          setError('Missing session ID');
          return;
        }

        console.log('Processing payment success:', { sessionId, customerEmail });

        // Call the backend payment success endpoint. Do not forward URL `tier`:
        // payment-success derives it from the verified Stripe session, and a
        // missing/edited query value used to skew purchase attribution.
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const params = new URLSearchParams({ session_id: sessionId });
        if (customerEmail) {
          params.set('customer_email', customerEmail);
        }
        const response = await fetch(`${API_URL}/api/stripe/payment-success?${params.toString()}`);

        if (response.ok) {
          // Parse the JSON response to get the redirect URL
          const data = await response.json();
          const skippedExisting = data.code === 'ACCOUNT_ALREADY_SUBSCRIBED';
          setIsTrialing(Boolean(data.trialing) && !skippedExisting);
          setAlreadySubscribed(skippedExisting);
          
          // A free trial is not a purchase. Keep this conversion paid-only;
          // trial-start tracking requires a separately configured analytics event.
          // Also skip when checkout was deliberately not attached to the account —
          // that payment is an orphaned duplicate, not a successful subscription.
          //
          // Every field comes from the API response, which is built from the
          // Stripe session the backend just verified, rather than from the query
          // string anyone can edit on the way back from checkout.
          if (data.paid && !skippedExisting) {
            const reported = pushPurchase({
              transactionId: data.session_id,
              value: data.amount,
              currency: data.currency,
              tier: data.tier,
            });
            if (reported) {
              console.log('Purchase event fired:', data.session_id);
            }
          }

          // Use redirect or redirectUrl (support both for backwards compatibility)
          const redirectDestination = data.redirect || data.redirectUrl;
          
          if (data.success && redirectDestination) {
            setRedirectUrl(redirectDestination);
            // Redirect after a brief delay to show success message
            setTimeout(() => {
              window.location.href = redirectDestination;
            }, 2000);
          } else {
            // Fallback redirect
            setRedirectUrl('/register');
            setTimeout(() => {
              window.location.href = '/register';
            }, 2000);
          }
        } else {
          console.error('Payment success API call failed:', response.status);
          setError('Failed to process payment success');
          setRedirectUrl('/register');
          setTimeout(() => {
            window.location.href = '/register';
          }, 3000);
        }
      } catch (error) {
        console.error('Error processing payment success:', error);
        setError('An error occurred while processing your payment');
        setRedirectUrl('/register');
        setTimeout(() => {
          window.location.href = '/register';
        }, 3000);
      }
    };

    processPaymentSuccess();
  }, [searchParams]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Payment Processing Error</h3>
              <p className="mt-1 text-sm text-gray-500">{error}</p>
              <div className="mt-6">
                <Link
                  href="/register"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Continue to Registration
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
    );
  }

  if (redirectUrl) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="text-center">
              <div className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full ${alreadySubscribed ? 'bg-amber-100' : 'bg-green-100'}`}>
                <svg className={`h-6 w-6 ${alreadySubscribed ? 'text-amber-600' : 'text-green-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={alreadySubscribed ? 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' : 'M5 13l4 4L19 7'} />
                </svg>
              </div>
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                {alreadySubscribed
                  ? 'Checkout not applied'
                  : isTrialing
                    ? 'Free trial started!'
                    : 'Payment successful!'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {alreadySubscribed
                  ? 'This account already has an active subscription. Redirecting so you can contact support about a refund...'
                  : isTrialing
                    ? 'Your first charge will be due after the trial. Redirecting you to finish setup...'
                    : 'Redirecting you to complete your account setup...'}
              </p>
              <div className="mt-6">
                <Link
                  href={redirectUrl}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Continue Now
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Processing Payment</h3>
            <p className="mt-1 text-sm text-gray-500">
              Please wait while we process your payment...
            </p>
            <div className="mt-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            </div>
          </div>
        </div>
      </div>
      </div>
      <SiteFooter />
    </div>
  );
}

export default function PaymentSuccessContent() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Loading...</h3>
              <p className="mt-1 text-sm text-gray-500">
                Please wait while we load the payment success page...
              </p>
              <div className="mt-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
    }>
      <PaymentSuccessContentInner />
    </Suspense>
  );
}
