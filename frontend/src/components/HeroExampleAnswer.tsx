"use client";

import Link from "next/link";

/**
 * Static product "after-state" for the homepage hero — a real reasoning answer
 * with numbers and a recommendation, not a loading skeleton.
 */
export default function HeroExampleAnswer() {
  return (
    <div className="w-full max-w-2xl mx-auto text-left rounded-xl border border-border/60 bg-slate-900/95 shadow-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-slate-950/60">
        <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden="true" />
        <span className="text-sm text-slate-400">Ask Linc</span>
        <span className="ml-auto text-xs text-slate-500">Sample answer</span>
      </div>

      <div className="px-4 sm:px-5 py-4 space-y-4">
        <p className="text-sm sm:text-base text-slate-200 font-medium leading-snug">
          Can we retire at 60 if rates stay higher for longer?
        </p>

        <p className="text-sm text-slate-300 leading-relaxed">
          Yes — with a clear surplus, if you hold spending near today&apos;s plan.
          At age 60 your portfolio is projected around{" "}
          <span className="text-white font-semibold">$6.3M</span> versus roughly{" "}
          <span className="text-white font-semibold">$4.6M</span> needed for your
          $140K lifestyle. Higher-for-longer rates help cash and bonds, but the
          real risk is sequence-of-returns in the first five years — not whether
          you can retire.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Age 60 surplus", value: "+$1.7M" },
            { label: "Success odds", value: "75–85%" },
            { label: "Debt to clear", value: "$444K" },
            { label: "Equity today", value: "92%" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg bg-white/5 border border-white/10 px-3 py-2"
            >
              <div className="text-[0.65rem] uppercase tracking-wide text-slate-500">
                {item.label}
              </div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5">
          <p className="text-xs font-medium text-primary mb-1">Recommendation</p>
          <p className="text-sm text-slate-200 leading-relaxed">
            Target 60 as the base case. Pay down the $444K debt before age 53,
            and glide equities from 92% toward ~70% so a market drop near
            retirement doesn&apos;t force a delay.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-xs text-slate-500">
            Numbers from sample household data · live rates cited in full answers
          </p>
          <Link
            href="/demo"
            className="text-xs font-medium text-primary hover:underline"
          >
            See a real answer free →
          </Link>
        </div>
      </div>
    </div>
  );
}
