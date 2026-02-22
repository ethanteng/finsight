"use client";

import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Brain, Shield, Lock, Eye, MessageCircle, CheckCircle } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

const RetirementReadinessPage = () => {
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
            cancelUrl: `${window.location.origin}/retirement-readiness`,
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

  const scenarioPrompts = [
    "Can I retire at 60?",
    "What happens if markets drop 20%?",
    "Is my withdrawal rate sustainable?",
    "Am I saving enough?",
  ];

  const howItWorksSteps = [
    "Connect accounts securely (read-only)",
    "Ask retirement questions",
    "See modeled outcomes and tradeoffs",
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal nav - logo only */}
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

      {/* 1. Hero */}
      <main>
      <section
        id="hero"
        className="scroll-mt-24 pt-28 pb-20"
        aria-labelledby="hero-heading"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 id="hero-heading" className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-foreground">
            Are You Actually On Track for Retirement?
          </h1>
          <p className="mt-6 text-xl text-muted-foreground leading-relaxed">
            Connect your real accounts. Stress test your plan. Get a clear
            answer — not a guess.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              variant="hero"
              size="xl"
              onClick={handlePrimaryCTA}
              disabled={isLoading}
            >
              {isLoading ? "Loading..." : "See If I'm On Track"}
            </Button>
            <Link
              href="#how-it-works"
              className="text-primary hover:text-primary/80 font-medium transition-colors underline-offset-4 hover:underline"
            >
              How It Works
            </Link>
          </div>

          <div className="mt-12 pt-8 border-t border-border/50">
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary/70" />
                Read-only account access
              </span>
              <span className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary/70" />
                Bank-level encryption
              </span>
              <span className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary/70" />
                No ads. No affiliates.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. How It Works */}
      <section
        id="how-it-works"
        className="scroll-mt-24 py-20 bg-muted/20"
        aria-labelledby="how-it-works-heading"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 id="how-it-works-heading" className="text-2xl md:text-3xl font-bold text-center mb-12">
            How It Works
          </h2>
          <ol className="space-y-8 list-none flex flex-col mx-auto max-w-lg" aria-label="Steps to check retirement readiness">
            {howItWorksSteps.map((title, i) => (
              <li key={i} className="flex gap-6 items-center">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold">
                  {i + 1}
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {title}
                </h3>
              </li>
            ))}
          </ol>
          <div className="mt-12 flex justify-center">
            <Button
              variant="hero"
              size="lg"
              onClick={handlePrimaryCTA}
              disabled={isLoading}
            >
              {isLoading ? "Loading..." : "Check My Retirement Plan"}
            </Button>
          </div>
        </div>
      </section>

      {/* 3. Scenarios */}
      <section
        id="scenarios"
        className="scroll-mt-24 py-20"
        aria-labelledby="scenarios-heading"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 id="scenarios-heading" className="text-2xl md:text-3xl font-bold text-center mb-12">
            Stress Test Real Retirement Scenarios
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {scenarioPrompts.map((prompt, i) => (
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
          <p className="mt-10 text-muted-foreground leading-relaxed text-center max-w-2xl mx-auto">
            Ask Linc uses your real financial data to model outcomes under
            different market conditions — including downturns, inflation, and
            withdrawal strategies.
          </p>
        </div>
      </section>

      {/* 4. Portfolio */}
      <section
        id="portfolio"
        className="scroll-mt-24 py-20 bg-muted/20"
        aria-labelledby="portfolio-heading"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 id="portfolio-heading" className="text-2xl md:text-3xl font-bold text-center mb-12">
            Full Portfolio-Level Analysis
          </h2>
          <div className="space-y-6 text-muted-foreground leading-relaxed">
            <p>
              Asset allocation directly impacts long-term outcomes. Ask Linc
              models how your current mix of stocks, bonds, and cash affects
              withdrawal sustainability.
            </p>
            <p>
              Volatility modeling shows how your plan holds up under different
              market conditions — not just average returns.
            </p>
            <p>
              Withdrawal sustainability and probability of success are
              calculated from your actual accounts, not generic assumptions.
            </p>
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
          <h2 id="security-heading" className="text-2xl md:text-3xl font-bold text-center">
            Your Financial Data Stays Yours
          </h2>
          <ul className="mt-8 space-y-4 flex flex-col mx-auto max-w-sm">
            {[
              { icon: Lock, text: "Encrypted connections" },
              { icon: Eye, text: "Read-only access" },
              { icon: Shield, text: "Never sold or shared" },
              { icon: CheckCircle, text: "No affiliate incentives" },
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
              {isLoading ? "Loading..." : "Start Secure Analysis"}
            </Button>
          </div>
        </div>
      </section>
      </main>

      {/* Minimal footer - privacy + terms only */}
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

export default RetirementReadinessPage;
