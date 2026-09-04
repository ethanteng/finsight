import type { Metadata } from "next";
import Link from "next/link";
import StructuredData from "@/components/StructuredData";
import { PageCta, SiteFooter, SiteHeader } from "@/components/marketing/SiteShell";
import { RetirementDecisionCrossSell } from "@/components/marketing/RetirementDecisionCrossSell";
import {
  canIRetireAt55,
  canIRetireAt60,
  canIRetireWithOneMillion,
  canIRetireWithThreeMillion,
  canIRetireWithTwoMillion,
  type AnswerPageData,
} from "@/lib/answer-pages";

const canonical = "https://asklinc.com/retirement-answers";
const description =
  "Explore clear retirement guides for different ages and savings balances, then try the same questions with your own finances.";

const balanceAnswers = [
  canIRetireWithOneMillion,
  canIRetireWithTwoMillion,
  canIRetireWithThreeMillion,
];
const ageAnswers = [canIRetireAt55, canIRetireAt60];
const allAnswers = [...balanceAnswers, ...ageAnswers];

export const metadata: Metadata = {
  title: "Retirement: Can I Retire? | Ask Linc",
  description,
  alternates: { canonical },
  openGraph: {
    title: "Retirement | Ask Linc",
    description,
    type: "website",
    url: canonical,
    siteName: "Ask Linc",
    images: [{ url: "https://asklinc.com/og-image.jpg", width: 1200, height: 630, alt: "Ask Linc retirement planning" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Retirement | Ask Linc",
    description,
    images: ["https://asklinc.com/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
  },
};

function answerHref(page: AnswerPageData) {
  return `/${page.slug}`;
}

function balanceLabel(page: AnswerPageData) {
  const match = page.title.match(/\$(\d+) million/);
  return match ? `$${match[1]}M portfolio` : page.title;
}

const collectionSchema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Retirement",
  description,
  url: canonical,
  mainEntity: {
    "@type": "ItemList",
    numberOfItems: allAnswers.length,
    itemListElement: allAnswers.map((page, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: page.title,
      url: `https://asklinc.com/${page.slug}`,
    })),
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://asklinc.com/" },
    { "@type": "ListItem", position: 2, name: "Retirement", item: canonical },
  ],
};

export default function RetirementAnswersPage() {
  return (
    <main className="marketing-site retirement-answers-hub">
      <StructuredData data={collectionSchema} />
      <StructuredData data={breadcrumbSchema} />
      <SiteHeader />

      <nav className="answer-breadcrumbs shell" aria-label="Breadcrumb">
        <ol>
          <li><Link href="/">Home</Link><i aria-hidden="true">/</i></li>
          <li><span aria-current="page">Retirement</span></li>
        </ol>
      </nav>

      <section className="answer-hub-hero shell">
        <div>
          <p className="section-kicker">RETIREMENT</p>
          <h1>Start with the math. <em>Then test the whole plan.</em></h1>
          <p className="answer-hub-standfirst">
            A portfolio balance or retirement age is only the opening question. These guides show the first-year math, the assumptions that change the result, and the next questions worth testing.
          </p>
          <div className="answer-hub-hero-links">
            <a className="button button-dark" href="#by-portfolio">Explore the guides <span aria-hidden="true">↓</span></a>
            <Link className="text-link" href="/use-cases/retirement">See how Ask Linc plans retirement</Link>
          </div>
        </div>
        <aside className="answer-hub-method-card" aria-label="How to use these retirement guides">
          <span>HOW TO START</span>
          <ol>
            <li><b>01</b><div><strong>Set the spending need</strong><small>Include taxes, healthcare, and irregular costs.</small></div></li>
            <li><b>02</b><div><strong>Subtract other income</strong><small>Time Social Security, pensions, and work by year.</small></div></li>
            <li><b>03</b><div><strong>Try a few what-ifs</strong><small>Change returns, inflation, timing, and flexibility.</small></div></li>
          </ol>
        </aside>
      </section>

      <section className="answer-number-strip answer-hub-number-strip" aria-label="Retirement answer library summary">
        <div className="shell">
          <div><span>Portfolio questions</span><strong>3 balances</strong><small>$1 million, $2 million, and $3 million</small></div>
          <div><span>Timing questions</span><strong>2 ages</strong><small>Retiring at 55 and retiring at 60</small></div>
          <div><span>Planning approach</span><strong>1 method</strong><small>Clear math with stated assumptions</small></div>
        </div>
      </section>

      <section className="answer-hub-section shell" id="by-portfolio" aria-labelledby="portfolio-heading">
        <div className="answer-hub-section-head">
          <div><p className="section-kicker">BY PORTFOLIO BALANCE</p><h2 id="portfolio-heading">What could your savings support?</h2></div>
          <p>Compare the same 3%, 3.5%, and 4% starting-withdrawal illustrations across three balances. Each guide then adds income, spending, tax, and risk context. For a broader benchmark, see <Link href="/blog/average-american-savings">how much Americans have in savings by age</Link>.</p>
        </div>
        <div className="answer-hub-card-grid">
          {balanceAnswers.map((page) => (
            <article className="answer-hub-card" key={page.slug}>
              <span>{balanceLabel(page)}</span>
              <h3>{page.title}</h3>
              <p>{page.directAnswer}</p>
              <dl>
                {page.keyNumbers.map((number) => (
                  <div key={number.label}><dt>{number.label.replace(" initial withdrawal", "")}</dt><dd>{number.value}</dd></div>
                ))}
              </dl>
              <Link href={answerHref(page)} aria-label={`Read ${page.title}`}>Read the full answer <i aria-hidden="true">↗</i></Link>
            </article>
          ))}
        </div>

        <div className="answer-table-wrap answer-hub-comparison">
          <table className="answer-table">
            <caption>First-year portfolio withdrawals at three illustrative starting rates</caption>
            <thead><tr><th scope="col">Starting portfolio</th><th scope="col">3.0%</th><th scope="col">3.5%</th><th scope="col">4.0%</th></tr></thead>
            <tbody>
              {balanceAnswers.map((page) => (
                <tr key={page.slug}>
                  <th scope="row"><Link href={answerHref(page)}>{balanceLabel(page)}</Link></th>
                  {page.keyNumbers.map((number) => <td key={number.label}>{number.value.replace("/yr", " / year")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="answer-hub-table-note">These are gross, first-year portfolio withdrawals—not promised returns, guaranteed lifetime income, or a complete retirement plan.</p>
      </section>

      <section className="answer-hub-age-section">
        <div className="shell">
          <div className="answer-hub-section-head">
            <div><p className="section-kicker">BY RETIREMENT AGE</p><h2 id="age-heading">What must the early years bridge?</h2></div>
            <p>Retiring before Medicare or Social Security changes what your plan needs to cover first. Start with the benefits and tax milestones that arrive after work stops.</p>
          </div>
          <div className="answer-hub-age-grid" aria-labelledby="age-heading">
            {ageAnswers.map((page) => (
              <article key={page.slug}>
                <span>{page.slug.endsWith("55") ? "A longer bridge" : "Five years to Medicare"}</span>
                <h3>{page.title}</h3>
                <p>{page.directAnswerDetail}</p>
                <ul>
                  {page.timeline?.items.slice(0, 4).map((item) => <li key={`${page.slug}-${item.age}`}><b>{item.age}</b><small>{item.label}</small></li>)}
                </ul>
                <Link href={answerHref(page)} aria-label={`Read ${page.title}`}>See the age-by-age answer <i aria-hidden="true">↗</i></Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="answer-hub-methodology">
        <div className="shell">
          <div>
            <p className="section-kicker light">SOURCES &amp; METHODOLOGY</p>
            <h2>Useful estimates. Explicit limits.</h2>
            <p>Every answer separates the math from the judgment calls. Withdrawal examples use simple starting-balance math. They do not predict returns or guarantee how long a portfolio will last.</p>
          </div>
          <ol>
            <li><span>01</span><div><strong>Show the calculation</strong><p>Rates, amounts, income gaps, and assumptions stay visible.</p></div></li>
            <li><span>02</span><div><strong>Use primary sources</strong><p>Each guide links to relevant IRS, Social Security, Medicare, and federal data.</p></div></li>
            <li><span>03</span><div><strong>Model the connected plan</strong><p>Use Ask Linc to replace the examples with your accounts, spending, income, and goals.</p></div></li>
          </ol>
          <div className="answer-hub-method-links">
            <Link href="/use-cases/retirement">Explore retirement planning <span aria-hidden="true">→</span></Link>
            <Link href="/use-cases/retirement">Check retirement readiness <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>

      <RetirementDecisionCrossSell />
      <PageCta title="Replace the examples with your accounts, spending, income, and goals." csOverrideId="cta-start-free-trial-mid" />
      <SiteFooter />
    </main>
  );
}
