"use client";
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import MailerLiteForm from './MailerLiteForm';
import MailerLiteScript from './MailerLiteScript';
import AnimatedPrompt from './AnimatedPrompt';
import { Brain, Shield, Zap, TrendingUp, CheckCircle, Users, Lock, Eye, Database, BarChart3, MessageCircle, ArrowRight, Sparkles, X, Target } from 'lucide-react';

const NewHomepage = () => {
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: 'smooth'
    });
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
              <button onClick={() => scrollToSection('features')} className="text-muted-foreground hover:text-primary transition-colors">Features</button>
              <button onClick={() => scrollToSection('pricing')} className="text-muted-foreground hover:text-primary transition-colors">Pricing</button>
              <a 
                href="https://consulting.ethanteng.com/privacy-security-at-ask-linc" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors cursor-pointer"
              >
                How We Protect Your Data
              </a>
              <Button 
                variant="hero" 
                size="sm"
                onClick={() => scrollToSection('waitlist')}
              >
                Get Early Access
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
            <Badge variant="secondary" className="animate-pulse-glow">
              <Sparkles className="h-4 w-4 mr-2" />
              Built with OpenAI • Powered by your data
            </Badge>
            
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight">
              Hey, I'm Linc{" — "}A{" "}
              <span className="gradient-text">Privacy-First</span>{" "}
              AI built for your finances
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
            Combines OpenAI's intelligence with real financial data and live market insights{" — "}
            <span className="gradient-text">without compromising your privacy.</span>
            </p>
            
            {/* Animated Prompt Demo */}
            <div className="max-w-2xl mx-auto pt-8">
              <AnimatedPrompt />
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center sm:items-start pt-8">
              <Button 
                variant="hero" 
                size="xl" 
                className="group"
                onClick={() => scrollToSection('waitlist')}
              >
                Get Early Access
              </Button>
              <div className="flex flex-col items-center">
                <a href="/demo">
                  <Button variant="outline" size="xl">See It In Action</Button>
                </a>
                <p className="mt-2 text-sm text-muted-foreground">No login needed</p>
              </div>
            </div>
            
            <div className="flex items-center justify-center space-x-6 pt-8 text-sm text-muted-foreground">
              <div className="flex items-center space-x-2">
                <Shield className="h-4 w-4 text-primary" />
                <span>Bank-grade security</span>
              </div>
              <div className="flex items-center space-x-2">
                <Lock className="h-4 w-4 text-primary" />
                <span>Privacy-first by design</span>
              </div>
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 text-primary" />
                <span>Built with your trust in mind</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI Demo Section */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <h2 className="text-3xl md:text-4xl font-bold">
                No dashboards. No spreadsheets.{" "}
                <span className="gradient-text">Just ask.</span>
              </h2>
              
              <div className="space-y-6">
                <div className="glass-card p-6 rounded-xl">
                  <div className="flex items-start space-x-4">
                    <MessageCircle className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                    <div>
                      <p className="font-medium mb-2">&quot;How much am I actually saving each month?&quot;</p>
                      <p className="text-sm text-muted-foreground">
                        Based on your last 6 months of transactions, you're averaging $1,247 in savings per month. 
                        Your highest saving month was March at $1,890.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="glass-card p-6 rounded-xl">
                  <div className="flex items-start space-x-4">
                    <MessageCircle className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                    <div>
                      <p className="font-medium mb-2">&quot;Should I move my emergency fund to a higher-yield account?&quot;</p>
                      <p className="text-sm text-muted-foreground">
                        Yes! Your current savings account yields 0.5%, but top high-yield accounts offer 4.8%. 
                        Moving your $12,000 emergency fund could earn an extra $516 annually.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-3xl animate-pulse-glow" />
              <div className="relative rounded-2xl shadow-2xl w-full animate-float bg-card p-8 border border-border/50">
                {/* Smartphone Frame */}
                <div className="bg-black rounded-3xl p-2 mx-auto max-w-xs">
                  {/* Status Bar */}
                  <div className="flex justify-between items-center px-4 py-2 text-white text-xs">
                    <span>9:41</span>
                    <div className="flex items-center space-x-1">
                      <div className="w-1 h-1 bg-white rounded-full"></div>
                      <div className="w-1 h-1 bg-white rounded-full"></div>
                      <div className="w-1 h-1 bg-white rounded-full"></div>
                    </div>
                  </div>
                  
                  {/* Chat Interface */}
                  <div className="bg-gray-900 rounded-2xl p-4 h-80 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                        <Brain className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="text-white font-medium">Linc</div>
                        <div className="text-gray-400 text-xs">AI Financial Assistant</div>
                      </div>
                    </div>
                    
                    {/* Chat Messages */}
                    <div className="flex-1 space-y-3 overflow-hidden">
                      {/* AI Message */}
                      <div className="flex items-start space-x-2">
                        <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                          <Brain className="w-3 h-3 text-white" />
                        </div>
                        <div className="bg-gray-800 rounded-lg p-3 max-w-xs">
                          <p className="text-white text-sm">Hi! I'm here to help with your financial questions. What would you like to know?</p>
                        </div>
                      </div>
                      
                      {/* User Message */}
                      <div className="flex items-start space-x-2 justify-end">
                        <div className="bg-primary rounded-lg p-3 max-w-xs">
                          <p className="text-white text-sm">How much am I saving each month?</p>
                        </div>
                        <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        </div>
                      </div>
                      
                      {/* AI Response */}
                      <div className="flex items-start space-x-2">
                        <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                          <Brain className="w-3 h-3 text-white" />
                        </div>
                        <div className="bg-gray-800 rounded-lg p-3 max-w-xs">
                          <p className="text-white text-sm">Based on your last 6 months, you're averaging $1,247/month in savings. Your highest month was March at $1,890.</p>
                        </div>
                      </div>
                      
                      {/* User Message */}
                      <div className="flex items-start space-x-2 justify-end">
                        <div className="bg-primary rounded-lg p-3 max-w-xs">
                          <p className="text-white text-sm">Should I move my emergency fund?</p>
                        </div>
                        <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        </div>
                      </div>
                      
                      {/* AI Response */}
                      <div className="flex items-start space-x-2">
                        <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                          <Brain className="w-3 h-3 text-white" />
                        </div>
                        <div className="bg-gray-800 rounded-lg p-3 max-w-xs">
                          <p className="text-white text-sm">Yes! Your current account yields 0.5%, but top high-yield accounts offer 4.8%. Moving your $12,000 could earn an extra $516 annually.</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Input Bar */}
                    <div className="mt-4 flex items-center space-x-2">
                      <div className="flex-1 bg-gray-800 rounded-full px-4 py-2">
                        <div className="text-gray-400 text-sm">Ask me anything...</div>
                      </div>
                      <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                        <ArrowRight className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What You Can Ask Linc Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">
              What You Can <span className="gradient-text">Ask Linc</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Linc is here for wherever you are in your financial journey. Here are common things people ask about:
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[{
              tier: "Starter Questions",
              color: "from-emerald-500/20 to-green-500/20",
              borderColor: "border-emerald-500/30",
              description: "For people with checking, savings, and maybe a 401(k). You're focused on saving more and getting clarity.",
              questions: ["What's my actual asset allocation across all accounts?", "Are we overpaying in fees?", "How much cash is just sitting in low-yield savings?", "How much do I save each month on average?", "Where is most of my money sitting right now?"]
            }, {
              tier: "Standard Questions",
              color: "from-blue-500/20 to-indigo-500/20",
              borderColor: "border-blue-500/30",
              description: "You've leveled up. You want smarter context to grow your money with real-world market awareness.",
              questions: ["Which of our CDs mature next month?", "How does inflation affect our savings goals?", "What's the average credit card APR vs. ours?", "Should we move excess cash into something higher-yield?", "How far are we from our house down payment target?"]
            }, {
              tier: "Premium Questions",
              color: "from-purple-500/20 to-pink-500/20",
              borderColor: "border-purple-500/30",
              description: "Complex finances with long-term goals. Get advisor-level insights without the fees.",
              questions: ["Should we refinance based on current mortgage rates?", "Are Treasuries a better option than CDs right now?", "What happens to our spending power if rates go to 6%?", "What asset mix gives us the right balance of safety and growth?", "How long can we last without touching our emergency fund if the market drops?"]
            }].map((tier, index) => (
              <Card key={index} className={`relative overflow-hidden glass-card hover:shadow-xl transition-all duration-300 hover:scale-105 border-2 ${tier.borderColor}`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${tier.color} opacity-50`} />
                <CardContent className="relative p-8 space-y-6">
                  <div className="space-y-3">
                    <h3 className="text-xl font-bold text-center">{tier.tier}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed text-center">{tier.description}</p>
                  </div>
                  
                  <div className="space-y-4">
                    {tier.questions.map((question, qIndex) => (
                      <div key={qIndex} className="glass-card p-4 rounded-lg bg-background/50">
                        <p className="text-sm font-medium">&quot;{question}&quot;</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">
              How <span className="gradient-text">This Works</span>
            </h2>
            <p className="text-xl text-muted-foreground">
              No dashboards. No spreadsheets. No setup required.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-12 items-start">
            {[{
              step: "1",
              title: "Connect your accounts",
              description: "Link your financial accounts securely via Plaid",
              icon: Target
            }, {
              step: "2",
              title: "Ask a question in plain English",
              description: "No complex setup or navigation required",
              icon: MessageCircle
            }, {
              step: "3",
              title: "Get actionable answers",
              description: "Linc uses your data + live market info to provide smart insights",
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

      {/* What GPT Knows Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">
              What <span className="gradient-text">ChatGPT Knows</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Most people don't realize this, but ChatGPT doesn't come with live market knowledge. That's where Linc makes a real difference.
            </p>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-12 max-w-5xl mx-auto">
            <div className="space-y-6">
              <div className="flex items-center space-x-3 mb-6">
                <CheckCircle className="h-6 w-6 text-emerald-500" />
                <h3 className="text-2xl font-bold text-emerald-500">ChatGPT Knows:</h3>
              </div>
              
              <div className="space-y-4">
                {["Financial theory (e.g. asset allocation, tax optimization)", "Best practices for budgeting and investing", "How to reason through questions with logic"].map((item, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <p className="text-muted-foreground">{item}</p>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="flex items-center space-x-3 mb-6">
                <X className="h-6 w-6 text-red-500" />
                <h3 className="text-2xl font-bold text-red-500">It Doesn't Know:</h3>
              </div>
              
              <div className="space-y-4">
                {["Today's CD or Treasury rates", "Current economic headlines or Fed moves", "Anything that's happened since late 2023"].map((item, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <X className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-muted-foreground">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="mt-16 max-w-4xl mx-auto">
            <Card className="glass-card border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
              <CardContent className="p-8 text-center space-y-4">
                <h3 className="text-2xl font-bold">That's where Linc makes a real difference.</h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Linc feeds trusted real-time data into OpenAI behind the scenes — so when you ask,{" "}
                  <span className="font-semibold text-foreground">&quot;Should I roll over this CD?&quot;</span>{" "}
                  you get an answer based on{" "}
                  <span className="font-semibold text-foreground">today's best rates</span>{" "}
                  and{" "}
                  <span className="font-semibold text-foreground">your actual accounts.</span>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">
              Why Linc is <span className="gradient-text">different</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Linc is not a budget tracker, robo-advisor, or complicated dashboard. It's your on-demand financial analyst, powered by OpenAI + real-time market awareness.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[{
              icon: Brain,
              title: "AI-Powered Insights",
              description: "OpenAI analyzes your financial data to provide personalized, intelligent answers to your money questions."
            }, {
              icon: TrendingUp,
              title: "Real-Time Market Data",
              description: "Get answers based on current interest rates, market conditions, and economic trends, not outdated information."
            }, {
              icon: Zap,
              title: "Instant Analysis",
              description: "No setup required. Ask questions in plain English and get immediate, actionable insights about your finances."
            }, {
              icon: Shield,
              title: "Bank-Grade Security",
              description: "Your data is protected with the same security technology used by major banks and financial institutions."
            }, {
              icon: Eye,
              title: "Complete Transparency",
              description: "See exactly what data we have, export it anytime, or delete everything with a single click."
            }, {
              icon: Database,
              title: "Privacy First",
              description: "Your financial data is never used to train AI models. Everything is anonymized and encrypted."
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
              name: "Starter",
              price: "$5",
              period: "/month",
              description: "For people with checking, savings, and maybe a 401(k). You're focused on saving more and getting clarity.",
              features: ["Unlimited questions", "Link up to 3 accounts", "Spending & savings analysis", "Basic financial insights"],
              cta: "Get Early Access",
              popular: false
            }, {
              name: "Standard",
              price: "$12",
              period: "/month",
              description: "You've leveled up. You want smarter context to grow your money with real-world market awareness.",
              features: ["Unlimited accounts & questions", "Market context (CPI, Fed rates)", "Investment analysis", "Goal tracking & progress"],
              cta: "Get Early Access",
              popular: true
            }, {
              name: "Premium",
              price: "$25",
              period: "/month",
              description: "Complex finances with long-term goals. Get advisor-level insights without the fees.",
              features: ["Everything in Standard", "Live market data & rates", "What-if scenario planning", "Advanced portfolio analysis"],
              cta: "Get Early Access",
              popular: false
            }].map((plan, index) => (
              <Card key={index} className={`relative overflow-hidden hover:shadow-2xl transition-all duration-300 hover:scale-105 ${plan.popular ? 'ring-2 ring-primary shadow-xl' : ''}`}>
                {plan.popular && (
                  <div className="absolute top-0 right-0 bg-gradient-to-l from-primary to-secondary text-primary-foreground text-xs font-medium px-3 py-1 rounded-bl-lg">
                    Most Popular
                  </div>
                )}
                <CardContent className="p-8 space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold">{plan.name}</h3>
                    <div className="flex items-baseline space-x-1">
                      <span className="text-4xl font-bold gradient-text">{plan.price}</span>
                      <span className="text-muted-foreground">{plan.period}</span>
                    </div>
                    <p className="text-muted-foreground text-sm leading-relaxed">{plan.description}</p>
                  </div>
                  
                  <ul className="space-y-3">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center space-x-3">
                        <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <Button 
                    variant={plan.popular ? "hero" : "outline"} 
                    className="w-full" 
                    size="lg"
                    onClick={() => scrollToSection('waitlist')}
                  >
                    {plan.cta}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">
              Your data is <span className="gradient-text">protected</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              We never store sensitive information, never train on your data, and give you full control 
              over what's connected or deleted.
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
              question: "What's the difference between ChatGPT and OpenAI? And which do you use?",
              answer: "OpenAI is the company that developed the GPT models, including the one behind ChatGPT. Ask Linc uses OpenAI’s most advanced model, GPT-4o — but through a private, secure API that’s very different from using the public ChatGPT app."
            },
               {
              question: "I don't want to give OpenAI all my financial data...",
              answer: "Totally fair. That's why we use Plaid, not your login info — and your data is read-only, never stored, and never used to train models."
            }, {
              question: "How do you know what's going on in the market?",
              answer: "On its own, ChatGPT doesn't. That's why Linc pulls in real-time data — like CD rates, bond yields, and current news — and feeds it into OpenAI as context for your questions."
            }, {
              question: "Is this just another budgeting app?",
              answer: "Nope! Linc does not track your spending or categorize transactions. It answers your questions using your actual account data + live market context. Think of Linc as your financial advisor, not your accountant."
            }, {
              question: "What if I want to delete everything?",
              answer: "Easy. You can view, export, or delete all your data anytime with a single click. Full transparency, full control."
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

      {/* Waitlist Section */}
      <section id="waitlist" className="py-20 bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8 space-y-8">
          <h2 className="text-3xl md:text-4xl font-bold">
            Ready to get <span className="gradient-text">real answers</span> about your money?
          </h2>
          <p className="text-xl text-muted-foreground">
            Stop guessing and started getting clear, honest financial advice
          </p>
          <div className="max-w-md mx-auto">
            <MailerLiteForm />
          </div>
          <p className="text-sm text-muted-foreground">
            No spam • Unsubscribe anytime • Early access to features
          </p>
        </div>
      </section>

      {/* Demo CTA Section */}
      {/*<section className="py-20 bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8 space-y-8">
          <h2 className="text-3xl md:text-4xl font-bold">
            Join the <span className="gradient-text">Waitlist</span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Be among the first to experience Linc when we launch. Get early access and exclusive updates.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a href="/demo" className="w-full sm:w-auto">
              <Button variant="glass" size="xl" className="group w-full sm:w-auto">
                Try Demo First
              </Button>
            </a>
          </div>
          <p className="text-sm text-muted-foreground">
            Try the demo with realistic financial data • No account required • See how it works
          </p>
        </div>
      </section>*/}

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
                href="https://consulting.ethanteng.com/ask-linc-privacy-policy" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                Privacy Policy
              </a>
              <a 
                href="https://consulting.ethanteng.com/ask-linc-terms-of-service" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                Terms of Service
              </a>
              <button 
                className="hover:text-primary transition-colors"
                onClick={() => {
                  if (typeof window !== 'undefined' && window.hj) {
                    window.hj('event', 'contact_button_clicked');
                  }
                }}
              >
                Contact
              </button>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
            <p>&copy; 2025 Ask Linc. Your AI financial analyst. Built with privacy in mind.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default NewHomepage; 