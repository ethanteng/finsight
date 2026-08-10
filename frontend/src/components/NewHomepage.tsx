"use client";
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import MailerLiteScript from './MailerLiteScript';
import AnimatedPrompt from './AnimatedPrompt';
import BlogSubscription from './BlogSubscription';
import HeroExampleAnswer from './HeroExampleAnswer';
import RealMathCallout from './RealMathCallout';
import FounderBlock from './FounderBlock';
import { Brain, Shield, Zap, TrendingUp, CheckCircle, Users, Lock, Eye, BarChart3, MessageCircle, Sparkles, X, Target, Menu, ChevronDown, CircleArrowUp } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { pushBeginCheckout } from '@/lib/dataLayer';
import { USE_CASE_LINKS, COMPARE_LINKS } from '@/lib/site-nav';
import { PricingValueBadge } from './PricingOfferCallouts';
import SiteFooter from './SiteFooter';

const HOW_LINC_STEPS = [
  { title: "Connect once", description: "Link your financial accounts securely via Plaid", icon: Target },
  { title: "Ask anything", description: "No setup or navigation required", icon: MessageCircle },
  { title: "Keep asking", description: "Ask follow-ups, change assumptions, stress-test scenarios", icon: Brain },
];

const INSTITUTIONS = [
  'Chase', 'Bank of America', 'Wells Fargo', 'Citi', 'PNC', 'US Bank', 'TD Bank', 'HSBC',
  'Fidelity', 'Charles Schwab', 'Capital One', 'Ally', 'Discover', 'American Express',
  'Morgan Stanley', 'Goldman Sachs',
];

