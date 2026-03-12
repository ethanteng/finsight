import type { Metadata } from "next";
import Link from "next/link";
import { Brain, PiggyBank, Home, BarChart3, Shield, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PROMPT_PAGES } from "@/lib/promptExamples";

export const metadata: Metadata = {
  title: "Example Prompts | Ask Linc",
  description:
    "Explore real prompt examples showing how Ask Linc analyzes retirement, home buying, portfolio allocation, and financial stress testing.",
  alternates: {
    canonical: "https://asklinc.com/prompts",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const ICONS: Record<string, typeof PiggyBank> = {
  retirement: PiggyBank,
  "home-buying": Home,
  "portfolio-analysis": BarChart3,
  "financial-stress-testing": Shield,
  "geopolitical-retirement": Globe,
};

export default function PromptsIndexPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation - client nav would need to be in a separate client component for interactivity */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-lg bg-background/80 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-2 hover:opacity-90 transition-opacity">
              <Brain className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold gradient-text">Ask Linc</span>
            </Link>
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/features" className="text-muted-foreground hover:text-primary transition-colors">
                Product
              </Link>
              <Link href="/use-cases" className="text-muted-foreground hover:text-primary transition-colors">
                Use Cases
              </Link>
              <Link href="/#pricing" className="text-muted-foreground hover:text-primary transition-colors">
                Pricing
              </Link>
              <a
                href="https://blog.asklinc.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Blog
              </a>
              <Button variant="hero" size="sm" asChild>
                <Link href="/">Get started</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="/login">Login</a>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <section className="relative pt-24 pb-20 overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-20 bg-gradient-to-br from-primary/20 to-secondary/20" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background z-10" />
        <div className="relative z-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-8">
            <div className="text-center">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
                Example Prompts
              </h1>
              <p className="text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">
                See real prompt-and-response examples from each use case.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 pt-4">
              {PROMPT_PAGES.map((page) => {
                const Icon = ICONS[page.slug];
                return (
                  <Link
                    key={page.slug}
                    href={`/prompts/${page.slug}`}
                    className="block p-6 rounded-xl border border-border/50 bg-background/50 hover:border-primary/30 hover:bg-primary/5 transition-colors text-left"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold">{page.title}</h2>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {page.description}
                        </p>
                        <p className="text-sm text-primary mt-2 font-medium">
                          View prompt →
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="flex flex-col items-center gap-2 pt-10">
              <Button variant="hero" size="lg" asChild className="w-auto max-w-full px-4 py-3 text-base sm:px-6 sm:py-4 sm:text-lg md:px-10 md:py-[1.875rem] md:text-[1.40625rem]">
                <Link href="/use-cases">Explore Use Cases</Link>
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                See more examples and related blog posts for each use case.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
