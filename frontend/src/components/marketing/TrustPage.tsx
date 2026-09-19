import Link from "next/link";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { TRIAL_CTA_MICROCOPY } from "./trial-copy";
import { PageCta, SiteFooter, SiteHeader } from "./SiteShell";

const answerLayers = [
  ["Your numbers", "The facts Linc used"],
  ["Assumptions", "What had to be estimated"],
  ["Math", "How the answer was worked out"],
  ["Checks", "What was verified before answering"],
  ["Sources", "Where current information came from"],
] as const;

const pipelineSteps = [
  ["01", "Start with the decision", "Linc identifies what you are trying to decide before deciding which inputs or calculations matter."],
  ["02", "Build the financial model", "Cash, spending, debt, investments, property, goals, rates, or market history are included only when they could change the answer."],
  ["03", "Run deterministic calculations", "Purpose-built tools handle supported math and scenarios. The language model does not invent those calculated results."],
  ["04", "Check and explain the result", "Reasoning and calculation stay separate. Linc explains the tradeoffs and keeps the inputs, assumptions, checks, and sources attached."],
] as const;

export const TRUST_FAQS = [
  {
    question: "Can AI get financial numbers wrong?",
    answer: "Yes. A polished answer can still contain bad math, hidden assumptions, or unsupported conclusions. Ask Linc reduces that risk by grounding the answer in your financial data, using purpose-built calculations for supported scenarios, checking the result, and showing you the work.",
  },
  {
    question: "Does Ask Linc use AI to perform financial calculations?",
    answer: "AI helps understand the question, compare tradeoffs, and explain the result. Purpose-built tools handle supported financial calculations rather than asking a chatbot to make up the math in the conversation.",
  },
  {
    question: "What is Show the Math?",
    answer: "Show the Math lets you see the numbers Linc used, what it assumed, the calculations, the checks, and the sources behind an answer.",
  },
  {
    question: "Why can an answer change over time?",
    answer: "Because your finances or the world can change. Balances, spending, investments, rates, goals, or assumptions may move. Ask Linc shows what changed and why the answer moved with it.",
  },
  {
    question: "Is Ask Linc an AI financial advisor?",
    answer: "Ask Linc is decision-support software, not a human financial advisor or fiduciary. It helps you understand your numbers, test what-ifs, and compare tradeoffs before you decide.",
  },
] as const;

export default function TrustPage() {
  return (
    <main className="marketing-site subpage trust-page">
      <SiteHeader />

      <section className="trust-hero shell">
        <div className="trust-hero-copy">
          <p className="section-kicker">ANSWERS YOU CAN CHECK</p>
          <h1>Don&apos;t trust the answer. <em>Check it.</em></h1>
          <p className="subhero-copy">
            Open Show the Math to see your inputs, the assumptions, and how the result was calculated. Follow the sources when you want to go deeper.
          </p>
          <div className="hero-actions">
            <MarketingGetStartedButton className="button button-primary" trackingLocation="trust_hero" csOverrideId="cta-start-free-trial-hero" label="Build a plan I can check" />
          </div>
          <p className="microcopy">{TRIAL_CTA_MICROCOPY}</p>
        </div>

        <article className="trust-audit-card" aria-label="Illustrative Ask Linc answer with checks">
          <div className="trust-audit-top"><div><span className="brand-mark small" aria-hidden="true">L</span><b>SHOW THE MATH</b></div><span>ILLUSTRATIVE</span></div>
          <div className="trust-audit-question"><small>YOUR QUESTION</small><p>Can we afford this house without setting retirement back?</p></div>
          <div className="trust-audit-verdict"><span>✓</span><div><small>CONCLUSION</small><strong>Yes—if you keep enough cash after closing and leave retirement contributions unchanged.</strong></div></div>
          <div className="trust-audit-layers">
            {answerLayers.map(([label, description]) => <div key={label}><span>✓</span><b>{label}</b><small>{description}</small><i>VIEW</i></div>)}
          </div>
          <div className="trust-audit-footer"><span>∑</span><b>The work stays attached to the answer.</b></div>
        </article>
      </section>

      <section className="trust-pipeline-section" id="how-it-works">
        <div className="shell">
          <div className="editorial-heading trust-pipeline-heading"><p className="section-kicker">HOW AN ANSWER IS BUILT</p><h2>Here’s how Linc does the work.</h2></div>
          <div className="trust-pipeline-grid">
            {pipelineSteps.map(([number, title, description]) => (
              <article key={number}><div><span>{number}</span><small>ANSWER STEP</small></div><h3>{title}</h3><p>{description}</p></article>
            ))}
          </div>
          <p className="trust-pipeline-caveat">No product is perfect. That is why being able to inspect the work matters.</p>
        </div>
      </section>

      <section className="trust-privacy-bridge shell">
        <div>
          <p className="section-kicker">TRUST INCLUDES YOUR DATA</p>
          <h2>Your financial data is never used to train AI models.</h2>
          <p>Connections are read-only. Sensitive identifying labels are removed before AI analysis. You can disconnect accounts anytime.</p>
        </div>
        <Link href="/how-we-protect-your-data">See how your data is protected <span>→</span></Link>
      </section>

      <section className="page-section shell compact-faq">
        <div><p className="section-kicker">COMMON QUESTIONS</p><h2>Good skepticism is useful here.</h2></div>
        <div>{TRUST_FAQS.map((item) => <details key={item.question}><summary>{item.question}<span>+</span></summary><p>{item.answer}</p></details>)}</div>
      </section>

      <PageCta title="Bring a real decision to Linc—and check the work." label="Build a plan I can inspect" csOverrideId="cta-start-free-trial-mid" />
      <SiteFooter />
    </main>
  );
}
