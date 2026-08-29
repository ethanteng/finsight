import Link from "next/link";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { PageCta, SiteFooter, SiteHeader } from "./SiteShell";

const answerLayers = [
  ["Inputs", "The financial facts used"],
  ["Assumptions", "What the analysis had to estimate"],
  ["Calculations", "How the important numbers were derived"],
  ["Validation", "The checks run on the result"],
  ["Sources", "Where current context came from"],
] as const;

const pipelineSteps = [
  {
    number: "01",
    label: "GROUND",
    title: "Start with your actual financial picture",
    description:
      "Linc assembles the cash, debt, investments, property, income, spending, goals, and outside context that can materially change this decision.",
    note: "Your numbers first. AI second.",
  },
  {
    number: "02",
    label: "SEPARATE",
    title: "Keep facts and assumptions distinct",
    description:
      "Known balances and spending stay separate from choices about future inflation, a retirement date, a home price, or planned spending.",
    note: "Change an assumption. See what moves.",
  },
  {
    number: "03",
    label: "CALCULATE",
    title: "Use repeatable math where it matters",
    description:
      "Retirement projections, debt scenarios, affordability comparisons, cash-flow analysis, and compounding can run through deterministic financial tools.",
    note: "Same inputs. Same calculation. Same result.",
  },
  {
    number: "04",
    label: "VALIDATE",
    title: "Check the answer before you see it",
    description:
      "The reasoning pipeline can flag inconsistent calculations, conflicting inputs, unsupported assumptions, and conclusions that do not follow from the numbers.",
    note: "Correct the mismatch, not the story around it.",
  },
] as const;

const aiJobs = [
  "Understand what you are asking",
  "Identify relevant context",
  "Compare tradeoffs",
  "Interpret results and uncertainty",
  "Explain the recommendation",
] as const;

const engineJobs = [
  "Run financial arithmetic",
  "Apply compounding and rates",
  "Calculate scenarios",
  "Run historical simulations",
  "Reproduce the result later",
] as const;

export const TRUST_FAQS = [
  {
    question: "Can AI hallucinate financial numbers?",
    answer:
      "Yes. Language models generate responses rather than operating like traditional financial calculation engines, so they can produce incorrect arithmetic, inconsistent values, or unsupported assumptions. Ask Linc is designed to reduce that risk by grounding analysis in real financial data, separating important calculations from language generation, validating results, and making the underlying work inspectable.",
  },
  {
    question: "Does Ask Linc use AI to perform financial calculations?",
    answer:
      "AI helps understand questions, identify relevant information, interpret results, and explain tradeoffs. Where precise and repeatable calculations matter, Ask Linc can use deterministic financial tools instead of relying on a language model to improvise the arithmetic.",
  },
  {
    question: "What does deterministic financial analysis mean?",
    answer:
      "A deterministic calculation produces the same result when given the same inputs. That makes important financial calculations reproducible and easier to inspect, test, and compare.",
  },
  {
    question: "What is Show the Math?",
    answer:
      "Show the Math is Ask Linc’s transparency layer. It lets you inspect the information, assumptions, calculations, validation, and relevant sources behind a financial answer so you can understand how the conclusion was reached.",
  },
  {
    question: "Can Ask Linc still give different answers over time?",
    answer:
      "Yes—when the underlying facts change. Account balances, spending, investments, interest rates, market data, goals, or assumptions may change. The goal is not to freeze the answer forever. It is to make clear what changed and why the answer changed with it.",
  },
  {
    question: "Is Ask Linc an AI financial advisor?",
    answer:
      "Ask Linc is a financial analysis and decision-support tool, not a human financial advisor or fiduciary. It helps you analyze your financial information, explore scenarios, and understand tradeoffs so you can make more informed decisions.",
  },
] as const;

const trustReading = [
  {
    number: "01",
    title: "Show the Math: how Ask Linc makes analysis transparent",
    href: "/blog/show-the-math-how-ask-linc-makes-ai-financial-analysis-transparent",
  },
  {
    number: "02",
    title: "Why determinism matters in AI financial analysis",
    href: "/blog/why-determinism-matters-in-ai-financial-analysis",
  },
  {
    number: "03",
    title: "Inside the Ask Linc financial reasoning pipeline",
    href: "/blog/inside-the-ask-linc-financial-reasoning-pipeline",
  },
  {
    number: "04",
    title: "How Ask Linc prevents hallucinated numbers",
    href: "/blog/how-ask-linc-prevents-hallucinated-numbers-in-ai-financial-advice",
  },
  {
    number: "05",
    title: "Intelligent finance is a trust story",
    href: "/blog/intelligent-finance-isnt-an-ai-story-its-a-trust-story",
  },
] as const;

