"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import SiteFooter from './SiteFooter';
import { isStripeBillingPortalUrl, replaceLocation } from '@/lib/external-navigation';

/**
 * The landing page for the signed-in header's upgrade CTA when the account is
 * on a trial that collects no card — the shape `/admin/user-trial` grants.
 *
 * Such a trial cannot be converted by checking out again. A second Checkout on
 * the same customer mints a second subscription beside the first rather than
 * replacing it, and the card it saves also defeats the
 * `missing_payment_method: 'cancel'` that was supposed to end the trial, so
 * Stripe would bill both. Adding a payment method to the subscription that
 * already exists converts it in place, keeps the end date the admin granted,
 * and bills once.
 *
 * This is the sibling of `/subscribe` and exists for the same mechanical
 * reason: a Billing Portal session is minted per visit and expires, so there is
 * no durable URL a button could point at, and minting one inside a click
 * handler before opening a tab is exactly what popup blockers stop. A plain
 * link to a page that mints on mount is neither.
 */
function BillingPortalRedirectInner() {
  const [failed, setFailed] = useState(false);
  /**
   * The portal needs an account. A visitor who is not signed in is not one, and
   * telling them that is more use than a generic failure.
   */
  const [signedOut, setSignedOut] = useState(false);
  // React runs effects twice in development StrictMode, and every run mints a
  // portal session. Without this guard a single page view creates two.
  const startedRef = useRef(false);
  // A retry must not mint another session while one is already in flight.
  const inFlightRef = useRef(false);
  // Footer links can navigate away mid-flight; skip the replace if so.
  const mountedRef = useRef(true);

  const openPortal = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setFailed(false);
    setSignedOut(false);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      // Reading storage throws outright when a browser blocks it — Safari's
      // private mode is the common one — so treat that as signed out.
      let token: string | null = null;
      try {
        token = localStorage.getItem('auth_token');
      } catch {
        token = null;
      }

      if (!token) {
        if (mountedRef.current) setSignedOut(true);
        return;
      }

      const response = await fetch(`${API_URL}/api/stripe/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        // Back into the workspace, which is where they came from.
        body: JSON.stringify({ returnUrl: `${window.location.origin}/app` }),
      });

      if (!mountedRef.current) return;

      if (response.status === 401) {
        setSignedOut(true);
        return;
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('Failed to create billing portal session:', error);
        setFailed(true);
        return;
      }

      const { url } = await response.json();
      // Auto-forward pages must fail closed on a non-Stripe target: unlike a
      // click, the visitor never confirmed this navigation.
      if (typeof url !== 'string' || !isStripeBillingPortalUrl(url)) {
        setFailed(true);
        return;
      }

      if (!mountedRef.current) return;
      replaceLocation(url);
    } catch (error) {
      if (!mountedRef.current) return;
      console.error('Error creating billing portal session:', error);
      setFailed(true);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Guarded rather than an early return: returning before the cleanup below
    // registers none at all, and StrictMode's remount takes exactly that path.
    if (!startedRef.current) {
      startedRef.current = true;
      void openPortal();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [openPortal]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            {signedOut ? (
              <div className="text-center" role="alert">
                <h1 className="text-lg font-medium text-gray-900">Please sign in first</h1>
                <p className="mt-2 text-sm text-gray-500">
                  Billing details are tied to your account, so we need you signed in to open them.
                </p>
                <div className="mt-6">
                  <Link
                    className="block w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    href="/login"
                  >
                    Sign in
                  </Link>
                </div>
              </div>
            ) : failed ? (
              <div className="text-center" role="alert">
                <h1 className="text-lg font-medium text-gray-900">We could not open your billing details</h1>
                <p className="mt-2 text-sm text-gray-500">
                  Something went wrong on our side. Please try again, or manage billing from your
                  account page.
                </p>
                <div className="mt-6 space-y-3">
                  <button
                    type="button"
                    className="w-full inline-flex justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    onClick={() => void openPortal()}
                  >
                    Try again
                  </button>
                  <Link className="block text-sm text-indigo-600 hover:text-indigo-500" href="/profile">
                    Go to your account
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <h1 className="text-lg font-medium text-gray-900">Taking you to billing</h1>
                {/* Says what the next page is for. Somebody who clicked
                    "Upgrade your account" is about to land on Stripe's billing
                    portal, and adding a card is the thing that keeps their
                    access past the trial. */}
                <p className="mt-2 text-sm text-gray-500">
                  Add a payment method there to keep your access when your trial ends. Your plan and
                  trial end date stay as they are.
                </p>
                <div
                  className="mt-6 animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"
                  role="status"
                  aria-label="Opening billing"
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

export default function BillingPortalRedirect() {
  return <BillingPortalRedirectInner />;
}
