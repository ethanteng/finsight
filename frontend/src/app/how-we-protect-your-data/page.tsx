"use client";
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Shield, Eye, Lock, Database, FileText, MessageCircle, Brain } from 'lucide-react';
import Link from 'next/link';

const PrivacyPage = () => {

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-lg bg-background/80 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
              <Brain className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold gradient-text">Ask Linc</span>
            </Link>
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/#waitlist">
                <Button 
                  variant="hero" 
                  size="sm"
                >
                  Get Early Access
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="pt-24">
        {/* Hero Section */}
        <section className="relative py-12 overflow-hidden">
          <div className="absolute inset-0 z-0 opacity-20 bg-gradient-to-br from-primary/20 to-secondary/20" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background z-10" />
          
          <div className="relative z-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center space-y-8">
              
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight">
                How we protect <span className="gradient-text">your data</span>
              </h1>
              
              <p className="text-xl md:text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
                We built Ask Linc to help people make better financial decisions — not to collect, sell, or exploit your data.{" "}
                <span className="gradient-text font-semibold">Privacy isn't just a feature. It's the foundation.</span>
              </p>
            </div>
          </div>
        </section>

        {/* Privacy Features Grid */}
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 gap-8">
              <Card className="glass-card hover:shadow-xl transition-all duration-300 hover:scale-105">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Eye className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">You Control Your Data — Always</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">You choose what accounts to connect (or not).</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">You can disconnect any time — instantly.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">You can delete all your data with one click. No dark patterns.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground"><strong className="text-primary">We never sell, share, or train on your data. Period.</strong></p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card hover:shadow-xl transition-all duration-300 hover:scale-105">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Shield className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">Read-Only Access via Plaid</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-muted-foreground">
                    Ask Linc uses <span className="text-primary font-medium">Plaid</span> to connect to your financial accounts. 
                    Plaid is used by thousands of banks, apps, and fintech tools and is SOC 2 Type II compliant.
                  </p>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">We never see or store your login credentials.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">All access is read-only — Ask Linc cannot move or touch your money.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">You can revoke access at any time, directly from your account or via your bank.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card hover:shadow-xl transition-all duration-300 hover:scale-105">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Database className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">We Don't Store Sensitive Identifiers</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    We intentionally avoid storing personally identifiable information (PII) wherever possible.
                  </p>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">No account numbers. No raw transaction descriptions.</p>
                    <p className="text-muted-foreground text-sm">We tokenize sensitive data before it ever touches our AI layer:</p>
                  </div>
                  <div className="space-y-2 bg-muted p-4 rounded-lg">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">"Bank of America Checking"</span>
                      <span className="text-primary">→ "Account_1"</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">"Chase Sapphire Preferred"</span>
                      <span className="text-primary">→ "Card_2"</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">"Trader Joe's"</span>
                      <span className="text-primary">→ "Merchant_12"</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    That means even if data flows through our system, it's anonymized — and not useful to anyone but you.
                  </p>
                </CardContent>
              </Card>

              <Card className="glass-card hover:shadow-xl transition-all duration-300 hover:scale-105">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                      <MessageCircle className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">GPT, But Smarter (And Safer)</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Ask Linc uses OpenAI's GPT models to answer your financial questions. But unlike typing into ChatGPT directly, we:
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                      <p className="text-muted-foreground">Anonymize your financial data before it's passed to GPT</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                      <p className="text-muted-foreground">Use the OpenAI API, not ChatGPT — your data is not used to train any models</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                      <p className="text-muted-foreground">Only send the minimum context required to answer your question</p>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-primary">
                    So you get the clarity of GPT — without the exposure.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Infrastructure Section */}
        <section className="py-20 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Lock className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">Infrastructure & Encryption</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-foreground mb-2">All data is encrypted:</h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                        <span className="text-muted-foreground">In transit (TLS 1.2+)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                        <span className="text-muted-foreground">At rest (AES-256 where applicable)</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">
                      We host our backend on Render and Vercel, using secure, industry-standard practices including 
                      environment isolation, access control, and daily backups.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Additional Sections */}
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 gap-8">
              <Card className="glass-card hover:shadow-xl transition-all duration-300 hover:scale-105">
                <CardHeader>
                  <CardTitle className="text-xl">No Tracking, No Ads, No Creepy Stuff</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    We don't use cookies for tracking or ad targeting. We use lightweight analytics to understand usage patterns — 
                    but never tied to your identity or data.
                  </p>
                </CardContent>
              </Card>

              <Card className="glass-card hover:shadow-xl transition-all duration-300 hover:scale-105">
                <CardHeader>
                  <CardTitle className="text-xl">Want to Leave? No Problem.</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-muted-foreground mb-3">You can:</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                      <span className="text-muted-foreground">Disconnect all linked accounts</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                      <span className="text-muted-foreground">Wipe all your data</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                      <span className="text-muted-foreground">Close your account</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    We'll respect that — no friction, no dark patterns.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section className="py-20 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Card className="glass-card border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">Questions? Talk to a Human</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Privacy is a relationship — not a legal checkbox. If you ever have questions, concerns, or suggestions, 
                  reach out directly at <a href="mailto:hello@asklinc.com" className="text-primary hover:underline font-medium">hello@asklinc.com</a>. 
                  We'll always respond, and we'll always be transparent.
                </p>
                <a href="mailto:hello@asklinc.com">
                  <Button variant="hero">
                    Contact Us
                  </Button>
                </a>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Final Statement */}
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center glass-card rounded-xl p-8 border border-primary/20">
              <blockquote className="text-lg italic text-muted-foreground mb-4">
                "Ask Linc was built because existing tools made us feel vulnerable — pasting bank statements into ChatGPT, 
                hoping no one sees. That's not good enough. So we made something better."
              </blockquote>
              <div className="text-primary font-semibold text-xl">
                Your data. Your control. Real answers — without the risk.
              </div>
            </div>
          </div>
        </section>
      </main>

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
                href="mailto:hello@asklinc.com"
                className="hover:text-primary transition-colors"
              >
                Contact
              </a>
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

export default PrivacyPage; 