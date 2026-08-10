"use client";

import Image from "next/image";
import Link from "next/link";

export default function FounderBlock() {
  return (
    <section id="founder" className="py-20 bg-muted/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center">
            Why I built <span className="gradient-text">this</span>
          </h2>
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
            <Image
              src="/ethan-teng.jpg"
              alt="Ethan Teng, founder of Ask Linc"
              width={112}
              height={112}
              className="rounded-full object-cover shrink-0 w-24 h-24 sm:w-28 sm:h-28 border border-border"
              priority={false}
            />
            <div className="space-y-4">
              <div>
                <p className="text-lg font-semibold">Ethan Teng</p>
                <p className="text-sm text-muted-foreground">Founder, Ask Linc</p>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                After getting laid off, I pasted my own bank statements into
                ChatGPT — and immediately regretted it. General-purpose AI fails
                at money math. I built Ask Linc so households planning retirement
                get decision-ready answers from their real accounts, live market
                data, and calculations you can inspect — not another dashboard,
                and not a black box.
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                <a
                  href="https://www.linkedin.com/in/ethanteng"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  LinkedIn
                </a>
                <a
                  href="https://asklinc.substack.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Substack
                </a>
                <Link href="/about" className="text-primary hover:underline">
                  About Ask Linc
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
