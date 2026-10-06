import type { Metadata } from 'next';
import Link from 'next/link';
import StructuredData from '@/components/StructuredData';
import { MarketingGetStartedButton } from '@/components/marketing/MarketingGetStartedButton';
import { TeaserVideo } from '@/components/marketing/TeaserVideo';
import { PageCta, SiteFooter, SiteHeader } from '@/components/marketing/SiteShell';
import { TRIAL_CTA_MICROCOPY } from '@/components/marketing/trial-copy';
import CashFlowSampleCapture from '@/components/marketing/CashFlowSampleCapture';
import { CASH_FLOW_SIGNUP_HREF } from '@/lib/cash-flow-signup';
import { buildMarketingMetadata } from '@/lib/seo';

const canonical = 'https://asklinc.com/cash-flow-forecast';
const description =
  'See what you are likely to have left after income, spending, and the things you already know are coming. Ask Linc builds a personal cash flow forecast from your real accounts.';

export const metadata: Metadata = {
  ...buildMarketingMetadata({
    title: 'Personal Cash Flow Forecast App | Ask Linc',
    description,
    path: '/cash-flow-forecast',
    imageAlt: 'Ask Linc personal cash flow forecast',
  }),
  keywords: [
    'personal cash flow forecast',
    'cash flow forecast app',
    'cash flow planner',
    'cash flow forecasting',
    'personal cash flow calculator',
    'cash flow forecast tool',
  ],
};

const applicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Ask Linc Cash Flow Forecast',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  url: canonical,
  description,
  provider: {
    '@type': 'Organization',
    name: 'Ask Linc',
    url: 'https://asklinc.com',
  },
  featureList: [
    'Personal cash flow forecasting from connected checking, savings, and credit cards',
    'Projected savings and cash balances',
    'Planned income and expense scenarios',
    'Credit-card payment and interest projections',
    'Inspectable forecast assumptions',
  ],
};

const faqs = [
  {
    question: 'Is this a budgeting app?',
    answer:
      'Not really. You do not have to put every dollar into a category or build a monthly budget. The point is to understand what you are likely to have left and how a decision changes that.',
  },
  {
    question: 'Can I add something that has not happened yet?',
    answer:
      'Yes. Add future income or expenses like a bonus, trip, tuition bill, large purchase, or credit-card payment and see how they change your forecast.',
  },
  {
    question: 'How far ahead can I look?',
    answer:
      'You can look ahead over the next month, quarter, year, or another period that matters to you.',
  },
  {
    question: 'Does AI calculate the forecast?',
    answer:
      'No. The underlying cash-flow numbers are calculated outside the language model. AI helps explain the result and reason through your options.',
  },
] as const;

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: { '@type': 'Answer', text: item.answer },
  })),
};

const forecastInputs = [
  ['Money coming in', 'Paychecks and other recurring income from your connected accounts.'],
  ['Money going out', 'Bills, everyday spending, credit cards, and other regular expenses.'],
  ['Then add what’s coming', 'A trip. A bonus. Tuition. A big purchase. Paying off a card.'],
] as const;

const scenarios = [
  ['Can I afford the trip?', 'Add the cost and timing. See what you will have left afterward.'],
  ['What if my bonus is smaller?', 'Change the amount and see how the next few months look.'],
  ['Should I pay off this card now?', 'See what happens to your cash — and what you could save in interest.'],
] as const;

const questions = [
  'How much money will I have left?',
  'Can I afford this?',
  'How much can I spend this month?',
  'Will I run short before my next paycheck?',
  'What if this expense is bigger than I planned?',
  'What happens if I pay this card off now?',
] as const;

