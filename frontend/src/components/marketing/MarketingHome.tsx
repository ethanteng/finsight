"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "./SiteShell";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";

const scenarios = [
  "How much house can we afford?",
  "Can one of us take parental leave?",
  "Are we saving enough to retire?",
  "Can I take a lower-paying job?",
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
            Ask Linc uses your accounts to show what you can afford, what else changes, and what to do next.
          </p>
          <div className="hero-actions">
            <MarketingGetStartedButton className="button button-primary" />
          </div>
          <p className="microcopy">$9/month. Cancel anytime.</p>
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
          <p><strong>$9/month</strong><span>cancel anytime</span></p>
          <p><strong>Read-only</strong><span>Linc can&apos;t move your money</span></p>
          <p><strong>Clear assumptions</strong><span>see the inputs and calculations</span></p>
          <p><strong>Private by design</strong><span>sensitive labels removed before AI analysis</span></p>
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
            <h2>One decision affects<br />the rest of your plan.</h2>
          </div>
          <p>A larger home can change childcare options, emergency savings, and retirement. Linc checks those tradeoffs together instead of treating each account as a separate chart.</p>
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
              <div className="signal-note">When rates or inflation matter, Linc includes them and shows the source date.</div>
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
            <h2>Use your real numbers without handing over every identifying detail.</h2>
            <p>Account credentials stay with connection providers. Before AI analysis, Ask Linc replaces sensitive account and merchant labels with neutral tokens.</p>
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
            <span><i>✓</i> Not used for model training</span>
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
          <Link className="text-link" href="/about">Read the full story <span>→</span></Link>
        </div>
      </section>

      <section className="section pricing-section" id="pricing">
        <div className="shell pricing-shell">
          <div className="pricing-copy">
            <p className="section-kicker">SIMPLE PRICING</p>
            <h2>Planning help before<br />the decision gets expensive.</h2>
            <p>No asset minimum. No percentage of your wealth. No sales call.</p>
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
          <h2>See what your next decision means for everything else.</h2>
          <MarketingGetStartedButton className="button button-primary" />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
