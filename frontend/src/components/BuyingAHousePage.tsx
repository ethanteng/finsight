"use client";

import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Brain, Shield, Lock, Eye, MessageCircle, CheckCircle } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

const BuyingAHousePage = () => {
  const [isLoading, setIsLoading] = useState(false);

  const handlePrimaryCTA = async () => {
    setIsLoading(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const response = await fetch(
        `${API_URL}/api/stripe/create-checkout-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tier: "premium",
            successUrl: `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&tier=premium`,
            cancelUrl: `${window.location.origin}/buying-a-house`,
          }),
        }
      );

      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
      } else {
        window.location.href = "/login";
      }
    } catch {
      window.location.href = "/login";
    } finally {
      setIsLoading(false);
    }
  };

  const rentVsBuyPrompts = [
    "Should I buy now?",
    "Does this delay retirement?",
    "Is renting smarter?",
  ];

  return (
    <div className="min-h-screen bg-background">
      <nav
        className="fixed top-0 w-full z-50 backdrop-blur-lg bg-background/80 border-b border-border/50"
        aria-label="Main navigation"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link
              href="/"
              className="flex items-center space-x-2 hover:opacity-90 transition-opacity"
            >
              <Brain className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold gradient-text">Ask Linc</span>
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* 1. Hero */}
        <section
          id="hero"
          className="scroll-mt-24 pt-28 pb-20"
          aria-labelledby="hero-heading"
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1
              id="hero-heading"
              className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-foreground"
            >
              Can You Afford This House — Without Regretting It?
            </h1>
            <p className="mt-6 text-xl text-muted-foreground leading-relaxed">
              Model mortgage payments, down payments, and long-term impact
              using your real financial data.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                variant="hero"
                size="xl"
                onClick={handlePrimaryCTA}
                disabled={isLoading}
              >
                {isLoading ? "Loading..." : "Run the Numbers"}
              </Button>
              <Link
                href="#affordability"
                className="text-primary hover:text-primary/80 font-medium transition-colors underline-offset-4 hover:underline"
              >
                How It Works
              </Link>
            </div>

            <div className="mt-12 pt-8 border-t border-border/50">
              <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary/70" />
                  Secure account linking
                </span>
                <span className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary/70" />
                  Read-only access
                </span>
                <span className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary/70" />
                  Bank-level encryption
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Affordability */}
        <section
          id="affordability"
          className="scroll-mt-24 py-20 bg-muted/20"
          aria-labelledby="affordability-heading"
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2
              id="affordability-heading"
              className="text-2xl md:text-3xl font-bold text-center mb-12"
            >
              See Your Real Buying Power
            </h2>
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p>
                True affordability goes beyond the monthly payment. It includes
                what you give up — liquidity, investment returns, and
                flexibility.
              </p>
              <p>
                Liquidity impact: a large down payment locks up capital that
                could otherwise compound. See the opportunity cost.
              </p>
              <p>
                Rate sensitivity: model how payment changes if rates move. Plan
                for refinancing scenarios.
              </p>
              <p>
                Portfolio effects: understand how the purchase affects your
                overall wealth trajectory and retirement timeline.
              </p>
            </div>
            <div className="mt-12 flex justify-center">
              <Button
                variant="hero"
                size="lg"
                onClick={handlePrimaryCTA}
                disabled={isLoading}
              >
                {isLoading ? "Loading..." : "Model My Home Purchase"}
              </Button>
            </div>
          </div>
        </section>

        {/* 3. Rent vs Buy */}
        <section
          id="rent-vs-buy"
          className="scroll-mt-24 py-20"
          aria-labelledby="rent-vs-buy-heading"
        >
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2
              id="rent-vs-buy-heading"
              className="text-2xl md:text-3xl font-bold text-center mb-12"
            >
              Rent vs Buy — Modeled With Context
            </h2>
            <div className="space-y-6 text-muted-foreground leading-relaxed mb-12">
              <p>
                Investment opportunity cost: renting frees capital for the
                market. Buying locks it in equity. Model both paths with your
                real numbers.
              </p>
              <p>
                Long-term wealth impact: see how each choice affects your net
                worth over 10, 20, 30 years — not just monthly cash flow.
              </p>
              <p>
                Retirement tradeoffs: a mortgage today affects when you can
                retire. Understand the full picture before you decide.
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              {rentVsBuyPrompts.map((prompt, i) => (
                <Card
                  key={i}
                  className="border-border/50 hover:border-primary/30 hover:bg-card/80 transition-colors cursor-default"
                >
                  <CardContent className="p-5 flex items-center gap-3">
                    <MessageCircle className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="text-foreground font-medium">{prompt}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Mortgage */}
        <section
          id="mortgage"
          className="scroll-mt-24 py-20 bg-muted/20"
          aria-labelledby="mortgage-heading"
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2
              id="mortgage-heading"
              className="text-2xl md:text-3xl font-bold text-center mb-12"
            >
              Test Down Payments and Rates
            </h2>
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p>
                10% vs 20% down: compare payment impact, PMI, and the capital
                you keep invested. See which path builds more wealth.
              </p>
              <p>
                Rate increases: model what happens if rates rise before you
                lock. Stress test your budget.
              </p>
              <p>
                Monthly payment impact: understand exactly how down payment and
                rate changes affect your cash flow.
              </p>
              <p>
                Long-term compounding effect: the money you don&apos;t put
                down can grow. Model the opportunity cost over decades.
              </p>
            </div>
            <div className="mt-12 flex justify-center">
              <Button
                variant="hero"
                size="lg"
                onClick={handlePrimaryCTA}
                disabled={isLoading}
              >
                {isLoading ? "Loading..." : "Run Mortgage Scenarios"}
              </Button>
            </div>
          </div>
        </section>

        {/* 5. Security */}
        <section
          id="security"
          className="scroll-mt-24 py-20 bg-muted/40"
          aria-labelledby="security-heading"
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2
              id="security-heading"
              className="text-2xl md:text-3xl font-bold text-center"
            >
              Secure. Private. Read-Only.
            </h2>
            <ul className="mt-8 space-y-4 flex flex-col mx-auto max-w-sm">
              {[
                { icon: Lock, text: "Encrypted connections" },
                { icon: Shield, text: "No data selling" },
                { icon: CheckCircle, text: "No affiliate incentives" },
                { icon: Eye, text: "Bank-level security" },
              ].map(({ icon: Icon, text }, i) => (
                <li key={i} className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">{text}</span>
                </li>
              ))}
            </ul>
            <div className="mt-10 flex justify-center">
              <Button
                variant="hero"
                size="lg"
                onClick={handlePrimaryCTA}
                disabled={isLoading}
              >
                {isLoading ? "Loading..." : "Start My Analysis"}
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-8 border-t border-border/50" role="contentinfo">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center space-x-2">
              <Brain className="h-5 w-5 text-primary" />
              <span className="font-semibold gradient-text">Ask Linc</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/privacy" className="hover:text-primary transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-primary transition-colors">
                Terms
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default BuyingAHousePage;
