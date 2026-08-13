import Link from "next/link";
import type { AnswerPageData, RetirementScenario, WithdrawalScenario } from "@/lib/answer-pages";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { SiteFooter, SiteHeader } from "./SiteShell";

export function AnswerBreadcrumbs({ items }: { items: AnswerPageData["breadcrumbs"] }) {
  return (
    <nav className="answer-breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => (
          <li key={item.label}>
            {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
            {index < items.length - 1 && <i aria-hidden="true">/</i>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function WithdrawalScenarioTable({ caption, scenarios }: { caption: string; scenarios: WithdrawalScenario[] }) {
  return (
    <div className="answer-table-wrap">
      <table className="answer-table">
        <caption>{caption}</caption>
        <thead>
          <tr><th scope="col">Initial rate</th><th scope="col">Per year</th><th scope="col">Per month</th><th scope="col">How to read it</th></tr>
        </thead>
        <tbody>
          {scenarios.map((scenario) => (
            <tr key={scenario.rate}>
              <th scope="row">{scenario.rate}</th>
              <td>{scenario.annualWithdrawal}</td>
              <td>{scenario.monthlyWithdrawal}</td>
              <td>{scenario.planningUse}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RetirementScenarioTable({ caption, scenarios }: { caption: string; scenarios: RetirementScenario[] }) {
  return (
    <div className="answer-table-wrap scenario-comparison-table">
      <table className="answer-table">
        <caption>{caption}</caption>
        <thead>
          <tr><th scope="col">Scenario</th><th scope="col">Gross income target</th><th scope="col">Other income</th><th scope="col">Portfolio draw</th><th scope="col">Initial rate</th></tr>
        </thead>
        <tbody>
          {scenarios.map((scenario) => (
            <tr key={scenario.label}>
              <th scope="row">{scenario.label}</th>
              <td>{scenario.annualIncomeTarget}</td>
              <td>{scenario.otherIncome}</td>
              <td>{scenario.portfolioWithdrawal}</td>
              <td><strong>{scenario.initialRate}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CalculationDisplay({ example }: { example: AnswerPageData["example"] }) {
  return (
    <article className="answer-calculation" aria-labelledby="calculation-heading">
      <div className="answer-calculation-head">
        <span>ILLUSTRATIVE CALCULATION</span>
        <b>∑ &nbsp;Show the math</b>
      </div>
      <div className="answer-calculation-body">
        <h3 id="calculation-heading">{example.title}</h3>
        <p>{example.intro}</p>
        <div className="answer-equation">
          {example.steps.map((step) => (
            <div key={step.label} className={step.operator === "=" ? "equation-result" : ""}>
              <span>{step.operator && <i aria-hidden="true">{step.operator}</i>}{step.label}</span>
              <strong>{step.value}</strong>
            </div>
          ))}
        </div>
        <p className="calculation-result"><span>✓</span>{example.result}</p>
        <small>{example.note}</small>
      </div>
    </article>
  );
}

function RelatedAnswerCard({ item }: { item: AnswerPageData["relatedAnswers"][number] }) {
  const content = <><span>{item.eyebrow}</span><strong>{item.question}</strong><i aria-hidden="true">{item.href ? "→" : "Coming next"}</i></>;

  return item.href ? (
    <Link className="related-answer-card" href={item.href}>{content}</Link>
  ) : (
    <div className="related-answer-card is-coming" aria-label={`${item.question} — coming next`}>{content}</div>
  );
}

export default function AnswerPage({ page }: { page: AnswerPageData }) {
  return (
    <main className="marketing-site answer-page">
      <SiteHeader />

      <div className="shell"><AnswerBreadcrumbs items={page.breadcrumbs} /></div>

      <header className="answer-hero shell">
        <div className="answer-hero-copy">
          <p className="section-kicker">{page.category.toUpperCase()}</p>
          <h1>{page.title}<em>{page.titleAccent}</em></h1>
          <p className="answer-standfirst">{page.description}</p>
          <p className="answer-review-date">Reviewed {page.reviewedOn} · {page.readTime}</p>
        </div>
        <article className="answer-direct-card" aria-label="The short answer">
          <div><span className="brand-mark small" aria-hidden="true">L</span><b>THE SHORT ANSWER</b><span>ILLUSTRATIVE</span></div>
          <h2>{page.directAnswer}</h2>
          <p>{page.directAnswerDetail}</p>
          <a href="#portfolio-support">See the numbers <span aria-hidden="true">↓</span></a>
        </article>
      </header>

      <section className="answer-number-strip" aria-label={page.numberStripLabel}>
        <div className="shell">
          {page.keyNumbers.map((number) => (
            <div key={number.label}><span>{number.label}</span><strong>{number.value}</strong><small>{number.note}</small></div>
          ))}
        </div>
      </section>

      <div className="answer-layout shell">
        <aside className="answer-toc" aria-label="On this page">
          <b>ON THIS PAGE</b>
          <a href="#portfolio-support">{page.withdrawalSection.tocLabel}</a>
          <a href="#simple-example">A simple example</a>
          <a href="#what-changes-the-answer">What changes the answer</a>
          <a href="#test-your-plan">How to test your plan</a>
          <a href="#related-questions">Related questions</a>
          <a href="#sources">Sources + methodology</a>
        </aside>

        <article className="answer-content">
          <section id="portfolio-support">
            <p className="section-kicker">START WITH THE RANGE</p>
            <h2>{page.withdrawalSection.heading}</h2>
            <p className="answer-lede">The first useful calculation is simple: multiply the portfolio by a starting withdrawal rate. This shows what the investments would provide in year one before taxes. It does not predict how markets will behave or promise that a given rate will last for life.</p>
            <WithdrawalScenarioTable caption={page.withdrawalSection.tableCaption} scenarios={page.withdrawalScenarios} />
            <div className="answer-note"><b>{page.withdrawalSection.noteTitle}</b><p>{page.withdrawalSection.noteBody}</p></div>
          </section>

          <section id="simple-example">
            <p className="section-kicker">PUT INCOME SOURCES TOGETHER</p>
            <h2>Subtract the income your portfolio does not need to provide.</h2>
            <p>Retirement spending can be funded by several sources. The portfolio only needs to cover the gap between the income you want and reliable income from Social Security, pensions, or other sources.</p>
            <CalculationDisplay example={page.example} />
            <RetirementScenarioTable caption={page.scenarioTableCaption} scenarios={page.retirementScenarios} />
            <p className="table-footnote">{page.scenarioTableFootnote}</p>
          </section>

          <section id="what-changes-the-answer">
            <p className="section-kicker">THE BALANCE IS ONLY ONE INPUT</p>
            <h2>Six things that can change the answer.</h2>
            <div className="answer-factor-grid">
              {page.factors.map((factor) => (
                <article key={factor.number}><span>{factor.number}</span><h3>{factor.title}</h3><p>{factor.body}</p></article>
              ))}
            </div>
          </section>

          <section id="test-your-plan" className="answer-checklist-section">
            <div>
              <p className="section-kicker light">TURN THE RULE OF THUMB INTO A PLAN</p>
              <h2>Test the years, not just the first withdrawal.</h2>
              <p>A useful retirement model follows cash flow over time and makes uncertainty visible. It should show which assumption moved the answer and what you could change.</p>
            </div>
            <ol>
              {page.checkpoints.map((checkpoint, index) => <li key={checkpoint}><span>{String(index + 1).padStart(2, "0")}</span>{checkpoint}</li>)}
            </ol>
          </section>

          <section className="answer-product-bridge">
            <div>
              <p className="section-kicker">NOW USE YOUR ACTUAL FINANCES</p>
              <h2>{page.productBridge.heading}</h2>
              <p>{page.productBridge.body}</p>
            </div>
            <div><MarketingGetStartedButton className="button button-primary" /><small>{page.productBridge.priceNote}</small></div>
          </section>

          <section className="answer-faq" aria-labelledby="faq-heading">
            <p className="section-kicker">RELATED QUESTIONS</p>
            <h2 id="faq-heading">What people ask next.</h2>
            <div>
              {page.faqs.map((faq) => (
                <details key={faq.question}><summary>{faq.question}<span aria-hidden="true">+</span></summary><p>{faq.answer}</p></details>
              ))}
            </div>
          </section>
        </article>
      </div>

      <section id="related-questions" className="answer-related shell">
        <div><p className="section-kicker">KEEP EXPLORING</p><h2>Related retirement questions.</h2></div>
        <div className="related-answer-grid">{page.relatedAnswers.map((item) => <RelatedAnswerCard item={item} key={item.question} />)}</div>
      </section>

      <section id="sources" className="answer-sources">
        <div className="shell">
          <div>
            <p className="section-kicker light">SOURCES + METHODOLOGY</p>
            <h2>Built to show its assumptions.</h2>
            <p>This page uses simple, deterministic arithmetic to illustrate first-year withdrawals. It does not assume a guaranteed return or label any withdrawal rate “safe.” Dollar examples are nominal, before fees, and before tax unless stated otherwise.</p>
            <p>Official rules and benefit amounts can change. Confirm current information with the linked agencies and consider a qualified professional for tax, legal, or investment advice.</p>
          </div>
          <ol>
            {page.sources.map((source, index) => (
              <li key={source.href}><span>{String(index + 1).padStart(2, "0")}</span><div><a href={source.href} target="_blank" rel="noreferrer">{source.title} ↗</a><small>{source.publisher}</small><p>{source.use}</p></div></li>
            ))}
          </ol>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
