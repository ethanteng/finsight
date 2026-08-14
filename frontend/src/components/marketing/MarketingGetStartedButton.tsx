"use client";

import { useState } from "react";
import { pushBeginCheckout } from "@/lib/dataLayer";

type MarketingGetStartedButtonProps = {
  className?: string;
  trackingLocation?: string;
};

export function MarketingGetStartedButton({
  className = "button button-small button-dark",
  trackingLocation = "marketing_cta",
}: MarketingGetStartedButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

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
      alert(err.error || "Failed to create checkout session. Please try again.");
    } catch (error) {
      console.error("Error creating checkout session:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button className={className} type="button" onClick={handleClick} disabled={isLoading}>
      {isLoading ? "Loading..." : "Start free trial"}
    </button>
  );
}
