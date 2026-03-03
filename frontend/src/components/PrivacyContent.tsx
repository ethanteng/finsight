"use client";
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Shield, Eye, Lock, Database, FileText, MessageCircle, Users } from 'lucide-react';
import Link from 'next/link';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';

export default function PrivacyContent() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="pt-24">
        {/* Hero Section */}
        <section className="relative py-12 overflow-hidden">
          <div className="absolute inset-0 z-0 opacity-20 bg-gradient-to-br from-primary/20 to-secondary/20" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background z-10" />
          
          <div className="relative z-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center space-y-8">
              
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight">
                <span className="gradient-text">Privacy Policy</span>
              </h1>
              
              <div className="text-center space-y-4">
                <p className="text-lg text-muted-foreground">
                  <strong className="text-foreground">Effective Date:</strong> July 29, 2025
                </p>
                <p className="text-lg text-muted-foreground">
                  <strong className="text-foreground">Operated by:</strong> Ethan Teng Consulting LLC
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Privacy Policy Content */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            
            {/* What We Collect */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-3">
                  <Database className="h-6 w-6 text-primary" />
                  1. What We Collect
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  We collect the minimum necessary to deliver Ask Linc:
                </p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Financial account data</strong> (via Plaid): balances, transactions, account names — read-only
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Questions you ask</strong> and Linc's responses
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Basic usage data</strong>: browser type, device info, session duration, error logs
                    </p>
                  </div>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm font-medium text-foreground">
                    We do <strong className="text-primary">not</strong> collect or store banking credentials.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* How We Use It */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-3">
                  <MessageCircle className="h-6 w-6 text-primary" />
                  2. How We Use It
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">To provide answers and insights tailored to your accounts</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">To improve the quality and performance of Ask Linc</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">To understand aggregate usage trends (anonymized)</p>
                  </div>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm font-medium text-foreground mb-2">We <strong className="text-primary">do not</strong>:</p>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">• Sell your data</p>
                    <p className="text-sm text-muted-foreground">• Share your data with advertisers</p>
                    <p className="text-sm text-muted-foreground">• Use your data to train AI models</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Your Rights Under GDPR and CCPA */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-3">
                  <Shield className="h-6 w-6 text-primary" />
                  3. Your Rights Under GDPR and CCPA
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  If you're located in the <strong className="text-foreground">European Union (GDPR)</strong> or <strong className="text-foreground">California (CCPA)</strong>, you have specific rights:
                </p>
                <div className="space-y-3">
                  <h4 className="font-semibold text-foreground">You can:</h4>
                  <div className="space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                      <p className="text-muted-foreground"><strong className="text-foreground">Access</strong> the data we've collected about you</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                      <p className="text-muted-foreground"><strong className="text-foreground">Correct</strong> or update that data</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                      <p className="text-muted-foreground"><strong className="text-foreground">Request deletion</strong> of all personal data we store</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                      <p className="text-muted-foreground"><strong className="text-foreground">Opt out</strong> of data collection (except what's required to operate the service)</p>
                    </div>
                  </div>
                </div>
                <p className="text-muted-foreground">
                  You can do this via your in-app Privacy Dashboard or by emailing us at <a href="mailto:hello@asklinc.com" className="text-primary hover:underline font-medium">hello@asklinc.com</a>.
                </p>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm font-medium text-foreground">
                    We will never discriminate against you for exercising your privacy rights.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Data Storage and Transfers */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-3">
                  <Lock className="h-6 w-6 text-primary" />
                  4. Data Storage and Transfers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  All data is stored securely in the United States. If you are outside the U.S., your data may be transferred and processed here. We take appropriate safeguards to protect it.
                </p>
              </CardContent>
            </Card>

            {/* Deletion & Control */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-3">
                  <Eye className="h-6 w-6 text-primary" />
                  5. Deletion & Control
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">You can disconnect your accounts and delete all data at any time.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">Deleted data is permanently removed from our systems within 30 days.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground">We retain only the minimum necessary logs for service security and fraud prevention.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Third-Party Services */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-3">
                  <Users className="h-6 w-6 text-primary" />
                  6. Third-Party Services
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-3">We use:</p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground"><strong className="text-foreground">Plaid</strong> for account linking (SOC 2 certified)</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground"><strong className="text-foreground">OpenAI</strong> for GPT-powered responses (with anonymized input)</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground"><strong className="text-foreground">Hosting and analytics services</strong> that follow industry-standard security protocols</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact */}
            <Card className="glass-card border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-3">
                  <FileText className="h-6 w-6 text-primary" />
                  7. Contact
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  For privacy-related questions or to exercise your rights, contact:
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

      <SiteFooter />
    </div>
  );
}

