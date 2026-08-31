import Link from "next/link";
import { PageCta, SiteFooter, SiteHeader } from "./marketing/SiteShell";
import type { PromptExample } from "@/lib/promptExamples";
import { RetirementDecisionCrossSell } from "./marketing/RetirementDecisionCrossSell";

interface PromptExamplePageProps {
  title: string;
  description: string;
  cta: string;
  example: PromptExample;
  useCaseHref: string;
}

export default function PromptExamplePage({
  title,
  description,
  example,
  useCaseHref,
}: PromptExamplePageProps) {
  return (
    <main className="marketing-site subpage prompt-example-page">
      <SiteHeader />
      <section className="prompt-example shell">
        <Link href="/prompts" className="back-link">← All example questions</Link>
        <header className="prompt-example-head">
          <p className="section-kicker">ILLUSTRATIVE EXAMPLE</p>
          <h1>{title}</h1>
          <p>{description} The accounts, amounts, and answer below are fictional.</p>
        </header>

        <div className="prompt-example-layout">
          <aside className="prompt-question-card">
            <span>QUESTION</span>
            <p>“{example.prompt}”</p>
          </aside>
          <article className="prompt-answer-card">
            <div className="prompt-answer-top"><span className="brand-mark small">L</span><b>SAMPLE ANSWER</b><small>ILLUSTRATIVE</small></div>
            <section>
              <span className="prompt-label">THE SHORT ANSWER</span>
              <p className="prompt-response">{example.response}</p>
            </section>
            <section>
              <span className="prompt-label">KEY NUMBERS</span>
              <div className="prompt-number-grid">
                {example.keyNumbers.map((item) => (
                  <div key={item.label}><span>{item.label}</span><b>{item.value}</b></div>
                ))}
              </div>
            </section>
            <div className="prompt-detail-grid">
              <section>
                <span className="prompt-label">WHAT MATTERS</span>
                <ul>{example.insights.map((insight) => <li key={insight}>{insight}</li>)}</ul>
              </section>
              <section>
                <span className="prompt-label">POSSIBLE NEXT STEPS</span>
                <ul>{example.suggestedActions.map((action) => <li key={action}>{action}</li>)}</ul>
              </section>
            </div>
          </article>
        </div>
        <Link href={useCaseHref} className="prompt-use-case-link">See how this use case works <b>→</b></Link>
      </section>
      {useCaseHref === "/use-cases/retirement" && <RetirementDecisionCrossSell />}
      <PageCta title="Try a question like this with your own numbers." csOverrideId="cta-start-free-trial-mid" />
      <SiteFooter />
    </main>
  );
}
