"use client";

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/** How this account starts paying. Decided by the server, never inferred here. */
export type UpgradeAction = 'checkout' | 'billing_portal';

/**
 * Narrow a subscription-status payload to an action this build can honour.
 *
 * The status endpoint is JSON over the wire, so callers that already fetched
 * billing state must not trust the field as typed — an unknown or absent value
 * is "offer nothing", matching `useUpgradeEligibility`.
 */
export function parseUpgradeAction(value: unknown): UpgradeAction | null {
  return value === 'checkout' || value === 'billing_portal' ? value : null;
}

/**
 * Where the header CTA sends someone, per the server's `upgradeAction`.
 *
 * Neither is a direct Stripe URL, because there is no such thing: Checkout
 * Sessions and Billing Portal sessions are both minted per visit and expire.
 * Each of these pages mints one on mount, sending the stored auth token so the
 * server works from the session rather than anything the client claims.
 *
 * Going through a page rather than minting here is also what lets this stay a
 * plain link. Opening a tab from a callback that has already awaited a fetch is
 * what popup blockers exist to stop; a real link click is never blocked.
 *
 * The two destinations are not interchangeable. A no-card signup has no Stripe
 * subscription, so Checkout is right. A trial that collects no card already has
 * one, and checking out again would mint a rival subscription and bill twice
 * rather than convert it — that account has to add a payment method to the
 * subscription it already has, which is what the billing portal is for.
 */
export const UPGRADE_HREFS: Record<UpgradeAction, string> = {
  checkout: '/subscribe?channel=app&src=header',
  billing_portal: '/billing?src=header',
};

/**
 * What the signed-in header should offer this account, or null for nothing.
 *
 * The rule itself lives on the server (`upgradeAction` in
 * `getUserSubscriptionStatus`), so the two headers that show this button do not
 * each re-derive a billing decision from a status string. Anything unexpected —
 * a failed request, an older backend that does not send the field, a value this
 * build does not know — reads as "offer nothing", because an upgrade CTA shown
 * to a paying subscriber is worse than one missing from a free account.
 */
export function useUpgradeEligibility(enabled = true): UpgradeAction | null {
  const [upgradeAction, setUpgradeAction] = useState<UpgradeAction | null>(null);

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
        const action = parseUpgradeAction(data?.upgradeAction);
        if (active && action) {
          setUpgradeAction(action);
        }
      } catch {
        // Billing state is not this header's job to report. Stay quiet.
      }
    })();

    return () => {
      active = false;
    };
  }, [enabled]);

  return upgradeAction;
}

interface UpgradeAccountButtonProps {
  /** Which destination this account needs. See `UPGRADE_HREFS`. */
  action: UpgradeAction;
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
  action,
  variant = 'light',
  className = '',
}: UpgradeAccountButtonProps) {
  return (
    <a
      href={UPGRADE_HREFS[action]}
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
