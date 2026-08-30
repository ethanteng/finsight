"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import { Button } from "./ui/button";
import { pushBeginCheckout } from "@/lib/dataLayer";
import { useDialog } from '@/components/ui/dialog';
import { TRIAL_PRICE_LINE } from '@/config/pricing';

export default function AboutPageContent() {
  const [isLoading, setIsLoading] = useState(false);
  const { showError, dialog } = useDialog();

  const handleBuyClick = async () => {
    pushBeginCheckout();
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
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="pt-24">
        <section className="py-16">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            <div className="space-y-4 text-center">
              <h1 className="text-3xl md:text-5xl font-bold">
                About <span className="gradient-text">Ask Linc</span>
              </h1>
              <p className="text-xl text-muted-foreground">
                The AI financial reasoning assistant for households planning
                retirement — decisions-ready answers, not charts.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 items-start rounded-2xl border border-border/60 bg-muted/20 p-6 sm:p-8">
              <Image
                src="/ethan-teng.jpg"
                alt="Ethan Teng, founder of Ask Linc"
                width={120}
                height={120}
                className="rounded-full object-cover w-28 h-28 border border-border shrink-0"
              />
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold">Ethan Teng</h2>
                  <p className="text-muted-foreground">Founder</p>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  After getting laid off, I pasted my own bank statements into
                  ChatGPT — and immediately regretted it. General-purpose AI fails
                  at money math. I built Ask Linc so households planning retirement
                  get decision-ready answers from their real accounts, live market
                  data, and math you can check — not another dashboard,
                  and not a black box.
                </p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <a
                    href="https://www.linkedin.com/in/ethanteng"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    LinkedIn
                  </a>
                  <a
                    href="https://asklinc.substack.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Substack
                  </a>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold">What Ask Linc is</h2>
              <p className="text-muted-foreground leading-relaxed">
                Connect your accounts once. Ask real questions — can we retire at
                60, can we afford this house, what if rates stay higher for longer.
                Get answers that combine your data with live rates and inflation,
                show the math, and help you decide. Built for people who already
                tried ChatGPT on their finances and wanted something purpose-built
                — and private.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                {TRIAL_PRICE_LINE}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
              <Button variant="hero" size="lg" onClick={handleBuyClick} disabled={isLoading}>
                {isLoading ? "Loading..." : "Get started"}
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/pricing">View pricing</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
      {dialog}
    </div>
  );
}
