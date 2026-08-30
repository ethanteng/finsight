"use client";

import { useState } from "react";

type DemoView = "decisions" | "finances" | "accounts";
type DecisionTab = "answer" | "math" | "sources";
type PortfolioTab = "overview" | "holdings" | "transactions";

type DemoDecision = {
  id: string;
  shortTitle: string;
  date: string;
  question: string;
  metrics: Array<{ label: string; value: string; source?: string }>;
  summary: string;
  takeaways: string[];
  actions: string[];
};

const decisions: DemoDecision[] = [
  {
    id: "retirement",
    shortTitle: "What should I consider for retirement?",
    date: "Aug 25",
    question: "What are the key factors I need to consider when planning for retirement?",
    metrics: [
      { label: "Net worth", value: "$3,645,158", source: "Net Worth" },
      { label: "Total debt", value: "$351,484", source: "Total Debt" },
      { label: "Current age", value: "48", source: "Profile Age" },
      { label: "Savings rate", value: "35.42%", source: "Savings Rate" },
      { label: "Total investments", value: "$2,274,872", source: "Total Investments" },
    ],
    summary:
      "You’re in a strong position overall—$3.65M net worth, $2.27M invested, and a healthy 35% savings rate. The next step is to match your future income against spending, inflation, and how long the money needs to last.",
    takeaways: [
      "A 35% savings rate gives you a strong retirement engine, but your monthly cash flow still moves around.",
      "Your retirement and taxable accounts give you several places to draw from over time.",
      "About $351K of debt, mostly the mortgage, needs to be paid off or included in future spending.",
      "Your target retirement age and annual spending goal will have the biggest effect on the answer.",
    ],
    actions: [
      "Choose a target retirement age and annual spending goal.",
      "Review the part of the retirement portfolio that is not itemized.",
      "Decide whether paying off the mortgage before retirement is a goal.",
    ],
  },
  {
    id: "inflation",
    shortTitle: "What if inflation stays high?",
    date: "Aug 22",
    question:
      "If inflation stays high and the market underperforms for the next 5 years, what impact would that have on our retirement plan?",
    metrics: [
      { label: "Survival rate", value: "100%", source: "Survival Rate" },
      { label: "Withdrawal rate", value: "3.61%", source: "Withdrawal Rate" },
      { label: "CPI inflation YoY", value: "3.3%", source: "Market Context" },
      { label: "Equity allocation", value: "82.14%", source: "Equity Allocation" },
      { label: "Historical sequence count", value: "49", source: "Historical Sequence Count" },
    ],
    summary:
      "Your existing retirement model tests 49 overlapping historical periods and shows a 100% survival rate at a 3.61% starting withdrawal rate. The bigger short-term risk is the 82% stock allocation swinging hard during a weak first five years.",
    takeaways: [
      "The long-term plan held up across all 49 historical periods tested.",
      "An 82% stock allocation can still create a painful short-term drop even when the long-term plan works.",
      "At 3.3% inflation, a $150K spending target may need to rise faster than expected.",
      "A larger cash or bond buffer could reduce the need to sell stocks after a market drop.",
    ],
    actions: [
      "Compare the current plan with a larger cash or bond buffer.",
      "Test a slightly lower stock allocation before retirement.",
      "Review the spending target against actual inflation each year.",
    ],
  },
  {
    id: "credit-cards",
    shortTitle: "How much card debt do I have?",
    date: "Aug 24",
    question: "Are you able to see how much credit card debt I have, and what the interest rates are?",
    metrics: [
      { label: "Everyday card APR", value: "19.49%" },
      { label: "Travel card balance", value: "$1,347" },
      { label: "Everyday card balance", value: "$357" },
      { label: "Travel card APR", value: "19.49%" },
      { label: "Third card balance", value: "$0" },
    ],
    summary:
      "Two cards carry balances: $356.67 and $1,347.26, both at 19.49% APR. A third card is at $0. The balances are manageable relative to your finances, but the rates are high enough to prioritize paying them off.",
    takeaways: [
      "The card with a $0 balance is not costing you interest right now.",
      "Cash-advance rates are higher than purchase rates and worth avoiding.",
      "The larger balance has fallen from its last statement, so it is already moving in the right direction.",
    ],
    actions: [
      "Pay the $1,347.26 balance first because it creates the largest interest charge.",
      "Avoid cash advances at rates near 30%.",
      "If balances persist, compare lower-rate payoff options.",
    ],
  },
];

const overviewMetrics = [
  ["Net Worth", "$3,668,349"],
  ["Total Cash", "$82,651"],
  ["Total Debt", "$350,305"],
  ["Total Investments", "$2,291,203"],
  ["Home Value", "$1,644,800"],
] as const;

