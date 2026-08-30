import Link from "next/link";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { TRIAL_PRICE_LINE } from "@/config/pricing";
import { PageCta, SiteFooter, SiteHeader } from "./SiteShell";

const answerLayers = [
  ["Your numbers", "The balances and facts Linc used"],
  ["Assumptions", "What Linc had to estimate"],
  ["Math", "How Linc worked out the answer"],
  ["Checks", "What Linc checked before answering"],
  ["Sources", "Where current information came from"],
] as const;

const pipelineSteps = [
  {
    number: "01",
    label: "YOUR NUMBERS",
    title: "Start with your actual financial picture",
    description:
      "Linc brings together the cash, debt, investments, property, income, spending, goals, and outside information that could change the decision.",
    note: "Your numbers first. AI second.",
  },
  {
    number: "02",
    label: "SEPARATE",
    title: "Keep known numbers and estimates separate",
    description:
      "Known balances and spending stay separate from choices about future inflation, a retirement date, a home price, or planned spending.",
    note: "Change an assumption. See what moves.",
  },
  {
    number: "03",
    label: "DO THE MATH",
    title: "Use the same math every time",
    description:
      "Dedicated tools can work out retirement estimates, debt options, home affordability, cash flow, and compound growth.",
    note: "Same inputs. Same calculation. Same result.",
  },
  {
    number: "04",
    label: "CHECK",
    title: "Check the answer before you see it",
    description:
      "Built-in checks can flag math that does not add up, numbers that conflict, guesses without support, and conclusions the numbers do not support.",
    note: "Fix the numbers before explaining the answer.",
  },
] as const;

const aiJobs = [
  "Understand what you are asking",
  "Find the useful information",
  "Compare tradeoffs",
  "Explain what the result means and what could change",
  "Explain the recommendation",
] as const;

const engineJobs = [
  "Do the financial math",
  "Apply compounding and rates",
  "Compare what-if scenarios",
  "Test against market history",
  "Get the same result from the same numbers",
] as const;

export const TRUST_FAQS = [
  {
    question: "Can AI get financial numbers wrong?",
    answer:
      "Yes. A chatbot can produce bad math, conflicting numbers, or guesses that sound certain. Ask Linc lowers that risk by starting with your real financial data, using dedicated tools for important math, checking the result, and showing you the work.",
  },
  {
    question: "Does Ask Linc use AI to perform financial calculations?",
    answer:
      "AI helps understand your question, find useful information, compare tradeoffs, and explain the result. Dedicated tools handle important math instead of asking a chatbot to make it up in the conversation.",
  },
  {
    question: "Why does using the same math matter?",
    answer:
      "The same numbers should produce the same result. That makes an answer easier to check, compare, and revisit later.",
  },
  {
    question: "What is Show the Math?",
    answer:
      "Show the Math lets you see the numbers Linc used, what it assumed, the math, the checks, and the sources behind an answer.",
  },
  {
    question: "Can Ask Linc still give different answers over time?",
    answer:
      "Yes—when your finances or the world changes. Balances, spending, investments, rates, goals, or assumptions may move. Ask Linc shows what changed and why the answer moved with it.",
  },
  {
    question: "Is Ask Linc an AI financial advisor?",
    answer:
      "Ask Linc is software, not a human financial advisor or fiduciary. It helps you understand your numbers, try what-ifs, and compare tradeoffs before you decide.",
  },
] as const;

const trustReading = [
  {
    number: "01",
    title: "Show the Math: see how Ask Linc reached the answer",
    href: "/blog/show-the-math-how-ask-linc-makes-ai-financial-analysis-transparent",
  },
  {
    number: "02",
    title: "Why the same numbers should produce the same result",
    href: "/blog/why-determinism-matters-in-ai-financial-analysis",
  },
  {
    number: "03",
    title: "Inside how Ask Linc builds and checks an answer",
    href: "/blog/inside-the-ask-linc-financial-reasoning-pipeline",
  },
  {
    number: "04",
    title: "How Ask Linc reduces made-up numbers and bad math",
    href: "/blog/how-ask-linc-prevents-hallucinated-numbers-in-ai-financial-advice",
  },
  {
    number: "05",
    title: "A good money answer is a trust story",
    href: "/blog/intelligent-finance-isnt-an-ai-story-its-a-trust-story",
  },
] as const;

