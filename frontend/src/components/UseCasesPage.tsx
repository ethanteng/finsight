"use client";
import { useState } from "react";
import Link from "next/link";
import { Brain, Menu, X, ChevronDown, PiggyBank, Home, BarChart3, Shield } from "lucide-react";
import { Button } from "./ui/button";
import { pushBeginCheckout } from "@/lib/dataLayer";

const USE_CASES = [
  { href: "/use-cases/retirement", label: "Retirement Planning", description: "See how Ask Linc analyzes retirement readiness, withdrawal rates, and portfolio sustainability.", icon: PiggyBank },
  { href: "/use-cases/home-buying", label: "Home Buying Decisions", description: "Evaluate affordability, mortgage scenarios, and long-term impact.", icon: Home },
  { href: "/use-cases/portfolio-analysis", label: "Investment Portfolio Analysis", description: "Analyze asset allocation, risk exposure, and diversification.", icon: BarChart3 },
  { href: "/use-cases/financial-stress-testing", label: "Financial Stress Testing", description: "Simulate market downturns and evaluate resilience.", icon: Shield },
];

export default function UseCasesPage() {
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
                      {USE_CASES.map((link) => (
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
                {USE_CASES.map((link) => (
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
              <Button variant="hero" size="lg" asChild className="w-auto max-w-full px-4 py-3 text-base sm:px-6 sm:py-4 sm:text-lg md:px-10 md:py-[1.875rem] md:text-[1.40625rem]">
                <Link href="/demo">See Linc in Action</Link>
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Try our interactive demo with sample financial data.
              </p>
              <p className="text-center text-sm text-muted-foreground pt-4">
                Or explore{" "}
                <Link href="/prompts" className="text-primary hover:underline">
                  example prompts
                </Link>{" "}
                with real responses and CTAs to get started.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
