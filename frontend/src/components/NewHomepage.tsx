"use client";
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import MailerLiteForm from './MailerLiteForm';
import MailerLiteScript from './MailerLiteScript';
import AnimatedPrompt from './AnimatedPrompt';
import BlogSubscription from './BlogSubscription';
import { Brain, Shield, Zap, TrendingUp, CheckCircle, Users, Lock, Eye, Database, BarChart3, MessageCircle, ArrowRight, Sparkles, X, Target, XCircle, Menu } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

const NewHomepage = () => {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: 'smooth'
    });
  };

  const handleBuyClick = async (planId: string) => {
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
              <Link href="/" className="text-muted-foreground hover:text-primary transition-colors">Home</Link>
              <Link href="/features" className="text-muted-foreground hover:text-primary transition-colors">Features</Link>
              <button onClick={() => scrollToSection('pricing')} className="text-muted-foreground hover:text-primary transition-colors">Pricing</button>
              <a 
                href="https://www.asklinc.com/blog" 
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
                href="/" 
                className="block py-3 text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Home
              </Link>
              <Link 
                href="/features" 
                className="block py-3 text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Features
              </Link>
              <button 
                onClick={() => {
                  scrollToSection('pricing');
                  setIsMobileMenuOpen(false);
                }} 
                className="block w-full text-left py-3 text-muted-foreground hover:text-primary transition-colors"
              >
                Pricing
              </button>
              <a 
                href="https://www.asklinc.com/blog" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block py-3 text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Blog
              </a>
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
      <section className="relative pt-20 pb-20 overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-20 bg-gradient-to-br from-primary/20 to-secondary/20" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background z-10" />
        
        <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center">
          {/* Pre-hero strip */}
          <div className="text-center mb-6 w-full">
            <p className="text-[0.9375rem] sm:text-[1.09375rem] text-secondary">
              Built to help you make real financial decisions — not just track your spending
            </p>
          </div>
          
          <div className="text-center space-y-8 w-full max-w-4xl flex flex-col items-center">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight">
              Stop tracking.{" "}
              <span className="gradient-text">Start deciding.</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground max-w-4xl leading-relaxed">
              Ask questions about your finances and get answers grounded in your real accounts, goals, and live market conditions.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center sm:items-start pt-8 w-full">
              <div className="flex flex-col items-center gap-3">
                <a href="/demo">
                  <Button 
                    variant="hero" 
                    size="xl" 
                    className="group h-[4.235rem] px-[3.025rem] text-[1.36125rem]"
                  >
                    See It In Action
                  </Button>
                </a>
                <p className="text-sm text-secondary">Interactive example — no signup required</p>
              </div>
            </div>
            
            <div className="pt-12 max-w-2xl mx-auto">
              <AnimatedPrompt />
            </div>
          </div>
        </div>
      </section>

      {/* Value Differentiators Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="glass-card hover:shadow-xl transition-all duration-300">
              <CardContent className="p-8 space-y-4">
                <h3 className="text-2xl font-bold">Built for decisions, not just tracking</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Connects your cash, investments, debt, home value, and goals into one continuous line of reasoning.
                </p>
              </CardContent>
            </Card>
            
            <Card className="glass-card hover:shadow-xl transition-all duration-300">
              <CardContent className="p-8 space-y-4">
                <h3 className="text-2xl font-bold">Understands the real world, not just your accounts</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Live interest rates, inflation, market conditions, and economic data are baked into every answer.
                </p>
              </CardContent>
            </Card>
            
            <Card className="glass-card hover:shadow-xl transition-all duration-300">
              <CardContent className="p-8 space-y-4">
                <h3 className="text-2xl font-bold">Learns as you ask questions</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Ask follow-ups, change assumptions, explore scenarios — Linc remembers context and builds on it.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How Linc Works Section */}
      <section id="how-it-works" className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">
              How <span className="gradient-text">Linc Works</span>
            </h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-12 items-start">
            {[{
              title: "Connect your accounts",
              description: "Link your financial accounts securely via Plaid",
              icon: Target
            }, {
              title: "Ask a question",
              description: "No setup or navigation required",
              icon: MessageCircle
            }, {
              title: "Get actionable answers",
              description: "Your data + live market info = meaningful analysis",
              icon: Brain
            }].map((step, index) => (
              <div key={index} className="text-center space-y-6 group">
                <div className="relative">
                  <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto group-hover:bg-primary/20 transition-colors border-4 border-primary/20">
                    <step.icon className="h-10 w-10 text-primary" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Example Questions Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold">
              Ask the questions <span className="gradient-text">dashboards can't answer</span>
            </h2>
            <p className="text-lg text-muted-foreground md:whitespace-nowrap">
              Dashboards show what happened. Linc explains what it means — and what changes if you act.
            </p>
            
            <ul className="space-y-4 max-w-2xl mx-auto mt-8">
              <li className="flex items-start space-x-3">
                <MessageCircle className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                <p className="text-lg text-muted-foreground">
                  "Are Treasuries better than CDs right now for excess cash?"
                </p>
              </li>
              <li className="flex items-start space-x-3">
                <MessageCircle className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                <p className="text-lg text-muted-foreground">
                  "Are we overestimating how safe our retirement plan actually is?"
                </p>
              </li>
              <li className="flex items-start space-x-3">
                <MessageCircle className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                <p className="text-lg text-muted-foreground">
                  "Which matters more right now: paying down debt or investing?"
                </p>
              </li>
              <li className="flex items-start space-x-3">
                <MessageCircle className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                <p className="text-lg text-muted-foreground">
                  "What breaks first if inflation stays high for longer than expected?"
                </p>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Why Ask Linc is Not Just ChatGPT Section */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">
              Why Ask Linc is not just <span className="gradient-text">ChatGPT with money</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              ChatGPT reasons in theory. Ask Linc reasons with your actual financial reality — live rates, real accounts, real tradeoffs.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[{
              icon: Brain,
              title: "Financial Reasoning",
              description: "Personalized answers powered by OpenAI analysis of your financial data."
            }, {
              icon: TrendingUp,
              title: "Real-Time Market Data",
              description: "Answers based on current rates, conditions, and economic trends."
            }, {
              icon: Zap,
              title: "Instant Analysis",
              description: "Ask questions and get decision-ready answers immediately."
            }, {
              icon: Shield,
              title: "Bank-Grade Security",
              description: "Same security technology used by major banks and financial institutions."
            }, {
              icon: Eye,
              title: "Complete Transparency",
              description: "View, export, or delete all your data anytime."
            }, {
              icon: Database,
              title: "Privacy First",
              description: "Your data is never used to train AI models."
            }].map((feature, index) => (
              <Card key={index} className="group hover:shadow-xl transition-all duration-300 hover:scale-105 glass-card">
                <CardContent className="p-6 space-y-4">
                  <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-16 bg-muted/30">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-8">
            <h2 className="text-3xl md:text-4xl font-bold">
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
                <p className="text-muted-foreground text-lg">
                  Full access to Ask Linc's financial reasoning platform.
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
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

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

      {/* FAQ Section */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">
              Questions We Get <span className="gradient-text">A Lot</span>
            </h2>
            <p className="text-xl text-muted-foreground">
              Let's clear up some common concerns
            </p>
          </div>
          
          <div className="space-y-6">
            {[{
              question: "Is this just another budget tracking app?",
              answer: "No. Budget tracking apps show you what already happened. Ask Linc helps you reason about what's happening now—and what it means for your specific situation—by combining your accounts with market context and plain-English explanations."
            }, {
              question: "Is there a free plan or trial?",
              answer: "No. Ask Linc is $9/month for full access. We've found it works best when people use it with real questions from day one."
            }, {
              question: "I don't want to give OpenAI all my financial data...",
              answer: "You don't give OpenAI your bank logins. We use Plaid to securely connect accounts in read-only mode. Your credentials are never shared with us, and your financial data is not used to train AI models. You're always in control and can disconnect accounts at any time."
            }, {
              question: "How do you know what's going on in the market?",
              answer: "Ask Linc pulls in current market context—interest rates, bond yields, inflation data, and relevant news—and uses it to ground answers in what's happening right now, not generic advice."
            }, {
              question: "What if I want to delete everything?",
              answer: "You can view, export, or delete your data at any time. Deleting your data permanently removes it from our systems."
            }].map((faq, index) => (
              <Card key={index} className="glass-card hover:shadow-lg transition-all duration-300">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-foreground">
                      {faq.question}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8 space-y-8">
          <h2 className="text-3xl md:text-4xl font-bold">
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
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter Subscription Section */}
      <section className="py-20 bg-muted/30 border-t border-border/50">
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
      </section>

      {/* Footer */}
      <footer className="bg-muted/50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <Brain className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold gradient-text">Ask Linc</span>
            </div>
            <div className="flex items-center space-x-6 text-sm text-muted-foreground">
              <a 
                href="/blog/i-pasted-my-bank-statements-into-chatgpt-and-immediately-regretted-it/" 
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 transition-colors"
              >
                Our Story
              </a>
              <a 
                href="/privacy" 
                className="hover:text-primary transition-colors"
              >
                Privacy Policy
              </a>
              <a 
                href="/terms" 
                className="hover:text-primary transition-colors"
              >
                Terms of Service
              </a>
              <a 
                href="/contact" 
                className="hover:text-primary transition-colors"
              >
                Contact
              </a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <p className="text-sm text-muted-foreground">
                &copy; 2025 Ask Linc. Your AI financial analyst. Built with privacy in mind.
              </p>
              <div className="flex items-center space-x-4">
                <a 
                  href="https://bsky.app/profile/asklinc.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <img 
                    src="/logos/bluesky.jpeg" 
                    alt="Bluesky" 
                    className="w-4 h-4"
                    onError={(e) => {
                      // Fallback to colored square if logo fails to load
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                  <div className="w-4 h-4 bg-blue-500 rounded hidden"></div>
                  <span>Bluesky</span>
                </a>
                <a 
                  href="https://asklinc.substack.com/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <img 
                    src="/logos/substack.png" 
                    alt="Substack" 
                    className="w-4 h-4"
                    onError={(e) => {
                      // Fallback to colored square if logo fails to load
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                  <div className="w-4 h-4 bg-orange-500 rounded hidden"></div>
                  <span>Substack</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default NewHomepage; 