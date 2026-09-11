import Link from "next/link";
import { CoastFireCalculatorLink } from "./CoastFireCalculatorLink";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { SiteFooter, SiteHeader } from "./SiteShell";
import { TRIAL_CTA_MICROCOPY } from "./trial-copy";

const decisions = [
  ["01", "Work less", "Move to four days a week without quietly moving retirement out of reach."],
  ["02", "Change careers", "Compare a lower salary with the time and flexibility it buys back."],
  ["03", "Let one income go", "See whether one partner can step away from work—and for how long."],
  ["04", "Start something", "Test a business runway without treating retirement accounts as a backup plan."],
  ["05", "Spend more now", "Find the room for travel, family, or everyday life after years of aggressive saving."],
  ["06", "Pay down the house", "Compare the certainty of less debt with keeping more money invested."],
];

export function CoastFireLanding() {
  return (
    <main className="marketing-site coast-fire-page coast-fire-landing-page">
      <SiteHeader />

      <section className="shell cf-landing-hero">
        <div className="cf-landing-copy">
          <p className="eyebrow"><span className="pulse" aria-hidden="true" /> Coast FIRE planning</p>
          <h1>Know what your money <em>lets you do next.</em></h1>
          <p className="cf-landing-lead">
            You spent years building retirement savings. Now find out whether that money has earned
            you more freedom today—and what you can safely change without putting the future at risk.
          </p>
          <div className="cf-hero-actions">
            <CoastFireCalculatorLink
              className="button button-primary"
              location="coast_fire_hero"
              csOverrideId="cta-coast-fire-calculator-hero"
            />
            <a className="text-link" href="#after-the-number">See what comes after the number</a>
          </div>
          <p className="cf-hero-note">Free calculator · no account needed · assumptions you can change</p>
        </div>

        <div className="cf-plan-card" aria-label="Example Coast FIRE result">
          <div className="cf-plan-card-head">
            <span>YOUR COAST FIRE PLAN</span>
            <b>Simple estimate</b>
          </div>
          <div className="cf-plan-status">
            <span aria-hidden="true">✓</span>
            <div><small>STATUS</small><strong>You’ve reached Coast FIRE.</strong></div>
          </div>
          <dl>
            <div><dt>Coast FIRE number</dt><dd>$369,000</dd></div>
            <div><dt>Retirement savings</dt><dd>$400,000</dd></div>
            <div><dt>Target at 65</dt><dd>$1.25M</dd></div>
          </dl>
          <div className="cf-plan-track"><span /></div>
          <p>At 5% real growth, $400K becomes about $1.35M at 65—even with $0 in new contributions.</p>
          <div className="cf-plan-question">
            <span>BUT DOES THAT MEAN YOU SHOULD STOP SAVING?</span>
            <strong>That depends on the life change you want to make.</strong>
          </div>
        </div>
      </section>

      <section className="cf-freedom-strip">
        <div className="shell">
          <span>THE OLD JOB</span><strong>Earn more → Save more → Invest more</strong>
          <i aria-hidden="true">→</i>
          <span>THE NEW QUESTION</span><strong>Do I still have to?</strong>
        </div>
      </section>

      <section className="shell cf-decisions" id="after-the-number">
        <div className="cf-section-heading">
          <p className="section-kicker">FROM ACCUMULATION TO OPTIONALITY</p>
          <h2>The point isn’t to stop working. It’s to have a choice.</h2>
          <p>
            Your Coast FIRE number tells you whether today&apos;s savings could grow into tomorrow&apos;s
            retirement. A plan tells you which tradeoffs your whole financial life can actually absorb.
          </p>
        </div>
        <div className="cf-decision-grid">
          {decisions.map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cf-boundary-section">
        <div className="shell">
          <div className="cf-section-heading cf-section-heading-light">
            <p className="section-kicker light">FREE NUMBER → REAL PLAN</p>
            <h2>Start simple. Get rigorous when the decision gets real.</h2>
          </div>
          <div className="cf-boundary-grid">
            <article className="cf-boundary-free">
              <span>FREE COAST FIRE CALCULATOR</span>
              <h3>Have I reached Coast FIRE?</h3>
              <ul>
                <li>Your Coast FIRE number today</li>
                <li>Your target portfolio at retirement</li>
                <li>Return sensitivity around your estimate</li>
                <li>Every assumption in plain view</li>
              </ul>
              <CoastFireCalculatorLink
                className="cf-card-link"
                location="coast_fire_boundary"
                label="Calculate my number →"
                csOverrideId="cta-coast-fire-calculator-boundary"
              />
            </article>
            <article className="cf-boundary-paid">
              <span>YOUR ASK LINC PLAN</span>
              <h3>What can I safely change now?</h3>
              <ul>
                <li>Your actual holdings, fees, income, and spending</li>
                <li>Historical markets, inflation, and sequence risk</li>
                <li>Taxes, Social Security, pensions, and account access</li>
                <li>Scenarios built around the choice in front of you</li>
              </ul>
              <MarketingGetStartedButton
                className="cf-card-link"
                trackingLocation="coast_fire_boundary"
                csOverrideId="cta-stress-test-coast-fire-boundary"
                label="Stress-test my plan →"
              />
            </article>
          </div>
        </div>
      </section>

      <section className="shell cf-real-plan">
        <div className="cf-real-plan-copy">
          <p className="section-kicker">YOUR ACTUAL PLAN</p>
          <h2>Ask the question you’re really trying to answer.</h2>
          <p>
            Ask Linc turns a life decision into a financial model. Change an assumption, compare a
            scenario, and see the math behind the answer without building the spreadsheet yourself.
          </p>
        </div>
        <div className="cf-question-stack">
          <div><span>01</span><p>Can I stop maxing my 401(k)?</p></div>
          <div><span>02</span><p>Could I take a $30K pay cut?</p></div>
          <div><span>03</span><p>Could one of us stop working?</p></div>
          <div><span>04</span><p>What if returns are worse than expected?</p></div>
          <div><span>05</span><p>Can I spend $20K more each year?</p></div>
        </div>
      </section>

      <section className="cf-final-cta">
        <div className="shell">
          <p className="section-kicker light">KNOW WHAT YOU CAN SAFELY DO</p>
          <h2>Your money may already be buying you freedom.</h2>
          <p>Find the number for free. Then decide what it means for your life.</p>
          <div>
            <CoastFireCalculatorLink
              className="button button-primary"
              location="coast_fire_final"
              csOverrideId="cta-coast-fire-calculator-final"
            />
            <MarketingGetStartedButton
              className="button cf-outline-button"
              trackingLocation="coast_fire_final"
              csOverrideId="cta-start-coast-fire-plan-final"
              label="Build my actual plan"
            />
          </div>
          <p className="microcopy">{TRIAL_CTA_MICROCOPY}</p>
        </div>
      </section>

      <section className="shell cf-plain-language">
        <h2>A note on the name.</h2>
        <p>
          Coast FIRE does not require early retirement. It describes a point where your existing
          retirement savings may be able to do the rest of the long-term work—giving you more room
          to make decisions about work, family, time, and spending now.
        </p>
        <Link href="/retirement-calculator">Looking for the full retirement calculator? →</Link>
      </section>

      <SiteFooter />
    </main>
  );
}
