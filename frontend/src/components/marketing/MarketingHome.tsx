import Link from "next/link";
import { LockKeyhole, ArrowRight } from "lucide-react";
import { FALLBACK_PRICING, type Pricing } from "@/config/pricing";
import { SiteFooter, SiteHeader } from "./SiteShell";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { TRIAL_CTA_MICROCOPY } from "./trial-copy";
import { AnalysisVisual, ConnectedLifeVisual, PlanningFlow } from "./PlanningStory";
import { AssumptionPreview } from "./AssumptionPreview";

export default function MarketingHome({ pricing = FALLBACK_PRICING }: { pricing?: Pricing }) {
  return (
    <main className="marketing-site story-home">
      <SiteHeader />
      <section className="story-hero shell" id="top">
        <p className="section-kicker">SELF-DIRECTED FINANCIAL PLANNING</p>
        <h1>Tell Linc what you’re<br className="desktop-break" /> trying to figure out. <em>It builds the financial plan.</em></h1>
        <p className="story-hero-copy">Connect your finances. Ask your question. Linc pulls it all together, runs the numbers, and gives you a plan you can explore.</p>
        <div className="hero-actions"><MarketingGetStartedButton className="button button-primary" trackingLocation="homepage_hero" csOverrideId="cta-start-free-trial-hero" /></div>
        <p className="microcopy">{TRIAL_CTA_MICROCOPY}</p>
      </section>
      <section className="story-flow-section shell" aria-label="From your accounts to your next decision"><PlanningFlow /></section>
      <div className="story-narrative shell" id="how-it-works">
        <section className="story-chapter" aria-labelledby="connect-title">
          <div className="story-chapter-copy"><p className="section-kicker">01 / BRING IT TOGETHER</p><h2 id="connect-title">Connect your<br />financial life.</h2><p>Connect your bank and investment accounts, then add your home, loans, or any missing details. Linc uses these numbers to build your plan.</p><Link className="text-link" href="/integrations">See what you can connect <ArrowRight size={16} aria-hidden="true" /></Link></div>
          <ConnectedLifeVisual />
        </section>
        <section className="story-chapter story-chapter-reverse" aria-labelledby="ask-title">
          <div className="story-chapter-copy"><p className="section-kicker">02 / ASK IN YOUR OWN WORDS</p><h2 id="ask-title">You ask the question.<br /><em>Linc does the work.</em></h2><p>Retire sooner? Buy the house? Take a year off? Tell Linc what you’re weighing and answer any clarifying questions. It runs the analysis and explains the tradeoffs.</p><Link className="text-link" href="/use-cases">See what you can ask <ArrowRight size={16} aria-hidden="true" /></Link></div>
          <AnalysisVisual />
        </section>
        <section className="story-chapter" aria-labelledby="change-title">
          <div className="story-chapter-copy"><p className="section-kicker">03 / EXPLORE THE WHAT-IFS</p><h2 id="change-title">Change the assumption,<br /><em>not the spreadsheet.</em></h2><p>Try a different retirement date, a larger travel budget, or a smaller down payment. Ask a follow-up to see how it affects your plan.</p><Link className="text-link" href="/demo">See a plan in action <ArrowRight size={16} aria-hidden="true" /></Link></div>
          <AssumptionPreview />
        </section>
      </div>
      <section className="story-trust" aria-labelledby="trust-title">
        <div className="shell story-trust-inner"><div><p className="section-kicker light">SHOW THE MATH</p><h2 id="trust-title">A clear answer.<br /><em>And the work behind it.</em></h2><p>Open Show the Math to see the numbers Linc used, the assumptions it made, and how it calculated the result.</p><Link className="light-link" href="/trust">See how answers are checked <span aria-hidden="true">→</span></Link></div>
          <div className="story-evidence"><dl><div><dt><span>01</span> Inputs</dt><dd>The numbers Linc used</dd></div><div><dt><span>02</span> Assumptions</dt><dd>What the plan depends on</dd></div><div><dt><span>03</span> Math</dt><dd>How the result was calculated</dd></div><div><dt><span>04</span> Sources</dt><dd>Where the information came from</dd></div></dl><p><LockKeyhole size={18} aria-hidden="true" /><span>Read-only connections. Linc can’t move your money. Your financial data is never used to train AI models. <Link href="/how-we-protect-your-data">How we protect your data ↗</Link></span></p></div>
        </div>
      </section>
      <section className="story-closing shell" id="pricing" aria-labelledby="start-title"><p className="section-kicker">START WITH YOUR QUESTION</p><h2 id="start-title">Your next decision<br /><em>starts here.</em></h2><p>30 days free. Then {pricing.label}.<br />One plan. Full access. Cancel anytime.</p><MarketingGetStartedButton className="button button-primary" trackingLocation="homepage_final" csOverrideId="cta-start-free-trial-pricing-premium" /><small>{TRIAL_CTA_MICROCOPY}</small></section>
      <SiteFooter />
    </main>
  );
}