const allocation = [
  ["ETF", "$802,144.54", "35.0%"],
  ["Target Date Fund", "$408,025.18", "17.8%"],
  ["Not itemized", "$383,561.98", "16.7%"],
  ["Equity", "$318,453.61", "13.9%"],
  ["Mutual Fund", "$272,908.39", "11.9%"],
  ["Unrecognized holdings", "$57,697.10", "2.5%"],
  ["Manual Investments", "$45,894.76", "2.0%"],
  ["Cash", "$2,517.35", "0.1%"],
] as const;

const mathFacts = [
  ["Net worth", "$3,645,158", "Financial snapshot"],
  ["Total cash", "$76,970", "Connected cash accounts"],
  ["Total debt", "$351,484", "Connected debt accounts"],
  ["Total investments", "$2,274,872", "Investment snapshot"],
  ["Current age", "48", "Profile"],
] as const;

function DemoOverview({ onOpenFinances }: { onOpenFinances: () => void }) {
  return (
    <aside className="demo-overview-card" aria-label="Demo financial overview">
      <div className="demo-overview-heading">
        <span aria-hidden="true" />
        <h3>Your Financial Overview</h3>
      </div>
      <small>Data as of 8/30/2026</small>
      <button type="button" className="demo-overview-net-worth" onClick={onOpenFinances}>
        <span>Net Worth</span>
        <strong>$3,668,349</strong>
      </button>
      <div className="demo-overview-grid">
        {overviewMetrics.slice(1).map(([label, value]) => (
          <div key={label}><span>{label}</span><strong>{value}</strong></div>
        ))}
      </div>
      <div className="demo-overview-counts">
        <div><span>Accounts</span><strong>22</strong></div>
        <div><span>Holdings</span><strong>118</strong></div>
        <div><span>Securities</span><strong>79</strong></div>
      </div>
      <button type="button" className="demo-text-button" onClick={onOpenFinances}>Review connected data <span>→</span></button>
    </aside>
  );
}

function AnswerPanel({ decision }: { decision: DemoDecision }) {
  return (
    <div className="demo-answer-panel">
      <div className="demo-current-answer"><span>✓</span> Current answer</div>
      <section aria-label="Demo key metrics">
        <h3>Key metrics</h3>
        <div className="demo-metrics-grid">
          {decision.metrics.map((metric) => (
            <article key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              {metric.source ? <small>Source: {metric.source}</small> : null}
            </article>
          ))}
        </div>
      </section>
      <p className="demo-answer-summary">{decision.summary}</p>
      <section className="demo-answer-list" aria-label="Demo takeaways">
        <h3><span aria-hidden="true">♧</span> Takeaways</h3>
        <ol>{decision.takeaways.map((item) => <li key={item}>{item}</li>)}</ol>
      </section>
      <section className="demo-answer-list demo-action-list" aria-label="Demo action items">
        <h3><span aria-hidden="true">✓</span> Action items</h3>
        <ol>{decision.actions.map((item) => <li key={item}>{item}</li>)}</ol>
      </section>
    </div>
  );
}

