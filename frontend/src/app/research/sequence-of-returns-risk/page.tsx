import type { Metadata } from 'next';
import Link from 'next/link';
import StructuredData from '@/components/StructuredData';
import { PageCta, SiteFooter, SiteHeader } from '@/components/marketing/SiteShell';
import { RETIREMENT_STORY_EXAMPLE } from '@/data/retirement-story-example';
import { buildMarketingMetadata } from '@/lib/seo';

const PATH = '/research/sequence-of-returns-risk';
const URL = 'https://asklinc.com' + PATH;
const data = RETIREMENT_STORY_EXAMPLE;
const scenario = data.scenarios[0];

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Sequence-of-Returns Risk: 685 Historical Retirement Tests | Ask Linc',
  description:
    'Ask Linc ran the same retirement plan across 685 overlapping historical market sequences. The plan survived 620 and ran short in 65—without changing the household.',
  path: PATH,
  imageAlt: 'Ask Linc sequence of returns risk historical study',
});

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value: number) {
  return (value * 100).toFixed(1) + '%';
}

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Article',
      headline: 'Sequence-of-Returns Risk: What 685 Historical Retirement Tests Show',
      description:
        'A controlled Ask Linc study showing how the same retirement plan can survive or deplete depending on the historical order of market returns.',
      url: URL,
      datePublished: '2026-09-29',
      dateModified: '2026-09-29',
      author: {
        '@type': 'Person',
        name: 'Ethan Teng',
        url: 'https://asklinc.com/about',
      },
      publisher: {
        '@type': 'Organization',
        name: 'Ask Linc',
        url: 'https://asklinc.com',
      },
      mainEntityOfPage: URL,
    },
    {
      '@type': 'Dataset',
      name: 'Ask Linc sequence-of-returns retirement stress test',
      description:
        'A fictional age-55 retirement plan tested against 685 overlapping historical U.S. market sequences from the Ask Linc retirement engine.',
      url: URL,
      temporalCoverage: '1926-07/2026-06',
      creator: {
        '@type': 'Organization',
        name: 'Ask Linc',
        url: 'https://asklinc.com',
      },
      variableMeasured: [
        'historical sequence',
        'retirement survival',
        'retirement age',
        'annual spending',
        'initial withdrawal rate',
      ],
    },
  ],
};

