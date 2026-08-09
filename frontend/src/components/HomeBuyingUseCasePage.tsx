"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Brain, Menu, X, ChevronDown, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { pushBeginCheckout } from "@/lib/dataLayer";
import type { GhostPost } from "@/lib/ghost";

const USE_CASE_LINKS = [
  { href: "/use-cases/retirement", label: "Retirement Planning" },
  { href: "/use-cases/home-buying", label: "Home Buying Decisions" },
  { href: "/use-cases/portfolio-analysis", label: "Investment Portfolio Analysis" },
  { href: "/use-cases/financial-stress-testing", label: "Financial Stress Testing" },
];

const HOME_BUYING_EXAMPLE = {
  prompt: "How much emergency funds should I have? Do I already have enough?",
  response: "Your emergency fund of $133,937 provides nearly 12 months of expense coverage, which significantly exceeds the recommended 3-6 months for most households and even the 9-month recommendation for high-income dual-earner professionals. You are well-positioned and could consider redeploying $20,000-$35,000 of excess cash into investments or debt reduction while maintaining a robust 9-10 month emergency cushion of approximately $100,000-$112,500.",
  keyNumbers: [
    { label: "Current Cash", value: "$133,937" },
    { label: "Months Covered", value: "11.9" },
    { label: "Recommended Minimum", value: "$67,500" },
    { label: "Optimal Emergency Fund", value: "$106,250" },
    { label: "Excess Available", value: "$27,687" },
  ],
  insights: [
    "You exceed standard 6-month emergency fund guidelines by 98%, providing exceptional financial security",
    "Dual-income household reduces simultaneous job loss risk, but high-income positions take 6-12 months to replace",
    "Your cash position generates $5,000-$6,700 annually if held in high-yield savings at current 4-5% rates",
    "With $2M+ in liquid investments and no mortgage, you have substantial backup resources beyond emergency cash",
  ],
  suggestedActions: [
    "Maintain $100,000-$112,500 as emergency fund (9-10 months coverage) optimized for your dual-income, high-earning profile",
    "Redeploy $20,000-$35,000 excess cash into retirement accounts or brokerage investments for better long-term returns",
    "Ensure emergency cash is split between immediate access accounts and high-yield savings earning 4-5% APY",
    "If credit balances carry interest, prioritize paying these down; if 0% promotional, maintain current approach",
    "Review emergency fund annually or when employment circumstances change for either spouse",
  ],
};

interface HomeBuyingUseCasePageProps {
  homeBuyingPosts?: GhostPost[];
}

export default function HomeBuyingUseCasePage({ homeBuyingPosts = [] }: HomeBuyingUseCasePageProps) {
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
              <Link href="/pricing" className="text-muted-foreground hover:text-primary transition-colors">
                Pricing
              </Link>
              <a
                href="/blog"
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
              <Link href="/pricing" className="block py-3 text-muted-foreground hover:text-primary transition-colors" onClick={() => setIsMobileMenuOpen(false)}>
                Pricing
              </Link>
              <a
                href="/blog"
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
                Home Buying Decisions
              </h1>
              <p className="text-lg text-muted-foreground mt-2">
                See these real examples of how Ask Linc can help you prepare for a home purchase—from assessing your emergency fund readiness to evaluating affordability and mortgage impact.
              </p>
            </div>

            <div className="space-y-6">
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Prompt</div>
                <div className="bg-primary/5 rounded-xl p-5 border border-primary/10 text-foreground leading-relaxed">
                  {HOME_BUYING_EXAMPLE.prompt}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Response</div>
                <div className="bg-muted/30 rounded-xl p-6 border border-border/50 space-y-4">
                  <p className="text-foreground/90 leading-relaxed">{HOME_BUYING_EXAMPLE.response}</p>
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-2">Key Numbers</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {HOME_BUYING_EXAMPLE.keyNumbers.map((item, i) => (
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
                      {HOME_BUYING_EXAMPLE.insights.map((insight, i) => (
                        <li key={i}>{insight}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-2">Suggested Actions</div>
                    <ul className="list-disc list-inside space-y-1.5 text-foreground/90 text-sm leading-relaxed">
                      {HOME_BUYING_EXAMPLE.suggestedActions.map((action, i) => (
                        <li key={i}>{action}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center pt-10 gap-2 w-full">
              <Button
                variant="hero"
                size="lg"
                onClick={() => handleBuyClick("premium")}
                disabled={isLoading === "premium"}
                className="w-fit max-w-full px-4 py-3 text-base sm:px-6 sm:py-4 sm:text-lg md:px-10 md:py-[1.875rem] md:text-[1.40625rem]"
              >
                {isLoading === "premium" ? "Loading..." : "Check Your Home Buying Readiness"}
              </Button>
              <p className="w-full text-center text-sm text-muted-foreground">
                Securely connect your accounts. No spreadsheets required.
              </p>
            </div>

            {/* Blog posts tagged with home-buying */}
            <div className="pt-12 border-t border-border/50">
              <h2 className="text-xl font-semibold mb-6">Related from the blog</h2>
              {homeBuyingPosts.length > 0 ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {homeBuyingPosts.map((post) => {
                    const postUrl = `/blog/${post.slug || ''}`;
                    return (
                    <a
                      key={post.id}
                      href={postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block rounded-xl overflow-hidden border border-border/50 bg-muted/10 hover:border-primary/20 hover:bg-muted/20 transition-all"
                    >
                      <div className="aspect-video relative bg-muted/30">
                        {post.feature_image ? (
                          <Image
                            src={post.feature_image}
                            alt={post.title || 'Blog post'}
                            fill
                            className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-4xl text-muted-foreground/50">📄</span>
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                          {post.title || 'Untitled'}
                        </h3>
                        {post.excerpt && (
                          <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                            {post.excerpt}
                          </p>
                        )}
                        <span className="inline-flex items-center gap-1 text-sm text-primary mt-2 font-medium">
                          Read more
                          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </div>
                    </a>
                  );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Explore our{" "}
                  <Link href="/blog" className="text-primary hover:underline">
                    blog
                  </Link>{" "}
                  for home buying insights and affordability guidance.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
