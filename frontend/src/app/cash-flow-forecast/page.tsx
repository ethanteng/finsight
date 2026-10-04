import type { Metadata } from 'next';
import Link from 'next/link';
import StructuredData from '@/components/StructuredData';
import LincAvatar from '@/components/LincAvatar';
import { MarketingGetStartedButton } from '@/components/marketing/MarketingGetStartedButton';
import { PageCta, SiteFooter, SiteHeader } from '@/components/marketing/SiteShell';
import { TRIAL_CTA_MICROCOPY } from '@/components/marketing/trial-copy';
import { buildMarketingMetadata } from '@/lib/seo';

const canonical = 'https://asklinc.com/cash-flow-forecast';
const description =
  'See how much money you may have left next month, next quarter, or next year. Ask Linc builds a personal cash flow forecast from your real accounts and lets you add upcoming expenses, income, and credit-card payments.';

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
    question: 'What is a personal cash flow forecast?',
    answer:
      'It is an estimate of how much money may come in, go out, and remain over a future period. Ask Linc builds the forecast from connected account history, regular income and spending, and future items you add.',
  },
  {
    question: 'Is this another budgeting app?',
    answer:
      'No. The cash flow view is focused on what your money may look like over the coming weeks and months, not on assigning every dollar to a category or enforcing a monthly budget.',
  },
  {
    question: 'Can I add expenses or income that have not happened yet?',
    answer:
      'Yes. You can add planned items such as a bonus, vacation, tuition bill, large purchase, or credit-card payment and see how they change the forecast.',
  },
  {
    question: 'Does the AI calculate the cash flow numbers?',
    answer:
      'No. The cash flow figures are calculated by Ask Linc’s backend financial engine. The AI can help explain the result and answer questions about it, but it does not invent the underlying arithmetic.',
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
  ['What normally comes in', 'Regular paychecks and other recurring income from the accounts you connect.'],
  ['What normally goes out', 'Bills, everyday spending, credit-card activity, and the patterns in your transaction history.'],
  ['What you already know is coming', 'Add a bonus, vacation, tuition bill, big purchase, or card payment that has not happened yet.'],
] as const;

const questions = [
  'How much money will I have left?',
  'Can I afford the trip?',
  'How much can I spend this month?',
  'What if my bonus is smaller?',
  'Should I pay off this card now?',
] as const;

export default function CashFlowForecastPage() {
  return (
    <main className="marketing-site subpage use-case-page lime">
      <StructuredData data={applicationSchema} />
      <StructuredData data={faqSchema} />
      <SiteHeader />

      <section className="subhero shell use-case-hero">
        <div>
          <p className="section-kicker">PERSONAL CASH FLOW FORECAST</p>
          <h1>How much will you actually have left?</h1>
          <p className="subhero-copy">
            Connect your checking, savings, and credit cards. Ask Linc uses what normally comes in and goes out,
            then lets you add the things you already know are coming — a bonus, a trip, tuition, a big purchase,
            or paying down a card.
          </p>
          <MarketingGetStartedButton
            className="button button-primary"
            trackingLocation="cash_flow_hero"
            csOverrideId="cta-start-free-trial-cash-flow-hero"
            label="Build my forecast"
          />
          <p className="microcopy">{TRIAL_CTA_MICROCOPY}</p>
        </div>

        <article className="use-case-answer">
          <div className="miniature-top">
            <LincAvatar size={26} />
            <b>EXAMPLE CASH FLOW</b>
            <span>ILLUSTRATIVE</span>
          </div>
          <p>What will my cash look like over the next three months?</p>
          <div className="use-case-verdict">
            <small>THE SHORT ANSWER</small>
            <h2>You&apos;re projected to save about $6,240.</h2>
            <span>
              That includes your usual income and spending plus the plans you added. Your projected cash stays above
              $17,920 along the way.
            </span>
          </div>
          <div className="use-case-metrics">
            <span><small>CASH TODAY</small><b>$24,810</b></span>
            <span><small>EXPECTED TO SAVE</small><b>+$6,240</b></span>
            <span><small>LOWEST POINT</small><b>$17,920</b></span>
          </div>
          <div className="use-case-check">Add the trip, bonus, or card payment and recalculate the forecast.</div>
        </article>
      </section>

      <section className="decision-levers shell">
        <div className="editorial-heading">
          <p className="section-kicker">WHAT THE FORECAST USES</p>
          <h2>Start with what normally happens.<br /><em>Then add what&apos;s coming.</em></h2>
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

      <section className="case-context dark-band">
        <div className="shell case-context-inner">
          <div>
            <p className="section-kicker light">THE QUESTIONS THIS IS FOR</p>
            <h2>Ask the thing you actually want to know.</h2>
          </div>
          <div className="context-chips" aria-label="Example cash flow questions">
            {questions.map((question) => <span key={question}>{question}</span>)}
          </div>
        </div>
      </section>

      <section className="use-case-bridge">
        <div className="shell">
          <p className="section-kicker">IF THE FORECAST GETS SOMETHING WRONG</p>
          <h2>Fix the assumption instead of working around it.</h2>
          <p>
            A one-time purchase should not become your normal monthly spending. An old subscription may be gone.
            A paycheck that stopped may actually be continuing. Ask Linc shows what it thinks belongs in the forecast
            and lets you change it. The cash-flow math is calculated by the financial engine rather than invented by
            the language model. <Link href="/trust">See how Ask Linc checks the math →</Link>
          </p>
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
        title="See what your next few months could look like."
        label="Build my forecast"
        csOverrideId="cta-start-free-trial-cash-flow-bottom"
      />
      <SiteFooter />
    </main>
  );
}
