"use client";

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Where the header CTA sends someone.
 *
 * Not a direct Stripe URL, because there is no such thing: a Checkout Session
 * is minted per checkout and expires. `/subscribe` is the page that already
 * mints one — it sends the stored auth token, so the server reuses this
 * account's Stripe customer and fills in their email, and it fires
 * `begin_checkout` from the browser that will go on to convert.
 *
 * Going through a page rather than minting here is also what lets this be a
 * plain link. Opening a tab from a callback that has already awaited a fetch is
 * what popup blockers exist to stop; a real link click is never blocked.
 */
export const UPGRADE_CHECKOUT_HREF = '/subscribe?channel=app&src=header';

/**
 * Whether the signed-in header should offer this account a checkout.
 *
 * The rule itself lives on the server (`canUpgrade` in
 * `getUserSubscriptionStatus`), so the two headers that show this button do not
 * each re-derive a billing decision from a status string. Anything unexpected —
 * a failed request, an older backend that does not send the field — reads as
 * "no", because an upgrade CTA shown to a paying subscriber is worse than one
 * missing from a free account.
 */
export function useUpgradeEligibility(enabled = true): boolean {
  const [canUpgrade, setCanUpgrade] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    const token = (() => {
      try {
        return localStorage.getItem('auth_token');
      } catch {
        return null;
      }
    })();
    if (!token) return;

    void (async () => {
      try {
        const response = await fetch(`${API_URL}/api/stripe/subscription-status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = await response.json();
        if (active) setCanUpgrade(data?.canUpgrade === true);
      } catch {
        // Billing state is not this header's job to report. Stay quiet.
      }
    })();

    return () => {
      active = false;
    };
  }, [enabled]);

  return canUpgrade;
}

interface UpgradeAccountButtonProps {
  /** `light` for the cream page chrome, `dark` for the /app sidebar. */
  variant?: 'light' | 'dark';
  className?: string;
}

const VARIANT_CLASSES = {
  light:
    'border-[#102319]/15 bg-white/70 text-[#102319] hover:border-[#102319]/35 hover:bg-white',
  dark: 'border-white/15 bg-white/5 text-white/80 hover:border-[#d9ff6f]/45 hover:bg-white/10 hover:text-white',
} as const;

/**
 * A deliberately quiet upgrade CTA: an outlined pill, not a filled button.
 *
 * It sits beside the primary action in both headers and has to stay there for
 * the whole of a free account's life, so it is styled to be findable rather
 * than insistent. Callers decide whether to render it at all — see
 * `useUpgradeEligibility`.
 */
export default function UpgradeAccountButton({
  variant = 'light',
  className = '',
}: UpgradeAccountButtonProps) {
  return (
    <a
      href={UPGRADE_CHECKOUT_HREF}
      target="_blank"
      rel="noopener"
      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${VARIANT_CLASSES[variant]} ${className}`}
    >
      <Sparkles size={14} aria-hidden="true" />
      {/* Short on a phone, where this shares a 360px header with the brand and
          the new-decision button; full wherever there is room for it. */}
      <span>
        Upgrade<span className="hidden sm:inline"> your account</span>
      </span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