export default function TrustPage() {
  return (
    <main className="marketing-site subpage trust-page">
      <SiteHeader />

      <section className="trust-hero shell">
        <div className="trust-hero-copy">
          <p className="section-kicker">ANSWERS YOU CAN CHECK</p>
          <h1>Don’t trust the answer. <em>Check it.</em></h1>
          <p className="subhero-copy">
            Your accounts provide the numbers. Dedicated tools handle the important math. AI helps explain the choices and tradeoffs.
          </p>
          <p className="trust-hero-support">
            See the numbers Linc used, what it assumed, the math, the checks, and the sources.
          </p>
          <div className="hero-actions">
            <MarketingGetStartedButton className="button button-primary" trackingLocation="trust_hero" />
            <Link className="text-link" href="#how-it-works">See how it works ↓</Link>
          </div>
          <p className="microcopy">{TRIAL_PRICE_LINE}</p>
        </div>

        <article className="trust-audit-card" aria-label="Illustrative Ask Linc answer with checks">
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
          <span><b>SAME MATH, SAME RESULT</b><small>Important numbers are worked out consistently</small></span>
          <span><b>BUILT-IN CHECKS</b><small>Math is checked before the answer</small></span>
          <span><b>SHOW THE MATH</b><small>The work is there when you want it</small></span>
        </div>
      </section>

      <section className="trust-opening page-section shell">
        <div className="trust-opening-heading">
          <div>
            <p className="section-kicker">CONNECTED DATA IS ONLY THE BEGINNING</p>
            <h2>Can you trust what the AI does with the numbers?</h2>
          </div>
          <div>
            <p>With your accounts connected, you can ask a question instead of piecing together five dashboards and a spreadsheet.</p>
            <p>But access to your accounts does not make an answer correct. A confident explanation can still contain bad math, a hidden assumption, or a conclusion the numbers do not support.</p>
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
            <h2>Let AI explain. Let dedicated tools do the math.</h2>
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
          <p className="trust-pipeline-caveat">No product is perfect. That is why being able to check the work matters.</p>
        </div>
      </section>

      <section className="trust-separation page-section shell">
        <div className="trust-separation-heading">
          <p className="section-kicker">WHO DOES WHAT</p>
          <h2>AI explains. Dedicated tools do the math.</h2>
          <p>Ask Linc uses AI to understand and explain your question without asking it to make up the math your decision depends on.</p>
        </div>
        <div className="trust-role-grid">
          <article>
            <div><span>AI</span><small>UNDERSTAND + EXPLAIN</small></div>
            <ul>{aiJobs.map((job) => <li key={job}>{job}</li>)}</ul>
          </article>
          <div className="trust-role-divider" aria-hidden="true">≠</div>
          <article className="trust-engine-card">
            <div><span>∑</span><small>DEDICATED MATH TOOLS</small></div>
            <ul>{engineJobs.map((job) => <li key={job}>{job}</li>)}</ul>
          </article>
        </div>
      </section>

      <section className="trust-math-section dark-band">
        <div className="shell trust-math-layout">
          <div className="trust-math-copy">
            <p className="section-kicker light">∑ SHOW THE MATH</p>
            <h2>You don’t have to take Linc’s word for it.</h2>
            <p>Open Show the Math to see how Linc reached the conclusion. You do not have to take the answer on faith.</p>
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
            <p>Market and financial sources show when they were checked.</p>
          </article>
        </div>
      </section>

      <section className="trust-repeatability page-section shell">
        <div className="editorial-heading">
          <p className="section-kicker">WHY REPEATABILITY MATTERS</p>
          <h2>The answer shouldn’t change just because the math was run twice.</h2>
        </div>
        <div className="trust-repeat-grid">
          <article className="trust-same-input-card">
            <div><span>MONDAY</span><strong>Can I retire at 60?</strong><b>YES</b></div>
            <div><span>TUESDAY</span><strong>Same facts. Same assumptions.</strong><b>YES</b></div>
            <p>Same inputs <i>→</i> same calculation <i>→</i> same result</p>
          </article>
          <article className="trust-uncertainty-card">
            <span>A RANGE IS NOT A GUESS</span>
            <h3>The future can change without changing how the math works.</h3>
            <p>Markets, inflation, and life change. Ask Linc can show a range of outcomes using clear assumptions and real market history instead of inventing one number that merely sounds right.</p>
            <ul><li>Repeat</li><li>Check</li><li>Test</li><li>Compare</li></ul>
          </article>
        </div>
      </section>

      <section className="trust-category-section">
        <div className="shell trust-category-layout">
          <div>
            <p className="section-kicker">A HIGHER BAR FOR MONEY ANSWERS</p>
            <h2>Connecting accounts is not enough.</h2>
          </div>
          <div className="trust-category-questions">
            <p>As connected financial AI takes on more important questions, the standard should become higher:</p>
            <ul>
              <li>What data did you use?</li>
              <li>What did you assume?</li>
              <li>Where did this number come from?</li>
              <li>Would I get the same result again?</li>
              <li>What would change the answer?</li>
              <li>Can I check the work myself?</li>
            </ul>
            <strong>Do not trust a polished answer blindly. Check the numbers behind it.</strong>
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
          <h2>Check the answer instead of taking it on faith.</h2>
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
          <h2>How Ask Linc checks an answer.</h2>
          <p>Learn why Ask Linc separates your numbers, the math, and the explanation—and shows you all three.</p>
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
            <h2>The right questions to ask before you trust an answer.</h2>
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
