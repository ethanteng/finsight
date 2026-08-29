"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "./SiteShell";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";

const scenarios = [
  "Where is our spending quietly drifting?",
  "Can one of us take parental leave?",
  "Is our portfolio taking too much risk?",
  "What would let us retire two years sooner?",
];

const ageScenarios = {
  58: { portfolio: "$1.8M", surplus: "−$100K", odds: "62–72%", note: "Possible, but the plan has little room for a long downturn." },
  60: { portfolio: "$2.1M", surplus: "+$200K", odds: "74–84%", note: "This keeps the planned lifestyle with a more useful cushion." },
  62: { portfolio: "$2.4M", surplus: "+$500K", odds: "84–91%", note: "Working two more years adds flexibility, but may be more than the plan needs." },
};

export default function Home() {
  const [showMath, setShowMath] = useState(false);
  const [retirementAge, setRetirementAge] = useState<58 | 60 | 62>(60);
  const activeScenario = ageScenarios[retirementAge];

  return (
    <main className="marketing-site">
      <SiteHeader />

      <section className="hero shell" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse" /> Financial planning for real life</div>
          <h1>See what a big decision changes. <em>Before you make it.</em></h1>
          <p className="hero-subhead">
            Buying a home, growing your family, changing jobs, or planning retirement?
            Connect your accounts and ask in your own words. Linc grounds each answer in your
            financial picture, goals, and real-life context—while you stay in control of what
            you connect and share.
          </p>
          <div className="hero-actions">
            <MarketingGetStartedButton className="button button-primary" />
          </div>
          <p className="microcopy"><strong>1 month free</strong>, then $9/month. Cancel anytime.</p>
        </div>

        <div className="answer-wrap" id="answer">
          <div className="context-chip context-chip-a">
            <span>ILLUSTRATIVE</span>
            30Y mortgage&nbsp; 6.4%
          </div>
          <article className="answer-card" aria-label="Example Ask Linc answer">
            <div className="answer-topbar">
              <div className="mini-brand"><span className="brand-mark small">L</span> Ask Linc</div>
              <div className="context-chip context-chip-inline context-chip-b">
                <span>SAMPLE</span>
                6 accounts
              </div>
              <span className="sample-label">SAMPLE ANSWER</span>
            </div>
            <div className="question-row">
              <span className="avatar">
                <Image src="/images/ethan-teng-cartoon.webp" alt="Ethan Teng" fill sizes="27px" />
              </span>
              <p>Can we afford a $700K home without pausing retirement savings?</p>
            </div>
            <div className="answer-body">
              <p className="verdict"><span className="check">✓</span> Yes—if you keep at least $45K in cash.</p>
              <p className="answer-summary">
                A 15% down payment leaves a six-month emergency fund and keeps both retirement contributions unchanged.
                Putting 20% down would leave too little cash after closing.
              </p>
              <div className="metrics">
                <div><span>Home price</span><strong>$700K</strong></div>
                <div><span>Cash after closing</span><strong>$48K</strong></div>
                <div><span>Retirement saving</span><strong>On track</strong></div>
              </div>
              <div className="recommendation">
                <span className="rec-label">LINC&apos;S TAKE</span>
                <p>Put 15% down, keep total housing costs below $4,800 a month, and leave both 401(k) contributions alone.</p>
              </div>
              <button className="math-toggle" type="button" onClick={() => setShowMath(!showMath)} aria-expanded={showMath}>
                <span>∑</span> {showMath ? "Hide the math" : "Show the math"}
                <span className="chevron">{showMath ? "−" : "+"}</span>
              </button>
              {showMath && (
                <div className="math-panel">
                  <div><span>Cash available</span><b>$165K</b></div>
                  <div><span>15% down payment</span><b>−$105K</b></div>
                  <div><span>Closing + moving</span><b>−$12K</b></div>
                  <div><span>Cash remaining</span><b>$48K</b></div>
                  <p>Illustrative calculation using sample accounts and a 6.4% mortgage rate.</p>
                </div>
              )}
            </div>
          </article>
        </div>
      </section>

      <section className="proof-strip" aria-label="Product trust signals">
        <div className="shell proof-grid">
          <p><strong>Your real context</strong><span>accounts, goals, spending, debt, and investments</span></p>
          <p><strong>Read-only</strong><span>Linc can&apos;t move your money</span></p>
          <p><Link href="/trust"><strong>Inspectable answers</strong><span>see the assumptions and calculations</span></Link></p>
          <p><strong>Never training data</strong><span>no opt-out or settings required</span></p>
        </div>
      </section>

      <section className="question-ticker" aria-label="Questions you can ask Linc">
        <div className="ticker-label">ASK THE HARD QUESTIONS</div>
        <div className="ticker-items">
          {scenarios.map((item, index) => <span key={item}><i>{String(index + 1).padStart(2, "0")}</i>{item}</span>)}
        </div>
      </section>

      <section className="section shell question-to-answer-section" id="ask">
        <div className="section-heading split-heading">
          <div>
            <p className="section-kicker">THE CONTEXT DIFFERENCE</p>
            <h2>Same question.<br />A very different answer.</h2>
          </div>
          <p>General guidance can sound sensible and still miss your life. Connected context turns the same question into a recommendation you can inspect, challenge, and act on.</p>
        </div>

        <div className="connection-comparison-grid">
          <article className="connection-panel without-connection">
            <header className="connection-panel-header">
              <h3>Without Ask Linc connected</h3>
              <span>GENERAL ANSWER</span>
            </header>
            <div className="connection-panel-body">
              <div className="comparison-prompt">
                <span>YOU ASK</span>
                <p>Should I use my $30K bonus to pay down the mortgage, invest it, or keep it in cash for our move next year?</p>
              </div>
              <div className="comparison-response-lead">
                <span className="brand-mark small">L</span>
                <p>Here&apos;s a general framework for deciding how to use a bonus when several goals are competing.</p>
              </div>
              <ol className="generic-response-list">
                <li><span>1</span><div><b>Protect your emergency fund</b><p>Keep three to six months of expenses available before putting extra cash elsewhere.</p></div></li>
                <li><span>2</span><div><b>Compare debt and investing</b><p>Weigh your mortgage rate against the return you might earn by investing.</p></div></li>
                <li><span>3</span><div><b>Consider splitting the bonus</b><p>Using some for each goal can be a reasonable compromise.</p></div></li>
              </ol>
              <div className="generic-response-caveat">
                <span>WHAT THIS ANSWER DOESN&apos;T KNOW</span>
                <p>Your cash balance, mortgage rate, retirement contributions, taxes, or how much the move will require.</p>
              </div>
            </div>
          </article>

          <article className="connection-panel with-connection">
            <header className="connection-panel-header">
              <h3>With Ask Linc connected</h3>
              <span>GROUNDED ANSWER</span>
            </header>
            <div className="connection-panel-body">
              <div className="comparison-prompt">
                <span>YOU ASK</span>
                <p>Should I use my $30K bonus to pay down the mortgage, invest it, or keep it in cash for our move next year?</p>
              </div>
              <div className="comparison-response-lead">
                <span className="brand-mark small">L</span>
                <p>I&apos;ll use your cash reserve, move target, mortgage rate, and retirement plan to compare the options.</p>
              </div>

              <div className="connected-money-card" aria-label="Illustrative connected financial context">
                <div className="connected-money-head"><span>YOUR DECISION INPUTS</span><small>SAMPLE DATA</small></div>
                <div className="cash-goal-row"><span>Cash today</span><b>$42K</b></div>
                <div className="cash-track"><i style={{ width: "70%" }} /><em>Move-fund floor $60K</em></div>
                <div className="connected-money-metrics">
                  <span><i>BONUS</i><b>$30K</b></span>
                  <span><i>MORTGAGE</i><b>6.4%</b></span>
                  <span><i>401(K)</i><b>Match maxed</b></span>
                </div>
              </div>

              <div className="grounded-recommendation">
                <span>LINC&apos;S TAKE</span>
                <h4>Keep $18K in cash to reach the move-fund floor. Put the remaining $12K toward retirement. Don&apos;t prepay the mortgage yet.</h4>
              </div>
              <div className="grounded-next-step"><span>NEXT STEP</span><p>Set aside the $18K now, then compare the tax impact of the remaining retirement options before contributing.</p></div>
              <p className="connection-sample-note">Illustrative answer using sample accounts and assumptions you can inspect.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="section shell model-section" id="how">
        <div className="section-heading split-heading">
          <div>
            <p className="section-kicker">THE DIFFERENCE</p>
            <h2>One decision affects<br />the rest of your plan.</h2>
          </div>
          <p>Money shapes where you live, how you care for family, and the future you can plan for. But the full picture is often scattered across accounts, cards, loans, investment apps, and spreadsheets. Linc connects it and turns it into one decision-ready answer.</p>
        </div>
        <div className="model-grid">
          <article className="model-card model-inputs">
            <div className="model-card-label">YOUR FINANCIAL MODEL</div>
            <div className="orbit">
              <div className="orbit-core"><span className="brand-mark">L</span><b>Your plan</b></div>
              <span className="orbit-item orbit-a">Cash <b>$92K</b></span>
              <span className="orbit-item orbit-b">Retirement <b>$285K</b></span>
              <span className="orbit-item orbit-c">Income <b>$210K</b></span>
              <span className="orbit-item orbit-d">Goal <b>Buy in 18 mo.</b></span>
            </div>
            <p>Cash, debt, property, taxes, goals, and risk stay connected—not trapped in separate tabs.</p>
          </article>
          <article className="model-card market-card">
            <div className="model-card-label">ILLUSTRATIVE MARKET SNAPSHOT</div>
            <div className="market-visual">
              <div className="signal signal-up"><span>10Y TREASURY</span><b>4.18%</b><i>↗</i></div>
              <div className="signal"><span>CORE INFLATION</span><b>2.7%</b><i>→</i></div>
              <div className="signal signal-down"><span>S&amp;P 500</span><b>5,982</b><i>↘</i></div>
              <div className="signal-note">When a question depends on rates, inflation, or market performance, Linc uses the latest available data and shows the source date.</div>
            </div>
          </article>
          <article className="model-card reasoning-card">
            <div className="model-card-label">LINC&apos;S REASONING</div>
            <div className="reason-steps">
              <span><i>01</i> Build the baseline</span>
              <span><i>02</i> Stress the assumptions</span>
              <span><i>03</i> Compare the tradeoffs</span>
              <span className="active"><i>04</i> Make a recommendation</span>
            </div>
            <a className="reason-output" href="#scenarios">A decision, not another dashboard <span>→</span></a>
          </article>
        </div>
      </section>

      <section className="ecosystem-section">
        <div className="shell ecosystem-shell">
          <div className="section-heading split-heading ecosystem-heading">
            <div>
              <p className="section-kicker light">CONNECTED TODAY</p>
              <h2>Your financial ecosystem is already here.</h2>
            </div>
            <p>Broad enough to see the whole plan. Deep enough to examine the accounts, holdings, property estimates, and outside conditions that can change the decision.</p>
          </div>

          <div className="ecosystem-grid" aria-label="Data providers that power Ask Linc">
            <article>
              <span>01 · MONEY IN MOTION</span>
              <small className="ecosystem-providers">PLAID</small>
              <h3>Accounts + cash flow</h3>
              <p>Checking, savings, cards, loans, balances, transactions, and month-by-month income and spending.</p>
            </article>
            <article>
              <span>02 · PORTFOLIO INTELLIGENCE</span>
              <small className="ecosystem-providers">SNAPTRADE · FMP · TIINGO</small>
              <h3>Investments, looked through</h3>
              <p>Brokerage positions and cash, plus fund fees, sector and country exposure, quotes, and recent returns.</p>
            </article>
            <article>
              <span>03 · PROPERTY</span>
              <small className="ecosystem-providers">RENTCAST</small>
              <h3>Home value, with a range</h3>
              <p>A current property estimate, its dated 85% range, and a validated property match for housing and net-worth decisions.</p>
            </article>
            <article>
              <span>04 · MARKETS + PLANNING</span>
              <small className="ecosystem-providers">FRED · MASSIVE · BRAVE · FRENCH / SHILLER</small>
              <h3>Rates, markets + history</h3>
              <p>Inflation, consumer and Treasury rates, current market evidence, and long-run history for stress tests.</p>
            </article>
          </div>

          <div className="ecosystem-outcome">
            <div><span>ONE QUESTION, THE RELEVANT FACTS</span><strong>Linc does not throw the whole data stack at every answer. It selects the useful facts, runs repeatable calculations, and keeps assumptions, sources, and dates visible.</strong></div>
            <Link href="/integrations">Explore the data ecosystem <span>→</span></Link>
          </div>
        </div>
      </section>

      <section className="section scenario-section" id="scenarios">
        <div className="shell scenario-shell">
          <div className="scenario-copy">
            <p className="section-kicker">WHAT-IF, WITHOUT THE SPREADSHEET</p>
            <h2>Change one assumption. See everything it changes.</h2>
            <p>Explore the decision until it feels clear—not because Linc gave you one answer, but because you can see what moves it.</p>
            <div className="scenario-tabs" role="group" aria-label="Retirement age">
              {([58, 60, 62] as const).map((age) => (
                <button key={age} className={retirementAge === age ? "active" : ""} aria-pressed={retirementAge === age} onClick={() => setRetirementAge(age)}>
                  Retire at {age}
                </button>
              ))}
            </div>
          </div>
          <div className="scenario-card" aria-live="polite">
            <div className="scenario-card-head"><span>RETIREMENT SCENARIO</span><b>Age {retirementAge}</b></div>
            <div className="scenario-chart">
              <div className="chart-line chart-target"><span>Plan needs $1.9M</span></div>
              <div className="chart-bar-wrap">
                {[42, 52, 61, retirementAge === 58 ? 70 : retirementAge === 60 ? 78 : 88].map((height, index) => (
                  <div className="chart-bar" key={index} style={{ height: `${height}%` }}><span>{index === 4 ? activeScenario.portfolio : ""}</span></div>
                ))}
              </div>
              <div className="chart-axis"><span>Today</span><span>Age {retirementAge}</span></div>
            </div>
            <div className="scenario-result">
              <div><span>Projected surplus</span><b>{activeScenario.surplus}</b></div>
              <div><span>Success range</span><b>{activeScenario.odds}</b></div>
            </div>
            <p className="scenario-note"><span>✓</span>{activeScenario.note}</p>
          </div>
        </div>
      </section>

      <section className="privacy-section" id="privacy">
        <div className="shell privacy-shell">
          <div className="privacy-copy">
            <p className="section-kicker light">PRIVACY BY DESIGN</p>
            <h2>Your financial data is never used to train AI models.</h2>
            <p>That promise does not depend on a setting or an opt-out. You choose what to connect and can disconnect or request deletion at any time. Credentials stay with connection providers, and sensitive labels are replaced before AI analysis.</p>
            <div className="privacy-training-promise"><b>NO TRAINING</b><span>No toggle. No opt-out. Your financial data stays yours.</span></div>
            <Link className="light-link" href="/how-we-protect-your-data">See how your data is protected <span>→</span></Link>
          </div>
          <div className="privacy-flow" aria-label="How Ask Linc protects data">
            <div className="privacy-node"><span className="privacy-icon">▰</span><b>Your accounts</b><small>Connected through Plaid</small></div>
            <span className="flow-arrow">→</span>
            <div className="privacy-node shield-node"><span className="privacy-icon">◇</span><b>Privacy layer</b><small>Identity removed</small></div>
            <span className="flow-arrow">→</span>
            <div className="privacy-node"><span className="privacy-icon">L</span><b>Linc&apos;s analysis</b><small>Only the data needed</small></div>
          </div>
          <div className="privacy-points">
            <span><i>✓</i> Read-only access</span>
            <span><i>✓</i> Never used for training</span>
            <span><i>✓</i> Disconnect anytime</span>
          </div>
        </div>
      </section>

      <section className="section shell founder-section">
        <div className="founder-statement">
          <span className="quote-mark">“</span>
          <blockquote>The answers sounded convincing. But financial decisions need more than convincing.</blockquote>
          <div className="founder-signature">
            <div className="founder-avatar">
              <Image src="/images/ethan-teng-cartoon.webp" alt="" fill sizes="42px" />
            </div>
            <div><b>Ethan Teng</b><span>Founder, Ask Linc</span></div>
          </div>
        </div>
        <div className="founder-story">
          <p className="section-kicker">WHY I BUILT THIS</p>
          <h2>I wanted an answer I could trust with my own money.</h2>
          <p>After getting laid off, I pasted my bank statements into ChatGPT to answer tough money questions—and immediately regretted it.</p>
          <p>Financial decisions need your real financial picture, reliable calculations, dated market inputs when they matter, and numbers you can inspect. So I built Ask Linc.</p>
          <p>Ask Linc is still early. I&apos;m learning from real questions, improving it carefully, and expanding only when it makes the answers more useful and trustworthy.</p>
          <Link className="text-link" href="/about">Read the full story <span>→</span></Link>
        </div>
      </section>

      <section className="section pricing-section" id="pricing">
        <div className="shell pricing-shell">
          <div className="pricing-copy">
            <p className="section-kicker">SIMPLE PRICING</p>
            <h2>Planning help before<br />the decision gets expensive.</h2>
            <p>No asset minimum. No percentage of your wealth. No sales call.</p>
            <p className="compare-label">Compare this price to:</p>
            <div className="advisor-compare">
              <span>A 1% advisor fee on $500K</span><strong>$5,000<small>/year</small></strong>
              <i>Illustrative comparison</i>
            </div>
          </div>
          <article className="price-card">
            <div className="price-card-top"><span>ONE PLAN. EVERYTHING INCLUDED.</span><b>MOST POPULAR</b></div>
            <div className="price"><sup>$</sup>9<span>/month</span></div>
            <p>Less than two coffees. Cancel anytime.</p>
            <ul>
              <li>Unlimited questions &amp; follow-ups</li>
              <li>Unlimited connected accounts</li>
              <li>What-if scenarios</li>
              <li>Market-aware analysis</li>
              <li>Inspectable calculations</li>
            </ul>
            <MarketingGetStartedButton className="button button-primary price-button" />
          </article>
        </div>
      </section>

      <section className="final-cta">
        <div className="shell final-cta-inner">
          <p className="section-kicker light">YOUR NEXT DECISION STARTS HERE</p>
          <h2>Ask the money question you actually need answered.</h2>
          <MarketingGetStartedButton className="button button-primary" />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
