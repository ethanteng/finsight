"use client";
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Shield, Eye, Lock, FileText, MessageCircle, Brain, Scale } from 'lucide-react';
import Link from 'next/link';

const TermsPage = () => {

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-lg bg-background/80 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Link href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
                <Brain className="h-8 w-8 text-primary" />
                <span className="text-xl font-bold gradient-text">Ask Linc</span>
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a 
                href="/how-we-protect-your-data" 
                className="text-primary hover:text-primary/80 transition-colors cursor-pointer"
              >
                How We Protect Your Data
              </a>
              <a href="/#waitlist">
                <Button 
                  variant="hero" 
                  size="sm"
                >
                  Get Early Access
                </Button>
              </a>
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
                <span className="gradient-text">Terms of Service</span>
              </h1>
              
              <div className="text-center space-y-4">
                <p className="text-lg text-muted-foreground">
                  <strong className="text-foreground">Effective Date:</strong> July 29, 2025
                </p>
                <p className="text-lg text-muted-foreground">
                  These terms apply to your use of Ask Linc, a product operated by Ethan Teng Consulting LLC.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Terms Content */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            
            {/* What Ask Linc Does */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-3">
                  <Brain className="h-6 w-6 text-primary" />
                  1. What Ask Linc Does
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Ask Linc connects to your accounts and helps you make sense of your finances by answering plain-language questions with context from your actual data and today's market.
                </p>
              </CardContent>
            </Card>

            {/* Your Responsibilities */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-3">
                  <Shield className="h-6 w-6 text-primary" />
                  2. Your Responsibilities
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">You agree to:</p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">Use Ask Linc only for personal, lawful purposes</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">Not resell or misuse the service</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">Keep your login credentials secure</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">Understand that Linc provides <strong className="text-foreground">informational insights</strong>, not investment, tax, or legal advice</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Subscription & Billing */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-3">
                  <FileText className="h-6 w-6 text-primary" />
                  3. Subscription & Billing
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Some features require a paid subscription. You'll always see clear pricing and can cancel anytime. We don't do surprise charges or hidden fees.
                </p>
              </CardContent>
            </Card>

            {/* Data & Privacy */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-3">
                  <Lock className="h-6 w-6 text-primary" />
                  4. Data & Privacy
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  We handle your data according to our <a href="/privacy" className="text-primary hover:underline font-medium">Privacy Policy</a>. You can:
                </p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">View, export, or delete your data</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">Opt out of tracking and personalized services (except where essential)</p>
                  </div>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm font-medium text-foreground">
                    If you're a resident of California or the EU, you have enhanced rights under <strong className="text-primary">CCPA</strong> and <strong className="text-primary">GDPR</strong>, which we fully honor.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* No Guarantees */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-3">
                  <Eye className="h-6 w-6 text-primary" />
                  5. No Guarantees
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">We do our best, but we can't guarantee:</p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">100% uptime</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">Financial accuracy in all responses</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">That our AI will always interpret your question perfectly</p>
                  </div>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm font-medium text-foreground">
                    You should double-check any major decisions with a financial advisor.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Changes to These Terms */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-3">
                  <MessageCircle className="h-6 w-6 text-primary" />
                  6. Changes to These Terms
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  If we update these Terms, we'll let you know in-app or via email. Continued use means you agree to the new terms.
                </p>
              </CardContent>
            </Card>

            {/* Contact */}
            <Card className="glass-card border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-3">
                  <FileText className="h-6 w-6 text-primary" />
                  7. Contact Info
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Questions, complaints, or requests? We're reachable at:
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📧</span>
                  <a href="mailto:hello@asklinc.com" className="text-primary hover:underline font-medium text-lg">
                    hello@asklinc.com
                  </a>
                </div>
              </CardContent>
            </Card>
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

export default TermsPage; 