import Link from "next/link";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { PageCta, SiteFooter, SiteHeader } from "./SiteShell";

const financialPicture = [
  {
    number: "01",
    title: "Cash, spending, and debt",
    copy: "Checking, savings, cards, loans, income, and spending show what is available now and what the decision has to fit around.",
    examples: ["Checking + savings", "Credit cards + loans", "Income + spending"],
  },
  {
    number: "02",
    title: "Investments, property, and goals",
    copy: "Brokerage and retirement accounts, home value, and longer-term goals show what the decision could help—or set back.",
    examples: ["Brokerage + retirement", "Home value", "Retirement + other goals"],
  },
  {
    number: "03",
    title: "What is true now",
    copy: "Rates, market prices, current rules, and long-term history are added when they can materially change the answer.",
    examples: ["Mortgage + Treasury rates", "Market prices", "Rules + market history"],
  },
] as const;

const decisionExamples = [
  {
    label: "HOME",
    question: "Can we afford a $700K home without pausing retirement savings?",
    context: "Cash · spending · mortgage rates · property · retirement",
  },
  {
    label: "CAREER",
    question: "Can I take a year off without setting retirement back?",
    context: "Cash · spending · income · benefits · retirement",
  },
  {
    label: "RETIREMENT",
    question: "Could we retire two years earlier without making the plan too tight?",
    context: "Savings · spending · Social Security · investments · market history",
  },
] as const;

const sources = [
  ["Plaid", "Banking, cards, loans, balances, and transactions"],
  ["SnapTrade", "Brokerage and retirement accounts, holdings, and cash"],
  ["RentCast", "Home-value estimates and property context"],
  ["FRED + Massive", "Rates, inflation, yields, and economic context"],
  ["FMP + Tiingo", "Fund details, prices, history, and market information"],
  ["Kenneth French + Robert Shiller", "Long-run market, bond, and inflation history"],
  ["Focused web sources", "Current rules, limits, and facts when the question needs them"],
] as const;

function DecisionMap() {
  return (
    <div className="integration-map" aria-label="Ask Linc brings relevant financial information into the decision">
      <div className="integration-map-top"><span>THE FINANCIAL PICTURE BEHIND THE ANSWER</span><small>BUILT AROUND YOUR QUESTION</small></div>
      <div className="integration-map-stage">
        <span className="integration-map-node map-cash"><small>YOUR MONEY</small><b>Cash + spending</b></span>
        <span className="integration-map-node map-investments"><small>YOUR PLAN</small><b>Investments</b></span>
        <span className="integration-map-node map-property"><small>YOUR LIFE</small><b>Property + goals</b></span>
        <span className="integration-map-core"><i className="brand-mark" aria-hidden="true">L</i><b>Your decision</b><small>What could change it?</small></span>
        <span className="integration-map-node map-rates"><small>RIGHT NOW</small><b>Rates + markets</b></span>
        <span className="integration-map-node map-current"><small>RIGHT NOW</small><b>Current rules</b></span>
        <span className="integration-map-node map-history"><small>THE LONG VIEW</small><b>Market history</b></span>
      </div>
      <div className="integration-map-output"><small>THE RESULT</small><strong>One answer that keeps the rest of your financial life in the decision.</strong></div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <main className="marketing-site subpage integrations-page">
      <SiteHeader />

      <section className="integration-hero shell">
        <div>
          <p className="section-kicker">ACCOUNTS &amp; DATA</p>
          <h1>Your finances live in many places. <em>Your answer shouldn&apos;t.</em></h1>
          <p className="subhero-copy">Linc brings together the parts of your financial life that matter for the question you are asking—and leaves out what does not.</p>
          <div className="hero-actions">
            <MarketingGetStartedButton className="button button-primary" trackingLocation="integrations_hero" csOverrideId="cta-start-free-trial-hero" />
            <Link className="text-link" href="/features">See how Linc builds an answer →</Link>
          </div>
        </div>
        <DecisionMap />
      </section>

      <section className="integration-principles" aria-label="How Ask Linc handles financial data">
        <div className="shell">
          <span><strong>READ-ONLY</strong><small>Linc cannot move your money</small></span>
          <span><strong>QUESTION-FIRST</strong><small>The decision determines what matters</small></span>
          <span><strong>ONLY WHAT MATTERS</strong><small>No need to throw every data point at every answer</small></span>
          <span><strong>CHECKABLE</strong><small>See the facts and sources behind the result</small></span>
        </div>
      </section>

      <section className="integration-owned-section shell">
        <div className="integration-section-heading">
          <div><p className="section-kicker">THE NUMBERS BEHIND THE DECISION</p><h2>Linc pulls in what could change the answer.</h2></div>
          <p>Connected accounts are the starting point, not the product. The value is knowing which facts belong in this decision and how they affect one another.</p>
        </div>
        <div className="connected-source-grid" aria-label="Financial information Ask Linc can use">
          {financialPicture.map((item) => (
            <article className="connected-source-card" key={item.number}>
              <div className="connected-source-top"><span>{item.number} / FINANCIAL PICTURE</span></div>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
              <div className="connection-tags">{item.examples.map((example) => <span key={example}>{example}</span>)}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="integration-context-section dark-band">
        <div className="shell">
          <div className="integration-section-heading on-dark">
            <div><p className="section-kicker light">START WITH THE QUESTION</p><h2>Different decisions need different facts.</h2></div>
            <p>A home question needs mortgage rates and cash after closing. A career break needs income, spending, benefits, and runway. Retirement needs a longer view.</p>
          </div>
          <div className="outside-context-grid" aria-label="Examples of how Ask Linc routes data by decision">
            {decisionExamples.map((item, index) => (
              <article key={item.label}>
                <div><span>{String(index + 1).padStart(2, "0")}</span><small>{item.label}</small></div>
                <h3>{item.question}</h3>
                <p>{item.context}</p>
              </article>
            ))}
          </div>
          <div className="integration-context-note"><span className="brand-mark" aria-hidden="true">L</span><p><small>ONLY WHAT MATTERS</small><strong>Linc does not use every available data point just because it can. It uses what could change the answer.</strong></p></div>
        </div>
      </section>

      <section className="integration-inventory-section">
        <div className="shell">
          <div className="integration-section-heading">
            <div><p className="section-kicker">WHERE THE FACTS COME FROM</p><h2>Connected accounts, property, markets, and current information.</h2></div>
            <p>You do not need to know the provider names to use Ask Linc. They are here so you can see where the underlying information comes from.</p>
          </div>
          <div className="coverage-grid" aria-label="Ask Linc data providers">
            {sources.map(([name, description], index) => (
              <article className="coverage-card" key={name}><div className="coverage-card-top"><span>{String(index + 1).padStart(2, "0")}</span><small>SOURCE</small></div><h3>{name}</h3><p>{description}</p></article>
            ))}
          </div>
          <div className="fact-routing-links">
            <Link className="text-link" href="/trust">See how the answer is checked →</Link>
            <Link className="text-link" href="/how-we-protect-your-data">See how your data is protected →</Link>
          </div>
        </div>
      </section>

      <PageCta title="What decision are you trying to make?" csOverrideId="cta-start-free-trial-mid" />
      <SiteFooter />
    </main>
  );
}
