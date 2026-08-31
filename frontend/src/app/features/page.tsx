import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingGetStartedButton } from '@/components/marketing/MarketingGetStartedButton';
import { PageCta, SiteFooter, SiteHeader } from '@/components/marketing/SiteShell';

export const metadata: Metadata = {
  title: 'How Ask Linc Works | Financial Planning That Starts With Your Question',
  description: 'Ask a financial question, bring in the parts of your financial life that matter, compare the tradeoffs, and see the math behind the answer.',
  keywords: ['financial planning', 'financial decisions', 'what-if planning', 'connected financial accounts', 'show the math'],
  alternates: { canonical: 'https://asklinc.com/features' },
  openGraph: {
    title: 'How Ask Linc Works | Financial Planning That Starts With Your Question',
    description: 'Start with the decision, not the dashboard. See how Ask Linc builds the analysis around your question.',
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
  ['01', 'Ask the question', 'Start with what you are trying to decide. No financial model to build first.'],
  ['02', 'Linc pulls in what matters', 'Cash, spending, debt, investments, property, goals, rates, and market context—only when they could change the answer.'],
  ['03', 'Compare the tradeoffs', 'Change the price, date, income, spending, or assumption and see what moves with it.'],
  ['04', 'Get the recommendation', 'See what looks workable, what is tight, what could break the plan, and what Linc would change.'],
  ['05', 'Check the work', 'Show the Math keeps your numbers, assumptions, calculations, checks, and sources attached to the answer.'],
] as const;

export default function FeaturesPageRoute() {
  return (
    <main className="marketing-site subpage features-page">
      <SiteHeader />
      <section className="subhero shell split-subhero">
        <div>
          <p className="section-kicker">HOW ASK LINC WORKS</p>
          <h1>Financial planning that starts with <em>your question.</em></h1>
          <p className="subhero-copy">You should not have to build the financial model before you can ask the question. Tell Linc what you are trying to decide; it builds the analysis around it.</p>
          <div className="hero-actions">
            <MarketingGetStartedButton className="button button-primary" csOverrideId="cta-start-free-trial-hero" />
            <Link className="text-link" href="/use-cases">See what you can ask →</Link>
          </div>
        </div>
        <article className="decision-miniature">
          <div className="miniature-top"><span className="brand-mark small">L</span><b>ASK LINC · SAMPLE ANSWER</b><span>ILLUSTRATIVE</span></div>
          <p className="miniature-question">Can we afford a $700K home without pausing retirement savings?</p>
          <div className="miniature-verdict"><i>✓</i><div><span>THE SHORT ANSWER</span><strong>Yes—if you put 15% down and keep at least $45K in cash.</strong></div></div>
          <div className="miniature-numbers"><span><small>DOWN PAYMENT</small><b>$105K</b></span><span><small>CASH LEFT</small><b>$48K</b></span><span><small>RETIREMENT</small><b>On track</b></span></div>
          <div className="miniature-take"><span>LINC’S TAKE</span><p>Cap total housing costs at $4,800 a month and keep both 401(k) contributions unchanged.</p></div>
          <Link href="/trust">∑ &nbsp;Show the math <span>→</span></Link>
        </article>
      </section>

      <section className="page-section shell" id="system">
        <div className="editorial-heading">
          <p className="section-kicker">START WITH THE DECISION, NOT THE DASHBOARD</p>
          <h2>One question. Five clear steps.</h2>
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
              <h2>Your whole financial picture stays connected to the answer.</h2>
            </div>
            <p>Ask Linc can use cash, spending, debt, investments, property, goals, current rates, rules, and market history. It does not pull everything into every answer—only what could change the decision.</p>
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
          </div>
        </div>
      </section>

      <PageCta title="What decision are you trying to make?" csOverrideId="cta-start-free-trial-mid" />
      <SiteFooter />
    </main>
  );
}
