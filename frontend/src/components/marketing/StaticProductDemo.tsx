"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DEMO_DECISIONS as decisions, type DemoDecision } from "@/data/product-demo-examples";
import {
  pushProductDemoCompleted,
  pushProductDemoDetailViewed,
  pushProductDemoSectionViewed,
  pushProductDemoStarted,
  type ProductDemoDetail,
} from "@/lib/dataLayer";

type DemoView = "decisions" | "finances" | "accounts";
type DecisionTab = "answer" | "math" | "sources";
type PortfolioTab = "overview" | "holdings" | "transactions";

const decisionTabs: DecisionTab[] = ["answer", "math", "sources"];
const autoTabDelay = 4300;
const autoClickLead = 260;
const autoClickDuration = 720;

export { decisions as DEMO_DECISIONS };

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
      <div className="demo-current-answer"><span>✓</span> Linc’s answer</div>
      <p className="demo-answer-summary"><strong>{decision.verdict}</strong> {decision.summary}</p>
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
      <section className="demo-answer-list" aria-label="Demo takeaways">
        <h3><span aria-hidden="true">♧</span> What I’d pay attention to</h3>
        <ol>{decision.takeaways.map((item) => <li key={item}>{item}</li>)}</ol>
      </section>
      <section className="demo-answer-list demo-action-list" aria-label="Demo action items">
        <h3><span aria-hidden="true">✓</span> What I’d do next</h3>
        <ol>{decision.actions.map((item) => <li key={item}>{item}</li>)}</ol>
      </section>
    </div>
  );
}

function MathPanel({ decision }: { decision: DemoDecision }) {
  return (
    <div className="demo-math-panel">
      <div className="demo-panel-heading"><div><span aria-hidden="true">▦</span><div><h3>The numbers behind this answer</h3><p>Inputs, assumptions, and calculations for this example.</p></div></div></div>
      <section className="demo-answer-list">
        <h3>Your numbers</h3>
        <div className="demo-accordion-content"><table><thead><tr><th>Input</th><th>Value</th><th>Source</th></tr></thead><tbody>{decision.facts.map(([label, value, source]) => <tr key={label}><td>{label}</td><td>{value}</td><td>{source}</td></tr>)}</tbody></table></div>
      </section>
      <section className="demo-answer-list"><h3>Assumptions</h3><ul>{decision.assumptions.map(item => <li key={item}>{item}</li>)}</ul></section>
      <section className="demo-answer-list">
        <h3>Calculations</h3>
        <div className="demo-accordion-content"><table><thead><tr><th>Calculation</th><th>Result</th><th>How it was worked out</th></tr></thead><tbody>{decision.calculations.map(([label, value, method]) => <tr key={label}><td>{label}</td><td>{value}</td><td>{method}</td></tr>)}</tbody></table></div>
      </section>
      <section className="demo-answer-list"><h3>Checks and limits</h3><ul>{decision.checks.map(item => <li key={item}>{item}</li>)}</ul></section>
    </div>
  );
}

function SourcesPanel({ decision }: { decision: DemoDecision }) {
  return (
    <div className="demo-sources-panel">
      <div className="demo-panel-heading"><div><span aria-hidden="true">▤</span><div><h3>Where the numbers came from</h3><p>Sample inputs and calculation sources for this answer.</p></div></div></div>
      {decision.sources.map(source => <section className="demo-answer-list" key={source.title}><h3>{source.title}</h3><p>{source.detail}</p>{source.href ? <Link className="demo-text-button" href={source.href}>Explore this source <span aria-hidden="true">→</span></Link> : null}</section>)}
    </div>
  );
}

