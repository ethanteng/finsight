import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingGetStartedButton } from '@/components/marketing/MarketingGetStartedButton';
import { TRIAL_CTA_MICROCOPY } from '@/components/marketing/trial-copy';
import { AnalysisVisual } from '@/components/marketing/PlanningStory';
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
  ['01', 'Connect your financial life', 'Bring together your accounts, investments, and loans. Add any missing details yourself.'],
  ['02', 'Ask your question', 'Tell Linc what you are trying to figure out. It asks for context, runs supported calculations, and explains the tradeoffs.'],
  ['03', 'Change an assumption', 'Ask a follow-up. Compare retirement dates, spending, or a down payment, and inspect what changed.'],
] as const;

export default function FeaturesPageRoute() {
  return (
    <main className="marketing-site subpage features-page">
      <SiteHeader />
      <section className="subhero shell split-subhero">
        <div>
          <p className="section-kicker">HOW ASK LINC WORKS</p>
          <h1>You bring the question. <em>Linc brings it together.</em></h1>
          <p className="subhero-copy">Connect your finances, tell Linc what you’re weighing, and explore the plan it builds. The numbers, tradeoffs, and next questions come together in one place.</p>
          <div className="hero-actions">
            <MarketingGetStartedButton className="button button-primary" csOverrideId="cta-start-free-trial-hero" label="Start free" />
          </div>
          <p className="microcopy">{TRIAL_CTA_MICROCOPY}</p>
        </div>
        <AnalysisVisual />
      </section>

      <section className="page-section shell" id="system">
        <div className="editorial-heading">
          <p className="section-kicker">START WITH THE DECISION, NOT THE DASHBOARD</p>
          <h2>Three steps to a clearer next move.</h2>
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
              <h2>The right numbers. A plan you can check.</h2>
            </div>
            <p>Linc starts with your finances and adds current rates, rules, or market history when the question needs them. Open Show the Math to inspect the work.</p>
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

      <PageCta title="Change the assumption, not the spreadsheet." label="Start planning" csOverrideId="cta-start-free-trial-mid" />
      <SiteFooter />
    </main>
  );
}
