"use client";
import { Button } from './ui/button';
import { pushBeginCheckout } from '@/lib/dataLayer';
import { Brain, TrendingUp, MessageCircle, Lock, Users, Link2, Briefcase, Wallet, Banknote, BarChart3, Search, Home, Layers, Menu, X, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import RealMathCallout from './RealMathCallout';

const USE_CASE_LINKS = [
  { href: '/use-cases/retirement', label: 'Retirement Planning' },
  { href: '/use-cases/home-buying', label: 'Home Buying Decisions' },
  { href: '/use-cases/portfolio-analysis', label: 'Investment Portfolio Analysis' },
  { href: '/use-cases/financial-stress-testing', label: 'Financial Stress Testing' },
];

const FeaturesPage = () => {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUseCasesOpen, setIsUseCasesOpen] = useState(false);

  const handleBuyClick = async (planId: string) => {
    pushBeginCheckout();
    setIsLoading(planId);
    
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      
      // Create checkout session for anyone (new or existing users)
      const response = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tier: planId,
          successUrl: `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&tier=${planId}`,
          cancelUrl: `${window.location.origin}/`
        })
      });

      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
      } else {
        const error = await response.json();
        console.error('Failed to create checkout session:', error);
        alert('Failed to create checkout session. Please try again.');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-lg bg-background/80 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-2">
              <Brain className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold gradient-text">Ask Linc</span>
            </Link>
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/features" className="text-primary hover:text-primary/80 transition-colors">Product</Link>
              <div
                className="relative group"
                onMouseEnter={() => setIsUseCasesOpen(true)}
                onMouseLeave={() => setIsUseCasesOpen(false)}
              >
                <Link href="/use-cases" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5">
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
              <Link href="/pricing" className="text-muted-foreground hover:text-primary transition-colors">Pricing</Link>
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
                onClick={() => handleBuyClick('premium')}
                disabled={isLoading === 'premium'}
              >
                {isLoading === 'premium' ? 'Loading...' : 'Get started'}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.href = '/login'}
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
                {isMobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>
        </div>
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-16 left-0 right-0 bg-background/95 backdrop-blur-lg border-b border-border/50 shadow-lg">
            <div className="px-4 py-4 space-y-1">
              <Link href="/features" className="block py-3 text-primary transition-colors" onClick={() => setIsMobileMenuOpen(false)}>Product</Link>
              <div className="py-2">
                <span className="block py-1 text-sm font-medium text-foreground">Use Cases</span>
                <Link href="/use-cases" className="block py-2 pl-4 text-muted-foreground hover:text-primary transition-colors" onClick={() => setIsMobileMenuOpen(false)}>Overview</Link>
                {USE_CASE_LINKS.map((link) => (
                  <Link key={link.href} href={link.href} className="block py-2 pl-4 text-muted-foreground hover:text-primary transition-colors" onClick={() => setIsMobileMenuOpen(false)}>{link.label}</Link>
                ))}
              </div>
              <Link href="/pricing" className="block py-3 text-muted-foreground hover:text-primary transition-colors" onClick={() => setIsMobileMenuOpen(false)}>Pricing</Link>
              <a href="/blog" target="_blank" rel="noopener noreferrer" className="block py-3 text-muted-foreground hover:text-primary transition-colors" onClick={() => setIsMobileMenuOpen(false)}>Blog</a>
              <div className="pt-4 space-y-2 border-t border-border/50">
                <Button variant="hero" size="sm" className="w-full" onClick={() => { handleBuyClick('premium'); setIsMobileMenuOpen(false); }} disabled={isLoading === 'premium'}>{isLoading === 'premium' ? 'Loading...' : 'Get started'}</Button>
                <Button variant="outline" size="sm" className="w-full" onClick={() => { window.location.href = '/login'; setIsMobileMenuOpen(false); }}>Login</Button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative pt-20 pb-10 sm:pt-24 sm:pb-14 overflow-hidden">
        {/* Radial glow behind hero text */}
        <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
          <div className="w-[800px] h-[500px] rounded-full bg-primary/8 blur-3xl" />
        </div>
        <div className="absolute inset-0 z-0 opacity-30 bg-gradient-to-b from-primary/5 via-transparent to-background" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/40 to-background z-10" />
        
        <div className="relative z-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-6 sm:space-y-10 md:space-y-12">
            <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.08] tracking-tight px-1">
              Get Answers to Your <span className="text-primary">Real Financial Questions</span>
            </h1>
          </div>
        </div>
      </section>

      {/* Feature Bands */}
      <div className="divide-y divide-primary/15">
        {/* Section 1: Icon left, content right */}
        <section id="conversational" className="py-10 sm:py-12 md:py-16 bg-primary/[0.02]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-center">
            <div className="grid md:grid-cols-[auto_1fr] gap-6 sm:gap-8 md:gap-16 items-start w-full max-w-5xl">
              <div className="flex items-center gap-4 md:flex-col md:items-start md:translate-x-[4rem] lg:translate-x-[7rem]">
                <div className="relative h-14 w-14 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 ring-2 ring-primary/20 feature-icon-glow">
                  <MessageCircle className="h-7 w-7 text-primary" />
                </div>
                <div className="md:hidden">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Conversational Financial <span className="text-primary">Reasoning</span></h2>
                  <p className="mt-1 text-xs text-muted-foreground tracking-[0.12em] uppercase font-medium">Ask follow-ups. Change assumptions. Explore tradeoffs.</p>
                </div>
              </div>
              <div className="space-y-4 sm:space-y-6 max-w-[65ch] min-w-0 md:pl-8 lg:pl-[15%]">
                <div className="hidden md:block">
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Conversational Financial <span className="text-primary">Reasoning</span></h2>
                  <p className="mt-2 text-xs text-muted-foreground tracking-[0.12em] uppercase font-medium">Ask follow-ups. Change assumptions. Explore tradeoffs.</p>
                </div>
                <p className="text-[1.0625rem] text-muted-foreground leading-[1.75]">
                  Most financial tools treat every question as isolated. Ask Linc doesn&apos;t. It understands your finances as a <span className="text-primary/90">connected system</span>—remembering your goals, age, risk tolerance, and past assumptions as part of an ongoing conversation. That means you can ask:
                </p>
                <div className="space-y-3 border-l-2 border-primary/50 pl-5 py-1">
                  <p className="text-[1.0625rem] text-foreground/80 leading-relaxed italic">&ldquo;Are we still on track to retire if we slow down contributions?&rdquo;</p>
                  <p className="text-[1.0625rem] text-foreground/80 leading-relaxed italic">&ldquo;What happens if rates stay higher for longer?&rdquo;</p>
                  <p className="text-[1.0625rem] text-foreground/80 leading-relaxed italic">&ldquo;Does paying off the mortgage early actually help us?&rdquo;</p>
                </div>
                <p className="text-[1.0625rem] text-muted-foreground leading-[1.75]">
                  And then keep going. Refine the scenario. Push on edge cases. Ask &ldquo;what if&rdquo; without starting over. This is financial reasoning, not one-off answers.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Icon left, content right */}
        <section id="market-aware" className="py-10 sm:py-12 md:py-16 bg-muted/25">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-center">
            <div className="grid md:grid-cols-[auto_1fr] gap-6 sm:gap-8 md:gap-16 items-start w-full max-w-5xl">
              <div className="flex items-center gap-4 md:flex-col md:items-start md:translate-x-[4rem] lg:translate-x-[7rem]">
                <div className="h-14 w-14 rounded-xl flex items-center justify-center shrink-0 bg-primary/8 ring-2 ring-primary/15 feature-icon-glow">
                  <TrendingUp className="h-7 w-7 text-primary" />
                </div>
                <div className="md:hidden">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Market-Aware <span className="text-primary">Analysis</span></h2>
                  <p className="mt-1 text-xs text-muted-foreground tracking-[0.12em] uppercase font-medium">Your decisions don&apos;t happen in a vacuum. Neither do Ask Linc&apos;s answers.</p>
                </div>
              </div>
              <div className="space-y-4 sm:space-y-6 max-w-[65ch] min-w-0 md:pl-8 lg:pl-[15%]">
                <div className="hidden md:block">
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Market-Aware <span className="text-primary">Analysis</span></h2>
                  <p className="mt-2 text-xs text-muted-foreground tracking-[0.12em] uppercase font-medium">Your decisions don&apos;t happen in a vacuum. Neither do Ask Linc&apos;s answers.</p>
                </div>
                <p className="text-[1.0625rem] text-muted-foreground leading-[1.75]">
                  Ask Linc incorporates <span className="text-primary/90">current market conditions</span>—interest rates, inflation trends, mortgage dynamics, and macro context—so advice isn&apos;t frozen in time. That matters when you&apos;re deciding whether to:
                </p>
                <ul className="space-y-3 pl-6 [&>li]:relative [&>li]:pl-3 [&>li]:before:content-[''] [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-[0.55em] [&>li]:before:h-1.5 [&>li]:before:w-1.5 [&>li]:before:rounded-full [&>li]:before:bg-primary/50">
                  <li>Refinance or stay put</li>
                  <li>Shift asset allocation</li>
                  <li>Change savings rates</li>
                  <li>Delay or accelerate retirement</li>
                </ul>
                <p className="text-[1.0625rem] text-muted-foreground leading-[1.75]">
                  Static rules of thumb break down when conditions change. Ask Linc adjusts the analysis instead of pretending markets don&apos;t exist.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Icon left, content right */}
        <section id="retirement-risk" className="py-10 sm:py-12 md:py-16 bg-primary/[0.02]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-center">
            <div className="grid md:grid-cols-[auto_1fr] gap-6 sm:gap-8 md:gap-16 items-start w-full max-w-5xl">
              <div className="flex items-center gap-4 md:flex-col md:items-start md:translate-x-[4rem] lg:translate-x-[7rem]">
                <div className="h-14 w-14 rounded-xl flex items-center justify-center shrink-0 bg-secondary/10 ring-2 ring-secondary/20 feature-icon-glow-secondary">
                  <Brain className="h-7 w-7 text-primary" />
                </div>
                <div className="md:hidden">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Retirement & <span className="text-primary">Risk</span> Analysis</h2>
                  <p className="mt-1 text-xs text-muted-foreground tracking-[0.12em] uppercase font-medium">Stress-test your plan before real life does.</p>
                </div>
              </div>
              <div className="space-y-4 sm:space-y-6 max-w-[65ch] min-w-0 md:pl-8 lg:pl-[15%]">
                <div className="hidden md:block">
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Retirement & <span className="text-primary">Risk</span> Analysis</h2>
                  <p className="mt-2 text-xs text-muted-foreground tracking-[0.12em] uppercase font-medium">Stress-test your plan before real life does.</p>
                </div>
                <p className="text-[1.0625rem] text-muted-foreground leading-[1.75]">
                  Ask Linc evaluates the <span className="text-primary/90">durability of your financial plan</span>, not just whether the numbers add up today. That includes:
                </p>
                <ul className="space-y-3 pl-6 [&>li]:relative [&>li]:pl-3 [&>li]:before:content-[''] [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-[0.55em] [&>li]:before:h-1.5 [&>li]:before:w-1.5 [&>li]:before:rounded-full [&>li]:before:bg-primary/50">
                  <li>Portfolio sustainability and withdrawal fragility</li>
                  <li>Inflation risk over long horizons</li>
                  <li>Downside and &ldquo;bad timing&rdquo; scenarios</li>
                  <li>Tradeoffs between safety, growth, and flexibility</li>
                </ul>
                <p className="text-[1.0625rem] text-muted-foreground leading-[1.75]">
                  Instead of vague reassurance, you get clarity on where your plan is strong, where it&apos;s exposed, and what actually improves outcomes versus what just feels comforting.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Icon left, content right */}
        <section id="privacy" className="py-10 sm:py-12 md:py-16 bg-muted/25">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-center">
            <div className="grid md:grid-cols-[auto_1fr] gap-6 sm:gap-8 md:gap-16 items-start w-full max-w-5xl">
              <div className="flex items-center gap-4 md:flex-col md:items-start md:translate-x-[4rem] lg:translate-x-[7rem]">
                <div className="h-14 w-14 rounded-xl flex items-center justify-center shrink-0 bg-teal/10 ring-2 ring-teal/20 feature-icon-glow-teal">
                  <Lock className="h-7 w-7 text-teal" />
                </div>
                <div className="md:hidden">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Privacy-First <span className="text-teal">Architecture</span></h2>
                  <p className="mt-1 text-xs text-muted-foreground tracking-[0.12em] uppercase font-medium">Your real data never gets handed to an AI model.</p>
                </div>
              </div>
              <div className="space-y-4 sm:space-y-6 max-w-[65ch] min-w-0 md:pl-8 lg:pl-[15%]">
                <div className="hidden md:block">
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Privacy-First <span className="text-teal">Architecture</span></h2>
                  <p className="mt-2 text-xs text-muted-foreground tracking-[0.12em] uppercase font-medium">Your real data never gets handed to an AI model.</p>
                </div>
                <p className="text-[1.0625rem] text-muted-foreground leading-[1.75]">
                  This matters, and most tools hand-wave it. Ask Linc abstracts and anonymizes your financial information before analysis. The AI reasons over <span className="text-primary/90">signals and structure</span>—not raw account details. Your balances, institutions, and identities are not exposed.
                </p>
                <p className="text-[1.0625rem] text-muted-foreground leading-[1.75]">
                  You get <span className="text-primary/90">insights from your finances</span> without turning your life into training data. No screenshots. No copy-pasting statements into a chatbot. No blind trust required.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Icon left, content right */}
        <section id="who-its-for" className="py-10 sm:py-12 md:py-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-center">
            <div className="grid md:grid-cols-[auto_1fr] gap-6 sm:gap-8 md:gap-16 items-start w-full max-w-5xl">
              <div className="flex items-center gap-4 md:flex-col md:items-start md:translate-x-[4rem] lg:translate-x-[7rem]">
                <div className="h-14 w-14 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 ring-2 ring-primary/20 feature-icon-glow">
                  <Users className="h-7 w-7 text-primary" />
                </div>
                <div className="md:hidden">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Built for People Making <span className="text-primary">Real</span> Decisions</h2>
                  <p className="mt-1 text-xs text-muted-foreground tracking-[0.12em] uppercase font-medium">Not day traders. Not spreadsheet hobbyists.</p>
                </div>
              </div>
              <div className="space-y-4 sm:space-y-6 max-w-[65ch] min-w-0 md:pl-8 lg:pl-[15%]">
                <div className="hidden md:block">
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Built for People Making <span className="text-primary">Real</span> Decisions</h2>
                  <p className="mt-2 text-xs text-muted-foreground tracking-[0.12em] uppercase font-medium">Not day traders. Not spreadsheet hobbyists.</p>
                </div>
                <p className="text-[1.0625rem] text-muted-foreground leading-[1.75]">
                  Ask Linc is for people who need answers they can act on:
                </p>
                <ul className="space-y-3 pl-6 [&>li]:relative [&>li]:pl-3 [&>li]:before:content-[''] [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-[0.55em] [&>li]:before:h-1.5 [&>li]:before:w-1.5 [&>li]:before:rounded-full [&>li]:before:bg-primary/50">
                  <li>Households planning retirement</li>
                  <li>Investors managing long-term tradeoffs</li>
                  <li>Decision-makers weighing uncertainty, not chasing alpha</li>
                </ul>
                <p className="text-[1.0625rem] text-muted-foreground leading-[1.75]">
                  If you want constant alerts, pretty charts, or generic advice, this isn&apos;t it. If you want to understand <span className="text-primary/90">where you stand</span>, <span className="text-primary/90">what actually matters</span>, and <span className="text-primary/90">what to do next</span>, Ask Linc was built for you.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Integrations Section - Last under feature bands */}
        <section id="integrations" className="py-10 sm:py-12 md:py-16 bg-muted/25">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-center">
            <div className="grid md:grid-cols-[auto_1fr] gap-6 sm:gap-8 md:gap-16 items-start w-full max-w-5xl">
              <div className="flex items-center gap-4 md:flex-col md:items-start md:translate-x-[4rem] lg:translate-x-[7rem]">
                <div className="h-14 w-14 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 ring-2 ring-primary/20 feature-icon-glow">
                  <Link2 className="h-7 w-7 text-primary" />
                </div>
                <div className="md:hidden">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Integrations & <span className="text-primary">Data</span> Sources</h2>
                  <p className="mt-1 text-xs text-muted-foreground tracking-[0.12em] uppercase font-medium">Connect your accounts. Get analysis grounded in reality.</p>
                </div>
              </div>
              <div className="space-y-4 sm:space-y-6 max-w-[65ch] min-w-0 md:pl-8 lg:pl-[15%]">
                <div className="hidden md:block">
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Integrations & <span className="text-primary">Data</span> Sources</h2>
                  <p className="mt-2 text-xs text-muted-foreground tracking-[0.12em] uppercase font-medium">Connect your accounts. Get analysis grounded in reality.</p>
                </div>
                <p className="text-[1.0625rem] text-muted-foreground leading-[1.75]">
                  Ask Linc combines your real account data with live market and economic context. You connect accounts; we pull in rates, inflation, and market data from trusted sources. Together, these enable <span className="text-primary/90">scenario modeling</span>, tradeoff analysis, and answers grounded in your actual situation—not hypotheticals.
                </p>
                <div className="space-y-6">
                  <p className="text-xs text-muted-foreground/80 tracking-wide uppercase">Account connections</p>
                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Wallet className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Banking (Plaid)</h3>
                      <p className="text-[1rem] text-muted-foreground leading-relaxed">
                        Over 11,000 institutions—banks, credit unions, fintechs. Balances, transactions (90+ days), interest rates, and APRs. Powers <span className="text-primary/90">cash flow analysis</span>, spending patterns, and debt payoff scenarios.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                      <Briefcase className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Investments (SnapTrade)</h3>
                      <p className="text-[1rem] text-muted-foreground leading-relaxed">
                        Fidelity, Vanguard, Schwab, Robinhood, E*TRADE, and more. Holdings, asset allocation, market values, and 2+ years of buy/sell history. Essential for <span className="text-primary/90">retirement modeling</span>, withdrawal sequencing, and portfolio stress tests.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    <div className="h-10 w-10 rounded-lg bg-teal/10 flex items-center justify-center shrink-0">
                      <Banknote className="h-5 w-5 text-teal" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Manual Accounts</h3>
                      <p className="text-[1rem] text-muted-foreground leading-relaxed">
                        Cash, real estate, or assets that can&apos;t be linked. Add balances manually to round out your net worth and ensure scenario analysis reflects your <span className="text-primary/90">full financial picture</span>.
                      </p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border/50 mt-6">
                    <p className="text-xs text-muted-foreground/80 tracking-wide uppercase mb-4">Market & economic context</p>
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row gap-4 items-start">
                        <div className="h-10 w-10 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                          <BarChart3 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground mb-1">FRED (Federal Reserve)</h3>
                          <p className="text-[1rem] text-muted-foreground leading-relaxed">
                            CPI, Fed funds rate, mortgage rates, credit card APR, unemployment. Powers <span className="text-primary/90">inflation-aware analysis</span>, refinance decisions, and debt strategy.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4 items-start">
                        <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                          <BarChart3 className="h-5 w-5 text-secondary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground mb-1">Alpha Vantage</h3>
                          <p className="text-[1rem] text-muted-foreground leading-relaxed">
                            Live CD rates, Treasury yields, mortgage rates, and stock data. Used for <span className="text-primary/90">real-time market context</span> when comparing savings options or tracking investments.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4 items-start">
                        <div className="h-10 w-10 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                          <BarChart3 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground mb-1">Polygon.io</h3>
                          <p className="text-[1rem] text-muted-foreground leading-relaxed">
                            Stock aggregates, Treasury yields, inflation, and inflation expectations. Powers <span className="text-primary/90">comprehensive market intelligence</span> for answers.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4 items-start">
                        <div className="h-10 w-10 rounded-lg bg-teal/10 flex items-center justify-center shrink-0">
                          <Search className="h-5 w-5 text-teal" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground mb-1">Brave Search</h3>
                          <p className="text-[1rem] text-muted-foreground leading-relaxed">
                            Real-time financial news and current rates. Supplements market context so answers reference <span className="text-primary/90">what&apos;s happening now</span>, not last month&apos;s data.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4 items-start">
                        <div className="h-10 w-10 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                          <Home className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground mb-1">RentCast (Home Valuations)</h3>
                          <p className="text-[1rem] text-muted-foreground leading-relaxed">
                            Property valuations when you add your address. Low, mid, and high estimates feed into <span className="text-primary/90">net worth</span> and retirement planning.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border/50 mt-6">
                    <p className="text-xs text-muted-foreground/80 tracking-wide uppercase mb-4">Retirement & portfolio analysis</p>
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row gap-4 items-start">
                        <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                          <TrendingUp className="h-5 w-5 text-secondary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground mb-1">Tiingo</h3>
                          <p className="text-[1rem] text-muted-foreground leading-relaxed">
                            Historical price data with dividend and split adjustments. Powers <span className="text-primary/90">retirement stress testing</span> and portfolio Monte Carlo simulations with accurate long-horizon returns.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4 items-start">
                        <div className="h-10 w-10 rounded-lg bg-teal/10 flex items-center justify-center shrink-0">
                          <Layers className="h-5 w-5 text-teal" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground mb-1">Financial Modeling Prep (FMP)</h3>
                          <p className="text-[1rem] text-muted-foreground leading-relaxed">
                            ETF and fund metadata: expense ratios, asset class, geographic focus. Enables accurate <span className="text-primary/90">portfolio mapping</span> and asset allocation analysis for retirement projections.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-[0.8rem] text-muted-foreground leading-[1.75]">
                  Account connections are read-only—Ask Linc cannot move money. Your credentials are never stored on our servers. All market and economic data is fetched by Ask Linc to enrich your analysis; you don&apos;t connect to these sources directly.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <RealMathCallout />

      {/* CTA Section */}
      <section className="py-12 sm:py-16 md:py-24 relative overflow-hidden bg-[hsl(217,32%,6%)]">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-secondary/15 to-primary/20 pointer-events-none" />
        <div className="relative max-w-3xl mx-auto text-center px-4 sm:px-6 lg:px-8 space-y-8 sm:space-y-10">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white">
            Start understanding your money
          </h2>
          <div className="flex flex-col items-center gap-4">
            <Button 
              variant="hero" 
              size="xl"
              onClick={() => handleBuyClick('premium')}
              disabled={isLoading === 'premium'}
            >
              {isLoading === 'premium' ? 'Creating...' : 'Get started'}
            </Button>
            <p className="text-[1.0625rem] font-medium text-white">
              <span className="text-primary">$9/month</span>. Cancel anytime.
            </p>
            <Link href="/demo" className="text-sm text-slate-300 hover:text-primary transition-colors">
              See a real answer free, no credit card needed
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-muted/50 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 md:gap-0 text-center md:text-left">
            <div className="flex items-center space-x-2">
              <Brain className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold gradient-text">Ask Linc</span>
            </div>
            <div className="flex flex-wrap justify-center md:justify-start items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <Link href="/privacy" className="hover:text-primary transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-primary transition-colors">
                Terms of Service
              </Link>
              <Link href="/contact" className="hover:text-primary transition-colors">
                Contact
              </Link>
            </div>
          </div>
          <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-border text-center">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Ask Linc. Your AI financial analyst. Built with privacy in mind.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default FeaturesPage;
