"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import SiteFooter from './SiteFooter';
import { pushBeginCheckout } from '@/lib/dataLayer';
import { replaceLocation } from '@/lib/external-navigation';

/**
 * The landing page for a "subscribe" link in an email campaign.
 *
 * Stripe Checkout has no durable URL — a session is minted per checkout and
 * expires — so an email cannot link to it directly. This page stands in for
 * one: it mints a session on mount and forwards the visitor to it.
 *
 * It deliberately does the minting in the browser rather than as a backend
 * redirect endpoint, for three reasons:
 *
 *  - Authentication. `optionalAuth` reads a Bearer header and nothing else, so
 *    a top-level navigation from a mail client carries no identity at all. A
 *    backend GET link is therefore anonymous by construction, and the server
 *    would reuse no Stripe customer and grant a fresh trial to a returning
 *    subscriber. Here the token is read from storage and sent, so a signed-in
 *    recipient gets their own customer and the correct trial decision.
 *  - Link scanners. Corporate mail filters and prefetchers fetch every URL in
 *    a message. A GET endpoint that mints on request would create a real
 *    Checkout Session per scan; a page that mints from JavaScript is inert to
 *    them, because they do not run it.
 *  - Analytics. `begin_checkout` still fires from the browser that will go on
 *    to convert.
 */

/**
 * Campaign label for the `begin_checkout` event, from `?src=`.
 *
 * Allowlisted rather than passed through: this value is read from a URL that
 * anybody can edit and is then written into the analytics dataLayer, so it is
 * held to a short opaque slug. Anything else is reported as a generic email
 * click rather than rejected — the visitor still gets their checkout.
 */
const CAMPAIGN_SLUG = /^[a-z0-9_-]{1,32}$/i;

export function campaignLocation(src: string | null): string {
  return src && CAMPAIGN_SLUG.test(src) ? `email_${src}` : 'email';
}

/**
 * Reading storage throws outright when a browser blocks it — Safari's private
 * mode is the common one. Identity is an optimization here, so a refusal
 * degrades this visitor to an anonymous checkout instead of denying them one.
 */
function storedAuthToken(): string | null {
  try {
    return localStorage.getItem('auth_token');
  } catch {
    return null;
  }
}

function SubscribeRedirectInner() {
  const searchParams = useSearchParams();
  const [failed, setFailed] = useState(false);
  // React runs effects twice in development StrictMode, and every run mints a
  // Stripe session. Without this guard a single page view creates two.
  const startedRef = useRef(false);

  const startCheckout = useCallback(async () => {
    setFailed(false);
    pushBeginCheckout(campaignLocation(searchParams.get('src')));

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      // Absent for the cold-list recipient, present for a trial user who is
      // still signed in. Both are supported; only the latter gets their
      // existing Stripe customer reused.
      const token = storedAuthToken();

      const response = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          tier: 'premium',
          successUrl: `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&tier=premium`,
          // Abandoning checkout lands on pricing rather than the homepage:
          // somebody who clicked a subscribe link and then backed out is still
          // deciding, and that is the page that argues the case.
          cancelUrl: `${window.location.origin}/pricing`,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('Failed to create checkout session:', error);
        setFailed(true);
        return;
      }

      const { url } = await response.json();
      if (typeof url !== 'string' || url.length === 0) {
        setFailed(true);
        return;
      }

      replaceLocation(url);
    } catch (error) {
      console.error('Error creating checkout session:', error);
      setFailed(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startCheckout();
  }, [startCheckout]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            {failed ? (
              <div className="text-center" role="alert">
                <h1 className="text-lg font-medium text-gray-900">We could not start your checkout</h1>
                <p className="mt-2 text-sm text-gray-500">
                  Something went wrong on our side. Please try again, or start from the pricing page.
                </p>
                <div className="mt-6 space-y-3">
                  <button
                    type="button"
                    className="w-full inline-flex justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    onClick={() => void startCheckout()}
                  >
                    Try again
                  </button>
                  <Link className="block text-sm text-indigo-600 hover:text-indigo-500" href="/pricing">
                    Go to pricing
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <h1 className="text-lg font-medium text-gray-900">Taking you to checkout</h1>
                <p className="mt-2 text-sm text-gray-500">
                  One moment while we open a secure Stripe checkout page.
                </p>
                <div
                  className="mt-6 animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"
                  role="status"
                  aria-label="Loading checkout"
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

export default function SubscribeRedirect() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div className="sm:mx-auto sm:w-full sm:max-w-md">
            <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
              <div className="text-center">
                <h1 className="text-lg font-medium text-gray-900">Taking you to checkout</h1>
                <div
                  className="mt-6 animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"
                  role="status"
                  aria-label="Loading checkout"
                />
              </div>
            </div>
          </div>
        </div>
        <SiteFooter />
      </div>
    }>
      <SubscribeRedirectInner />
    </Suspense>
  );
}
