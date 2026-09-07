"use client";

import Link from "next/link";
import { pushStartFreeClick } from "@/lib/dataLayer";
import { GET_STARTED_HREF } from "@/lib/site-nav";

/**
 * The primary "Start free" call to action.
 *
 * This used to POST straight to Stripe Checkout, which asked for a card before
 * the trial began. It now links to /getstarted, where an account is created
 * with no payment details at all — so the "no credit card required" promise in
 * the surrounding copy holds wherever this CTA appears.
 */

type MarketingGetStartedButtonProps = {
  className?: string;
  trackingLocation?: string;
  /**
   * Contentsquare element identity, e.g. `cta-start-free-trial-hero`.
   *
   * Required, and deliberately not defaulted: Contentsquare otherwise binds
   * click goals and heatmap zones to an element's HTML path, so any markup
   * change silently unbinds them and the goal reports zero forever. Every
   * call site has to name its own placement, and no two may share a value —
   * a shared value merges the two placements' data.
   *
   * These are a stable contract with the Contentsquare workspace. Do not
   * rename one during a refactor.
   */
  csOverrideId: string;
};

export function MarketingGetStartedButton({
  className = "button button-small button-dark",
  trackingLocation = "marketing_cta",
  csOverrideId,
}: MarketingGetStartedButtonProps) {
  return (
    <Link
      className={className}
      href={GET_STARTED_HREF}
      data-cs-override-id={csOverrideId}
      onClick={() => pushStartFreeClick(trackingLocation)}
    >
      Start free
    </Link>
  );
}
