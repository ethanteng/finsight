import type { Metadata } from 'next';
import Link from 'next/link';
import StructuredData from '@/components/StructuredData';
import { PageCta, SiteFooter, SiteHeader } from '@/components/marketing/SiteShell';
import { DEMO_RETIREMENT_RESULTS } from '@/data/demo-retirement-results';
import { buildMarketingMetadata } from '@/lib/seo';

const PATH = '/research/coast-fire-contributions';
const URL = 'https://asklinc.com' + PATH;

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Coast FIRE Contributions: What If You Nearly Stop Saving? | Ask Linc',
  description:
    'Ask Linc compared the same fictional retirement plan with $45,000 versus $5,000 of annual contributions. Both survived all 637 tested histories, but the tradeoff was real.',
  path: PATH,
  imageAlt: 'Ask Linc Coast FIRE contribution tradeoff study',
});

const fullSaving = DEMO_RETIREMENT_RESULTS[1];
const lowSaving = DEMO_RETIREMENT_RESULTS[2];

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
  headline: 'Coast FIRE Isn’t Binary: What Happens If You Nearly Stop Saving?',
  description:
    'A controlled Ask Linc study comparing $45,000 and $5,000 of annual retirement contributions for the same fictional household.',
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

export default function CoastFireContributionsPage() {
  const contributionReduction =
    fullSaving.inputs.annualContributions - lowSaving.inputs.annualContributions;
  const portfolioDifference =
    fullSaving.result.projectedPortfolioAtRetirement - lowSaving.result.projectedPortfolioAtRetirement;
  const withdrawalRateIncrease =
    lowSaving.result.firstYearWithdrawalRate - fullSaving.result.firstYearWithdrawalRate;

  return (
    <main className="marketing-site subpage">
      <StructuredData data={structuredData} />
      <SiteHeader />

      <section className="subhero centered-subhero shell">
        <p className="section-kicker">COAST FIRE CONTRIBUTION STUDY</p>
        <h1>What if you nearly stop saving?<em>The answer is more useful than “yes, you’ve reached Coast FIRE.”</em></h1>
        <p className="subhero-copy">
          We took the same fictional household retiring at age {fullSaving.inputs.retirementAge} and cut annual contributions from {money(fullSaving.inputs.annualContributions)} to {money(lowSaving.inputs.annualContributions)}.
          Everything else stayed the same.
        </p>
      </section>

      <section className="page-section shell">
        <div className="editorial-heading">
          <p className="section-kicker">THE CONTROL</p>
          <h2>Only the savings rate changed.</h2>
        </div>
        <div className="belief-grid">
          <article>
            <span>STARTING ASSETS</span>
            <h3>{money(fullSaving.inputs.investableAssets)}</h3>
            <p>Same investable assets at age {fullSaving.inputs.currentAge} in both scenarios.</p>
          </article>
          <article>
            <span>RETIREMENT AGE</span>
            <h3>{fullSaving.inputs.retirementAge}</h3>
            <p>Both scenarios stop working at the same age and model retirement through age {fullSaving.inputs.lifeExpectancy}.</p>
          </article>
          <article>
            <span>RETIREMENT SPENDING</span>
            <h3>{money(fullSaving.inputs.annualSpending)}/year</h3>
            <p>Annual retirement spending stays fixed across the comparison.</p>
          </article>
          <article>
            <span>SOCIAL SECURITY</span>
            <h3>{money(fullSaving.inputs.socialSecurityAnnual)}/year</h3>
            <p>Same annual Social Security beginning at age {fullSaving.inputs.socialSecurityStartAge}.</p>
          </article>
        </div>
      </section>

      <section className="page-section values-band">
        <div className="shell">
          <div className="editorial-heading">
            <p className="section-kicker">THE TRADEOFF</p>
            <h2>Saving {money(contributionReduction)} less per year did not break this plan—but it did reduce the margin.</h2>
          </div>
          <div className="belief-grid">
            <article>
              <span>SAVE {money(fullSaving.inputs.annualContributions)}/YEAR</span>
              <h3>{fullSaving.result.sequencesSurvived}/{fullSaving.result.sequencesTested} histories lasted</h3>
              <p>Modeled portfolio at retirement: <strong>{money(fullSaving.result.projectedPortfolioAtRetirement)}</strong>.</p>
              <p>Initial portfolio withdrawal: <strong>{percent(fullSaving.result.firstYearWithdrawalRate)}</strong>.</p>
            </article>
            <article>
              <span>SAVE {money(lowSaving.inputs.annualContributions)}/YEAR</span>
              <h3>{lowSaving.result.sequencesSurvived}/{lowSaving.result.sequencesTested} histories lasted</h3>
              <p>Modeled portfolio at retirement: <strong>{money(lowSaving.result.projectedPortfolioAtRetirement)}</strong>.</p>
              <p>Initial portfolio withdrawal: <strong>{percent(lowSaving.result.firstYearWithdrawalRate)}</strong>.</p>
            </article>
            <article>
              <span>LESS CAPITAL AT RETIREMENT</span>
              <h3>-{money(portfolioDifference)}</h3>
              <p>Reducing annual contributions by {money(contributionReduction)} left about {money(portfolioDifference)} less modeled capital at retirement.</p>
            </article>
            <article>
              <span>MORE WITHDRAWAL PRESSURE</span>
              <h3>+{(withdrawalRateIncrease * 100).toFixed(2)} percentage points</h3>
              <p>The initial portfolio withdrawal rate rose from {percent(fullSaving.result.firstYearWithdrawalRate)} to {percent(lowSaving.result.firstYearWithdrawalRate)}.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="page-section shell">
        <div className="editorial-heading">
          <p className="section-kicker">WHY THIS MATTERS</p>
          <h2>Coast FIRE is better treated as a tradeoff surface than a finish line.</h2>
        </div>
        <p>
          A binary Coast FIRE calculator answers a useful first question: could your existing investments grow enough to support a future retirement target without additional contributions?
          But real decisions rarely stop there. Someone might want to save less, take a lower-paying job, work fewer hours, or redirect cash toward life now.
        </p>
        <p>
          In this example, cutting annual contributions from {money(fullSaving.inputs.annualContributions)} to {money(lowSaving.inputs.annualContributions)} still produced {lowSaving.result.sequencesSurvived} surviving histories out of {lowSaving.result.sequencesTested}.
          The tradeoff was not “retirement works” versus “retirement fails.” It was roughly {money(portfolioDifference)} less modeled capital at retirement and a higher initial withdrawal rate.
        </p>
        <p>
          That is a much more decision-useful way to think about Coast FIRE: not “am I done saving?” but “how much margin am I willing to trade for more flexibility today?”
        </p>
      </section>

      <section className="page-section values-band">
        <div className="shell">
          <div className="editorial-heading">
            <p className="section-kicker">METHODOLOGY & LIMITS</p>
            <h2>This is a controlled historical stress test, not a universal Coast FIRE rule.</h2>
          </div>
          <div className="belief-grid">
            <article>
              <span>CONTROLLED</span>
              <h3>One variable changed</h3>
              <p>Starting assets, retirement age, retirement spending, Social Security, life expectancy, and allocation remain the same. Only annual contributions change.</p>
            </article>
            <article>
              <span>HISTORY</span>
              <h3>{fullSaving.history.sequencesTested} overlapping tests</h3>
              <p>The scenarios use historical U.S. returns from July 1926 through June 2026 and {fullSaving.history.horizonYears}-year windows.</p>
            </article>
            <article>
              <span>NOT A PROBABILITY</span>
              <h3>637/637 is not a guarantee</h3>
              <p>The historical windows overlap, and future returns, inflation, taxes, spending, and income can differ from the tested record.</p>
            </article>
            <article>
              <span>NOT BINARY</span>
              <h3>Margin still changed</h3>
              <p>Even though both scenarios survived every tested history, their retirement assets and withdrawal pressure were materially different.</p>
            </article>
          </div>
          <p>
            For the simple threshold calculation, use the <Link href="/coast-fire-calculator">Coast FIRE calculator</Link>.
            For the broader retirement stress test, use the <Link href="/retirement-calculator">retirement calculator</Link> or <Link href="/research">browse all Ask Linc research</Link>.
          </p>
        </div>
      </section>

      <PageCta title="What could you change once saving becomes optional?" label="Explore my plan" csOverrideId="cta-start-free-trial-research-coast" />
      <SiteFooter />
    </main>
  );
}
