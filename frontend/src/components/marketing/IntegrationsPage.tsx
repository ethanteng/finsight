import Link from "next/link";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { PageCta, SiteFooter, SiteHeader } from "./SiteShell";
import { TRIAL_CTA_MICROCOPY } from "./trial-copy";
import { ConnectedLifeVisual } from "./PlanningScenes";

const financialPicture = [
  {
    number: "01",
    title: "Cash, spending, and debt",
    copy: "See your available cash, monthly spending, and debt payments together.",
    examples: ["Checking + savings", "Credit cards + loans", "Income + spending"],
  },
  {
    number: "02",
    title: "Investments, property, and goals",
    copy: "Include your investments and home value when planning for retirement, a move, or a change in income.",
    examples: ["Brokerage + retirement", "Home value", "Retirement + other goals"],
  },
  {
    number: "03",
    title: "Current rates and market data",
    copy: "Linc adds current rates, market prices, relevant rules, and historical returns when they affect your question.",
    examples: ["Mortgage + Treasury rates", "Market prices", "Rules + market history"],
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

export default function IntegrationsPage() {
  return (
    <main className="marketing-site subpage integrations-page">
      <SiteHeader />

      <section className="integration-hero shell">
        <div>
          <p className="section-kicker">ACCOUNTS &amp; DATA</p>
          <h1>Your financial life. <em>Finally together.</em></h1>
          <p className="subhero-copy">Connect bank and investment accounts, add your home and loans, and fill in any missing details. Linc brings the relevant numbers into your plan.</p>
          <div className="hero-actions">
            <MarketingGetStartedButton className="button button-primary" trackingLocation="integrations_hero" csOverrideId="cta-start-free-trial-hero" label="Start free" />
          </div>
          <p className="microcopy">{TRIAL_CTA_MICROCOPY}</p>
        </div>
        <ConnectedLifeVisual />
      </section>

      <section className="integration-principles" aria-label="How Ask Linc handles financial data">
        <div className="shell">
          <span><strong>READ-ONLY</strong><small>Linc cannot move your money</small></span>
          <span><strong>RELEVANT DATA</strong><small>Linc uses the numbers your question needs</small></span>
          <span><strong>FILL IN THE GAPS</strong><small>Add details that connected accounts don’t include</small></span>
          <span><strong>CHECKABLE</strong><small>See the facts and sources behind the result</small></span>
        </div>
      </section>

      <section className="integration-owned-section shell">
        <div className="integration-section-heading">
          <div><p className="section-kicker">THE NUMBERS BEHIND THE DECISION</p><h2>Connect what matters to you.</h2></div>
          <p>Use connected accounts and manual details together. Account availability depends on your institution and connection provider.</p>
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

      <section className="integration-inventory-section">
        <div className="shell">
          <div className="integration-section-heading">
            <div><p className="section-kicker">WHERE THE FACTS COME FROM</p><h2>Know where the numbers come from.</h2></div>
            <p>These providers supply account data, property estimates, and market information. You can check the sources behind your answer in Show the Math.</p>
          </div>
          <div className="coverage-grid" aria-label="Ask Linc data providers">
            {sources.map(([name, description], index) => (
              <article className="coverage-card" key={name}><div className="coverage-card-top"><span>{String(index + 1).padStart(2, "0")}</span><small>SOURCE</small></div><h3>{name}</h3><p>{description}</p></article>
            ))}
          </div>
          <div className="fact-routing-links">
            <Link className="section-cta-link" href="/trust">
              See how the answer is checked <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <PageCta title="Bring your finances together." label="Start free" csOverrideId="cta-start-free-trial-mid" />
      <SiteFooter />
    </main>
  );
}
