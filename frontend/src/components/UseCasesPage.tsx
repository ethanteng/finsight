"use client";
import Link from "next/link";
import { useState } from "react";
import { PiggyBank, Home, BarChart3, Shield } from "lucide-react";
import { Button } from "./ui/button";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import { pushBeginCheckout } from "@/lib/dataLayer";

const USE_CASES = [
  { href: "/use-cases/retirement", label: "Retirement Planning", description: "See how Ask Linc analyzes retirement readiness, withdrawal rates, and portfolio sustainability.", icon: PiggyBank },
  { href: "/use-cases/home-buying", label: "Home Buying Decisions", description: "Evaluate affordability, mortgage scenarios, and long-term impact.", icon: Home },
  { href: "/use-cases/portfolio-analysis", label: "Investment Portfolio Analysis", description: "Analyze asset allocation, risk exposure, and diversification.", icon: BarChart3 },
  { href: "/use-cases/financial-stress-testing", label: "Financial Stress Testing", description: "Simulate market downturns and evaluate resilience.", icon: Shield },
];

export default function UseCasesPage() {
  const [isLoading, setIsLoading] = useState(false);

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
      alert(err.error || "Failed to create checkout session. Please try again.");
    } catch (error) {
      console.error("Error creating checkout session:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Content */}
      <section className="relative pt-24 pb-20 overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-20 bg-gradient-to-br from-primary/20 to-secondary/20" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background z-10" />
        <div className="relative z-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-8">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              Use Cases
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Explore how Ask Linc helps with your financial decisions across different scenarios.
            </p>
            <div className="grid sm:grid-cols-2 gap-4 pt-8">
              {USE_CASES.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block p-6 rounded-xl border border-border/50 bg-background/50 hover:border-primary/30 hover:bg-primary/5 transition-colors text-left"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold">{link.label}</h2>
                        <p className="text-sm text-muted-foreground mt-1">{link.description}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
            <div className="flex flex-col items-center gap-2 pt-10">
              <Button
                variant="hero"
                size="lg"
                className="w-auto max-w-full px-4 py-3 text-base sm:px-6 sm:py-4 sm:text-lg md:px-10 md:py-[1.875rem] md:text-[1.40625rem]"
                onClick={handleBuyClick}
                disabled={isLoading}
              >
                {isLoading ? "Loading..." : "Get started"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                1 month free, then $9/month. Cancel anytime.
              </p>
            </div>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
