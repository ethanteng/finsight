import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingGetStartedButton } from '@/components/marketing/MarketingGetStartedButton';
import RotatingHeroExamples from '@/components/marketing/RotatingHeroExamples';
import { PageCta, SiteFooter, SiteHeader } from '@/components/marketing/SiteShell';

export const metadata: Metadata = {
  title: 'How Ask Linc Works | Self-Directed Financial Planning',
  description: 'Ask a financial question. Ask Linc builds a model from your real numbers, runs deterministic calculations, tests scenarios, and shows every assumption.',
  keywords: ['self-directed financial planning', 'financial modeling', 'financial decisions', 'what-if planning', 'deterministic financial calculations', 'show the math'],
  alternates: { canonical: 'https://asklinc.com/features' },
  openGraph: {
    title: 'How Ask Linc Works | Self-Directed Financial Planning',
    description: 'Go from a question to a rigorous financial model without building the spreadsheet first.',
    type: 'website',
    url: 'https://asklinc.com/features',
    siteName: 'Ask Linc',
    images: [{ url: 'https://asklinc.com/og-image.jpg', width: 1200, height: 630, alt: 'How Ask Linc works' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'How Ask Linc Works',
    description: 'Start with the decision, not the dashboard.',
    images: ['https://asklinc.com/og-image.jpg'],
  },
  robots: { index: true, follow: true },
};

const steps = [
  ['01', 'Ask the question', 'Start with what you are trying to decide. No spreadsheet or financial model to build first.'],
  ['02', 'Build the relevant model', 'Linc brings in the cash, spending, debt, investments, property, goals, rates, or history that could change this decision.'],
  ['03', 'Run deterministic calculations', 'Purpose-built tools handle supported financial math so the same inputs produce the same calculated result.'],
  ['04', 'Stress-test the scenarios', 'Change the date, income, spending, portfolio, or assumption in plain English and see what moves with it.'],
  ['05', 'Inspect the answer', 'See what looks workable, what could break, and the numbers, assumptions, checks, and sources behind the conclusion.'],
] as const;

export default function FeaturesPageRoute() {
  return (
    <main className="marketing-site subpage features-page">
      <SiteHeader />
      <section className="subhero shell split-subhero">
        <div>
          <p className="section-kicker">HOW ASK LINC WORKS</p>
          <h1>From your question <em>to a financial model you can inspect.</em></h1>
          <p className="subhero-copy">You should not have to build the spreadsheet before you can ask the question. Tell Linc what you are trying to decide; it builds the relevant model, runs the math, and lets you change the assumptions conversationally.</p>
          <div className="hero-actions">
            <MarketingGetStartedButton className="button button-primary" csOverrideId="cta-start-free-trial-hero" label="Build my plan" />
            <Link className="text-link" href="/use-cases">See what you can ask →</Link>
          </div>
        </div>
        <RotatingHeroExamples />
      </section>

      <section className="page-section shell" id="system">
        <div className="editorial-heading">
          <p className="section-kicker">START WITH THE DECISION, NOT THE DASHBOARD</p>
          <h2>One question. One inspectable planning model.</h2>
        </div>
        <ol className="fact-routing-steps" aria-label="How Ask Linc builds an answer">
          {steps.map(([number, title, description]) => (
            <li key={number}><span>{number}</span><div><strong>{title}</strong><p>{description}</p></div></li>
          ))}
        </ol>
      </section>

      <section className="context-section dark-band ecosystem-detail-section">
        <div className="shell">
          <div className="ecosystem-detail-heading">
            <div>
              <p className="section-kicker light">THE NUMBERS BEHIND THE DECISION</p>
              <h2>Your real financial state stays attached to the model.</h2>
            </div>
            <p>Accounts and data sources are infrastructure, not the product. Ask Linc uses only the cash, spending, debt, investments, property, goals, current rates, rules, and history that could change the decision.</p>
          </div>
          <div className="coverage-grid">
            <article className="coverage-card"><div className="coverage-card-top"><span>01</span><small>YOUR MONEY</small></div><h3>Cash, spending, and debt</h3><p>What you have available, what you owe, and what your current lifestyle costs.</p></article>
            <article className="coverage-card"><div className="coverage-card-top"><span>02</span><small>YOUR PLAN</small></div><h3>Investments, property, and goals</h3><p>The assets and longer-term goals that this decision could help—or set back.</p></article>
            <article className="coverage-card"><div className="coverage-card-top"><span>03</span><small>WHAT IS TRUE NOW</small></div><h3>Rates, rules, and markets</h3><p>Current information is added when it can materially change the answer.</p></article>
          </div>
          <div className="fact-routing-links">
            <Link className="section-cta-link section-cta-link-on-dark" href="/integrations">
              Explore accounts &amp; data <span aria-hidden="true">→</span>
            </Link>
            <Link className="section-cta-link section-cta-link-on-dark" href="/trust">
              Show the math <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <PageCta title="Turn the decision into a model you can stress-test." label="Start planning" csOverrideId="cta-start-free-trial-mid" />
      <SiteFooter />
    </main>
  );
}
