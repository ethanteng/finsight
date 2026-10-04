import type { Metadata } from 'next';
import Link from 'next/link';
import StructuredData from '@/components/StructuredData';
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

const examples = [
  ['Can I afford the trip?', 'Add the cost and date. See what it does to your expected savings and lowest cash balance.'],
  ['What if my bonus is smaller?', 'Add the amount you actually expect and compare the next few months again.'],
  ['Should I pay off this card now?', 'Compare the cash you give up today with the balance and interest you may avoid later.'],
] as const;

export default function CashFlowForecastPage() {
  return (
    <main className="marketing-site subpage cash-flow-landing">
      <StructuredData data={applicationSchema} />
      <StructuredData data={faqSchema} />
      <SiteHeader />

      <section className="cash-flow-hero shell">
        <div className="cash-flow-hero-copy">
          <p className="section-kicker">PERSONAL CASH FLOW FORECAST</p>
          <h1>How much will you <em>actually have left?</em></h1>
          <p className="cash-flow-lede">
            Connect your checking, savings, and credit cards. Ask Linc uses what normally comes in and goes out to estimate
            what your cash could look like next month, next quarter, or next year.
          </p>
          <p className="cash-flow-lede cash-flow-lede-secondary">
            Then add the stuff your history can’t know yet — a bonus, a vacation, tuition, a big purchase, or paying down a card.
          </p>
          <div className="hero-actions">
            <MarketingGetStartedButton
              className="button button-primary"
              trackingLocation="cash_flow_hero"
              csOverrideId="cta-start-free-trial-cash-flow-hero"
              label="Build my forecast"
            />
            <Link className="text-link" href="#examples">See what you can test</Link>
          </div>
          <p className="microcopy">{TRIAL_CTA_MICROCOPY}</p>
        </div>

        <div className="cash-flow-preview" aria-label="Example personal cash flow forecast">
          <div className="cash-flow-preview-top">
            <div>
              <small>EXAMPLE FORECAST</small>
              <strong>Next 3 months</strong>
            </div>
            <span>Sample data</span>
          </div>
          <div className="cash-flow-preview-metrics">
            <div><small>Cash today</small><strong>$24,810</strong></div>
            <div><small>Expected to save</small><strong>+$6,240</strong></div>
            <div><small>Lowest point</small><strong>$17,920</strong></div>
          </div>
          <div className="cash-flow-preview-chart" role="img" aria-label="Example cash balance changing over three months">
            <div className="cash-flow-chart-grid" aria-hidden="true" />
            <svg viewBox="0 0 620 230" preserveAspectRatio="none" aria-hidden="true">
              <path className="cash-flow-chart-area" d="M0 126 C52 114, 84 154, 126 148 S203 102, 252 119 S328 168, 376 144 S461 76, 510 91 S570 61, 620 70 L620 230 L0 230 Z" />
              <path className="cash-flow-chart-line" d="M0 126 C52 114, 84 154, 126 148 S203 102, 252 119 S328 168, 376 144 S461 76, 510 91 S570 61, 620 70" />
            </svg>
            <div className="cash-flow-chart-labels"><span>Now</span><span>Next month</span><span>3 months</span></div>
          </div>
          <div className="cash-flow-preview-plans">
            <div><span className="cash-flow-plan-dot expense" />Vacation <strong>−$5,000</strong></div>
            <div><span className="cash-flow-plan-dot income" />Bonus <strong>+$8,000</strong></div>
            <div><span className="cash-flow-plan-dot card" />Card payment <strong>−$2,500</strong></div>
          </div>
        </div>
      </section>

      <section className="cash-flow-question-strip">
        <div className="shell">
          <span>THE QUESTIONS THIS IS FOR</span>
          <div>
            <p>“How much money will I have left?”</p>
            <p>“Can I afford this?”</p>
            <p>“How much can I spend?”</p>
          </div>
        </div>
      </section>

      <section className="page-section shell cash-flow-how" aria-labelledby="cash-flow-how-title">
        <div className="editorial-heading">
          <p className="section-kicker">START WITH YOUR REAL MONEY</p>
          <h2 id="cash-flow-how-title">See what usually happens. <em>Then add what you know is coming.</em></h2>
        </div>
        <div className="cash-flow-how-grid">
          <article>
            <span>01</span>
            <h3>What normally comes in</h3>
            <p>Regular paychecks and other recurring income from the accounts you connect.</p>
          </article>
          <article>
            <span>02</span>
            <h3>What normally goes out</h3>
            <p>Bills, everyday spending, credit-card activity, and the patterns in your transaction history.</p>
          </article>
          <article>
            <span>03</span>
            <h3>What you already know is coming</h3>
            <p>Add future income, expenses, and card payments that are not in your history yet.</p>
          </article>
          <article className="cash-flow-how-result">
            <span>04</span>
            <h3>What that leaves you with</h3>
            <p>Expected savings or shortfall, projected cash balances, and the lowest point along the way.</p>
          </article>
        </div>
      </section>

      <section className="cash-flow-examples" id="examples" aria-labelledby="cash-flow-examples-title">
        <div className="shell">
          <div className="cash-flow-examples-heading">
            <div>
              <p className="section-kicker light">TRY THE THING YOU’RE ACTUALLY WONDERING ABOUT</p>
              <h2 id="cash-flow-examples-title">Change one thing. <em>See what it does to the rest.</em></h2>
            </div>
            <p>You do not have to rebuild a spreadsheet every time a plan changes.</p>
          </div>
          <div className="cash-flow-example-grid">
            {examples.map(([question, answer]) => (
              <article key={question}>
                <small>ASK</small>
                <h3>“{question}”</h3>
                <p>{answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section shell cash-flow-correct" aria-labelledby="cash-flow-correct-title">
        <div className="cash-flow-correct-copy">
          <p className="section-kicker">YOU CAN CORRECT IT</p>
          <h2 id="cash-flow-correct-title">If a pattern is wrong, <em>change it.</em></h2>
          <p>
            Maybe a charge was a one-off. Maybe an old subscription is gone. Maybe a stopped paycheck is actually continuing.
            Ask Linc shows what it thinks belongs in the forecast and lets you change it.
          </p>
        </div>
        <div className="cash-flow-assumptions" aria-label="Example forecast assumptions">
          <div className="cash-flow-assumption-heading"><span>Count in forecast</span><span>Leave out</span></div>
          <div className="cash-flow-assumption-row"><strong>Payroll</strong><span>Every 2 weeks</span><button type="button" tabIndex={-1}>Counted</button></div>
          <div className="cash-flow-assumption-row"><strong>Mortgage</strong><span>Monthly</span><button type="button" tabIndex={-1}>Counted</button></div>
          <div className="cash-flow-assumption-row muted"><strong>Furniture purchase</strong><span>One time</span><button type="button" tabIndex={-1}>Left out</button></div>
        </div>
      </section>

      <section className="cash-flow-math">
        <div className="shell cash-flow-math-inner">
          <div>
            <p className="section-kicker light">THE AI DOESN’T GET TO MAKE UP THE NUMBERS</p>
            <h2>The forecast is calculated. <em>Then AI can help you think about it.</em></h2>
          </div>
          <div>
            <p>
              Cash flow, projected balances, planned events, and credit-card outcomes are computed by Ask Linc’s financial
              engine. The AI can explain the result and answer follow-up questions, but the arithmetic does not come from a chat response.
            </p>
            <Link className="light-link" href="/trust">See how Ask Linc checks the math <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>

      <section className="page-section shell cash-flow-faq" aria-labelledby="cash-flow-faq-title">
        <div className="cash-flow-faq-heading">
          <p className="section-kicker">PERSONAL CASH FLOW FORECAST FAQ</p>
          <h2 id="cash-flow-faq-title">A few things worth knowing.</h2>
        </div>
        <div className="cash-flow-faq-list">
          {faqs.map((item) => (
            <details key={item.question}>
              <summary>{item.question}<span aria-hidden="true">+</span></summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <PageCta title="See what your next few months could look like." label="Build my forecast" csOverrideId="cta-start-free-trial-cash-flow-bottom" />
      <SiteFooter />
    </main>
  );
}
