"use client";
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import MailerLiteForm from './MailerLiteForm';
import MailerLiteScript from './MailerLiteScript';
import AnimatedPrompt from './AnimatedPrompt';
import BlogSubscription from './BlogSubscription';
import { Brain, Shield, Zap, TrendingUp, CheckCircle, Users, Lock, Eye, Database, BarChart3, MessageCircle, ArrowRight, Sparkles, X, Target, XCircle } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

const NewHomepage = () => {
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
              <Link 
                href="/demo" 
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Demo
              </Link>
              <Button 
                variant="hero" 
                size="sm"
                onClick={() => window.location.href = '/login'}
              >
                Login
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.href = '/register'}
              >
                Sign up
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
              Not Just Charts.{" "}
              <span className="gradient-text">Real Answers.</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
              The AI that reasons about your finances — combining your real accounts, goals, and live market conditions to deliver answers that help you make smarter decisions.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
              <a href="/demo">
                <Button 
                  variant="hero" 
                  size="xl" 
                  className="group"
                >
                  Ask a real financial question
                </Button>
              </a>
              <Button 
                variant="outline" 
                size="xl"
                onClick={() => scrollToSection('how-it-works')}
              >
                See how it works
              </Button>
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
      <section id="pricing" className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">
              Choose your <span className="gradient-text">financial journey</span>
            </h2>
            <p className="text-xl text-muted-foreground">
              Pick the plan that fits where you are with your money today
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[{
              id: 'starter',
              name: "Starter",
              price: "$9",
              period: "/month",
              description: "Understand your money in isolation.",
              features: ["Ask anything about your money and get clear, instant answers", "Connect up to 5 accounts", "See personalized suggestions to reach your goals"],
              bestFor: "Anyone who wants quick answers about their finances.",
              popular: false
            }, {
              id: 'standard',
              name: "Standard",
              price: "$19",
              period: "/month",
              description: "Understand your money in context.",
              features: ["Everything in Starter","Connect unlimited accounts", "Factor in key U.S. economic data", "Get recommendations shaped by real-world events"],
              bestFor: "People who want to make smarter decisions by seeing the big picture.",
              popular: true
            }, {
              id: 'premium',
              name: "Premium",
              price: "$29",
              period: "/month",
              description: "Understand your money as part of the broader financial system.",
              features: ["Everything in Standard", "Live market data: CD rates, Treasury yields, mortgage rates, stocks & crypto", "Real-time news feeds from 60+ trusted sources", "Get notified when markets move"],
              bestFor: "Investors or anyone who wants a live pulse on the economy.",
              popular: false
            }].map((plan, index) => (
              <Card key={index} className={`relative overflow-hidden hover:shadow-2xl transition-all duration-300 hover:scale-105 ${plan.popular ? 'ring-2 ring-primary shadow-xl' : ''}`}>
                {plan.popular && (
                  <div className="absolute top-0 right-0 bg-gradient-to-l from-primary to-secondary text-primary-foreground text-xs font-medium px-3 py-1 rounded-bl-lg">
                    Most Popular
                  </div>
                )}
                <CardContent className="p-8 flex flex-col h-full">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold">{plan.name}</h3>
                    <div className="flex items-baseline space-x-1">
                      <span className="text-4xl font-bold gradient-text">{plan.price}</span>
                      <span className="text-muted-foreground">{plan.period}</span>
                    </div>
                    <p className="text-muted-foreground text-sm leading-relaxed">{plan.description}</p>
                  </div>
                  
                  <ul className="space-y-3 mt-6">
                    {plan.features.map((feature, featureIndex) => {
                      const isHighlighted = feature.includes("Factor in economic indicators") || feature.includes("Factor in key economic indicators") || feature.includes("Factor in key U.S. economic data") || feature.includes("Get recommendations shaped by real-world events") || feature.includes("Pull from trusted sources") || feature.includes("Pulls the latest financial news") || feature.includes("Searches the web for current financial headlines") || feature.includes("Live market data") || feature.includes("Real-time news feeds from 60+ trusted sources");
                      const isNewFeature = feature.includes("Get notified when markets move");
                      return (
                        <li key={featureIndex} className="flex items-center space-x-3">
                          {feature.startsWith('LIMIT:') ? (
                            <>
                              <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                              <span className="text-sm">{feature.replace('LIMIT: ', '')}</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                              <span className={`text-sm ${isHighlighted ? 'text-[hsl(158,64%,52%)]' : ''} flex items-center`}>
                                {feature}
                                {isNewFeature && (
                                  <span className="ml-2 inline-block bg-gradient-to-l from-primary to-secondary text-primary-foreground text-xs px-2 py-0.5 rounded-full flex items-center space-x-1">
                                    <span>New</span>
                                    <span>✨</span>
                                  </span>
                                )}
                              </span>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  
                  {/* Best For section */}
                  <div className="mt-6 pt-4 border-t border-muted/30">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Best for:</span> {plan.bestFor}
                    </p>
                  </div>
                  
                  <div className={`mt-auto pt-6 ${plan.id === 'premium' ? 'pt-8' : ''}`}>
                    <Button 
                      variant={plan.popular ? "hero" : "outline"} 
                      className="w-full" 
                      size="lg"
                      onClick={() => handleBuyClick(plan.id)}
                      disabled={isLoading === plan.id}
                    >
                      {isLoading === plan.id ? 'Creating...' : (plan.id === 'standard' ? 'Get Started' : `Get ${plan.name}`)}
                    </Button>
                    
                    {/* Data sources callout - only for Standard and Premium */}
                    {plan.id !== 'starter' ? (
                      <div className="mt-3 text-center">
                        <p className="text-xs text-muted-foreground/70">
                          {plan.id === 'standard' ? 'Included data sources: FRED, Brave Search' : 'Additional data sources: Alpha Vantage, Polygon.io'}
                        </p>
                      </div>
                    ) : (
                      /* Placeholder div to maintain button alignment for Starter plan */
                      <div className="mt-3 h-5"></div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* Blog link for plan selection help */}
          <div className="text-center mt-12">
            <p className="text-muted-foreground">
              Not sure which plan is right?{" "}
              <a 
                href="/blog/which-ask-linc-plan-fits-you/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[hsl(158,64%,52%)] hover:text-[hsl(158,64%,62%)] transition-colors font-medium"
              >
                Read our blog
              </a>{" "}
              to help you choose.
            </p>
          </div>

        </div>
      </section>

      {/* Privacy Section */}
      <section id="security" className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-6 mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">
              Privacy that <span className="gradient-text">actually means something</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto md:whitespace-nowrap">
              The AI never sees your real financial data — only abstracted signals it can reason over.
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
              question: "Is this just another tracking app?",
              answer: "No. Tracking apps show what happened. Linc explains what it means — connecting your accounts, layering in market data, and giving you clear reasoning without tracking your every move."
            }, {
              question: "I don't want to give OpenAI all my financial data...",
              answer: "We use Plaid, not your login info. Your data is read-only, never stored, and never used to train models."
            }, {
              question: "How do you know what's going on in the market?",
              answer: "Linc pulls in real-time data — CD rates, bond yields, current news — and feeds it into OpenAI as context for your questions."
            }, {
              question: "What if I want to delete everything?",
              answer: "You can view, export, or delete all your data anytime."
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
            <a href="/demo" className="w-full sm:w-auto">
              <Button variant="hero" size="xl" className="group w-full sm:w-auto">
                Ask your first question
              </Button>
            </a>
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