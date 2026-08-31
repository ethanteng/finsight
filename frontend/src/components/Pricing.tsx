"use client";
import { Button } from "@/components/ui/button";
import { pushBeginCheckout } from '@/lib/dataLayer';
import { CheckCircle } from "lucide-react";
import { useState } from "react";
import { useDialog } from '@/components/ui/dialog';
import { usePricing } from '@/components/PricingProvider';

export const Pricing = () => {
  const pricing = usePricing();
  const [isLoading, setIsLoading] = useState(false);
  const { showError, dialog } = useDialog();

  const handleBuyClick = async () => {
    pushBeginCheckout();
    setIsLoading(true);
    
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      
      // Create checkout session for anyone (new or existing users)
      const response = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tier: 'premium',
          successUrl: `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&tier=premium`,
          cancelUrl: `${window.location.origin}/`
        })
      });

      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
      } else {
        const error = await response.json();
        console.error('Failed to create checkout session:', error);
        void showError('Failed to create checkout session. Please try again.');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      void showError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold text-navy">
              Simple pricing
            </h2>
          </div>
          
          <div className="relative bg-card p-8 rounded-lg border border-border hover:shadow-lg transition-all duration-300">
            <div className="text-center space-y-4 mb-8">
              <h3 className="text-2xl font-bold text-navy">Ask Linc</h3>
              <div className="flex items-baseline justify-center space-x-1">
                <span className="text-5xl font-bold text-navy">{pricing.dollars}</span>
                <span className="text-muted-foreground text-xl">/ {pricing.intervalLabel}</span>
              </div>
              <p className="text-muted-foreground text-base max-w-md mx-auto">
                {pricing.trialLine} Compare that with a percentage-of-assets advisor fee.
              </p>
            </div>
            
            <div className="space-y-4 mb-8">
              <ul className="space-y-4">
                <li className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green flex-shrink-0 mt-0.5" />
                  <span className="text-card-foreground">Unlimited questions about your money</span>
                </li>
                <li className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green flex-shrink-0 mt-0.5" />
                  <span className="text-card-foreground">All connected accounts</span>
                </li>
                <li className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green flex-shrink-0 mt-0.5" />
                  <span className="text-card-foreground">Market-aware financial reasoning</span>
                </li>
                <li className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green flex-shrink-0 mt-0.5" />
                  <span className="text-card-foreground">Retirement & risk analysis</span>
                </li>
                <li className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green flex-shrink-0 mt-0.5" />
                  <span className="text-card-foreground">Privacy-first architecture</span>
                </li>
              </ul>
            </div>
            
            <div className="mt-auto">
              <Button 
                className="w-full bg-green hover:bg-green-light text-white"
                size="lg"
                onClick={handleBuyClick}
                disabled={isLoading}
              >
                {isLoading ? 'Creating...' : 'Get started'}
              </Button>
              <p className="text-center text-xs text-muted-foreground mt-3">
                Cancel anytime.
              </p>
            </div>
          </div>
        </div>
      </div>
      {dialog}
    </section>
  );
};
