import type { Metadata } from 'next';
import Link from 'next/link';
import StructuredData from '@/components/StructuredData';
import { PageCta, SiteFooter, SiteHeader } from '@/components/marketing/SiteShell';
import { RETIREMENT_STORY_EXAMPLE } from '@/data/retirement-story-example';
import { buildMarketingMetadata } from '@/lib/seo';

const PATH = '/research/historical-retirement-outcomes';
const URL = 'https://asklinc.com' + PATH;

export const metadata: Metadata = buildMarketingMetadata({
  title: '685 Historical Retirement Tests: What Changed the Outcome? | Ask Linc',
  description:
    'Ask Linc tested one fictional retirement plan across 685 overlapping historical market sequences. See how retirement age and spending changed the result.',
  path: PATH,
  imageAlt: 'Ask Linc historical retirement stress-test research',
});

const data = RETIREMENT_STORY_EXAMPLE;
const age55 = data.scenarios[0];
const age57 = data.scenarios[1];
const lowerSpending = data.spendingAlternative;

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
      headline: 'We Tested 685 Historical Retirement Starting Points. Here’s What Changed the Outcome.',
      description:
        'A reproducible Ask Linc retirement stress test showing how two years of additional work or lower annual spending changed historical plan outcomes.',
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
      name: 'Ask Linc 685-sequence retirement stress-test example',
      description:
        'A fictional household tested against 685 overlapping historical U.S. retirement sequences using Ask Linc’s deterministic retirement planning engine.',
      url: URL,
      temporalCoverage: '1926-07/2026-06',
      creator: {
        '@type': 'Organization',
        name: 'Ask Linc',
        url: 'https://asklinc.com',
      },
      variableMeasured: [
        'retirement age',
        'annual spending',
        'historical sequences survived',
        'initial withdrawal rate',
        'modeled portfolio at retirement',
      ],
    },
  ],
};