function MathPanel() {
  const [openSection, setOpenSection] = useState("facts");
  const sections = [
    ["facts", "Canonical facts and provenance"],
    ["planning", "Context planning"],
    ["validation", "Deterministic validation"],
    ["snapshot", "Snapshot and selected context"],
  ] as const;

  return (
    <div className="demo-math-panel">
      <div className="demo-panel-heading">
        <div><span aria-hidden="true">▦</span><div><h3>Calculations and pipeline</h3><p>Inspect the context, intermediate work, and validation behind this answer.</p></div></div>
      </div>
      <div className="demo-accordion">
        {sections.map(([id, label]) => {
          const open = openSection === id;
          return (
            <section key={id}>
              <button type="button" aria-expanded={open} onClick={() => setOpenSection(open ? "" : id)}>
                <span>{label}</span><i>{open ? "−" : "+"}</i>
              </button>
              {open ? (
                <div className="demo-accordion-content">
                  {id === "facts" ? (
                    <table><thead><tr><th>Number used</th><th>Value</th><th>Where it came from</th></tr></thead><tbody>{mathFacts.map(([label, value, source]) => <tr key={label}><td>{label}</td><td>{value}</td><td>{source}</td></tr>)}</tbody></table>
                  ) : null}
                  {id === "planning" ? <div className="demo-check-grid"><span><b>Goal</b>Retirement planning</span><span><b>Time horizon</b>10+ years</span><span><b>Spending assumption</b>$150,000/year</span><span><b>Inflation</b>3.3%</span></div> : null}
                  {id === "validation" ? <div className="demo-validation"><strong>✓ 5 key figures checked</strong><p>Balances match the saved financial snapshot. No conflicting totals were used in the answer.</p></div> : null}
                  {id === "snapshot" ? <div className="demo-check-grid"><span><b>Accounts</b>22</span><span><b>Holdings</b>118</span><span><b>Securities</b>79</span><span><b>Snapshot date</b>Aug 30, 2026</span></div> : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SourcesPanel() {
  const [source, setSource] = useState<"facts" | "market">("facts");
  return (
    <div className="demo-sources-panel">
      <div className="demo-panel-heading">
        <p>EVIDENCE BUNDLE</p>
        <div><span aria-hidden="true">▤</span><div><h3>Supporting evidence</h3><p>These are the real data groups recorded with this answer.</p></div></div>
      </div>
      <div className="demo-source-cards">
        <button type="button" className={source === "facts" ? "active" : ""} onClick={() => setSource("facts")}>
          <small>SOURCE 01</small><strong>Canonical Facts</strong><span>344 recorded items</span><b>{source === "facts" ? "Hide source data" : "View source data"}</b>
        </button>
        <button type="button" className={source === "market" ? "active" : ""} onClick={() => setSource("market")}>
          <small>SOURCE 02</small><strong>Market News History</strong><span>1 recorded item</span><b>{source === "market" ? "Hide source data" : "View source data"}</b>
        </button>
      </div>
      <section className="demo-source-detail" aria-live="polite">
        <div><strong>{source === "facts" ? "canonical facts" : "market news history"}</strong><span>−</span></div>
        {source === "facts" ? (
          <table><thead><tr><th>Recorded item</th><th>Value</th><th>Source</th></tr></thead><tbody>{mathFacts.slice(0, 4).map(([label, value, origin]) => <tr key={label}><td>{label}</td><td>{value}</td><td>{origin}</td></tr>)}</tbody></table>
        ) : (
          <div className="demo-market-source"><small>CHECKED AUG 25, 2026</small><strong>Current inflation and market context</strong><p>CPI inflation: 3.3% year over year. Current market information was attached to the saved answer.</p></div>
        )}
      </section>
    </div>
  );
}

function DecisionsView({ onOpenFinances }: { onOpenFinances: () => void }) {
  const [decisionId, setDecisionId] = useState(decisions[0].id);
  const [tab, setTab] = useState<DecisionTab>("answer");
  const [askNotice, setAskNotice] = useState(false);
  const decision = decisions.find((item) => item.id === decisionId) ?? decisions[0];

  function chooseDecision(id: string) {
    setDecisionId(id);
    setTab("answer");
    setAskNotice(false);
  }

  return (
    <div className="demo-decisions-view">
      <aside className="demo-recent-decisions" aria-label="Demo recent decisions">
        <div><span>Recent decisions</span><b>{decisions.length}</b></div>
        {decisions.map((item) => (
          <button type="button" key={item.id} className={item.id === decision.id ? "active" : ""} onClick={() => chooseDecision(item.id)}>
            <strong>{item.shortTitle}</strong><small>{item.date}</small>
          </button>
        ))}
      </aside>
      <div className="demo-decision-workspace">
        <div className="demo-workspace-title"><div><span>DECISION WORKSPACE</span><h2>Make the next financial decision with context.</h2></div><button type="button" onClick={onOpenFinances}>Review connected data <span>›</span></button></div>
        <section className="demo-question-card" aria-label="Demo decision analysis">
          <div className="demo-question-main">
            <span>ASK LINC</span>
            <label htmlFor="demo-question">Your financial question</label>
            <textarea id="demo-question" value={decision.question} readOnly />
            <p>Uses connected accounts, calculations, and current context when available.</p>
          </div>
          <button type="button" className="demo-ask-button" onClick={() => setAskNotice(true)}>Ask follow-up <span>↑</span></button>
          {askNotice ? <div className="demo-ask-notice" role="status">Question asking is disabled in this demo. Start a free trial to ask your own.</div> : null}
          <div className="demo-tabs" role="tablist" aria-label="Demo decision details">
            {(["answer", "math", "sources"] as const).map((item) => <button type="button" role="tab" aria-selected={tab === item} key={item} onClick={() => setTab(item)}>{item}</button>)}
          </div>
          <div className="demo-decision-layout">
            <div className="demo-tab-content">
              {tab === "answer" ? <AnswerPanel decision={decision} /> : null}
              {tab === "math" ? <MathPanel /> : null}
              {tab === "sources" ? <SourcesPanel /> : null}
            </div>
            <DemoOverview onOpenFinances={onOpenFinances} />
          </div>
        </section>
      </div>
    </div>
  );
}

function FinancesView({ onOpenAccounts }: { onOpenAccounts: () => void }) {
  const [chartMode, setChartMode] = useState<"assets" | "debt">("assets");
  const [openGroup, setOpenGroup] = useState("investments");
  const groups = [
    ["cash", "Cash Accounts", "4 accounts", "$82,651"],
    ["investments", "Investment Accounts", "14 accounts", "$2,291,203"],
    ["debt", "Debt Accounts", "4 accounts", "$350,305"],
  ] as const;

  return (
    <div className="demo-finances-view">
      <div className="demo-page-heading"><span>FINANCIAL OVERVIEW</span><h2>Your finances</h2><p>Your whole financial picture, in one place.</p></div>
      <section className="demo-net-worth-card">
        <span>NET WORTH</span><strong>$3,668,349</strong><p>Assets, investments, and property less connected debt.</p><small>Source data as of 8/30/2026 · Snapshot computed 8/30/2026</small>
      </section>
      <section className="demo-chart-card">
        <div className="demo-chart-heading"><h3>Financial Metrics Over Time</h3><div><button type="button" className={chartMode === "assets" ? "active" : ""} onClick={() => setChartMode("assets")}>Assets &amp; Net Worth</button><button type="button" className={chartMode === "debt" ? "active" : ""} onClick={() => setChartMode("debt")}>Debt</button></div></div>
        <svg viewBox="0 0 820 235" role="img" aria-label={chartMode === "assets" ? "Net worth and assets over time" : "Debt over time"}>
          <defs><linearGradient id="demoArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b9d0f3" stopOpacity=".9"/><stop offset="100%" stopColor="#b9d0f3" stopOpacity=".18"/></linearGradient></defs>
          {[30,80,130,180,230].map((y) => <line key={y} x1="35" x2="810" y1={y} y2={y} stroke="#cfd5cd" strokeWidth="1" />)}
          {chartMode === "assets" ? <><path d="M35 182 L75 164 L120 160 L175 155 L225 166 L260 82 L315 86 L370 73 L430 69 L495 72 L550 63 L620 65 L680 58 L730 66 L770 52 L810 49 L810 230 L35 230 Z" fill="url(#demoArea)"/><path d="M35 182 L75 164 L120 160 L175 155 L225 166 L260 82 L315 86 L370 73 L430 69 L495 72 L550 63 L620 65 L680 58 L730 66 L770 52 L810 49" fill="none" stroke="#173e2d" strokeWidth="4" strokeLinecap="round"/></> : <><path d="M35 68 L105 72 L175 78 L245 83 L315 91 L385 98 L455 110 L525 121 L595 135 L665 149 L735 162 L810 176" fill="none" stroke="#82634b" strokeWidth="4" strokeLinecap="round"/><path d="M35 68 L105 72 L175 78 L245 83 L315 91 L385 98 L455 110 L525 121 L595 135 L665 149 L735 162 L810 176 L810 230 L35 230 Z" fill="#ead8c5" opacity=".62"/></>}
        </svg>
      </section>
      <div className="demo-finance-metrics">{overviewMetrics.slice(1).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <section className="demo-account-groups">
        <div className="demo-section-title"><div><span>CONNECTED ACCOUNTS</span><h3>What makes up the total</h3></div><button type="button" onClick={onOpenAccounts}>Open accounts &amp; context <span>→</span></button></div>
        {groups.map(([id, label, count, value]) => <div key={id}><button type="button" aria-expanded={openGroup === id} onClick={() => setOpenGroup(openGroup === id ? "" : id)}><span>{openGroup === id ? "−" : "+"}</span><strong>{label}</strong><small>{count}</small><b>{value}</b></button>{openGroup === id ? <p>{id === "cash" ? "Checking, savings, and cash-management balances." : id === "investments" ? "Retirement, taxable, pension, and treasury accounts." : "Mortgage and connected credit-card balances."}</p> : null}</div>)}
      </section>
    </div>
  );
}

function AccountsView() {
  const [portfolioTab, setPortfolioTab] = useState<PortfolioTab>("overview");
  return (
    <div className="demo-accounts-view">
      <div className="demo-page-heading"><span>ACCOUNTS &amp; CONTEXT</span><h2>Your accounts &amp; context</h2><p>Keep the information behind every answer current.</p></div>
      <section className="demo-context-card">
        <div><span>WHAT LINC REMEMBERS</span><h3>Your household context</h3></div>
        <dl><div><dt>Age</dt><dd>48</dd></div><div><dt>Household</dt><dd>Married</dd></div><div><dt>Home value</dt><dd>$1,644,800</dd></div><div><dt>Annual retirement spending</dt><dd>$150,000</dd></div></dl>
      </section>
      <section className="demo-connected-summary">
        <div className="demo-section-title"><div><span>READ-ONLY CONNECTIONS</span><h3>Connected financial accounts</h3></div><b>22 accounts</b></div>
        <div><article><span>Banking &amp; cards</span><strong>8 connections</strong><small>Cash, credit cards, and mortgage balances</small></article><article><span>Investments</span><strong>14 accounts</strong><small>Retirement, taxable, pension, and treasury accounts</small></article><article><span>Connection health</span><strong>21 reporting</strong><small>1 account needs attention</small></article></div>
      </section>
      <section className="demo-portfolio">
        <div className="demo-portfolio-heading"><h3>Investment Portfolio</h3><div><span>Total Portfolio Value<strong>$2,291,202.92</strong></span><span>Total Holdings<strong>118</strong></span><span>Unique Securities<strong>79</strong></span><span>Recent Transactions<strong>2774</strong></span></div></div>
        <div className="demo-portfolio-tabs" role="tablist" aria-label="Demo investment portfolio details">{(["overview", "holdings", "transactions"] as const).map((tab) => <button type="button" role="tab" aria-selected={portfolioTab === tab} key={tab} onClick={() => setPortfolioTab(tab)}>{tab === "overview" ? "Portfolio Overview" : tab[0].toUpperCase() + tab.slice(1)}</button>)}</div>
        {portfolioTab === "overview" ? <div className="demo-allocation"><h4>Asset Allocation</h4>{allocation.map(([label, value, percent]) => <div key={label}><span>{label}</span><b>{value}</b><i><em style={{ width: percent }} /></i><small>{percent}</small></div>)}</div> : null}
        {portfolioTab === "holdings" ? <div className="demo-holdings-table"><h4>Holdings by category</h4><table><thead><tr><th>Category</th><th>Value</th><th>Share</th></tr></thead><tbody>{allocation.slice(0, 6).map(([label, value, percent]) => <tr key={label}><td>{label}</td><td>{value}</td><td>{percent}</td></tr>)}</tbody></table></div> : null}
        {portfolioTab === "transactions" ? <div className="demo-transactions"><h4>Recent activity</h4><div><span>Transfer in<small>Aug 27, 2026</small></span><strong>+$1,415.19</strong></div><div><span>Credit-card payment<small>Aug 27, 2026</small></span><strong>−$234.81</strong></div><div><span>Groceries<small>Aug 27, 2026</small></span><strong>−$7.46</strong></div><div><span>Coffee<small>Aug 27, 2026</small></span><strong>−$10.99</strong></div></div> : null}
      </section>
    </div>
  );
}

export default function StaticProductDemo() {
  const [view, setView] = useState<DemoView>("decisions");
  return (
    <figure className="static-product-demo" id="product-demo" aria-label="Interactive Ask Linc product demo">
      <div className="demo-browser-bar"><div aria-hidden="true"><span/><span/><span/></div><p><i>⌁</i> asklinc.com/demo</p><strong>INTERACTIVE DEMO</strong></div>
      <div className="demo-app-shell">
        <aside className="demo-app-nav">
          <div className="demo-app-brand"><span>L</span><strong>Ask Linc</strong><small>DEMO</small></div>
          <nav aria-label="Interactive demo navigation">
            <button type="button" className={view === "decisions" ? "active" : ""} aria-current={view === "decisions" ? "page" : undefined} onClick={() => setView("decisions")}><span aria-hidden="true">✦</span> Decisions</button>
            <button type="button" className={view === "finances" ? "active" : ""} aria-current={view === "finances" ? "page" : undefined} onClick={() => setView("finances")}><span aria-hidden="true">▥</span> Finances</button>
            <button type="button" className={view === "accounts" ? "active" : ""} aria-current={view === "accounts" ? "page" : undefined} onClick={() => setView("accounts")}><span aria-hidden="true">◎</span> Accounts &amp; context</button>
          </nav>
          <p>Explore freely. Asking new questions is disabled.</p>
        </aside>
        <main className="demo-app-main">
          {view === "decisions" ? <DecisionsView onOpenFinances={() => setView("finances")} /> : null}
          {view === "finances" ? <FinancesView onOpenAccounts={() => setView("accounts")} /> : null}
          {view === "accounts" ? <AccountsView /> : null}
        </main>
      </div>
      <figcaption>Interactive demo using real product output. Identifying details removed.</figcaption>
    </figure>
  );
}
