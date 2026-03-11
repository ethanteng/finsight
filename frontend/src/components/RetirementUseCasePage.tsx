"use client";
import { useState } from "react";
import Link from "next/link";
import { Brain, Menu, X, ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import { pushBeginCheckout } from "@/lib/dataLayer";

const USE_CASE_LINKS = [
  { href: "/use-cases/retirement", label: "Retirement Planning" },
  { href: "/use-cases/home-buying", label: "Home Buying Decisions" },
  { href: "/use-cases/portfolio-analysis", label: "Investment Portfolio Analysis" },
  { href: "/use-cases/financial-stress-testing", label: "Financial Stress Testing" },
];

const RETIREMENT_EXAMPLE = {
  prompt: "Analyze my current portfolio and show me how likely I will be able to retire by 50, 55, 60, and 62. Explain in detail why a scenario(s) is or not likely.",
  response: "Based on detailed analysis, retirement at age 50 is not feasible (shortfall of $991K), age 55 is marginally feasible (45-55% likelihood) but risky, age 60 is highly feasible (75-85% likelihood) with $1.7M surplus, and age 62 is very feasible (85-95% likelihood) with $3M surplus. The primary obstacle is your $444,299 debt, which must be eliminated for early retirement success. Target age 60 retirement as the optimal balance of earlier freedom and financial security.",
  keyNumbers: [
    { label: "Current Portfolio", value: "$2,190,695" },
    { label: "Age 50 Shortfall", value: "-$991,738" },
    { label: "Age 55 Surplus", value: "$184,774" },
    { label: "Age 60 Surplus", value: "$1,701,240" },
    { label: "Age 62 Surplus", value: "$3,022,870" },
    { label: "Debt To Eliminate", value: "$444,299" },
  ],
  insights: [
    "Your $81,000 annual surplus provides strong savings momentum, enabling portfolio growth from $2.2M today to $6.3M by age 60",
    "The $444,299 debt reduces your feasible retirement age by approximately 5 years; eliminating it by age 53 makes age 55 retirement viable",
    "Age 60 offers the best risk-reward balance with 37% surplus after meeting $140K spending needs, plus only 5-year healthcare gap before Medicare",
    "Current 2.5% fixed income allocation is too aggressive for someone 12 years from retirement; increase to 25-30% to reduce sequence-of-returns risk",
  ],
  suggestedActions: [
    "Immediately clarify the $444,299 debt type and interest rate, then create aggressive payoff plan targeting elimination by age 53 using annual surplus",
    "Shift asset allocation from current 97.5% growth assets to 75/25 equity/fixed income split, then follow glide path to 60/40 by age 58",
    "Build healthcare cost analysis for ages 60-65 and research ACA marketplace subsidies based on retirement income levels",
    "Establish 2-year spending reserve ($280K) in stable assets by age 58 to protect against sequence-of-returns risk in early retirement years",
    "Calculate Social Security claiming strategies comparing age 62 vs. 67 vs. 70 to optimize lifetime benefits given your strong portfolio position",
  ],
};

export default function RetirementUseCasePage() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUseCasesOpen, setIsUseCasesOpen] = useState(false);
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleBuyClick = async (planId: string) => {
    pushBeginCheckout();
    setIsLoading(planId);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const response = await fetch(
        `${API_URL}/api/stripe/create-checkout-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tier: planId,
            successUrl: `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&tier=${planId}`,
            cancelUrl: `${window.location.origin}/`,
          }),
        }
      );
      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
      } else {
        const err = await response.json();
        alert(err.error || "Failed to create checkout session. Please try again.");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred. Please try again.");
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-lg bg-background/80 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-2 hover:opacity-90 transition-opacity">
              <Brain className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold gradient-text">Ask Linc</span>
            </Link>
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/features" className="text-muted-foreground hover:text-primary transition-colors">
                Product
              </Link>
              <div
                className="relative group"
                onMouseEnter={() => setIsUseCasesOpen(true)}
                onMouseLeave={() => setIsUseCasesOpen(false)}
              >
                <Link
                  href="/use-cases"
                  className="text-primary hover:text-primary/80 transition-colors flex items-center gap-0.5"
                >
                  Use Cases
                  <ChevronDown className="h-4 w-4" />
                </Link>
                {isUseCasesOpen && (
                  <div className="absolute top-full left-0 pt-1">
                    <div className="bg-background/95 backdrop-blur-lg border border-border/50 rounded-lg shadow-lg py-2 min-w-[200px]">
                      {USE_CASE_LINKS.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="block px-4 py-2 text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Link href="/#pricing" className="text-muted-foreground hover:text-primary transition-colors">
                Pricing
              </Link>
              <a
                href="https://blog.asklinc.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Blog
              </a>
              <Button
                variant="hero"
                size="sm"
                onClick={() => handleBuyClick("premium")}
                disabled={isLoading === "premium"}
              >
                {isLoading === "premium" ? "Loading..." : "Get started"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => (window.location.href = "/login")}
              >
                Login
              </Button>
            </div>
            <div className="md:hidden flex items-center">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 text-muted-foreground hover:text-primary transition-colors"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-16 left-0 right-0 bg-background/95 backdrop-blur-lg border-b border-border/50 shadow-lg">
            <div className="px-4 py-4 space-y-1">
              <Link href="/features" className="block py-3 text-muted-foreground hover:text-primary transition-colors" onClick={() => setIsMobileMenuOpen(false)}>
                Product
              </Link>
              <div className="py-2">
                <span className="block py-1 text-sm font-medium text-foreground">Use Cases</span>
                {USE_CASE_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block py-2 pl-4 text-muted-foreground hover:text-primary transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              <Link href="/#pricing" className="block py-3 text-muted-foreground hover:text-primary transition-colors" onClick={() => setIsMobileMenuOpen(false)}>
                Pricing
              </Link>
              <a
                href="https://blog.asklinc.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="block py-3 text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Blog
              </a>
              <div className="pt-4 space-y-2 border-t border-border/50">
                <Button variant="hero" size="sm" className="w-full" onClick={() => { handleBuyClick("premium"); setIsMobileMenuOpen(false); }} disabled={isLoading === "premium"}>
                  {isLoading === "premium" ? "Loading..." : "Get started"}
                </Button>
                <Button variant="outline" size="sm" className="w-full" onClick={() => { window.location.href = "/login"; setIsMobileMenuOpen(false); }}>
                  Login
                </Button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Content */}
      <section className="relative pt-24 pb-20 overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-20 bg-gradient-to-br from-primary/20 to-secondary/20" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background z-10" />
        <div className="relative z-20 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/use-cases" className="text-sm text-muted-foreground hover:text-primary transition-colors inline-block mb-8">
            ← Use Cases
          </Link>
          <div className="space-y-8">
            <div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
                Retirement Planning
              </h1>
              <p className="text-lg text-muted-foreground mt-2">
                See these real examples of how Ask Linc can help analyze your retirement readiness, withdrawal rates, and portfolio sustainability.
              </p>
            </div>

            <div className="space-y-6">
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Prompt</div>
                <div className="bg-primary/5 rounded-xl p-5 border border-primary/10 text-foreground leading-relaxed">
                  {RETIREMENT_EXAMPLE.prompt}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Response</div>
                <div className="bg-muted/30 rounded-xl p-6 border border-border/50 space-y-4">
                  <p className="text-foreground/90 leading-relaxed">{RETIREMENT_EXAMPLE.response}</p>
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-2">Key Numbers</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {RETIREMENT_EXAMPLE.keyNumbers.map((item, i) => (
                        <div key={i} className="flex justify-between items-baseline gap-4 py-1.5 px-3 bg-background/60 rounded text-sm">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className="font-medium text-foreground tabular-nums">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-2">Insights</div>
                    <ul className="list-disc list-inside space-y-1.5 text-foreground/90 text-sm leading-relaxed">
                      {RETIREMENT_EXAMPLE.insights.map((insight, i) => (
                        <li key={i}>{insight}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-2">Suggested Actions</div>
                    <ul className="list-disc list-inside space-y-1.5 text-foreground/90 text-sm leading-relaxed">
                      {RETIREMENT_EXAMPLE.suggestedActions.map((action, i) => (
                        <li key={i}>{action}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
