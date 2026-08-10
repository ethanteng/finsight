"use client";
import { useState } from 'react';
import { Brain, Menu, X, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { Button } from './ui/button';
import { pushBeginCheckout } from '@/lib/dataLayer';
import { USE_CASE_LINKS, COMPARE_LINKS } from '@/lib/site-nav';

export default function SiteHeader() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [isUseCasesOpen, setIsUseCasesOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  const handleBuyClick = async (planId: string) => {
    pushBeginCheckout();
    setIsLoading(planId);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        const err = await response.json();
        alert(err.error || 'Failed to create checkout session. Please try again.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred. Please try again.');
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <nav className="fixed top-0 w-full z-50 backdrop-blur-lg bg-background/80 border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center space-x-2 hover:opacity-90 transition-opacity">
            <Brain className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold gradient-text">Ask Linc</span>
          </Link>
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
            <Link href="/blog" className="text-muted-foreground hover:text-primary transition-colors">
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
  );
}