function DecisionsView({
  onOpenFinances,
  onDetailViewed,
}: {
  onOpenFinances: () => void;
  onDetailViewed: (detail: ProductDemoDetail) => void;
}) {
  const [decisionId, setDecisionId] = useState(decisions[0].id);
  const [tab, setTab] = useState<DecisionTab>("answer");
  const [askNotice, setAskNotice] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [autoClickTab, setAutoClickTab] = useState<DecisionTab | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const demoRef = useRef<HTMLDivElement>(null);
  const decision = decisions.find((item) => item.id === decisionId) ?? decisions[0];

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setReduceMotion(mediaQuery.matches);
    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);
    return () => mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    const demo = demoRef.current;
    if (!demo) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting && entry.intersectionRatio >= 0.35),
      { threshold: [0.35] },
    );
    observer.observe(demo);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!autoPlay || !isVisible || reduceMotion || autoClickTab) return;
    const nextTab = decisionTabs[(decisionTabs.indexOf(tab) + 1) % decisionTabs.length];
    const timer = window.setTimeout(() => setAutoClickTab(nextTab), autoTabDelay);
    return () => window.clearTimeout(timer);
  }, [autoClickTab, autoPlay, isVisible, reduceMotion, tab]);

  useEffect(() => {
    if (!autoClickTab) return;
    const selectTimer = window.setTimeout(() => setTab(autoClickTab), autoClickLead);
    const clearTimer = window.setTimeout(() => setAutoClickTab(null), autoClickDuration);
    return () => {
      window.clearTimeout(selectTimer);
      window.clearTimeout(clearTimer);
    };
  }, [autoClickTab]);

  function stopAutoPlay() {
    setAutoPlay(false);
    setAutoClickTab(null);
  }

  function chooseDecision(id: string) {
    stopAutoPlay();
    setDecisionId(id);
    setTab("answer");
    setAskNotice(false);
  }

  function chooseTab(nextTab: DecisionTab) {
    stopAutoPlay();
    if (nextTab !== tab) onDetailViewed(nextTab);
    setTab(nextTab);
  }

  return (
    <div
      className="demo-decisions-view"
      ref={demoRef}
      onFocusCapture={stopAutoPlay}
      onPointerDownCapture={stopAutoPlay}
      onKeyDownCapture={stopAutoPlay}
    >
      <aside className="demo-recent-decisions" aria-label="Demo recent decisions">
        <div><span>Recent decisions</span><b>{decisions.length}</b></div>
        {decisions.map((item) => (
          <button type="button" key={item.id} className={item.id === decision.id ? "active" : ""} onClick={() => chooseDecision(item.id)}>
            <strong>{item.shortTitle}</strong><small>{item.date}</small>
          </button>
        ))}
      </aside>
      <div className="demo-decision-workspace">
        <div className="demo-workspace-title"><div><span>DECISION WORKSPACE</span><h2>Work through your next money decision.</h2></div><button type="button" onClick={onOpenFinances}>Review connected data <span>›</span></button></div>
        <section className="demo-question-card" aria-label="Demo decision analysis">
          <div className="demo-question-main">
            <span>ASK LINC</span>
            <h3 className="demo-question-text" id="demo-question">{decision.question}</h3>
            <p>Example answer based on the sample accounts and assumptions shown here.</p>
          </div>
          <button type="button" className="demo-ask-button" onClick={() => setAskNotice(true)}>Ask follow-up <span>↑</span></button>
          {askNotice ? <div className="demo-ask-notice" role="status">This demo shows saved examples. Start free to ask Linc your own question.</div> : null}
          <div className="demo-tabs" role="tablist" aria-label="Demo decision details">
            {decisionTabs.map((item) => (
              <button
                type="button"
                role="tab"
                aria-selected={tab === item}
                data-auto-click={autoClickTab === item ? "true" : undefined}
                key={item}
                onClick={() => chooseTab(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="demo-decision-layout">
            <div className="demo-tab-content">
              {tab === "answer" ? <AnswerPanel decision={decision} /> : null}
              {tab === "math" ? <MathPanel decision={decision} /> : null}
              {tab === "sources" ? <SourcesPanel decision={decision} /> : null}
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
        <dl><div><dt>Age</dt><dd>48</dd></div><div><dt>Household</dt><dd>Married</dd></div><div><dt>Home value</dt><dd>$1,644,800</dd></div><div><dt>Annual retirement spending</dt><dd>$150,000</dd></div><div><dt>Annual take-home pay</dt><dd>$195,000</dd></div><div><dt>Annual saving</dt><dd>$45,000</dd></div></dl>
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

type StaticProductDemoProps = {
  anchorId?: string | null;
  /** Emit the dedicated /demo funnel events. Shared marketing embeds leave this disabled. */
  trackAnalytics?: boolean;
};

export default function StaticProductDemo({
  anchorId = "product-demo",
  trackAnalytics = false,
}: StaticProductDemoProps = {}) {
  const [view, setView] = useState<DemoView>("decisions");
  const started = useRef(false);
  const completed = useRef(false);
  const viewedSections = useRef(new Set<DemoView>(["decisions"]));

  function trackStart() {
    if (!trackAnalytics || started.current) return;
    started.current = true;
    pushProductDemoStarted();
  }

  /** Count intentional activation keys only — Tabbing through the widget is not engagement. */
  function trackStartFromKey(event: { key: string }) {
    if (event.key !== "Enter" && event.key !== " ") return;
    trackStart();
  }

  function selectView(nextView: DemoView) {
    if (trackAnalytics) {
      trackStart();
      if (nextView !== view) pushProductDemoSectionViewed(nextView);
      viewedSections.current.add(nextView);
      if (!completed.current && viewedSections.current.size === 3) {
        completed.current = true;
        pushProductDemoCompleted();
      }
    }
    setView(nextView);
  }

  function trackDetailViewed(detail: ProductDemoDetail) {
    if (!trackAnalytics) return;
    pushProductDemoDetailViewed(detail);
  }

  return (
    <figure
      className="static-product-demo"
      id={anchorId ?? undefined}
      aria-label="Interactive Ask Linc product demo"
      onClickCapture={trackStart}
      onKeyDownCapture={trackStartFromKey}
    >
      <div className="demo-browser-bar"><div aria-hidden="true"><span/><span/><span/></div><p><i>⌁</i> asklinc.com/demo</p><strong>INTERACTIVE DEMO</strong></div>
      <div className="demo-app-shell">
        <aside className="demo-app-nav">
          <div className="demo-app-brand"><span>L</span><strong>Ask Linc</strong><small>DEMO</small></div>
          <nav aria-label="Interactive demo navigation">
            <button type="button" className={view === "decisions" ? "active" : ""} aria-current={view === "decisions" ? "page" : undefined} onClick={() => selectView("decisions")}><span aria-hidden="true">✦</span> Decisions</button>
            <button type="button" className={view === "finances" ? "active" : ""} aria-current={view === "finances" ? "page" : undefined} onClick={() => selectView("finances")}><span aria-hidden="true">▥</span> Finances</button>
            <button type="button" className={view === "accounts" ? "active" : ""} aria-current={view === "accounts" ? "page" : undefined} onClick={() => selectView("accounts")}><span aria-hidden="true">◎</span> Accounts &amp; context</button>
          </nav>
          <p>Explore freely. Asking new questions is disabled.</p>
        </aside>
        <main className="demo-app-main">
          {view === "decisions" ? <DecisionsView onOpenFinances={() => selectView("finances")} onDetailViewed={trackDetailViewed} /> : null}
          {view === "finances" ? <FinancesView onOpenAccounts={() => selectView("accounts")} /> : null}
          {view === "accounts" ? <AccountsView /> : null}
        </main>
      </div>
      <figcaption>Illustrative household. Retirement results use Ask Linc’s calculator; home costs use the assumptions shown. Historical results are not forecasts.</figcaption>
    </figure>
  );
}