const NewHomepage = () => {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUseCasesOpen, setIsUseCasesOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [howItWorksInView, setHowItWorksInView] = useState(false);
  const [revealedStepCount, setRevealedStepCount] = useState(0);
  const [highlightedStep, setHighlightedStep] = useState(0);
  const [highlightedValueBox, setHighlightedValueBox] = useState(0);
  const router = useRouter();
  const getCurrentQuestionRef = useRef<(() => string) | null>(null);
  const howItWorksRef = useRef<HTMLElement | null>(null);


  // How Linc Works: detect when section is in view
  useEffect(() => {
    const el = howItWorksRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHowItWorksInView(entry.isIntersecting),
      { threshold: 0.2, rootMargin: '0px 0px -50px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // How Linc Works: sequential reveal when in view
  useEffect(() => {
    if (!howItWorksInView) return;
    if (revealedStepCount >= 3) return;
    const t = setTimeout(() => setRevealedStepCount((c) => Math.min(c + 1, 3)), 350);
    return () => clearTimeout(t);
  }, [howItWorksInView, revealedStepCount]);

  // How Linc Works: cycle highlight after all steps revealed
  useEffect(() => {
    if (revealedStepCount < 3) return;
    const t = setInterval(() => setHighlightedStep((s) => (s + 1) % 3), 2500);
    return () => clearInterval(t);
  }, [revealedStepCount]);

  // Value Differentiators: sequential highlight cycle
  useEffect(() => {
    const t = setInterval(() => setHighlightedValueBox((s) => (s + 1) % 3), 2500);
    return () => clearInterval(t);
  }, []);

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
    <div className="min-h-screen bg-background">
      <MailerLiteScript />
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-lg bg-background/80 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Brain className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold gradient-text">Ask Linc</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/features" className="text-muted-foreground hover:text-primary transition-colors">Product</Link>
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
              <div
                className="relative group"
                onMouseEnter={() => setIsCompareOpen(true)}
                onMouseLeave={() => setIsCompareOpen(false)}
              >
                <span className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5 cursor-default">
                  Compare
                  <ChevronDown className="h-4 w-4" />
                </span>
                {isCompareOpen && (
                  <div className="absolute top-full left-0 pt-1">
                    <div className="bg-background/95 backdrop-blur-lg border border-border/50 rounded-lg shadow-lg py-2 min-w-[200px]">
                      {COMPARE_LINKS.map((link) => (
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
              <Link
                href="/blog"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Blog
              </Link>
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
            {/* Mobile hamburger menu - visible only on mobile */}
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
        {/* Mobile menu overlay */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-16 left-0 right-0 bg-background/95 backdrop-blur-lg border-b border-border/50 shadow-lg">
            <div className="px-4 py-4 space-y-1">
              <Link 
                href="/features" 
                className="block py-3 text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Product
              </Link>
              <div className="py-2">
                <span className="block py-1 text-sm font-medium text-foreground">Use Cases</span>
                <Link href="/use-cases" className="block py-2 pl-4 text-muted-foreground hover:text-primary transition-colors" onClick={() => setIsMobileMenuOpen(false)}>
                  Overview
                </Link>
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
              <div className="py-2">
                <span className="block py-1 text-sm font-medium text-foreground">Compare</span>
                {COMPARE_LINKS.map((link) => (
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
              <Link
                href="/pricing"
                className="block py-3 text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Pricing
              </Link>
              <Link
                href="/blog"
                className="block py-3 text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Blog
              </Link>
              <div className="pt-4 space-y-2 border-t border-border/50">
                <Button 
                  variant="hero" 
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    handleBuyClick('premium');
                    setIsMobileMenuOpen(false);
                  }}
                  disabled={isLoading === 'premium'}
                >
                  {isLoading === 'premium' ? 'Loading...' : 'Get started'}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    window.location.href = '/login';
                    setIsMobileMenuOpen(false);
                  }}
                >
                  Login
                </Button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <div>
        <section className="relative pt-20 pb-20 overflow-hidden">
          <div className="absolute inset-0 z-0 opacity-20 bg-gradient-to-br from-primary/20 to-secondary/20" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background z-10" />
          
          <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center">
            <div className="text-center space-y-8 w-full max-w-4xl flex flex-col items-center">
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight mt-6">
                <span className="gradient-text text-[2.53125rem] md:text-[4.21875rem] lg:text-[5.0625rem] block">
                  Ask Linc
                </span>
              </h1>

              <p className="text-xl md:text-2xl lg:text-[1.75rem] text-foreground max-w-3xl leading-snug font-semibold tracking-tight">
                The AI financial assistant for households planning for retirement.
              </p>
              <p className="text-[1rem] md:text-[1.1rem] text-foreground/90 max-w-3xl font-medium">
                Get real recommendations — not another chart.
              </p>
              
              <div className="space-y-4 w-full max-w-2xl mx-auto mt-4">
                <HeroExampleAnswer />
                <p className="text-sm text-muted-foreground">
                  Or ask your own question on sample data:
                </p>
                <AnimatedPrompt
                nestedInLink
                getCurrentQuestionRef={getCurrentQuestionRef}
                questions={[
                  "Are we actually on track to retire at 60?",
                  "Can we afford this house without selling investments?",
                  "How exposed is our portfolio if the market drops 30%?",
                  "Should we pay off our mortgage early or keep investing?",
                  "If inflation stays high, are we still okay?",
                  "How long would our money last if we retired today?",
                  "What’s the biggest risk in our portfolio right now?"
                ]}
                onClick={() => {
                  const question = getCurrentQuestionRef.current?.() || '';
                  if (question) {
                    sessionStorage.setItem('demo_initial_question', question);
                  }
                  router.push('/demo');
                }}
              />
              </div>
              
              <div className="flex flex-col items-center gap-3 w-full">
                  <Button 
                    variant="hero" 
                    size="xl" 
                    className="group h-[4.235rem] px-[3.025rem] text-[1.36125rem] flex items-center gap-3"
                    onClick={() => {
                      const question = getCurrentQuestionRef.current?.() || 'Can we retire at 60 if rates stay higher for longer?';
                      if (question) {
                        sessionStorage.setItem('demo_initial_question', question);
                      }
                      router.push('/demo');
                    }}
                  >
                    See a real answer free
                    <CircleArrowUp className="!w-[1.6875rem] !h-[1.6875rem] shrink-0" />
                  </Button>
                  <p className="text-[0.7875rem]">No credit card needed. Interactive demo with sample financial data.</p>
              </div>
            </div>
      </div>
    </section>
  </div>

      {/* How Linc Works Section */}
      <section
        id="how-it-works"
        ref={howItWorksRef}
        className="py-20 bg-slate-900"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              How <span className="gradient-text">Linc Works</span>
            </h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-12 items-start">
            {HOW_LINC_STEPS.map((step, index) => {
              const StepIcon = step.icon;
              const isRevealed = revealedStepCount > index;
              const isHighlighted = revealedStepCount >= 3 && highlightedStep === index;
              return (
                <div
                  key={index}
                  className={`text-center space-y-6 group transition-all duration-500 ease-out ${
                    isRevealed
                      ? 'opacity-100 translate-y-0'
                      : 'opacity-0 translate-y-6 pointer-events-none'
                  }`}
                  style={{
                    transitionDelay: isRevealed ? '0ms' : `${index * 100}ms`,
                  }}
                >
                  <div className="relative">
                    <div
                      className={`h-20 w-20 rounded-full flex items-center justify-center mx-auto border-4 transition-all duration-500 ${
                        isHighlighted
                          ? 'bg-primary/25 border-primary/50 scale-110 shadow-lg shadow-primary/20'
                          : 'bg-primary/10 border-primary/20 group-hover:bg-primary/20'
                      }`}
                    >
                      <StepIcon className="h-10 w-10 text-primary" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className={`text-xl font-bold transition-colors duration-300 ${isHighlighted ? 'text-primary' : 'text-white'}`}>
                      {step.title}
                    </h3>
                    <p className="text-slate-400">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Financial Institutions Connected Section */}
      <section className="py-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">
              Over 12,000 <span className="gradient-text">Financial Institutions</span> Connected
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Linc is connected to over 12,000 financial institutions around the world, including in the US, Canada, the UK, and Europe.
            </p>
          </div>
          <div className="relative min-h-[80px]">
            <div className="absolute left-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
            <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)] [-webkit-mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)] min-h-[80px]">
              <div className="flex shrink-0 animate-marquee items-center gap-12 sm:gap-16 py-6">
                {INSTITUTIONS.map((name) => (
                  <div
                    key={name}
                    className="flex shrink-0 items-center justify-center min-h-[48px] opacity-80 hover:opacity-100 transition-opacity duration-300 min-w-[100px] sm:min-w-[120px]"
                  >
                    <span className="text-muted-foreground/80 font-semibold text-sm sm:text-lg text-center">{name}</span>
                  </div>
                ))}
                {INSTITUTIONS.map((name) => (
                  <div
                    key={`${name}-dup`}
                    className="flex shrink-0 items-center justify-center min-h-[48px] opacity-80 hover:opacity-100 transition-opacity duration-300 min-w-[100px] sm:min-w-[120px]"
                  >
                    <span className="text-muted-foreground/80 font-semibold text-sm sm:text-lg text-center">{name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value Differentiators Section */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Brain,
                title: "One connected financial model",
                description: "Cash, investments, debt, home value, and goals flow into a single line of reasoning — not separate dashboards.",
              },
              {
                icon: TrendingUp,
                title: "Real-time market intelligence",
                description: "Live interest rates, inflation, market conditions, and economic data are baked into every answer.",
              },
              {
                icon: Zap,
                title: "Run what-if scenarios",
                description: "Model early retirement, home purchases, inflation spikes, or rate changes — before you decide.",
              },
            ].map((item, index) => {
              const isHighlighted = highlightedValueBox === index;
              return (
                <Card
                  key={index}
                  className={`glass-card hover:shadow-xl transition-all duration-500 ease-out group ${
                    isHighlighted
                      ? "ring-2 ring-primary/50 shadow-xl shadow-primary/10 scale-[1.02]"
                      : ""
                  }`}
                >
                  <CardContent className="p-8 space-y-4">
                    <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <item.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className={`text-2xl font-bold transition-colors duration-300 ${isHighlighted ? "text-primary" : ""}`}>
                      {item.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <RealMathCallout />

      {/* Pricing Section */}
      <section id="pricing" className="py-16 bg-[hsl(217,32%,6%)]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-8">
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              One plan. <span className="gradient-text">Full access.</span>
            </h2>
          </div>
          
          <Card className="relative overflow-hidden hover:shadow-2xl transition-all duration-300">
            <CardContent className="p-8 flex flex-col">
              <div className="text-center space-y-4 mb-8">
                <h3 className="text-2xl font-bold">Ask Linc</h3>
                <div className="flex items-baseline justify-center space-x-1">
                  <span className="text-5xl font-bold gradient-text">$9</span>
                  <span className="text-muted-foreground text-xl">/ month</span>
                </div>
                <PricingValueBadge />
                <p className="text-muted-foreground text-sm mx-auto max-w-xs sm:max-w-sm text-balance">
                  Compared to the 1-2% of your wealth a human advisor charges every year.
                </p>
              </div>
              
              <ul className="space-y-4 mb-8 mx-auto max-w-md">
                <li className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Unlimited questions about your money</span>
                </li>
                <li className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Unlimited number of connected accounts</span>
                </li>
                <li className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Market-aware financial reasoning</span>
                </li>
                <li className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Retirement & risk analysis</span>
                </li>
                <li className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Privacy-first architecture</span>
                </li>
              </ul>
              
              <div className="mt-auto">
                <Button 
                  variant="hero" 
                  className="w-full" 
                  size="lg"
                  onClick={() => handleBuyClick('premium')}
                  disabled={isLoading === 'premium'}
                >
                  {isLoading === 'premium' ? 'Creating...' : 'Get started'}
                </Button>
                <p className="text-center text-xs text-muted-foreground mt-3">
                  Cancel anytime.
                </p>
                <p className="text-center text-sm mt-2">
                  <Link href="/demo" className="text-primary hover:underline font-medium">
                    See a real answer free, no credit card needed
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <FounderBlock />

      {/* Privacy Section */}
      <section id="security" className="py-16 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-6 mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">
              Privacy that <span className="gradient-text">actually means something</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto md:whitespace-nowrap">
              The AI doesn’t see your real account details—only what’s necessary to provide answers.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[{
              icon: Shield,
              title: "Powered by Plaid",
              description: "The same secure tech used by Venmo, AmEx, and thousands of banks"
            }, {
              icon: Eye,
              title: "Read-only access",
              description: "We can't move your money — ever"
            }, {
              icon: Lock,
              title: "Data anonymization",
              description: "All sensitive data is anonymized before AI analysis"
            }, {
              icon: Brain,
              title: "Privacy-protected AI",
              description: "Your data is never used to train AI models"
            }, {
              icon: Zap,
              title: "Complete control",
              description: "View, export, or delete all your data anytime"
            }, {
              icon: BarChart3,
              title: "Transparency",
              description: "See exactly what data we have about you"
            }].map((item, index) => (
              <div key={index} className="text-center space-y-4 group">
                <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto group-hover:bg-primary/20 transition-colors">
                  <item.icon className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 relative overflow-hidden bg-[hsl(217,32%,6%)]">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-secondary/15 to-primary/20 pointer-events-none" />
        <div className="relative max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8 space-y-8">
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            Start understanding your money
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <div className="flex flex-col items-center gap-2">
              <Button 
                variant="hero" 
                size="xl" 
                className="group w-full sm:w-auto"
                onClick={() => handleBuyClick('premium')}
                disabled={isLoading === 'premium'}
              >
                {isLoading === 'premium' ? 'Creating...' : 'Get started'}
              </Button>
              <p className="text-[1.00625rem] text-primary font-medium">$9/month. Cancel anytime.</p>
              <Link href="/demo" className="text-sm text-slate-300 hover:text-primary transition-colors">
                See a real answer free, no credit card needed
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter Subscription Section - hidden for now */}
      {/* <section className="py-20 bg-muted/30 border-t border-border/50">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold">
              Stay <span className="gradient-text">Informed</span>
            </h2>
            <p className="text-xl text-muted-foreground">
              Get daily analysis on the economy, markets, and how they impact your wallet.
            </p>
          </div>
          
          <div className="flex justify-center">
            <BlogSubscription />
          </div>
        </div>
      </section> */}
      <SiteFooter />

    </div>
  );
};

export default NewHomepage; 