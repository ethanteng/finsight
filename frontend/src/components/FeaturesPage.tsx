"use client";
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Brain, Shield, Zap, TrendingUp, MessageCircle, ArrowRight, Lock, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

const FeaturesPage = () => {
  const [isLoading, setIsLoading] = useState<string | null>(null);

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
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-lg bg-background/80 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-2">
              <Brain className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold gradient-text">Ask Linc</span>
            </Link>
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/" className="text-muted-foreground hover:text-primary transition-colors">Home</Link>
              <Link href="/features" className="text-primary hover:text-primary/80 transition-colors">Features</Link>
              <button onClick={() => window.location.href = '/#pricing'} className="text-muted-foreground hover:text-primary transition-colors">Pricing</button>
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
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-24 pb-20 overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-20 bg-gradient-to-br from-primary/20 to-secondary/20" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background z-10" />
        
        <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-8">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight">
              Financial intelligence,{" "}
              <span className="gradient-text">not financial busywork</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
              Ask Linc blends your financial data and market context to deliver meaningful, decision-ready answers.
            </p>
          </div>
        </div>
      </section>

      {/* Features List */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-16">
            {/* Feature 1 */}
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <MessageCircle className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold">
                  Conversational Financial Reasoning
                </h2>
              </div>
              <p className="text-lg text-muted-foreground leading-relaxed pl-16">
                Ask Linc treats questions as part of an ongoing conversation, remembering context like goals, age, and previous assumptions.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold">
                  Market-Aware Analysis
                </h2>
              </div>
              <p className="text-lg text-muted-foreground leading-relaxed pl-16">
                Live data like interest rates, inflation, mortgage rates, and market conditions inform every answer.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Brain className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold">
                  Retirement & Risk Analysis
                </h2>
              </div>
              <p className="text-lg text-muted-foreground leading-relaxed pl-16">
                Ask Linc evaluates portfolio sustainability, withdrawal fragility, inflation risk, and downside scenarios.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold">
                  Privacy Architecture
                </h2>
              </div>
              <p className="text-lg text-muted-foreground leading-relaxed pl-16">
                Ask Linc anonymizes accounts before AI analysis — your AI insights, without exposing your real data.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold">
                  Who It's For
                </h2>
              </div>
              <p className="text-lg text-muted-foreground leading-relaxed pl-16">
                People who want answers, not alerts: decision-makers, investors, and households planning real financial outcomes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8 space-y-8">
          <h2 className="text-3xl md:text-4xl font-bold">
            Start understanding your money
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <div className="flex flex-col items-center gap-2">
              <Button 
                variant="hero" 
                size="xl"
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

      {/* Footer */}
      <footer className="bg-muted/50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <Brain className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold gradient-text">Ask Linc</span>
            </div>
            <div className="flex items-center space-x-6 text-sm text-muted-foreground">
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
          <div className="mt-8 pt-8 border-t border-border text-center">
            <p className="text-sm text-muted-foreground">
              &copy; 2025 Ask Linc. Your AI financial analyst. Built with privacy in mind.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default FeaturesPage;
