"use client";
import Link from "next/link";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

interface UseCaseStubPageProps {
  title: string;
  description: string;
}

export default function UseCaseStubPage({ title, description }: UseCaseStubPageProps) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Content */}
      <section className="relative pt-24 pb-20 overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-20 bg-gradient-to-br from-primary/20 to-secondary/20" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background z-10" />
        <div className="relative z-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <Link href="/use-cases" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              ← Use Cases
            </Link>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              {title}
            </h1>
            <p className="text-lg text-muted-foreground">
              {description}
            </p>
            <p className="text-muted-foreground">
              This page is coming soon.
            </p>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
