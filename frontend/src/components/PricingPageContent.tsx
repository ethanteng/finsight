"use client";

import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { CheckCircle } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import { pushBeginCheckout } from '@/lib/dataLayer';
import { FAQ_ITEMS } from '@/data/faq';
import { PricingValueBadge, PricingTrialCallout } from './PricingOfferCallouts';

export default function PricingPageContent() {
  const [isLoading, setIsLoading] = useState(false);

  const handleBuyClick = async () => {
    pushBeginCheckout();
    setIsLoading(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: 'premium',
          successUrl: `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&tier=premium`,
          cancelUrl: `${window.location.origin}/pricing`,
        }),
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
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="pt-24">
        <section className="py-16 bg-[hsl(217,32%,6%)]">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center space-y-4 mb-8">
              <h1 className="text-3xl md:text-4xl font-bold text-white">
                One plan. <span className="gradient-text">Full access.</span>
              </h1>
              <p className="text-slate-300">
                First 7 days free when you connect your accounts — cancel anytime, full refund.
                Or see a real answer free in the demo with sample data — no credit card needed.
              </p>
            </div>

            <Card className="relative overflow-hidden hover:shadow-2xl transition-all duration-300">
              <CardContent className="p-8 flex flex-col">
                <div className="text-center space-y-4 mb-8">
                  <h2 className="text-2xl font-bold">Ask Linc</h2>
                  <div className="flex items-baseline justify-center space-x-1">
                    <span className="text-5xl font-bold gradient-text">$9</span>
                    <span className="text-muted-foreground text-xl">/ month</span>
                  </div>
                  <PricingValueBadge />
                  <p className="text-muted-foreground text-base max-w-md mx-auto">
                    $9/month flat — vs the 1-2% of your wealth a human advisor
                    charges every year.
                  </p>
                </div>

                <ul className="space-y-4 mb-8 mx-auto max-w-md">
                  {[
                    'Unlimited questions about your money',
                    'Unlimited connected accounts',
                    'Market-aware financial reasoning',
                    'Retirement & risk analysis',
                    'Show the math on every answer',
                    'Privacy-first architecture',
                  ].map((item) => (
                    <li key={item} className="flex items-start space-x-3">
                      <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto space-y-3">
                  <Button
                    variant="hero"
                    className="w-full"
                    size="lg"
                    onClick={handleBuyClick}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Creating...' : 'Get started'}
                  </Button>
                  <PricingTrialCallout />
                  <p className="text-center text-sm">
                    <Link href="/demo" className="text-primary hover:underline font-medium">
                      See a real answer free, no credit card needed
                    </Link>
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="py-16 bg-muted/30">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <h2 className="text-2xl font-bold text-center">Pricing questions</h2>
            <div className="space-y-4">
              {FAQ_ITEMS.filter((item) =>
                /free|trial|wrong|budget|delete/i.test(item.question)
              ).map((faq) => (
                <div key={faq.question} className="rounded-lg border border-border/60 bg-background p-5">
                  <h3 className="font-semibold mb-2">{faq.question}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground">
              More in the{' '}
              <Link href="/faq" className="text-primary hover:underline">
                full FAQ
              </Link>
              .
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
