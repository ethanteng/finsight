import type { Metadata } from 'next';
import Link from 'next/link';
import StructuredData from '@/components/StructuredData';
import { PageCta, SiteFooter, SiteHeader } from '@/components/marketing/SiteShell';
import { buildMarketingMetadata } from '@/lib/seo';

const PATH = '/research';
const URL = 'https://asklinc.com' + PATH;

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Ask Linc Research | Financial Decisions Tested With Real Data',
  description:
    'Original Ask Linc research on retirement, Coast FIRE, sequence risk, and financial tradeoffs using deterministic models and historical market data.',
  path: PATH,
  imageAlt: 'Ask Linc financial planning research',
});

const studies = [
  {
    href: '/research/historical-retirement-outcomes',
    label: 'RETIREMENT · 685 HISTORICAL TESTS',
    title: 'What changed the outcome?',
    description:
      'One fictional household, three scenarios. We changed retirement age or spending and reran the plan across 685 overlapping historical market sequences.',
    finding: '620/685 histories lasted at 55 with $84k spending; 685/685 lasted after either of two controlled changes.',
  },
  {
    href: '/research/retire-55-vs-57',
    label: 'RETIREMENT AGE · CONTROLLED COMPARISON',
    title: 'Retire at 55 vs. 57',
    description:
      'Same household, spending, Social Security, allocation, and life expectancy. Only the retirement date changes.',
    finding: 'Two more working years added roughly $252k at retirement in this example and moved the tested result from 620/685 to 685/685.',
  },
  {
    href: '/research/sequence-of-returns-risk',
    label: 'SEQUENCE RISK · 685 HISTORICAL TESTS',
    title: 'How much does the order of returns matter?',
    description:
      'The plan is identical in every test. Only the historical market sequence changes—enough to produce both surviving and depleted outcomes.',
    finding: 'The same age-55 plan survived 620 histories and ran short in 65, showing why an average return can hide retirement risk.',
  },
  {
    href: '/research/coast-fire-contributions',
    label: 'COAST FIRE · CONTRIBUTION TRADEOFF',
    title: 'What if you nearly stop saving?',
    description:
      'We cut annual contributions from $45,000 to $5,000 for the same fictional household and held retirement age and spending constant.',
    finding: 'Both plans survived all 637 tested histories, but the lower-saving path reached retirement with about $541k less modeled capital.',
  },
] as const;

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Ask Linc Research',
  description:
    'Original financial planning research produced with Ask Linc deterministic models and historical datasets.',
  url: URL,
  publisher: {
    '@type': 'Organization',
    name: 'Ask Linc',
    url: 'https://asklinc.com',
  },
  mainEntity: {
    '@type': 'ItemList',
    itemListElement: studies.map((study, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: 'https://asklinc.com' + study.href,
      name: study.title,
    })),
  },
};

export default function ResearchPage() {
  return (
    <main className="marketing-site subpage">
      <StructuredData data={structuredData} />
      <SiteHeader />

      <section className="subhero centered-subhero shell">
        <p className="section-kicker">ASK LINC RESEARCH</p>
        <h1>Financial questions are more useful<em>when you can inspect the evidence.</em></h1>
        <p className="subhero-copy">
          These are controlled studies produced with Ask Linc’s deterministic financial models.
          We publish the inputs, calculations, historical coverage, limitations, and the result—not just the conclusion.
        </p>
      </section>

      <section className="page-section shell">
        <div className="editorial-heading">
          <p className="section-kicker">ORIGINAL STUDIES</p>
          <h2>Change one assumption. See what actually moves.</h2>
        </div>
        <div className="use-case-index">
          {studies.map((study, index) => (
            <Link className="use-case-tile" href={study.href} key={study.href}>
              <span>{String(index + 1).padStart(2, '0')} / {study.label}</span>
              <h2>{study.title}</h2>
              <p>{study.description}</p>
              <div className="use-case-question">
                <small>KEY RESULT</small>
                <b>{study.finding}</b>
              </div>
              <strong>Read the study <i>→</i></strong>
            </Link>
          ))}
        </div>
      </section>

      <section className="page-section values-band">
        <div className="shell">
          <div className="editorial-heading">
            <p className="section-kicker">RESEARCH STANDARD</p>
            <h2>Designed to be checked, not merely believed.</h2>
          </div>
          <div className="belief-grid">
            <article>
              <span>01</span>
              <h3>Controlled inputs</h3>
              <p>Each study states what changes and what stays fixed so the tradeoff is visible.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Deterministic calculations</h3>
              <p>The financial engine produces the numbers. The language model explains them; it does not invent them.</p>
            </article>
            <article>
              <span>03</span>
              <h3>Historical context</h3>
              <p>Where historical testing is used, we disclose the date range, window construction, and why overlapping histories are not probabilities.</p>
            </article>
            <article>
              <span>04</span>
              <h3>Limits in plain English</h3>
              <p>Every study names what the test cannot establish, including assumptions that could materially change the result.</p>
            </article>
          </div>
          <p>
            Want to see the mechanics behind the research? Read <Link href="/trust">how Ask Linc shows the math</Link> or try the <Link href="/retirement-calculator">retirement calculator</Link>.
          </p>
        </div>
      </section>

      <PageCta title="What assumption would you change?" label="Build my plan" csOverrideId="cta-start-free-trial-research-hub" />
      <SiteFooter />
    </main>
  );
}
