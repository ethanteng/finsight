"use client";

import Image from "next/image";
import Link from "next/link";
import { usePricing } from "@/components/PricingProvider";
import { SiteFooter, SiteHeader } from "./SiteShell";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { TRIAL_CTA_MICROCOPY } from "./trial-copy";
import HeroScreenshotCarousel from "./HeroScreenshotCarousel";
import StaticProductDemo from "./StaticProductDemo";

const decisions = [
  { label: "BUY A HOME", question: "Can we afford this home without becoming house poor?", lead: "Can we afford this home?", accent: "Without becoming house poor.", tone: "mint", href: "/use-cases/home-buying" },
  { label: "TAKE TIME OFF", question: "Can I take a year off without setting retirement back?", lead: "Can I take a year off?", accent: "Without setting retirement back.", tone: "blue", href: "/use-cases/career-change" },
  { label: "GROW A FAMILY", question: "Can one of us take leave and still afford childcare?", lead: "Can one of us take leave?", accent: "And still afford childcare.", tone: "sand", href: "/use-cases/family-planning" },
  { label: "RETIRE", question: "Could we retire two years sooner without making the plan too tight?", lead: "Could we retire two years sooner?", accent: "Without making the plan too tight.", tone: "lime", href: "/retirement-calculator" },
];

export default function Home() {
  const pricing = usePricing();

  return (
    <main className="marketing-site conversion-home">
      <SiteHeader />

      <section className="hero shell" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse" /> SELF-DIRECTED FINANCIAL PLANNING</div>
          <h1>Know what your money lets you do <em>next.</em></h1>
          <p className="hero-subhead">
            Ask Linc turns your real finances into a plan you can stress-test—so you can decide when to retire, work less, spend more, or make another big move.
          </p>
          <div className="hero-actions">
            <MarketingGetStartedButton className="button button-primary" trackingLocation="homepage_hero" csOverrideId="cta-start-free-trial-hero" label="Plan my next move" />
          </div>
          <p className="microcopy">{TRIAL_CTA_MICROCOPY}</p>
        </div>

        <HeroScreenshotCarousel />
      </section>

      <section className="proof-strip" aria-label="Product trust signals">
        <div className="shell proof-grid">
          <p><strong>Question → model</strong><span>start with the decision, not a spreadsheet</span></p>
          <p><strong>Deterministic calculations</strong><span>purpose-built math for supported scenarios</span></p>
          <p><strong>Stress-test the plan</strong><span>change assumptions and compare what-ifs</span></p>
          <p><Link href="/trust"><strong>Show the Math</strong><span>inspect the numbers, assumptions, and sources</span></Link></p>
        </div>
      </section>

      <section className="coast-fire-entry shell" aria-labelledby="coast-fire-entry-title">
        <div className="coast-fire-entry-inner">
          <div className="coast-fire-entry-copy">
            <p className="section-kicker light">COAST FIRE · FREE CALCULATOR</p>
            <h2 id="coast-fire-entry-title">Find your Coast FIRE number. <em>Then see what it lets you change.</em></h2>
            <p>
              Working toward Coast FIRE? Find out whether your current savings could grow to your retirement target without more contributions—then decide what that could mean for work, saving, and retirement.
            </p>
            <Link className="button button-primary" href="/coast-fire-calculator" data-cs-override-id="homepage-coast-fire-calculator">
              Calculate my Coast FIRE number <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="coast-fire-entry-model" aria-label="From a free Coast FIRE number to a stress-tested plan">
            <span><small>FREE TOOL</small><strong>Have I reached Coast FIRE?</strong><i>Number + assumptions</i></span>
            <b aria-hidden="true">→</b>
            <span><small>NEXT DECISION</small><strong>Can I really coast?</strong><i>Real finances + scenarios</i></span>
          </div>
        </div>
      </section>

      <section className="section shell" id="product-demo">
        <div className="section-heading split-heading">
          <div>
            <p className="section-kicker">SEE ASK LINC IN ACTION</p>
            <h2>See the planning model before you start.</h2>
          </div>
          <p>Explore a real product example with identifying details removed—from the decision and financial model to the calculations, assumptions, and sources behind the answer.</p>
        </div>
        <details className="product-demo-disclosure">
          <summary>Explore the interactive example</summary>
          <StaticProductDemo anchorId={null} />
        </details>
        <div className="hero-actions">
          <MarketingGetStartedButton className="button button-primary" trackingLocation="homepage_demo" csOverrideId="cta-start-free-trial-demo" />
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
              <li>An ongoing model built from your real finances</li>
              <li>Unlimited questions and follow-ups</li>
              <li>What-if scenarios and retirement stress tests</li>
              <li>Current rates and historical market context</li>
              <li>Inspectable assumptions and Show the Math</li>
            </ul>
            <MarketingGetStartedButton className="button button-primary price-button" csOverrideId="cta-start-free-trial-pricing-premium" label="Start planning" />
          </article>
        </div>
      </section>

      <section className="section shell question-to-answer-section" id="decisions">
        <div className="section-heading split-heading">
          <div>
            <p className="section-kicker">START WITH THE DECISION, NOT THE DASHBOARD</p>
            <h2>Know what you can safely change. <em>Before you change it.</em></h2>
          </div>
          <p>One decision can ripple through the rest of your plan. Linc keeps cash, work, family costs, investments, and retirement in the same model.</p>
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
              <h2>Ask the question. <em>Linc builds the financial model.</em></h2>
            </div>
            <div className="home-math-details">
              <p>Your real financial state supplies the inputs. Deterministic calculations handle supported math. You control the model by asking follow-ups and changing assumptions.</p>
              <ul aria-label="How Ask Linc works">
                <li>Ask in your own words</li>
                <li>Build the relevant model</li>
                <li>Run the calculations</li>
                <li>Stress-test scenarios</li>
                <li>Inspect the assumptions</li>
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
        </div>
      </section>

      <section className="section shell founder-section">
        <div className="founder-statement">
          <span className="quote-mark quote-mark-open" aria-hidden="true">“</span>
          <blockquote>The answers sounded convincing. That wasn&apos;t enough for a real financial decision.</blockquote>
          <span className="quote-mark quote-mark-close" aria-hidden="true">”</span>
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


      <section className="final-cta">
        <div className="shell final-cta-inner">
          <p className="section-kicker light">YOUR NEXT DECISION STARTS HERE</p>
          <h2>Know what your money lets you do next.</h2>
          <MarketingGetStartedButton className="button button-primary" csOverrideId="cta-start-free-trial-mid" label="Plan my next move" />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
