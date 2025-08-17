"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PricingPage() {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const router = useRouter();

  const plans = [
    {
      id: 'starter',
      name: "Starter",
      price: "$9",
      period: "/month",
      description: "Start making more informed financial decisions.",
      features: [
        "Unlimited questions",
        "Link up to 3 accounts",
        "Ask questions about your spending, savings, and other trends",
        "No external market data or scenario modeling"
      ],
      popular: false
    },
    {
      id: 'standard',
      name: "Standard",
      price: "$18",
      period: "/month",
      description: "For people growing their money and making goal-oriented decisions.",
      features: [
        "Unlimited accounts and questions",
        "Basic market context: CPI, Fed rates, average mortgage and credit card APRs",
        "No live rates or forecasting tools"
      ],
      popular: true
    },
    {
      id: 'premium',
      name: "Premium",
      price: "$28",
      period: "/month",
      description: "For people actively planning for retirement or major financial moves.",
      features: [
        "Everything in Standard",
        "Live market data: CD rates, Treasury yields, mortgage rates",
        "Smart 'what-if' planning and simulation tools",
        "Smarter GPT answers using real-world inputs"
      ],
      popular: false
    }
  ];

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
          cancelUrl: `${window.location.origin}/pricing`
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
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Choose Your <span className="text-blue-400">Financial Journey</span>
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Pick the plan that fits where you are with your money today. 
            Start with Starter and upgrade as your needs grow.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-gray-800 rounded-2xl p-8 border-2 transition-all duration-300 hover:scale-105 ${
                plan.popular 
                  ? 'border-blue-500 shadow-2xl shadow-blue-500/20' 
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-semibold">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <div className="mb-4">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-gray-400">{plan.period}</span>
                </div>
                <p className="text-gray-300 text-sm">{plan.description}</p>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <svg className="w-5 h-5 text-green-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-300 text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleBuyClick(plan.id)}
                disabled={isLoading === plan.id}
                className={`w-full py-3 px-6 rounded-lg font-semibold transition-all duration-200 ${
                  plan.popular
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isLoading === plan.id ? 'Creating...' : `Get ${plan.name}`}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-16">
          <p className="text-gray-400 text-sm">
            All plans include a 7-day free trial. Cancel anytime.
          </p>
          <p className="text-gray-400 text-sm mt-2">
            Questions? <a href="/contact" className="text-blue-400 hover:underline">Contact us</a>
          </p>
        </div>
      </div>
    </div>
  );
}
