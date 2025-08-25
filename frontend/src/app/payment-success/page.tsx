"use client";

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PageMeta from '../../components/PageMeta';

function PaymentSuccessContent() {
  const [error, setError] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const processPaymentSuccess = async () => {
      try {
        const sessionId = searchParams.get('session_id');
        const tier = searchParams.get('tier');
        const customerEmail = searchParams.get('customer_email');

        if (!sessionId) {
          setError('Missing session ID');
          return;
        }

        console.log('Processing payment success:', { sessionId, tier, customerEmail });

        // Call the backend payment success endpoint
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const response = await fetch(`${API_URL}/api/stripe/payment-success?` + 
          `session_id=${sessionId}&tier=${tier || 'standard'}&customer_email=${customerEmail || ''}`);

        if (response.ok) {
          // Parse the JSON response to get the redirect URL
          const data = await response.json();
          if (data.success && data.redirectUrl) {
            setRedirectUrl(data.redirectUrl);
            // Redirect after a brief delay to show success message
            setTimeout(() => {
              window.location.href = data.redirectUrl;
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
      } finally {
        // setIsProcessing(false); // This line was removed
      }
    };

    processPaymentSuccess();
  }, [searchParams]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
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
    );
  }

  if (redirectUrl) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Payment Successful!</h3>
              <p className="mt-1 text-sm text-gray-500">
                Redirecting you to complete your account setup...
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
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
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
  );
}

export default function PaymentSuccessPage() {
  return (
    <>
      <PageMeta 
        title="Welcome to Ask Linc | Subscription Activated" 
        description="Congratulations! Your Ask Linc subscription is now active. Welcome to the future of AI-powered financial management. Start exploring your personalized dashboard and unlock advanced financial insights."
      />
      <Suspense fallback={
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
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
      }>
        <PaymentSuccessContent />
      </Suspense>
    </>
  );
}