export default function TrustPage() {
  return (
    <main className="marketing-site subpage trust-page">
      <SiteHeader />

      <section className="trust-hero shell">
        <div className="trust-hero-copy">
          <p className="section-kicker">FINANCIAL AI, BUILT FOR TRUST</p>
          <h1>Don’t trust the answer. <em>Check it.</em></h1>
          <p className="subhero-copy">
            Your financial data provides the facts. Purpose-built tools handle the calculations where precision matters. AI helps reason through the decision and explain the tradeoffs.
          </p>
          <p className="trust-hero-support">
            Inspect the inputs, assumptions, calculations, validation, and sources behind the answer yourself.
          </p>
          <div className="hero-actions">
            <MarketingGetStartedButton className="button button-primary" trackingLocation="trust_hero" />
            <Link className="text-link" href="#how-it-works">See how it works ↓</Link>
          </div>
          <p className="microcopy"><strong>1 month free</strong>, then $9/month. Cancel anytime.</p>
        </div>

        <article className="trust-audit-card" aria-label="Illustrative verified Ask Linc answer">
          <div className="trust-audit-top">
            <div><span className="brand-mark small" aria-hidden="true">L</span><b>ANSWER CHECK</b></div>
            <span>ILLUSTRATIVE</span>
          </div>
          <div className="trust-audit-question">
            <small>YOUR QUESTION</small>
            <p>Can I retire at 60 without cutting our planned spending?</p>
          </div>
          <div className="trust-audit-verdict">
            <span>✓</span>
            <div><small>CONCLUSION</small><strong>The plan works across most historical periods, with two assumptions worth watching.</strong></div>
          </div>
          <div className="trust-audit-layers">
            {answerLayers.map(([label, description]) => (
              <div key={label}><span>✓</span><b>{label}</b><small>{description}</small><i>VIEW</i></div>
            ))}
          </div>
          <div className="trust-audit-footer"><span>∑</span><b>The work stays attached to the answer.</b></div>
        </article>
      </section>

      <section className="trust-signal-strip" aria-label="How Ask Linc makes answers verifiable">
        <div className="shell">
          <span><b>REAL DATA</b><small>Grounded in what you connect</small></span>
          <span><b>REPEATABLE MATH</b><small>Calculations that can be reproduced</small></span>
          <span><b>VALIDATION</b><small>Checks before the final answer</small></span>
          <span><b>INSPECTABLE</b><small>The work is there when you want it</small></span>
        </div>
      </section>

      <section className="trust-opening page-section shell">
        <div className="trust-opening-heading">
          <div>
            <p className="section-kicker">CONNECTED DATA IS ONLY THE BEGINNING</p>
            <h2>Can you trust what the AI does with the numbers?</h2>
          </div>
          <div>
            <p>Connected financial AI makes it possible to ask a question instead of assembling five dashboards and a spreadsheet.</p>
            <p>But access to your accounts does not make an answer correct. A confident explanation can still contain fragile arithmetic, a hidden assumption, or a conclusion that the underlying numbers do not support.</p>
            <strong>A polished paragraph isn’t enough. You should be able to see where the answer came from.</strong>
          </div>
        </div>
        <div className="trust-question-grid" aria-label="Financial questions where verifiability matters">
          <blockquote>Can I retire at 58?</blockquote>
          <blockquote>How much house can we actually afford?</blockquote>
          <blockquote>Should I pay off this loan or invest instead?</blockquote>
          <blockquote>How long will our savings last?</blockquote>
        </div>
      </section>

      <section className="trust-pipeline-section" id="how-it-works">
        <div className="shell">
          <div className="editorial-heading trust-pipeline-heading">
            <p className="section-kicker">HOW ASK LINC BUILDS AN ANSWER</p>
            <h2>Separate the jobs AI is good at from the jobs that require exact work.</h2>
          </div>
          <div className="trust-pipeline-grid">
            {pipelineSteps.map((step) => (
              <article key={step.number}>
                <div><span>{step.number}</span><small>{step.label}</small></div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <strong>{step.note}</strong>
              </article>
            ))}
          </div>
          <p className="trust-pipeline-caveat">No system is infallible. That is exactly why the final layer—letting you inspect the work—matters most.</p>
        </div>
      </section>

      <section className="trust-separation page-section shell">
        <div className="trust-separation-heading">
          <p className="section-kicker">THE ARCHITECTURAL DIFFERENCE</p>
          <h2>AI reasons. Financial engines calculate.</h2>
          <p>Ask Linc uses AI for the work it does well, without asking it to improvise the arithmetic that an important financial decision depends on.</p>
        </div>
        <div className="trust-role-grid">
          <article>
            <div><span>AI</span><small>REASONING + EXPLANATION</small></div>
            <ul>{aiJobs.map((job) => <li key={job}>{job}</li>)}</ul>
          </article>
          <div className="trust-role-divider" aria-hidden="true">≠</div>
          <article className="trust-engine-card">
            <div><span>∑</span><small>DETERMINISTIC TOOLS</small></div>
            <ul>{engineJobs.map((job) => <li key={job}>{job}</li>)}</ul>
          </article>
        </div>
      </section>

      <section className="trust-math-section dark-band">
        <div className="shell trust-math-layout">
          <div className="trust-math-copy">
            <p className="section-kicker light">∑ SHOW THE MATH</p>
            <h2>You don’t have to take Linc’s word for it.</h2>
            <p>Open the transparency layer beneath an answer to understand what produced the conclusion. That turns a recommendation from something you are expected to believe into something you can evaluate.</p>
            <div className="trust-math-links">
              <Link className="light-link" href="/features">See Ask Linc in action →</Link>
              <Link className="light-link" href="/blog/show-the-math-how-ask-linc-makes-ai-financial-analysis-transparent">Read about Show the Math →</Link>
            </div>
          </div>
          <article className="trust-math-panel" aria-label="What Show the Math includes">
            <div className="trust-math-panel-top"><span>ANSWER 0147</span><b>SHOW THE MATH</b><small>5 LAYERS</small></div>
            {answerLayers.map(([label, description], index) => (
              <div className="trust-math-row" key={label}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{label}</strong><small>{description}</small></div>
                <i>+</i>
              </div>
            ))}
            <p>Relevant market and financial sources retain their retrieval date.</p>
          </article>
        </div>
      </section>

      <section className="trust-repeatability page-section shell">
        <div className="editorial-heading">
          <p className="section-kicker">WHY REPEATABILITY MATTERS</p>
          <h2>The answer shouldn’t change just because the arithmetic was generated twice.</h2>
        </div>
        <div className="trust-repeat-grid">
          <article className="trust-same-input-card">
            <div><span>MONDAY</span><strong>Can I retire at 60?</strong><b>YES</b></div>
            <div><span>TUESDAY</span><strong>Same facts. Same assumptions.</strong><b>YES</b></div>
            <p>Same inputs <i>→</i> same calculation <i>→</i> same result</p>
          </article>
          <article className="trust-uncertainty-card">
            <span>UNCERTAINTY ≠ INCONSISTENCY</span>
            <h3>The future can vary without the method becoming a black box.</h3>
            <p>Markets, inflation, and life change. Ask Linc can examine a range of outcomes across explicit assumptions and historical conditions without inventing a number that merely feels plausible.</p>
            <ul><li>Reproduce</li><li>Inspect</li><li>Test</li><li>Compare</li></ul>
          </article>
        </div>
      </section>

      <section className="trust-category-section">
        <div className="shell trust-category-layout">
          <div>
            <p className="section-kicker">THE TRUST LAYER FOR INTELLIGENT FINANCE</p>
            <h2>Access to financial data isn’t the finish line.</h2>
          </div>
          <div className="trust-category-questions">
            <p>As connected financial AI takes on more important questions, the standard should become higher:</p>
            <ul>
              <li>What data did you use?</li>
              <li>What did you assume?</li>
              <li>Where did this number come from?</li>
              <li>Can I reproduce it?</li>
              <li>What would change the answer?</li>
              <li>Can I inspect the work myself?</li>
            </ul>
            <strong>Not AI you are asked to trust blindly. Financial intelligence you can verify.</strong>
          </div>
        </div>
      </section>

      <section className="trust-privacy-bridge shell">
        <div>
          <p className="section-kicker">TRUST INCLUDES YOUR DATA</p>
          <h2>Know what happens before your numbers reach an AI model.</h2>
          <p>Ask Linc uses read-only account connections, cannot move your money, and does not use your financial data to train AI models. Sensitive identifying labels are removed before analysis.</p>
        </div>
        <Link href="/how-we-protect-your-data">See how Ask Linc protects your financial data <span>→</span></Link>
      </section>

      <section className="trust-questions-section page-section">
        <div className="shell">
          <div className="trust-questions-heading">
            <p className="section-kicker">ASK HARDER QUESTIONS</p>
            <h2>Examine the answer instead of believing a black box.</h2>
          </div>
          <div className="trust-hard-question-list">
            <span>Can we afford this house without derailing retirement?</span>
            <span>What happens if one of us stops working for a year?</span>
            <span>Could I retire two years earlier?</span>
            <span>Should this extra cash go toward debt or investments?</span>
            <span>What would have to be true for this plan to work?</span>
          </div>
        </div>
      </section>

      <section className="trust-reading-section page-section shell">
        <div className="trust-reading-heading">
          <p className="section-kicker">GO DEEPER</p>
          <h2>The engineering behind a checkable answer.</h2>
          <p>Explore the architecture, tradeoffs, and product decisions behind Ask Linc’s approach to verifiable financial AI.</p>
        </div>
        <div className="trust-reading-grid">
          {trustReading.map((item) => (
            <Link href={item.href} key={item.href}>
              <span>{item.number}</span>
              <strong>{item.title}</strong>
              <i>↗</i>
            </Link>
          ))}
        </div>
      </section>

      <section className="trust-faq-section page-section">
        <div className="shell trust-faq-layout">
          <div>
            <p className="section-kicker">FREQUENTLY ASKED QUESTIONS</p>
            <h2>Good skepticism is part of the product.</h2>
          </div>
          <div className="trust-faq-list">
            {TRUST_FAQS.map((item, index) => (
              <details key={item.question} open={index === 0}>
                <summary>{item.question}<span>+</span></summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <PageCta title="A financial answer should earn your trust." />
      <SiteFooter />
    </main>
  );
}