export default function CashFlowForecastPage() {
  return (
    <main className="marketing-site subpage use-case-page lime">
      <StructuredData data={applicationSchema} />
      <StructuredData data={faqSchema} />
      <SiteHeader />

      <section className="story-hero shell">
        <p className="section-kicker">PERSONAL CASH FLOW FORECAST</p>
        <h1>See your future cash. Make better plans.</h1>
        <p className="story-hero-copy">
          Forecast your cash after income, bills, and upcoming plans. Add a vacation, bonus, or big purchase and see what changes.
        </p>
        <div className="hero-actions">
          <MarketingGetStartedButton
            className="button button-primary"
            trackingLocation="cash_flow_hero"
            csOverrideId="cta-start-free-trial-cash-flow-hero"
            label="Build my forecast"
            href={CASH_FLOW_SIGNUP_HREF}
          />
        </div>
        <p className="microcopy">{TRIAL_CTA_MICROCOPY}</p>
        <TeaserVideo configItem="cash-flow-video" title="Ask Linc cash flow demo" />
      </section>

      <section className="decision-levers shell">
        <div className="editorial-heading">
          <p className="section-kicker">START WITH WHAT USUALLY HAPPENS</p>
          <h2>Use your real cash flow.<br /><em>Then add what&apos;s coming.</em></h2>
        </div>
        <div className="lever-grid">
          {forecastInputs.map(([title, copy], index) => (
            <article key={title}>
              <span>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="decision-levers shell">
        <div className="editorial-heading">
          <p className="section-kicker">CHANGE ONE THING</p>
          <h2>See how one decision<br /><em>changes the rest.</em></h2>
        </div>
        <div className="lever-grid">
          {scenarios.map(([title, copy], index) => (
            <article key={title}>
              <span>0{index + 1}</span>
              <h3>“{title}”</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cash-flow-sample-section shell" aria-label="Get a sample forecast by email">
        <CashFlowSampleCapture />
      </section>

      <section className="case-context dark-band">
        <div className="shell case-context-inner">
          <div>
            <p className="section-kicker light">LOOK AHEAD</p>
            <h2>Your bank app tells you what you spent. <span className="case-context-accent">Ask Linc helps answer what you can afford.</span></h2>
          </div>
          <div className="context-chips" aria-label="Questions Ask Linc can help answer">
            {questions.map((question) => <span key={question}>{question}</span>)}
          </div>
        </div>
      </section>

      <section className="use-case-bridge">
        <div className="shell">
          <p className="section-kicker">IF SOMETHING LOOKS WRONG</p>
          <h2>Fix the assumption.</h2>
          <p>
            Maybe that big charge was a one-time purchase. Maybe you canceled that subscription. Maybe an old paycheck
            should still be counted. Ask Linc shows what it thinks belongs in your forecast so you can correct it instead
            of working around a bad assumption.
          </p>
        </div>
      </section>

      <section className="case-context dark-band">
        <div className="shell case-context-inner">
          <div>
            <p className="section-kicker light">SHOW THE MATH</p>
            <h2>The AI doesn&apos;t make up the math.</h2>
          </div>
          <div className="context-chips" aria-label="How Ask Linc calculates cash flow">
            <span>Cash flow is calculated by the financial engine</span>
            <span>AI helps explain the result</span>
            <span>The underlying numbers stay inspectable</span>
            <Link className="light-link" href="/trust">See how Ask Linc checks the math →</Link>
          </div>
        </div>
      </section>

      <section className="page-section shell compact-faq" aria-labelledby="cash-flow-faq-title">
        <div>
          <p className="section-kicker">CASH FLOW FAQ</p>
          <h2 id="cash-flow-faq-title">A few things worth knowing.</h2>
        </div>
        <div>
          {faqs.map((item) => (
            <details key={item.question}>
              <summary>{item.question}<span aria-hidden="true">+</span></summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <PageCta
        title="Can I afford it?"
        copy="See what you’ll have left before you decide."
        label="Build my forecast"
        csOverrideId="cta-start-free-trial-cash-flow-bottom"
        href={CASH_FLOW_SIGNUP_HREF}
      />
      <SiteFooter />
    </main>
  );
}
