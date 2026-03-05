"use client";
import { Card, CardContent } from './ui/card';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';

const FAQ_ITEMS = [
  {
    question: "Is this just another budget tracking app?",
    answer: "No. Budget tracking apps show you what already happened. Ask Linc helps you reason about what's happening now—and what it means for your specific situation—by combining your accounts with market context and plain-English explanations."
  },
  {
    question: "Is there a free plan or trial?",
    answer: "No. Ask Linc is $9/month for full access. We've found it works best when people use it with real questions from day one."
  },
  {
    question: "I don't want to give AI companies all my financial data...",
    answer: "You don't give AI providers your bank logins. We use Plaid to securely connect accounts in read-only mode. Your credentials are never shared with us, and your financial data is not used to train AI models. You're always in control and can disconnect accounts at any time."
  },
  {
    question: "How do you know what's going on in the market?",
    answer: "Ask Linc pulls in current market context—interest rates, bond yields, inflation data, and relevant news—and uses it to ground answers in what's happening right now, not generic advice."
  },
  {
    question: "What if I want to delete everything?",
    answer: "You can view, export, or delete your data at any time. Deleting your data permanently removes it from our systems."
  }
];

export default function FaqContent() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="pt-24">
        {/* Hero Section */}
        <section className="relative py-12 overflow-hidden">
          <div className="absolute inset-0 z-0 opacity-20 bg-gradient-to-br from-primary/20 to-secondary/20" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background z-10" />
          
          <div className="relative z-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center space-y-4">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight">
                Questions We Get <span className="gradient-text">A Lot</span>
              </h1>
              <p className="text-xl text-muted-foreground">
                Let's clear up some common concerns
              </p>
            </div>
          </div>
        </section>

        {/* FAQ Content */}
        <section className="py-20 bg-muted/30">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="space-y-6">
              {FAQ_ITEMS.map((faq, index) => (
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
      </main>

      <SiteFooter />
    </div>
  );
}
