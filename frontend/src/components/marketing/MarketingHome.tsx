"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "./SiteShell";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";

const scenarios = [
  "Can we retire at 60?",
  "Pay off the mortgage?",
  "Can we afford the lake house?",
  "What if the market drops 20%?",
];

const ageScenarios = {
  58: { portfolio: "$5.7M", surplus: "+$640K", odds: "68–76%", note: "Possible, with less margin for a prolonged downturn." },
  60: { portfolio: "$6.3M", surplus: "+$1.7M", odds: "75–85%", note: "The strongest balance of time, lifestyle, and resilience." },
  62: { portfolio: "$7.1M", surplus: "+$2.8M", odds: "86–92%", note: "More cushion than your current goals appear to require." },
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
          <div className="eyebrow"><span className="pulse" /> Your AI financial analyst</div>
          <h1>Your money has an answer. <em>Linc shows the work.</em></h1>
          <p className="hero-subhead">
            Ask the hard questions about retirement, debt, and big decisions.
            Get a clear recommendation grounded in your real finances and today&apos;s market.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="https://asklinc.com/demo">
              Ask Linc free <span aria-hidden="true">→</span>
            </a>
          </div>
          <p className="microcopy">No credit card · Sample data included · $9/month when you&apos;re ready</p>
        </div>

        <div className="answer-wrap" id="answer">
          <div className="context-chip context-chip-a">
            <span>LIVE</span>
            10Y Treasury&nbsp; 4.18%
          </div>
          <article className="answer-card" aria-label="Example Ask Linc answer">
            <div className="answer-topbar">
              <div className="mini-brand"><span className="brand-mark small">L</span> Ask Linc</div>
              <div className="context-chip context-chip-inline context-chip-b">
                <span>LINKED</span>
                8 accounts
              </div>
              <span className="sample-label">SAMPLE ANSWER</span>
            </div>
            <div className="question-row">
              <span className="avatar">
                <Image src="/images/ethan-teng-cartoon.webp" alt="Ethan Teng" fill sizes="27px" />
              </span>
              <p>Can we retire at 60 if rates stay higher for longer?</p>
            </div>
            <div className="answer-body">
              <p className="verdict"><span className="check">✓</span> Yes—with room to spare.</p>
              <p className="answer-summary">
                At 60, you&apos;re projected to have <strong>$1.7M more</strong> than your plan requires.
                The bigger risk isn&apos;t higher rates—it&apos;s having 92% in stocks this close to retirement.
              </p>
              <div className="metrics">
                <div><span>Projected at 60</span><strong>$6.3M</strong></div>
                <div><span>Plan requires</span><strong>$4.6M</strong></div>
                <div><span>Success range</span><strong>75–85%</strong></div>
              </div>
              <div className="recommendation">
                <span className="rec-label">LINC&apos;S TAKE</span>
                <p>Target 60. Clear the $444K debt by 53, then move toward 70% equities.</p>
              </div>
              <button className="math-toggle" type="button" onClick={() => setShowMath(!showMath)} aria-expanded={showMath}>
                <span>∑</span> {showMath ? "Hide the math" : "Show the math"}
                <span className="chevron">{showMath ? "−" : "+"}</span>
              </button>
              {showMath && (
                <div className="math-panel">
                  <div><span>Current invested assets</span><b>$3.18M</b></div>
                  <div><span>Annual savings</span><b>$82K</b></div>
                  <div><span>Retirement spending</span><b>$140K</b></div>
                  <div><span>Inflation assumption</span><b>2.5%</b></div>
                  <p>Calculated from linked sample accounts using a range of return and inflation assumptions.</p>
                </div>
              )}
            </div>
          </article>
        </div>
      </section>

      <section className="proof-strip" aria-label="Product trust signals">
        <div className="shell proof-grid">
          <p><strong>12,000+</strong><span>institutions connect via Plaid</span></p>
          <p><strong>Read-only</strong><span>Linc can&apos;t move your money</span></p>
          <p><strong>Inspectable</strong><span>Every number shows its work</span></p>
          <p><strong>Private</strong><span>Your data never trains AI</span></p>
        </div>
      </section>

      <section className="question-ticker" aria-label="Questions you can ask Linc">
        <div className="ticker-label">ASK THE HARD QUESTIONS</div>
        <div className="ticker-items">
          {scenarios.map((item, index) => <span key={item}><i>{String(index + 1).padStart(2, "0")}</i>{item}</span>)}
        </div>
      </section>

      <section className="section shell model-section" id="how">
        <div className="section-heading split-heading">
          <div>
            <p className="section-kicker">THE DIFFERENCE</p>
            <h2>One financial life.<br />One connected answer.</h2>
          </div>
          <p>Most tools show you pieces. Linc reasons across the whole picture—so an answer about your mortgage already understands your retirement plan.</p>
        </div>
        <div className="model-grid">
          <article className="model-card model-inputs">
            <div className="model-card-label">YOUR FINANCIAL MODEL</div>
            <div className="orbit">
              <div className="orbit-core"><span className="brand-mark">L</span><b>Your plan</b></div>
              <span className="orbit-item orbit-a">Investments <b>$3.18M</b></span>
              <span className="orbit-item orbit-b">Mortgage <b>$444K</b></span>
              <span className="orbit-item orbit-c">Income <b>$310K</b></span>
              <span className="orbit-item orbit-d">Goals <b>Retire at 60</b></span>
            </div>
            <p>Cash, debt, property, taxes, goals, and risk stay connected—not trapped in separate tabs.</p>
          </article>
          <article className="model-card market-card">
            <div className="model-card-label">TODAY&apos;S MARKET</div>
            <div className="market-visual">
              <div className="signal signal-up"><span>10Y TREASURY</span><b>4.18%</b><i>↗</i></div>
              <div className="signal"><span>CORE INFLATION</span><b>2.7%</b><i>→</i></div>
              <div className="signal signal-down"><span>S&amp;P 500</span><b>5,982</b><i>↘</i></div>
              <div className="signal-note">Current signals shape the answer—not last year&apos;s assumptions.</div>
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
              <div className="chart-line chart-target"><span>Plan needs $4.6M</span></div>
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
            <h2>Your finances stay yours. Even from the AI.</h2>
            <p>The AI never sees your bank names, account numbers, or identity. Sensitive details are stripped away before analysis.</p>
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
            <span><i>✓</i> Never trains AI</span>
            <span><i>✓</i> Delete anytime</span>
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
          <p>Financial decisions need your real financial picture, reliable calculations, current market data, and numbers you can inspect. So I built Ask Linc.</p>
          <Link className="text-link" href="/about">Read the full story <span>→</span></Link>
        </div>
      </section>

      <section className="section pricing-section" id="pricing">
        <div className="shell pricing-shell">
          <div className="pricing-copy">
            <p className="section-kicker">SIMPLE PRICING</p>
            <h2>Big decisions.<br />Small subscription.</h2>
            <p>No asset minimum. No percentage of your wealth. No sales call.</p>
            <div className="advisor-compare">
              <span>A 1% advisor fee on $2M</span><strong>$20,000<small>/year</small></strong>
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
          <h2>Ask the question your dashboard can&apos;t answer.</h2>
          <MarketingGetStartedButton className="button button-primary" />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
