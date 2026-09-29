import type { Metadata } from 'next';
import Link from 'next/link';
import StructuredData from '@/components/StructuredData';
import { PageCta, SiteFooter, SiteHeader } from '@/components/marketing/SiteShell';
import { RETIREMENT_STORY_EXAMPLE } from '@/data/retirement-story-example';
import { buildMarketingMetadata } from '@/lib/seo';

const PATH = '/research/retire-55-vs-57';
const URL = 'https://asklinc.com' + PATH;

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Retire at 55 vs. 57: 685 Historical Market Tests | Ask Linc',
  description:
    'What changed when the same fictional household retired at 55 instead of 57? Ask Linc reran both plans across 685 overlapping historical market sequences.',
  path: PATH,
  imageAlt: 'Retire at 55 versus 57 historical retirement comparison',
});

const data = RETIREMENT_STORY_EXAMPLE;
const age55 = data.scenarios[0];
const age57 = data.scenarios[1];

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
  '@type': 'Article',
  headline: 'Retiring at 55 vs. 57: Results Across 685 Historical Market Sequences',
  description:
    'A controlled Ask Linc retirement scenario comparison holding spending, starting assets, Social Security, allocation, and life expectancy constant while changing retirement age from 55 to 57.',
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
};

export default function Retire55Vs57Page() {
  const extraPortfolio = age57.projectedPortfolioAtRetirement - age55.projectedPortfolioAtRetirement;
  const withdrawalRateDrop = age55.firstYearWithdrawalRate - age57.firstYearWithdrawalRate;
  const failuresAt55 = age55.sequencesTested - age55.sequencesSurvived;

  return (
    <main className="marketing-site subpage research-article">
      <StructuredData data={structuredData} />
      <SiteHeader />

      <section className="subhero centered-subhero shell">
        <p className="section-kicker">RETIREMENT SCENARIO STUDY</p>
        <h1>Retire at 55 or wait until 57?<em>We changed only the retirement date.</em></h1>
        <p className="subhero-copy">
          The household, spending, portfolio, Social Security, allocation, and life expectancy stayed the same.
          We moved retirement two years later and reran the plan across the same 685 historical sequences.
        </p>
      </section>

      <section className="page-section shell">
        <div className="editorial-heading">
          <p className="section-kicker">CONTROLLED COMPARISON</p>
          <h2>Everything below stayed constant except retirement age.</h2>
        </div>
        <div className="belief-grid">
          <article><span>ASSETS</span><h3>{money(data.inputs.investableAssets)}</h3><p>Starting investable assets at age {data.inputs.currentAge}.</p></article>
          <article><span>SPENDING</span><h3>{money(data.inputs.annualSpending)}/year</h3><p>Same annual retirement spending in both scenarios.</p></article>
          <article><span>SAVING</span><h3>{money(data.inputs.annualContributions)}/year</h3><p>Annual contributions continue until the selected retirement age.</p></article>
          <article><span>SOCIAL SECURITY</span><h3>{money(data.inputs.socialSecurityAnnual)}/year</h3><p>Same benefit beginning at age {data.inputs.socialSecurityStartAge}.</p></article>
        </div>
      </section>

      <section className="page-section values-band">
        <div className="shell">
          <div className="editorial-heading">
            <p className="section-kicker">55 VS. 57</p>
            <h2>Two years changed three important parts of the plan.</h2>
          </div>
          <div className="belief-grid">
            <article>
              <span>RETIRE AT 55</span>
              <h3>{age55.sequencesSurvived}/{age55.sequencesTested} histories lasted</h3>
              <p>{percent(age55.survivalRate)} of tested historical paths reached age {data.inputs.lifeExpectancy}; {failuresAt55} ran short.</p>
              <p>Modeled portfolio at retirement: <strong>{money(age55.projectedPortfolioAtRetirement)}</strong></p>
              <p>Initial portfolio withdrawal: <strong>{percent(age55.firstYearWithdrawalRate)}</strong></p>
            </article>
            <article>
              <span>RETIRE AT 57</span>
              <h3>{age57.sequencesSurvived}/{age57.sequencesTested} histories lasted</h3>
              <p>{percent(age57.survivalRate)} of tested historical paths reached age {data.inputs.lifeExpectancy}; none ran short in the tested set.</p>
              <p>Modeled portfolio at retirement: <strong>{money(age57.projectedPortfolioAtRetirement)}</strong></p>
              <p>Initial portfolio withdrawal: <strong>{percent(age57.firstYearWithdrawalRate)}</strong></p>
            </article>
            <article>
              <span>MORE CAPITAL</span>
              <h3>+{money(extraPortfolio)}</h3>
              <p>Two more years of saving and compounding increased modeled assets at retirement by roughly {money(extraPortfolio)} in this example.</p>
            </article>
            <article>
              <span>LOWER WITHDRAWAL PRESSURE</span>
              <h3>-{(withdrawalRateDrop * 100).toFixed(2)} percentage points</h3>
              <p>The first-year portfolio withdrawal rate fell from {percent(age55.firstYearWithdrawalRate)} to {percent(age57.firstYearWithdrawalRate)}.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="page-section shell">
        <div className="editorial-heading">
          <p className="section-kicker">WHY TWO YEARS MATTERED</p>
          <h2>The later date helped on both sides of the equation.</h2>
        </div>
        <p>
          Waiting until 57 did more than add two years of contributions. It also gave the existing portfolio two additional years before withdrawals began and shortened the period the portfolio needed to fund before age {data.inputs.lifeExpectancy}.
        </p>
        <p>
          In the age-55 scenario, the plan began with an initial portfolio withdrawal rate of {percent(age55.firstYearWithdrawalRate)} and failed in {failuresAt55} of the {age55.sequencesTested} historical paths tested.
          At 57, the modeled retirement portfolio was about {money(extraPortfolio)} larger and the initial withdrawal rate dropped to {percent(age57.firstYearWithdrawalRate)}.
          Across this particular historical test set, all {age57.sequencesTested} sequences then lasted through the modeled horizon.
        </p>
        <p>
          That does not mean age 57 is “safe” or that age 55 is “unsafe.” It means the two-year change created enough additional margin to survive every historical sequence in this specific model.
        </p>
      </section>

      <section className="page-section values-band">
        <div className="shell">
          <div className="editorial-heading">
            <p className="section-kicker">WHAT THIS DOES — AND DOESN’T — PROVE</p>
            <h2>Use historical testing to expose sensitivity, not to manufacture certainty.</h2>
          </div>
          <div className="belief-grid">
            <article>
              <span>DOES SHOW</span>
              <h3>How retirement timing changes margin</h3>
              <p>Holding the rest of the plan constant makes the effect of retirement age visible.</p>
            </article>
            <article>
              <span>DOES SHOW</span>
              <h3>Where weak historical paths appear</h3>
              <p>The age-55 plan failed in {failuresAt55} tested sequences, which is useful evidence about sensitivity to market order and timing.</p>
            </article>
            <article>
              <span>DOES NOT SHOW</span>
              <h3>A future success probability</h3>
              <p>The 685 windows overlap and history will not repeat exactly. {percent(age55.survivalRate)} historical survival is not a {percent(age55.survivalRate)} forecast.</p>
            </article>
            <article>
              <span>DOES NOT SHOW</span>
              <h3>A universal retirement age</h3>
              <p>This is one fictional household. Different spending, assets, taxes, allocation, pensions, Social Security, or longevity assumptions can change the result.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="page-section shell">
        <div className="editorial-heading">
          <p className="section-kicker">DATA & REPRODUCIBILITY</p>
          <h2>The numbers come from the same deterministic engine Ask Linc uses for retirement planning.</h2>
        </div>
        <p>
          The historical dataset spans July 1926 through June 2026. This example uses {data.history.sequencesTested} overlapping {data.history.horizonYears}-year retirement windows, with start months from July 1926 through July 1983.
          The snapshot was generated on {data.generatedOn}; its dataset fingerprint is <code>{data.datasetSha256}</code>.
        </p>
        <p>
          See the broader study, <Link href="/research/historical-retirement-outcomes">what changed the outcome across all three scenarios →</Link>, run your own inputs through the <Link href="/retirement-calculator">Ask Linc retirement calculator</Link>, or <Link href="/research">browse all Ask Linc research</Link>.
        </p>
      </section>

      <PageCta title="What would two more years change for your plan?" label="Test my plan" csOverrideId="cta-start-free-trial-research-55-57" />
      <SiteFooter />
    </main>
  );
}
