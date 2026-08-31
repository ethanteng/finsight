"use client";

import Image from "next/image";
import Link from "next/link";
import { usePricing } from "@/components/PricingProvider";
import { SiteFooter, SiteHeader } from "./SiteShell";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";

const decisions = [
  { label: "BUY A HOME", question: "Can we afford this house without becoming house poor?", href: "/use-cases/home-buying" },
  { label: "TAKE TIME OFF", question: "Can I take a year off without setting retirement back?", href: "/use-cases/career-change" },
  { label: "GROW A FAMILY", question: "Can one of us take leave and still afford childcare?", href: "/use-cases/family-planning" },
  { label: "RETIRE", question: "Could we retire two years earlier without making the plan too tight?", href: "/use-cases/retirement" },
];

export default function Home() {
  const pricing = usePricing();

  return (
    <main className="marketing-site">
      <SiteHeader />

      <section className="hero shell" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse" /> FINANCIAL PLANNING FOR REAL LIFE</div>
          <h1>See what a big money decision changes. <em>Before you make it.</em></h1>
          <p className="hero-subhead">
            Buying a home, taking time off, growing your family, or planning retirement? Ask in your own words.
            Linc tests the decision against the rest of your financial life—then shows you the math.
          </p>
          <div className="hero-actions">
            <MarketingGetStartedButton className="button button-primary" csOverrideId="cta-start-free-trial-hero" />
          </div>
          <p className="microcopy">{pricing.trialLine}</p>
        </div>

        <aside className="hero-audit-card" aria-label="Sample Ask Linc decision">
          <span>ASK LINC · SAMPLE DECISION</span>
          <div><i>01</i><p><small>QUESTION</small><strong>Can we afford a $700K home without pausing retirement savings?</strong></p></div>
          <div><i>02</i><p><small>SHORT ANSWER</small><strong>Yes—if you put 15% down and keep at least $45K in cash.</strong></p></div>
          <div className="active"><i>03</i><p><small>LINC&apos;S TAKE</small><strong>Keep both 401(k) contributions unchanged and cap total housing costs at $4,800/month.</strong></p></div>
          <footer>Your numbers · Assumptions · Math · Checks · Sources</footer>
        </aside>
      </section>

      <section className="proof-strip" aria-label="Product trust signals">
        <div className="shell proof-grid">
          <p><strong>Start with the decision</strong><span>not another dashboard to interpret</span></p>
          <p><strong>Your whole financial picture</strong><span>cash, debt, investments, property, and goals</span></p>
          <p><Link href="/trust"><strong>Show the Math</strong><span>see the numbers behind every answer</span></Link></p>
        </div>
      </section>

      <section className="section shell question-to-answer-section" id="decisions">
        <div className="section-heading split-heading">
          <div>
            <p className="section-kicker">START WITH THE DECISION, NOT THE DASHBOARD</p>
            <h2>Your money is connected. Your decisions should be too.</h2>
          </div>
          <p>A home affects retirement. Time away from work changes cash flow and savings. Childcare changes what fits the budget. Linc keeps the rest of your financial life in the picture.</p>
        </div>
        <div className="use-case-index">
          {decisions.map((item, index) => (
            <Link href={item.href} className="use-case-tile" key={item.label}>
              <span>{String(index + 1).padStart(2, "0")} / {item.label}</span>
              <h2>{item.question}</h2>
              <strong>Explore this decision <i>→</i></strong>
            </Link>
          ))}
        </div>
        <div className="hero-actions">
          <Link className="text-link" href="/use-cases">See what you can ask →</Link>
        </div>
      </section>

      <section className="section home-math-section" id="how-it-works">
        <div className="shell home-math-shell">
          <div className="home-math-heading">
            <div>
              <p className="section-kicker light">HOW IT WORKS</p>
              <h2>Ask the question. Linc builds the analysis around it.</h2>
            </div>
            <ul aria-label="How Ask Linc works">
              <li>Ask in your own words</li>
              <li>Pull in what could change the answer</li>
              <li>Compare the tradeoffs</li>
              <li>See the recommendation</li>
              <li>Check the work</li>
            </ul>
          </div>
          <Link className="home-demo-link" href="/features">See how Ask Linc works <span>→</span></Link>
        </div>
      </section>

      <section className="ecosystem-section ecosystem-compact">
        <div className="shell ecosystem-compact-shell">
          <div>
            <p className="section-kicker light">CONNECTED DATA IS ONLY THE BEGINNING</p>
            <h2>The right numbers for this decision.</h2>
          </div>
          <p>
            Your accounts provide the facts. Linc brings in cash, spending, debt, investments, property, goals,
            rates, and market context only when they could change the answer.
          </p>
          <Link href="/integrations">Explore accounts &amp; data <span>→</span></Link>
        </div>
      </section>

      <section className="section connected-picture-section" id="show-the-math">
        <div className="shell">
          <div className="connected-picture-heading">
            <p className="section-kicker">SHOW THE MATH</p>
            <h2>Don&apos;t take the answer on faith.</h2>
            <p>See your numbers, what Linc assumed, the calculations, built-in checks, and where current information came from.</p>
          </div>
          <div className="connected-picture-preview" aria-label="What Show the Math includes">
            <div><span>Your numbers</span><strong>What Linc used</strong></div>
            <div><span>Assumptions</span><strong>What had to be estimated</strong></div>
            <div><span>Math</span><strong>How the answer was worked out</strong></div>
            <div><span>Checks</span><strong>What was verified</strong></div>
            <div><span>Sources</span><strong>Where current facts came from</strong></div>
            <Link href="/trust">See how answers are checked <span>→</span></Link>
          </div>
        </div>
      </section>

      <section className="privacy-section" id="privacy">
        <div className="shell privacy-shell">
          <div className="privacy-copy">
            <p className="section-kicker light">PRIVACY BY DESIGN</p>
            <h2>Your financial data is never used to train AI models.</h2>
            <p>Read-only connections. Sensitive labels removed before AI analysis. Disconnect anytime.</p>
            <Link className="light-link" href="/how-we-protect-your-data">See how your data is protected <span>→</span></Link>
          </div>
          <div className="privacy-flow" aria-label="How Ask Linc protects data">
            <div className="privacy-node"><span className="privacy-icon">▰</span><b>Your accounts</b><small>Read-only connection</small></div>
            <span className="flow-arrow">→</span>
            <div className="privacy-node shield-node"><span className="privacy-icon">◇</span><b>Sensitive labels removed</b><small>Before AI analysis</small></div>
            <span className="flow-arrow">→</span>
            <div className="privacy-node"><span className="privacy-icon">L</span><b>Your answer</b><small>Only what is needed</small></div>
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
          <blockquote>The answers sounded convincing. That wasn&apos;t enough for a real financial decision.</blockquote>
          <div className="founder-signature">
            <div className="founder-avatar">
              <Image src="/ethan-teng.jpg" alt="Ethan Teng, founder of Ask Linc" fill sizes="42px" />
            </div>
            <div><b>Ethan Teng</b><span>Founder, Ask Linc</span></div>
          </div>
        </div>
        <div className="founder-story">
          <p className="section-kicker">WHY I BUILT THIS</p>
          <h2>I needed to answer one hard money question.</h2>
          <p>After a layoff, I tried using ChatGPT with my own bank statements. I couldn&apos;t tell which numbers were facts, which were assumptions, or whether the math held together. So I built the tool I wanted to use myself.</p>
          <Link className="text-link" href="/about">Read the story <span>→</span></Link>
        </div>
      </section>

      <section className="section pricing-section" id="pricing">
        <div className="shell pricing-shell">
          <div className="pricing-copy">
            <p className="section-kicker">SIMPLE PRICING</p>
            <h2>One month free. Then {pricing.label}.</h2>
            <p>One plan. Full access. Cancel anytime.</p>
          </div>
          <article className="price-card" data-cs-override-id="pricing-card-premium">
            <div className="price-card-top"><span>ONE PLAN. EVERYTHING INCLUDED.</span></div>
            <div className="price"><sup>{pricing.symbol}</sup>{pricing.amountText}<span>/{pricing.intervalLabel}</span></div>
            <p>First month free. Full access. Cancel anytime.</p>
            <ul>
              <li>Unlimited questions &amp; follow-ups</li>
              <li>Unlimited connected accounts</li>
              <li>What-if scenarios</li>
              <li>Current rates and market context</li>
              <li>Show the Math on every answer</li>
            </ul>
            <MarketingGetStartedButton className="button button-primary price-button" csOverrideId="cta-start-free-trial-pricing-premium" />
          </article>
        </div>
      </section>

      <section className="final-cta">
        <div className="shell final-cta-inner">
          <p className="section-kicker light">YOUR NEXT DECISION STARTS HERE</p>
          <h2>What are you trying to figure out?</h2>
          <MarketingGetStartedButton className="button button-primary" csOverrideId="cta-start-free-trial-mid" />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
