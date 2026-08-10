"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { pushBeginCheckout } from "@/lib/dataLayer";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import type { GhostPost } from "@/lib/ghost";


const STRESS_TEST_EXAMPLE_1 = {
  prompt: "Re-evaluate my entire portfolio. Stress test it and give me a probability assessment on how long I'll likely be able to sustain my revised monthly drawdown, given that I'm currently 77 years old.",
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

const STRESS_TEST_EXAMPLE_2 = {
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

interface FinancialStressTestingUseCasePageProps {
  moneyTrendsPosts?: GhostPost[];
}

export default function FinancialStressTestingUseCasePage({ moneyTrendsPosts = [] }: FinancialStressTestingUseCasePageProps) {
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
      <SiteHeader />

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
                Financial Stress Testing
              </h1>
              <p className="text-lg text-muted-foreground mt-2">
                See these real examples of how Ask Linc can stress test your portfolio, assess withdrawal sustainability, and model the impact of geopolitical events on your retirement plans.
              </p>
            </div>

            <div className="space-y-6">
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Prompt</div>
                <div className="bg-primary/5 rounded-xl p-5 border border-primary/10 text-foreground leading-relaxed">
                  {STRESS_TEST_EXAMPLE_1.prompt}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Response</div>
                <div className="bg-muted/30 rounded-xl p-6 border border-border/50 space-y-4">
                  <p className="text-foreground/90 leading-relaxed">{STRESS_TEST_EXAMPLE_1.response}</p>
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-2">Key Numbers</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {STRESS_TEST_EXAMPLE_1.keyNumbers.map((item, i) => (
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
                      {STRESS_TEST_EXAMPLE_1.insights.map((insight, i) => (
                        <li key={i}>{insight}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-2">Suggested Actions</div>
                    <ul className="list-disc list-inside space-y-1.5 text-foreground/90 text-sm leading-relaxed">
                      {STRESS_TEST_EXAMPLE_1.suggestedActions.map((action, i) => (
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
                  {STRESS_TEST_EXAMPLE_2.prompt}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Response</div>
                <div className="bg-muted/30 rounded-xl p-6 border border-border/50 space-y-4">
                  <p className="text-foreground/90 leading-relaxed">{STRESS_TEST_EXAMPLE_2.response}</p>
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-2">Key Numbers</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {STRESS_TEST_EXAMPLE_2.keyNumbers.map((item, i) => (
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
                      {STRESS_TEST_EXAMPLE_2.insights.map((insight, i) => (
                        <li key={i}>{insight}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-2">Suggested Actions</div>
                    <ul className="list-disc list-inside space-y-1.5 text-foreground/90 text-sm leading-relaxed">
                      {STRESS_TEST_EXAMPLE_2.suggestedActions.map((action, i) => (
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
                {isLoading === "premium" ? "Loading..." : "Stress Test Your Portfolio"}
              </Button>
              <p className="w-full text-center text-sm text-muted-foreground">
                Securely connect your accounts. No spreadsheets required.
              </p>
            </div>

            {/* Blog posts tagged with money-trends */}
            <div className="pt-12 border-t border-border/50">
              <h2 className="text-xl font-semibold mb-6">Related from the blog</h2>
              {moneyTrendsPosts.length > 0 ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {moneyTrendsPosts.map((post) => {
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
                  for stress testing insights and money trends.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
