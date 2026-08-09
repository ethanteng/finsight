"use client";

import Link from "next/link";
import { Calculator } from "lucide-react";

export default function RealMathCallout() {
  return (
    <section className="py-16 bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-primary/25 bg-primary/5 px-6 py-8 sm:px-10 sm:py-10">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Calculator className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
                Real math, not AI guesses
              </h2>
              <p className="text-muted-foreground leading-relaxed text-base md:text-lg">
                Wondering if the answer is confidently wrong? The calculations
                are deterministic — run on your connected data, not improvised
                by the model. Numbers are shown, live sources are cited, and you
                can open &ldquo;Show the math&rdquo; on any answer to inspect the work.
              </p>
              <Link
                href="/blog/show-the-math-how-ask-linc-makes-ai-financial-analysis-transparent"
                className="inline-flex text-primary font-medium hover:underline"
              >
                How Show the math works →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
