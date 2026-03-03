"use client";
import { Card, CardContent } from './ui/card';
import { Brain } from 'lucide-react';
import Link from 'next/link';

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
    question: "I don't want to give OpenAI all my financial data...",
    answer: "You don't give OpenAI your bank logins. We use Plaid to securely connect accounts in read-only mode. Your credentials are never shared with us, and your financial data is not used to train AI models. You're always in control and can disconnect accounts at any time."
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
              <Link href="/features" className="text-muted-foreground hover:text-primary transition-colors">
                Product
              </Link>
              <Link href="/#pricing" className="text-muted-foreground hover:text-primary transition-colors">
                Pricing
              </Link>
              <a 
                href="https://www.asklinc.com/blog" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Blog
              </a>
              <Link href="/#pricing">
                <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                  Get started
                </button>
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
              <Link 
                href="/faq" 
                className="text-primary font-medium hover:text-primary/80 transition-colors"
              >
                FAQ
              </Link>
              <Link 
                href="/privacy" 
                className="hover:text-primary transition-colors"
              >
                Privacy Policy
              </Link>
              <Link 
                href="/terms" 
                className="hover:text-primary transition-colors"
              >
                Terms of Service
              </Link>
              <Link 
                href="/contact" 
                className="hover:text-primary transition-colors"
              >
                Contact
              </Link>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <p className="text-sm text-muted-foreground">
                &copy; {new Date().getFullYear()} Ask Linc. Your AI financial analyst. Built with privacy in mind.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