export default function HistoricalRetirementOutcomesPage() {
  const failuresAt55 = age55.sequencesTested - age55.sequencesSurvived;
  const portfolioDifference = age57.projectedPortfolioAtRetirement - age55.projectedPortfolioAtRetirement;

  return (
    <main className="marketing-site subpage research-article">
      <StructuredData data={structuredData} />
      <SiteHeader />

      <section className="subhero centered-subhero shell">
        <p className="section-kicker">ASK LINC RESEARCH</p>
        <h1>We tested 685 historical retirement starting points.<em>Two changes erased every shortfall in this example.</em></h1>
        <p className="subhero-copy">
          One fictional household. The same portfolio, Social Security assumption, and life expectancy.
          We changed only retirement age or spending, then reran the plan across 685 overlapping historical market sequences.
        </p>
      </section>

      <section className="page-section shell">
        <div className="editorial-heading">
          <p className="section-kicker">THE SETUP</p>
          <h2>A deliberately simple question: what actually changes the outcome?</h2>
        </div>
        <div className="belief-grid">
          <article>
            <span>01</span>
            <h3>{money(data.inputs.investableAssets)} invested</h3>
            <p>The fictional household starts at age {data.inputs.currentAge} with a balanced allocation and contributes {money(data.inputs.annualContributions)} per year until retirement.</p>
          </article>
          <article>
            <span>02</span>
            <h3>{money(data.inputs.annualSpending)} annual spending</h3>
            <p>The baseline plan assumes retirement spending of {money(data.inputs.annualSpending)} per year through age {data.inputs.lifeExpectancy}.</p>
          </article>
          <article>
            <span>03</span>
            <h3>{money(data.inputs.socialSecurityAnnual)} Social Security</h3>
            <p>The example assumes annual Social Security of {money(data.inputs.socialSecurityAnnual)} beginning at age {data.inputs.socialSecurityStartAge}.</p>
          </article>
          <article>
            <span>04</span>
            <h3>685 historical sequences</h3>
            <p>Each scenario was run across {data.history.sequencesTested} overlapping historical retirement windows drawn from U.S. market history beginning in July 1926.</p>
          </article>
        </div>
      </section>

      <section className="page-section values-band">
        <div className="shell">
          <div className="editorial-heading">
            <p className="section-kicker">THE RESULTS</p>
            <h2>Three scenarios. Same household. Very different historical outcomes.</h2>
          </div>
          <div className="belief-grid">
            <article>
              <span>RETIRE AT 55</span>
              <h3>{age55.sequencesSurvived} of {age55.sequencesTested} histories lasted</h3>
              <p>
                At {money(age55.annualSpending)} of annual spending, the plan lasted through age {data.inputs.lifeExpectancy} in {percent(age55.survivalRate)} of tested historical sequences.
                {' '}{failuresAt55} histories ran short.
              </p>
              <p>Initial portfolio withdrawal: <strong>{percent(age55.firstYearWithdrawalRate)}</strong>.</p>
            </article>
            <article>
              <span>RETIRE AT 55, SPEND LESS</span>
              <h3>{lowerSpending.sequencesSurvived} of {lowerSpending.sequencesTested} histories lasted</h3>
              <p>
                Keeping retirement at 55 but lowering annual spending by {money(data.inputs.annualSpending - lowerSpending.annualSpending)} eliminated every historical shortfall in this test.
              </p>
              <p>Initial portfolio withdrawal: <strong>{percent(lowerSpending.firstYearWithdrawalRate)}</strong>.</p>
            </article>
            <article>
              <span>RETIRE AT 57</span>
              <h3>{age57.sequencesSurvived} of {age57.sequencesTested} histories lasted</h3>
              <p>
                Working two additional years while keeping spending at {money(age57.annualSpending)} also eliminated every historical shortfall in this test.
              </p>
              <p>Initial portfolio withdrawal: <strong>{percent(age57.firstYearWithdrawalRate)}</strong>.</p>
            </article>
            <article>
              <span>WHAT CHANGED</span>
              <h3>Time and spending both created margin</h3>
              <p>
                Retiring at 57 produced about {money(portfolioDifference)} more modeled assets at retirement than retiring at 55, while the lower-spending scenario reduced the amount the portfolio had to support each year.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="page-section shell">
        <div className="editorial-heading">
          <p className="section-kicker">THE TAKEAWAY</p>
          <h2>The useful question was not “does retirement work?” It was “which lever changes the answer?”</h2>
        </div>
        <p>
          In this example, the baseline age-55 plan was not a binary failure: it survived most tested histories.
          But the weak historical sequences exposed how close the plan was to the edge. Two different changes created enough margin to remove those shortfalls from the historical record we tested: working two more years, or reducing annual spending by {money(data.inputs.annualSpending - lowerSpending.annualSpending)}.
        </p>
        <p>
          That is why Ask Linc treats retirement planning as a scenario problem rather than a single-number problem.
          The point is not to produce one confident answer; it is to show which assumptions are doing the work.
        </p>
        <p>
          For the focused age comparison, see <Link href="/research/retire-55-vs-57">Retiring at 55 vs. 57 across the same 685 historical sequences →</Link>
        </p>
      </section>

      <section className="page-section values-band">
        <div className="shell">
          <div className="editorial-heading">
            <p className="section-kicker">METHODOLOGY & LIMITS</p>
            <h2>Historical stress tests are evidence—not probabilities.</h2>
          </div>
          <div className="belief-grid">
            <article>
              <span>DATA</span>
              <h3>July 1926–June 2026</h3>
              <p>The underlying historical dataset spans July 1926 through June 2026. The tested retirement start months run from July 1926 through July 1983.</p>
            </article>
            <article>
              <span>WINDOWS</span>
              <h3>{data.history.horizonYears}-year retirement horizon</h3>
              <p>Each tested sequence models the household through age {data.inputs.lifeExpectancy}. Because the histories overlap, the 685 tests are not 685 independent observations.</p>
            </article>
            <article>
              <span>ENGINE</span>
              <h3>Deterministic calculation</h3>
              <p>The results were generated by Ask Linc’s retirement quick-plan engine. The language model does not calculate these outcomes.</p>
            </article>
            <article>
              <span>LIMIT</span>
              <h3>Past markets are not future odds</h3>
              <p>A result such as 620 of 685 is a count of tested historical paths, not a 90.5% forecast of future retirement success.</p>
            </article>
          </div>
          <p>
            Snapshot generated {data.generatedOn}. Dataset fingerprint: <code>{data.datasetSha256}</code>.
            {' '}Explore the <Link href="/retirement-calculator">retirement calculator</Link>, read how Ask Linc <Link href="/trust">shows the math behind its answers</Link>, or <Link href="/research">browse all Ask Linc research</Link>.
          </p>
        </div>
      </section>

      <PageCta title="Change the assumption, not the spreadsheet." label="Build my plan" csOverrideId="cta-start-free-trial-research-historical" />
      <SiteFooter />
    </main>
  );
}