export default function SequenceOfReturnsRiskPage() {
  const failures = scenario.sequencesTested - scenario.sequencesSurvived;

  return (
    <main className="marketing-site subpage research-article">
      <StructuredData data={structuredData} />
      <SiteHeader />

      <section className="subhero centered-subhero shell">
        <p className="section-kicker">SEQUENCE-OF-RETURNS STUDY</p>
        <h1>Same plan. Different market sequence.<em>65 outcomes ran short.</em></h1>
        <p className="subhero-copy">
          We held retirement age, spending, Social Security, contributions, allocation, and life expectancy constant.
          Then Ask Linc replayed the plan across {scenario.sequencesTested} overlapping historical market sequences.
        </p>
      </section>

      <section className="page-section shell">
        <div className="editorial-heading">
          <p className="section-kicker">THE PLAN</p>
          <h2>One retirement plan, tested over and over against different starting markets.</h2>
        </div>
        <div className="belief-grid">
          <article>
            <span>RETIRE</span>
            <h3>Age {scenario.retirementAge}</h3>
            <p>The fictional household begins retirement at 55 and models the plan through age {data.inputs.lifeExpectancy}.</p>
          </article>
          <article>
            <span>SPEND</span>
            <h3>{money(scenario.annualSpending)}/year</h3>
            <p>Annual retirement spending stays fixed in the model rather than changing from one historical test to another.</p>
          </article>
          <article>
            <span>STARTING ASSETS</span>
            <h3>{money(data.inputs.investableAssets)}</h3>
            <p>The household starts at age {data.inputs.currentAge} with the same investable assets and the same balanced allocation in every test.</p>
          </article>
          <article>
            <span>SOCIAL SECURITY</span>
            <h3>{money(data.inputs.socialSecurityAnnual)}/year</h3>
            <p>The same Social Security assumption begins at age {data.inputs.socialSecurityStartAge} in every historical sequence.</p>
          </article>
        </div>
      </section>

      <section className="page-section values-band">
        <div className="shell">
          <div className="editorial-heading">
            <p className="section-kicker">THE RESULT</p>
            <h2>Same plan. {scenario.sequencesSurvived} histories lasted. {failures} did not.</h2>
          </div>
          <div className="belief-grid">
            <article>
              <span>SURVIVED</span>
              <h3>{scenario.sequencesSurvived} of {scenario.sequencesTested}</h3>
              <p>The plan lasted through age {data.inputs.lifeExpectancy} in {percent(scenario.survivalRate)} of the historical windows tested.</p>
            </article>
            <article>
              <span>RAN SHORT</span>
              <h3>{failures} histories</h3>
              <p>Nothing about the household changed in those tests. The difference was the order and timing of historical returns and inflation.</p>
            </article>
            <article>
              <span>INITIAL WITHDRAWAL</span>
              <h3>{percent(scenario.firstYearWithdrawalRate)}</h3>
              <p>The first-year portfolio withdrawal is the same at the start of each test; what follows is a different historical market path.</p>
            </article>
            <article>
              <span>HORIZON</span>
              <h3>{data.history.horizonYears} years</h3>
              <p>Each historical path is long enough to cover the full modeled horizon, rather than stopping after a few favorable years.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="page-section shell">
        <div className="editorial-heading">
          <p className="section-kicker">WHY ORDER MATTERS</p>
          <h2>An average return can hide the thing retirement withdrawals make dangerous.</h2>
        </div>
        <p>
          A retiree is not simply compounding money. They are also withdrawing from the portfolio.
          A large decline early in retirement can force more assets to be sold while prices are depressed, leaving less capital available for a later recovery.
          The same disappointing returns arriving much later can be materially easier for a plan to absorb.
        </p>
        <p>
          That is why Ask Linc does not judge this plan using one assumed average market return.
          The engine replays complete historical paths month by month. In this example, that produced both successful and depleted outcomes from the exact same household assumptions.
        </p>
      </section>

      <section className="page-section values-band">
        <div className="shell">
          <div className="editorial-heading">
            <p className="section-kicker">THE BAD STARTS MATTER</p>
            <h2>A retirement model should not quietly delete difficult history.</h2>
          </div>
          <p>
            Ask Linc’s retirement engine explicitly preserves historically difficult starts such as 1929, 1937, 1966, and 1973 when constructing full-history tests.
            Those periods matter because removing early bad sequences can make the same retirement plan look materially safer.
          </p>
          <p>
            The test set for this example starts in July 1926 and runs through July 1983, using market data through June 2026.
            Every tested start has enough data to cover the full {data.history.horizonYears}-year modeled horizon.
          </p>
        </div>
      </section>

      <section className="page-section shell">
        <div className="editorial-heading">
          <p className="section-kicker">WHAT THIS PROVES</p>
          <h2>Sequence risk is not an abstract warning in this plan—it changes the observed outcome.</h2>
        </div>
        <div className="belief-grid">
          <article>
            <span>DOES SHOW</span>
            <h3>Path dependency</h3>
            <p>The same plan produced both surviving and depleted outcomes solely across different historical market paths.</p>
          </article>
          <article>
            <span>DOES SHOW</span>
            <h3>Why stress testing matters</h3>
            <p>A single expected return would collapse all {scenario.sequencesTested} historical paths into one number and hide the {failures} failures.</p>
          </article>
          <article>
            <span>DOES NOT SHOW</span>
            <h3>A future probability</h3>
            <p>{percent(scenario.survivalRate)} historical survival is not a {percent(scenario.survivalRate)} forecast. The windows overlap and the future can differ from the past.</p>
          </article>
          <article>
            <span>DOES NOT SHOW</span>
            <h3>A universal safe withdrawal rate</h3>
            <p>This result belongs to this household, horizon, spending level, income timing, and allocation.</p>
          </article>
        </div>
        <p>
          Next: see <Link href="/research/historical-retirement-outcomes">which changes eliminated the 65 historical shortfalls →</Link> or <Link href="/research">browse all Ask Linc research</Link>.
        </p>
      </section>

      <PageCta title="Stress-test the path, not just the average." label="Test my plan" csOverrideId="cta-start-free-trial-research-sequence" />
      <SiteFooter />
    </main>
  );
}
