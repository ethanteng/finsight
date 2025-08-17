"use client";

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function PaymentSuccessPage() {
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const processPaymentSuccess = async () => {
      try {
        const sessionId = searchParams.get('session_id');
        const tier = searchParams.get('tier');
        const customerEmail = searchParams.get('customer_email');

        if (!sessionId) {
          setError('Missing session ID');
          setIsProcessing(false);
          return;
        }

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
            router.push('/register?subscription=success&tier=' + (tier || 'standard'));
          }
        } else {
          // Handle error response
          const errorData = await response.json();
          setError(errorData.error || 'Payment processing failed');
          setIsProcessing(false);
        }
      } catch (err) {
        console.error('Error processing payment success:', err);
        setError('An error occurred while processing your payment');
        setIsProcessing(false);
      }
    };

    processPaymentSuccess();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8">
          <div className="text-red-500 text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold mb-4">Payment Processing Error</h1>
          <p className="text-gray-300 mb-6">{error}</p>
          <Link 
            href="/pricing" 
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            Try Again
          </Link>
        </div>
      </div>
    );
  }

  if (redirectUrl) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8">
          <div className="text-green-500 text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold mb-4">Payment Successful!</h1>
          <p className="text-gray-300 mb-6">
            Redirecting you to complete your account setup...
          </p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="max-w-md mx-auto text-center p-8">
        <div className="text-blue-500 text-6xl mb-4">🔄</div>
        <h1 className="text-2xl font-bold mb-4">Processing Your Payment</h1>
        <p className="text-gray-300 mb-6">
          Please wait while we verify your payment and set up your account...
        </p>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
      </div>
    </div>
  );
}
