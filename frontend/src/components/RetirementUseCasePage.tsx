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

const RETIREMENT_EXAMPLE = {
  prompt: "Analyze my current portfolio and show me how likely I will be able to retire by 50, 55, 60, and 62. Explain in detail why a scenario(s) is or is not likely.",
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

const RETIREMENT_EXAMPLE_2 = {
  prompt: "Dive deeper into my investment and retirement portfolio. Assess how well balanced it is (or isn't) based on my target retirement age -- assume 62. Recommend any adjustments that would be beneficial.",
  response: "Your retirement portfolio is extremely aggressive with 92.1% equity allocation—appropriate for someone decades from retirement, not 14 years away from age 62. While projected to reach $7.2M (exceeding your $3.5-4.5M needs), you face severe sequence-of-returns risk. A market crash near retirement could force significant delays. Immediate action needed: implement a glide path reducing equity to 70% now, then to 60% by age 62, while building a substantial bond allocation of 35%. Your strong $81K annual surplus can fund this transition entirely through new contributions over 3-4 years without selling equities.",
  keyNumbers: [
    { label: "Current Equity Allocation Pct", value: "92.1%" },
    { label: "Recommended Equity Allocation Pct", value: "70%" },
    { label: "Years To Target Retirement", value: "14" },
    { label: "Projected Portfolio At 62", value: "$7,242,330" },
    { label: "Minimum Portfolio Needed", value: "$3,500,000" },
    { label: "Current Fixed Income Pct", value: "2.5%" },
    { label: "Target Fixed Income Pct", value: "35%" },
    { label: "Equity Overweight Percentage Points", value: "40.1%" },
  ],
  insights: [
    "Portfolio is positioned 40 percentage points too aggressive for age 48 with 14-year retirement horizon—comparable risk profile to someone in their 20s",
    "Strong surplus of $81K annually provides opportunity to rebalance entirely through new contributions without triggering capital gains",
    "Projected $7.2M portfolio at age 62 provides 2x cushion above minimum needs, enabling flexible retirement timing or higher spending",
    "Critical vulnerability: 30% market decline at age 60-61 could reduce portfolio below safe withdrawal thresholds for $180K drawdown target",
  ],
  suggestedActions: [
    "Immediately reduce equity allocation from 92.1% to 70% by redirecting all new contributions to bonds and rebalancing retirement accounts tax-free",
    "Establish 14-year glide path decreasing equity 2% annually, reaching 60% equity / 35% bonds / 5% cash by age 62",
    "Build diversified fixed income allocation: 40% TIPS for inflation protection, 30% intermediate Treasuries for safety, 30% investment-grade corporates for yield",
    "Create quarterly rebalancing schedule with annual equity reduction targets and stress-test portfolio against bear market scenarios at ages 60-62",
    "Accelerate paydown of $444K credit liability using portion of monthly surplus to reduce interest costs and improve retirement cash flow",
  ],
};

const RETIREMENT_EXAMPLE_3 = {
  prompt: "Re-evaluate my entire portfolio. Stress test it and give me a probability assessment on how long I'll likely be able to sustain my revised monthly drawdown, given that I'm currently 77 years old. Be detailed about what's working well, and what could be improved.",
  response: "Your portfolio demonstrates exceptional strength and longevity. At age 77 with $1.53M in net worth and a conservative 2.90% withdrawal rate, your assets will sustain your $144,000 annual lifestyle for 40+ years even with zero growth. Stress tests confirm 100% probability of success for 20+ years. Your 19.2% cash allocation provides extraordinary stability with 8.2 years of coverage. Key opportunities: verify RMD compliance, consider modest reallocation from excess cash to inflation-protected securities, and conduct an annual fee review. Your financial position is extremely secure.",
  keyNumbers: [
    { label: "Net Worth", value: "$1,533,829" },
    { label: "Years Cash Reserves", value: "8.19" },
    { label: "Withdrawal Rate Percent", value: "2.9%" },
    { label: "Income Coverage Percent", value: "75%" },
    { label: "Years Sustainable Zero Growth", value: "42.6" },
    { label: "Survival Rate Stress Test Percent", value: "100%" },
  ],
  insights: [
    "Your 2.90% withdrawal rate is well below the 4% historical sustainability threshold, indicating very low risk of portfolio depletion",
    "Cash reserves of $294,762 provide 8.2 years of expense coverage, far exceeding typical recommendations",
    "Even in a severe 30% market correction, your portfolio would last 32+ years with a 4.15% withdrawal rate",
    "Income from Social Security, investments, and annuities covers 75% of expenses, requiring only $36,000 annual drawdown",
    "At current withdrawal rates and realistic return assumptions of 2-3%, your portfolio could sustain indefinitely",
  ],
  suggestedActions: [
    "Verify your retirement account withdrawals meet IRS Required Minimum Distribution requirements (estimated $21,454 annually at age 77)",
    "Consider reallocating $50,000-$75,000 from cash to VTIP or short-term bonds to enhance inflation protection while maintaining liquidity",
    "Conduct comprehensive fee review across all accounts, targeting total portfolio costs below 0.75% annually",
    "Maintain your current conservative withdrawal strategy as it provides exceptional sustainability",
    "Schedule annual portfolio reviews to adjust for any changes in health, expenses, or market conditions",
  ],
};

const RETIREMENT_EXAMPLE_4 = {
  prompt: "How can I expect the war with Iran to affect my retirement plans?",
  response: "The Iran conflict creates short-term volatility risks for your retirement portfolio due to your high 92.2% equity exposure, but your strong fundamentals—7-20 year timeline, $81K annual surplus, and $2M+ portfolio—position you to weather and recover from geopolitical shocks. Historical precedent shows war-related market corrections typically recover within 6-24 months, well within your retirement horizon. Key actions include tactical rebalancing to 80-85% equities, building a 6-12 month cash buffer, and maintaining your long-term plan while being opportunistic during market dips.",
  keyNumbers: [
    { label: "Current Equity Exposure Dollars", value: "$1,875,470" },
    { label: "Potential 10 Percent Loss", value: "$187,547" },
    { label: "Annual Surplus To Recover", value: "$81,000" },
    { label: "Recovery Time Months 10pct", value: "28" },
    { label: "Recommended Equity Allocation", value: "82.5%" },
    { label: "Recommended Cash Buffer", value: "$105,000" },
  ],
  insights: [
    "Your 92.2% equity allocation exposes you to $187K-$375K in potential war-related corrections, but your 7-20 year timeline allows full recovery based on historical precedent",
    "War-driven inflation could increase from 2.4% to 3.5-4.5%, requiring $2,100+ additional annual drawdown, but your equity exposure provides inflation hedge through growth",
    "Your $81K annual surplus provides exceptional resilience—you can recover a 10% portfolio loss in 2.3 years through continued contributions alone",
    "Historical Middle East conflicts (Gulf War 1990, Iraq 2003) caused 3-7 month market disruptions with full recovery within 12-18 months, supporting your retirement timeline",
  ],
  suggestedActions: [
    "Rebalance portfolio from 92.2% to 80-85% equity allocation within 30 days, moving 5-10% into TIPS and short-duration bonds to reduce volatility exposure",
    "Establish 6-12 month expense buffer ($70K-$140K) in money market funds or short-term CDs to avoid forced selling during corrections",
    "Prepare opportunistic buying strategy with your $6,750 monthly surplus to dollar-cost average into quality stocks if markets drop 10%+ during conflict escalation",
    "Increase inflation hedges by adding 5-10% allocation to energy stocks, commodities, or commodity-focused ETFs that benefit from war-driven oil price increases",
  ],
};

interface RetirementUseCasePageProps {
  retirementPosts?: GhostPost[];
}

export default function RetirementUseCasePage({ retirementPosts = [] }: RetirementUseCasePageProps) {
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

            <div className="space-y-6 pt-8">
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Prompt</div>
                <div className="bg-primary/5 rounded-xl p-5 border border-primary/10 text-foreground leading-relaxed">
                  {RETIREMENT_EXAMPLE_2.prompt}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Response</div>
                <div className="bg-muted/30 rounded-xl p-6 border border-border/50 space-y-4">
                  <p className="text-foreground/90 leading-relaxed">{RETIREMENT_EXAMPLE_2.response}</p>
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-2">Key Numbers</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {RETIREMENT_EXAMPLE_2.keyNumbers.map((item, i) => (
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
                      {RETIREMENT_EXAMPLE_2.insights.map((insight, i) => (
                        <li key={i}>{insight}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-2">Suggested Actions</div>
                    <ul className="list-disc list-inside space-y-1.5 text-foreground/90 text-sm leading-relaxed">
                      {RETIREMENT_EXAMPLE_2.suggestedActions.map((action, i) => (
                        <li key={i}>{action}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6 pt-8">
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Prompt</div>
                <div className="bg-primary/5 rounded-xl p-5 border border-primary/10 text-foreground leading-relaxed">
                  {RETIREMENT_EXAMPLE_3.prompt}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Response</div>
                <div className="bg-muted/30 rounded-xl p-6 border border-border/50 space-y-4">
                  <p className="text-foreground/90 leading-relaxed">{RETIREMENT_EXAMPLE_3.response}</p>
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-2">Key Numbers</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {RETIREMENT_EXAMPLE_3.keyNumbers.map((item, i) => (
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
                      {RETIREMENT_EXAMPLE_3.insights.map((insight, i) => (
                        <li key={i}>{insight}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-2">Suggested Actions</div>
                    <ul className="list-disc list-inside space-y-1.5 text-foreground/90 text-sm leading-relaxed">
                      {RETIREMENT_EXAMPLE_3.suggestedActions.map((action, i) => (
                        <li key={i}>{action}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6 pt-8">
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Prompt</div>
                <div className="bg-primary/5 rounded-xl p-5 border border-primary/10 text-foreground leading-relaxed">
                  {RETIREMENT_EXAMPLE_4.prompt}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Response</div>
                <div className="bg-muted/30 rounded-xl p-6 border border-border/50 space-y-4">
                  <p className="text-foreground/90 leading-relaxed">{RETIREMENT_EXAMPLE_4.response}</p>
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-2">Key Numbers</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {RETIREMENT_EXAMPLE_4.keyNumbers.map((item, i) => (
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
                      {RETIREMENT_EXAMPLE_4.insights.map((insight, i) => (
                        <li key={i}>{insight}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-2">Suggested Actions</div>
                    <ul className="list-disc list-inside space-y-1.5 text-foreground/90 text-sm leading-relaxed">
                      {RETIREMENT_EXAMPLE_4.suggestedActions.map((action, i) => (
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
                {isLoading === "premium" ? "Loading..." : "Check Your Retirement Plan"}
              </Button>
              <p className="w-full text-center text-sm text-muted-foreground">
                Securely connect your accounts. No spreadsheets required.
              </p>
            </div>

            {/* Blog posts tagged with retirement */}
            <div className="pt-12 border-t border-border/50">
              <h2 className="text-xl font-semibold mb-6">Related from the blog</h2>
              {retirementPosts.length > 0 ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {retirementPosts.map((post) => {
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
                  for retirement planning insights and financial analysis.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
