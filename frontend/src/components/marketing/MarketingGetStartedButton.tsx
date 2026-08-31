"use client";

import { useState } from "react";
import { pushBeginCheckout } from "@/lib/dataLayer";
import { useDialog } from "@/components/ui/dialog";

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
  const [isLoading, setIsLoading] = useState(false);
  const { showError, dialog } = useDialog();

  const handleClick = async () => {
    pushBeginCheckout(trackingLocation);
    setIsLoading(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const response = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: "premium",
          successUrl: `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&tier=premium`,
          cancelUrl: `${window.location.origin}/`,
        }),
      });

      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
        return;
      }

      const err = await response.json();
      void showError(err.error || "Failed to create checkout session. Please try again.");
    } catch (error) {
      console.error("Error creating checkout session:", error);
      void showError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        className={className}
        type="button"
        data-cs-override-id={csOverrideId}
        onClick={handleClick}
        disabled={isLoading}
      >
        {isLoading ? "Loading..." : "Start free trial"}
      </button>
      {dialog}
    </>
  );
}
