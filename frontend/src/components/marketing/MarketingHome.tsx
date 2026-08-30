"use client";

import Image from "next/image";
import Link from "next/link";
import {
  MONTHLY_PRICE,
  MONTHLY_PRICE_DOLLARS,
  TRIAL_PRICE_LINE,
} from "@/config/pricing";
import { SiteFooter, SiteHeader } from "./SiteShell";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import StaticProductDemo from "./StaticProductDemo";

const scenarios = [
  "Can we afford a home?",
  "Can one of us take leave?",
  "Is our portfolio too risky?",
  "Can we retire two years sooner?",
];

const providers = ["Plaid", "SnapTrade", "RentCast", "FRED", "FMP", "Tiingo"];

export default function Home() {
  return (
    <main className="marketing-site">
      <SiteHeader />

      <section className="hero shell" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse" /> STOP TRUSTING FINANCIAL ADVICE YOU CAN&apos;T VERIFY</div>
          <h1>Ask hard money questions. <em>Get answers you can check.</em></h1>
          <p className="hero-subhead">
            Connect your accounts and ask in your own words. Linc runs the numbers on your
            actual accounts and shows every assumption, every step, and where each figure came from.
          </p>
          <div className="hero-actions">
            <MarketingGetStartedButton className="button button-primary" />
          </div>
          <p className="microcopy">{TRIAL_PRICE_LINE}</p>
        </div>

        <aside className="hero-audit-card" aria-label="How Ask Linc turns your accounts into a clear answer">
          <span>FROM YOUR ACCOUNTS TO AN ANSWER</span>
          <div><i>01</i><p><small>START WITH</small><strong>Your accounts</strong></p></div>
          <div><i>02</i><p><small>ASK</small><strong>Your real question</strong></p></div>
          <div className="active"><i>03</i><p><small>OPEN</small><strong>The answer and its math</strong></p></div>
          <footer>Your numbers · What Linc assumed · Math · Checks · Sources</footer>
        </aside>
      </section>

      <section className="proof-strip" aria-label="Product trust signals">
        <div className="shell proof-grid">
          <p><Link href="/trust"><strong>Show the Math</strong><span>your numbers, math, and sources</span></Link></p>
          <p><strong>Your real accounts</strong><span>cash, debt, investments, and property</span></p>
          <p><strong>Never used for training</strong><span>read-only and privacy-first</span></p>
        </div>
      </section>

      <section className="section shell question-to-answer-section" id="ask">
        <div className="section-heading split-heading">
          <div>
            <p className="section-kicker">WHY THE ANSWER IS DIFFERENT</p>
            <h2>Real answers, not generic advice.</h2>
          </div>
          <p>Ask the same question. Linc answers with your accounts, clear math, and up-to-date information.</p>
        </div>

        <div className="answer-proof-grid">
          <div className="answer-proof-contrast">
            <article>
              <span>A GENERAL CHATBOT</span>
              <h3>No accounts. General guidance.</h3>
            </article>
            <article>
              <span>ASK LINC</span>
              <h3>Your accounts. An answer you can check.</h3>
            </article>
          </div>
          <StaticProductDemo />
        </div>
      </section>

      <section className="section home-math-section" id="show-the-math">
        <div className="shell home-math-shell">
          <div className="home-math-heading">
            <div>
              <p className="section-kicker light">SHOW THE MATH</p>
              <h2>See how every answer was worked out.</h2>
            </div>
            <ul aria-label="What Show the Math includes">
              <li>Your numbers</li>
              <li>What Linc assumed</li>
              <li>Step-by-step math</li>
              <li>Built-in checks</li>
              <li>Up-to-date sources</li>
            </ul>
          </div>
          <a className="home-demo-link" href="#product-demo">Open Math and Sources in the interactive demo <span>↑</span></a>
        </div>
      </section>

      <section className="question-ticker" aria-label="Questions you can ask Linc">
        <div className="ticker-label">ASK THE HARD QUESTIONS</div>
        <div className="ticker-items">
          {scenarios.map((item, index) => <span key={item}><i>{String(index + 1).padStart(2, "0")}</i>{item}</span>)}
        </div>
      </section>

      <section className="ecosystem-section ecosystem-compact">
        <div className="shell ecosystem-compact-shell">
          <div>
            <p className="section-kicker light">CONNECTED ACCOUNTS</p>
            <h2>The facts behind the answer.</h2>
          </div>
          <div className="provider-logo-row" aria-label="Data providers that power Ask Linc">
            {providers.map((provider) => <span key={provider}>{provider}</span>)}
          </div>
          <p>Banking, investments, property, and market data—pulled only when the question needs it.</p>
          <Link href="/integrations">See what Ask Linc can connect <span>→</span></Link>
        </div>
      </section>

      <section className="section connected-picture-section" id="scenarios">
        <div className="shell">
          <div className="connected-picture-heading">
            <p className="section-kicker">ONE CONNECTED PICTURE</p>
            <h2>See all your money in one place.</h2>
            <p>Know what you own, what you owe, and how it is changing.</p>
          </div>
          <div className="connected-picture-preview" aria-label="Connected financial overview">
            <div><span>Net Worth</span><strong>$3,668,349</strong></div>
            <div><span>Total Cash</span><strong>$82,651</strong></div>
            <div><span>Total Debt</span><strong>$350,305</strong></div>
            <div><span>Total Investments</span><strong>$2,291,203</strong></div>
            <div><span>Home Value</span><strong>$1,644,800</strong></div>
            <a href="#product-demo">Explore Finances and Accounts in the demo <span>↑</span></a>
          </div>
        </div>
      </section>

      <section className="privacy-section" id="privacy">
        <div className="shell privacy-shell">
          <div className="privacy-copy">
            <p className="section-kicker light">YOUR DATA STAYS YOURS</p>
            <h2>Your financial data is never used to train AI models.</h2>
            <p>We can only read your accounts. Personal details are removed before AI sees them. Disconnect or ask us to delete your data anytime.</p>
            <div className="privacy-training-promise"><b>NO TRAINING</b><span>No toggle. No opt-out. Your financial data stays yours.</span></div>
            <Link className="light-link" href="/how-we-protect-your-data">See how your data is protected <span>→</span></Link>
          </div>
          <div className="privacy-flow" aria-label="How Ask Linc protects data">
            <div className="privacy-node"><span className="privacy-icon">▰</span><b>Your accounts</b><small>Connected through Plaid</small></div>
            <span className="flow-arrow">→</span>
            <div className="privacy-node shield-node"><span className="privacy-icon">◇</span><b>Personal details removed</b><small>Before AI sees them</small></div>
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
          <p>After a layoff, I pasted bank statements into ChatGPT and regretted it. I built Ask Linc so financial answers start with your real accounts and show you the numbers behind them.</p>
          <Link className="text-link" href="/about">Read the full story <span>→</span></Link>
        </div>
      </section>

      <section className="section pricing-section" id="pricing">
        <div className="shell pricing-shell">
          <div className="pricing-copy">
            <p className="section-kicker">SIMPLE PRICING</p>
            <h2>{MONTHLY_PRICE_DOLLARS}/month. No advisor fees.</h2>
            <p>One subscription. No commissions, fees based on your balance, or sales calls.</p>
            <p className="pricing-terms">No minimum. Cancel anytime.</p>
          </div>
          <article className="price-card">
            <div className="price-card-top"><span>ONE PLAN. EVERYTHING INCLUDED.</span><b>MOST POPULAR</b></div>
            <div className="price"><sup>$</sup>{MONTHLY_PRICE}<span>/month</span></div>
            <p>First month free. Full access. Cancel anytime.</p>
            <ul>
              <li>Unlimited questions &amp; follow-ups</li>
              <li>Unlimited connected accounts</li>
              <li>What-if scenarios</li>
              <li>Current rates and market information</li>
              <li>Show the Math on every answer</li>
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
