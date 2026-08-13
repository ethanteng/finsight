import type { Metadata } from "next";
import Link from "next/link";
import { PageCta, SiteFooter, SiteHeader } from "@/components/marketing/SiteShell";
import { PROMPT_PAGES } from "@/lib/promptExamples";

export const metadata: Metadata = {
  title: "Example Financial Planning Questions | Ask Linc",
  description:
    "See illustrative questions and answers about retirement, home buying, investments, and financial stress testing.",
  alternates: {
    canonical: "https://asklinc.com/prompts",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PromptsIndexPage() {
  return (
    <main className="marketing-site subpage prompts-index-page">
      <SiteHeader />
      <section className="subhero centered-subhero shell">
        <p className="section-kicker">ILLUSTRATIVE QUESTIONS</p>
        <h1>See the kinds of questions <em>Ask Linc can work through.</em></h1>
        <p className="subhero-copy">
          These examples use fictional numbers. They show how an answer connects one decision to cash flow, savings, debt, and the goals that follow.
        </p>
      </section>
      <section className="prompt-index-grid shell">
        {PROMPT_PAGES.map((page, index) => (
          <Link key={page.slug} href={`/prompts/${page.slug}`} className="prompt-index-card">
            <span>{String(index + 1).padStart(2, "0")} / SAMPLE</span>
            <h2>{page.title}</h2>
            <p>{page.description}</p>
            <strong>Read the example <i>→</i></strong>
          </Link>
        ))}
      </section>
      <PageCta title="Try a question with your own numbers." />
      <SiteFooter />
    </main>
  );
}
