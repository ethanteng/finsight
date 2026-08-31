import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingGetStartedButton } from '@/components/marketing/MarketingGetStartedButton';
import { PageCta, SiteFooter, SiteHeader } from '@/components/marketing/SiteShell';

export const metadata: Metadata = {
  title: 'Career Change & Time Off — Use Cases | Ask Linc',
  description: 'See what a sabbatical, lower-paying job, layoff, or move to one income could change across cash, benefits, savings, and retirement.',
  alternates: {
    canonical: 'https://asklinc.com/use-cases/career-change',
  },
  robots: {
    index: true,
    follow: true,
  },
};

const levers = [
  ['Time away from work', 'Compare three months, six months, or a full year away and see how much cash the plan needs.'],
  ['Income after the change', 'Test a lower salary, one-income household, or a slower return to full-time work.'],
  ['Benefits and healthcare', 'Include insurance and other costs that used to come through an employer.'],
  ['Retirement savings', 'See what happens if contributions pause—and what it would take to catch back up.'],
];

export default function CareerChangeUseCaseRoute() {
  return (
    <main className="marketing-site subpage use-case-page blue">
      <SiteHeader />
      <section className="subhero shell use-case-hero">
        <div>
          <Link href="/use-cases" className="back-link">← All questions</Link>
          <p className="section-kicker">05 / CAREER CHANGE &amp; TIME OFF</p>
          <h1>Know what stepping away from work really changes.</h1>
          <p className="subhero-copy">
            Changing jobs, taking a sabbatical, or going down to one income affects more than your paycheck.
            See what it does to cash, benefits, savings, and the plans that come after it.
          </p>
          <MarketingGetStartedButton className="button button-primary" csOverrideId="cta-start-free-trial-hero" />
        </div>
        <article className="use-case-answer">
          <div className="miniature-top"><span className="brand-mark small">L</span><b>SAMPLE DECISION</b><span>ILLUSTRATIVE</span></div>
          <p>Can I take a year off without setting retirement back?</p>
          <div className="use-case-verdict">
            <small>THE SHORT ANSWER</small>
            <h2>Yes—if you keep about 12 months of spending in cash and restart retirement contributions when you return.</h2>
            <span>The year off uses part of the cash cushion, but the long-term plan stays workable if spending stays near the current level and contributions resume on schedule.</span>
          </div>
          <div className="use-case-metrics">
            <span><small>TIME OFF</small><b>12 mo</b></span>
            <span><small>CASH NEEDED</small><b>~$72K</b></span>
            <span><small>RETIREMENT</small><b>Still on track</b></span>
          </div>
          <div className="use-case-check">∑ &nbsp;Open Show the Math to see the numbers behind the answer.</div>
        </article>
      </section>

      <section className="decision-levers shell">
        <div className="editorial-heading">
          <p className="section-kicker">WHAT COULD CHANGE THE ANSWER?</p>
          <h2>Change one thing. See what happens.</h2>
        </div>
        <div className="lever-grid">
          {levers.slice(0, 3).map(([title, copy], index) => (
            <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{copy}</p></article>
          ))}
        </div>
      </section>

      <section className="case-context dark-band">
        <div className="shell case-context-inner">
          <div>
            <p className="section-kicker light">WHAT COULD CHANGE THE ANSWER?</p>
            <h2>The parts of the plan that move with your job.</h2>
          </div>
          <div className="context-chips" aria-label="Career change planning inputs">
            {['Cash reserve', 'Monthly spending', 'Income + benefits', 'Health insurance', 'Retirement contributions'].map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
      </section>

      <section className="other-cases shell">
        <span>EXPLORE ANOTHER DECISION</span>
        <Link href="/use-cases/home-buying">BUYING A HOME<b>→</b></Link>
        <Link href="/use-cases/family-planning">GROWING A FAMILY<b>→</b></Link>
        <Link href="/use-cases/retirement">RETIREMENT<b>→</b></Link>
        <Link href="/use-cases/portfolio-analysis">INVESTMENTS<b>→</b></Link>
      </section>

      <PageCta title="Bring the work decision you are weighing to Linc." csOverrideId="cta-start-free-trial-mid" />
      <SiteFooter />
    </main>
  );
}
