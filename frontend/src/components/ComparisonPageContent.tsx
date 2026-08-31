"use client";

import Link from "next/link";
import { useState } from "react";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import { Button } from "./ui/button";
import type { ComparisonPage } from "@/lib/comparisons";
import { COMPARISONS } from "@/lib/comparisons";
import { pushBeginCheckout } from "@/lib/dataLayer";
import { useDialog } from '@/components/ui/dialog';
import { MONTHLY_PRICE_LABEL } from '@/config/pricing';

export default function ComparisonPageContent({ page }: { page: ComparisonPage }) {
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
        <section className="py-14">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            <div className="space-y-4 text-center">
              <h1 className="text-3xl md:text-5xl font-bold">
                {page.headline}
              </h1>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                {page.summary}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button variant="hero" size="lg" onClick={handleBuyClick} disabled={isLoading}>
                  {isLoading ? "Loading..." : "Get started"}
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link href="/pricing">1 month free, then {MONTHLY_PRICE_LABEL}</Link>
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-4 font-semibold w-[22%]">Dimension</th>
                    <th className="p-4 font-semibold w-[39%]">Ask Linc</th>
                    <th className="p-4 font-semibold w-[39%]">{page.competitorName}</th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row) => (
                    <tr key={row.dimension} className="border-t border-border/50 align-top">
                      <td className="p-4 font-medium">{row.dimension}</td>
                      <td className="p-4 text-muted-foreground leading-relaxed">{row.askLinc}</td>
                      <td className="p-4 text-muted-foreground leading-relaxed">{row.competitor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold">FAQ</h2>
              {page.faqs.map((faq) => (
                <div key={faq.question} className="rounded-lg border border-border/60 p-5">
                  <h3 className="font-semibold mb-2">{faq.question}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
                </div>
              ))}
            </div>

            <div className="text-center space-y-3 pt-4">
              <p className="text-sm text-muted-foreground">Other comparisons</p>
              <div className="flex flex-wrap justify-center gap-4 text-sm">
                {COMPARISONS.filter((c) => c.slug !== page.slug).map((c) => (
                  <Link
                    key={c.slug}
                    href={`/vs/${c.slug}`}
                    className="text-primary hover:underline"
                  >
                    vs {c.competitorName}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
      {dialog}
    </div>
  );
}
