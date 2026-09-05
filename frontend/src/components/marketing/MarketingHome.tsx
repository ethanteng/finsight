"use client";

import Image from "next/image";
import Link from "next/link";
import { usePricing } from "@/components/PricingProvider";
import { SiteFooter, SiteHeader } from "./SiteShell";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import HeroScreenshotCarousel from "./HeroScreenshotCarousel";
import StaticProductDemo from "./StaticProductDemo";

const decisions = [
  { label: "BUY A HOME", question: "Can we afford this home without becoming house poor?", lead: "Can we afford this home?", accent: "Without becoming house poor.", tone: "mint", href: "/use-cases/home-buying" },
  { label: "TAKE TIME OFF", question: "Can I take a year off without setting retirement back?", lead: "Can I take a year off?", accent: "Without setting retirement back.", tone: "blue", href: "/use-cases/career-change" },
  { label: "GROW A FAMILY", question: "Can one of us take leave and still afford childcare?", lead: "Can one of us take leave?", accent: "And still afford childcare.", tone: "sand", href: "/use-cases/family-planning" },
  { label: "RETIRE", question: "Could we retire two years sooner without making the plan too tight?", lead: "Could we retire two years sooner?", accent: "Without making the plan too tight.", tone: "lime", href: "/use-cases/retirement" },
];

export default function Home() {
  const pricing = usePricing();

  return (
    <main className="marketing-site conversion-home">
      <SiteHeader />

      <section className="hero shell" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse" /> AI FINANCIAL PLANNING</div>
          <h1>Financial planning that starts with <em>your question.</em></h1>
          <p className="hero-subhead">
            Ask Linc what you’re trying to decide. It uses your connected financial accounts to work out the answer.
          </p>
          <p className="hero-answer-promise">See the numbers and assumptions behind every answer.</p>
          <div className="hero-actions">
            <MarketingGetStartedButton className="button button-primary" trackingLocation="homepage_hero" csOverrideId="cta-start-free-trial-hero" />
          </div>
          <p className="microcopy">{pricing.trialLine}</p>
        </div>

        <HeroScreenshotCarousel />
      </section>

      <section className="proof-strip" aria-label="Product trust signals">
        <div className="shell proof-grid">
          <p><strong>Ask in plain English</strong><span>about retirement, buying a home, or taking time off</span></p>
          <p><strong>Your whole financial picture</strong><span>cash, debt, investments, property, and goals</span></p>
          <p><Link href="/trust"><strong>Show the Math</strong><span>see the numbers behind every answer</span></Link></p>
        </div>
      </section>

      <section className="section shell" id="product-demo">
        <div className="section-heading split-heading">
          <div>
            <p className="section-kicker">SEE ASK LINC IN ACTION</p>
            <h2>See an example before you start.</h2>
          </div>
          <p>Explore a real product example with identifying details removed—from the decision itself to connected finances, Show the Math, and the sources behind the answer.</p>
        </div>
        <details className="product-demo-disclosure">
          <summary>Explore the interactive example</summary>
          <StaticProductDemo anchorId={null} />
        </details>
        <div className="hero-actions">
          <MarketingGetStartedButton className="button button-primary" trackingLocation="homepage_demo" csOverrideId="cta-start-free-trial-demo" />
        </div>
      </section>

      <section className="section shell question-to-answer-section" id="decisions">
        <div className="section-heading split-heading">
          <div>
            <p className="section-kicker">START WITH THE DECISION, NOT THE DASHBOARD</p>
            <h2>Your money is connected. <em>Your decisions should be too.</em></h2>
          </div>
          <p>One decision can ripple through the rest of your plan. Linc keeps cash, work, family costs, and retirement in the same picture.</p>
        </div>
        <div className="use-case-index">
          {decisions.map((item, index) => (
            <Link href={item.href} className={`use-case-tile ${item.tone}`} key={item.label}>
              <span>{String(index + 1).padStart(2, "0")} / {item.label}</span>
              <h2 aria-label={item.question}><span>{item.lead}</span><em>{item.accent}</em></h2>
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
              <h2>Ask the question. <em>Linc finds what could change the answer.</em></h2>
            </div>
            <div className="home-math-details">
              <p>Your accounts provide the facts. Linc adds only the cash, debt, investments, rates, or market context that could change the decision.</p>
              <ul aria-label="How Ask Linc works">
                <li>Ask in your own words</li>
                <li>Bring in what matters</li>
                <li>Compare the tradeoffs</li>
                <li>Get a recommendation</li>
                <li>Check the work</li>
              </ul>
            </div>
          </div>
          <Link className="home-demo-link" href="/features">See how Ask Linc works <span>→</span></Link>
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
              <Image src="/ethan-teng.jpg" alt="" fill sizes="42px" />
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
