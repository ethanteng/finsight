"use client";

/**
 * Dated third-party signal strip for D3.5.
 * Populate as real external signals land (Product Hunt, Trustpilot, press).
 * Do not invent badges.
 */
export default function ThirdPartySignals() {
  return (
    <section id="as-seen-in" className="py-10 border-y border-border/40 bg-muted/20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs uppercase tracking-[0.14em] text-muted-foreground mb-4">
          As seen in
        </p>
        <p className="text-center text-sm text-muted-foreground max-w-xl mx-auto">
          Third-party mentions and ratings will appear here with dates as they
          land — Product Hunt, reviews, and press. No filler logos.
        </p>
      </div>
    </section>
  );
}
