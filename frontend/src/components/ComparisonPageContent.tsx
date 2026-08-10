"use client";

import Link from "next/link";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import { Button } from "./ui/button";
import type { ComparisonPage } from "@/lib/comparisons";
import { COMPARISONS } from "@/lib/comparisons";

export default function ComparisonPageContent({ page }: { page: ComparisonPage }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="pt-24">
        <section className="py-14">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            <div className="space-y-4 text-center">
              <h1 className="text-3xl md:text-5xl font-bold">
                {page.headline}
              </h1>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                {page.summary}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button variant="hero" size="lg" asChild>
                  <Link href="/demo">See a real answer free, no credit card needed</Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link href="/pricing">$9/month pricing</Link>
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-4 font-semibold w-[22%]">Dimension</th>
                    <th className="p-4 font-semibold w-[39%]">Ask Linc</th>
                    <th className="p-4 font-semibold w-[39%]">{page.competitorName}</th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row) => (
                    <tr key={row.dimension} className="border-t border-border/50 align-top">
                      <td className="p-4 font-medium">{row.dimension}</td>
                      <td className="p-4 text-muted-foreground leading-relaxed">{row.askLinc}</td>
                      <td className="p-4 text-muted-foreground leading-relaxed">{row.competitor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold">FAQ</h2>
              {page.faqs.map((faq) => (
                <div key={faq.question} className="rounded-lg border border-border/60 p-5">
                  <h3 className="font-semibold mb-2">{faq.question}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
                </div>
              ))}
            </div>

            <div className="text-center space-y-3 pt-4">
              <p className="text-sm text-muted-foreground">Other comparisons</p>
              <div className="flex flex-wrap justify-center gap-4 text-sm">
                {COMPARISONS.filter((c) => c.slug !== page.slug).map((c) => (
                  <Link
                    key={c.slug}
                    href={`/vs/${c.slug}`}
                    className="text-primary hover:underline"
                  >
                    vs {c.competitorName}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
