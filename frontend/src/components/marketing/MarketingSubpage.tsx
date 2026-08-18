import { PageCta, SiteFooter, SiteHeader } from "./SiteShell";
import Image from "next/image";
import Link from "next/link";
import { FeatureScenario } from "./FeatureScenario";
import { MarketingContactForm } from "./MarketingContactForm";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { RotatingContextChips } from "./RotatingContextChips";
import type { GhostPost } from "@/lib/ghost";
import { COMPARISONS, getComparison } from "@/lib/comparisons";

type RouteProps = { params: Promise<{ slug: string[] }> };

const faqs = [
  ["Is this another budgeting app?", "No. Budgeting apps organize what already happened. Ask Linc helps you think through what to do next—such as how much house you can afford, whether a career change works, or how a new expense affects retirement."],
  ["Can I try it before connecting my accounts?", "Yes. Start with a free 1-month trial, then Ask Linc is $9/month for full access with your own accounts. Cancel anytime."],
  ["How do I know the AI isn’t confidently wrong?", "The numbers come from fixed, repeatable calculations rather than being improvised by the language model. You can inspect the inputs, assumptions, calculations, and sources."],
  ["Does Ask Linc give financial advice?", "Ask Linc provides informational analysis and decision support. It does not manage your money and is not a replacement for individualized investment, tax, or legal advice."],
  ["What account data can Linc access?", "Only the read-only financial data needed to answer your questions. Bank credentials are handled by connection providers and are never stored by Ask Linc."],
  ["Is my data used to train AI models?", "No. Sensitive details are anonymized before analysis, and your data is never used to train AI models."],
  ["What market information does Linc use?", "Relevant interest rates, yields, inflation readings, market conditions, and financial news are brought into the answer when they affect your decision."],
  ["Can I delete everything?", "You can disconnect accounts immediately and request deletion at any time. Deletion is completed within 30 days, except for minimal records that may be required for security, fraud prevention, or legal compliance."],
];

const securitySections = [
  ["01", "You control the connection", "Choose which accounts to connect and disconnect them whenever you want. You can also request deletion at any time."],
  ["02", "Read-only by design", "Plaid and SnapTrade handle account connections. Ask Linc never stores your bank credentials and cannot move your money."],
  ["03", "Identity removed before AI", "Account names and merchant details are tokenized before analysis, so the model gets useful context without your identifying details."],
  ["04", "Minimum context, protected models", "Only the context needed for the question is shared. Your financial data is not used to train AI models."],
  ["05", "Encrypted in transit and at rest", "Data is protected with modern transport encryption and strong encryption at rest where applicable."],
  ["06", "No ads. No data brokerage.", "Ask Linc does not sell your data, share it with advertisers, or build an advertising profile around your finances."],
];

const ecosystemCoverage = [
  {
    number: "01",
    title: "Accounts and cash flow",
    providers: "Plaid",
    description: "The day-to-day financial picture behind your decision, normalized across the institutions you connect.",
    details: ["Accounts, balances, cards, and loans", "Transactions, merchants, and category spending", "Monthly income, expenses, and cash flow"],
  },
  {
    number: "02",
    title: "Brokerage and portfolio detail",
    providers: "SnapTrade · FMP · Tiingo",
    description: "Your positions become more than ticker symbols, with the portfolio-level detail needed to discuss concentration, cost, and recent performance.",
    details: ["Brokerage accounts, positions, and cash", "Fund fees plus sector and country exposure", "Quotes, adjusted history, and ticker-linked news"],
  },
  {
    number: "03",
    title: "Property value",
    providers: "RentCast",
    description: "Housing and net-worth questions can use a current estimate without pretending a property value is more precise than it is.",
    details: ["Estimate informed by up to 20 comparables", "Dated midpoint and 85% estimate range", "Standardized address and validated property match"],
  },
  {
    number: "04",
    title: "Rates and the economy",
    providers: "FRED · Massive",
    description: "Published benchmarks ground comparisons about borrowing, saving, inflation, and the wider rate environment.",
    details: ["Inflation, unemployment, and Fed policy", "Mortgage, credit-card, Treasury, and CD rates", "Treasury curve and inflation expectations"],
  },
  {
    number: "05",
    title: "Long-view planning history",
    providers: "Kenneth French · Robert Shiller",
    description: "Retirement stress tests use source-backed monthly histories instead of asking an AI model to invent market behavior.",
    details: ["U.S. and developed international equities", "Government bonds and Treasury bills", "Inflation-adjusted rolling retirement windows"],
  },
  {
    number: "06",
    title: "Current public evidence",
    providers: "Brave Search · market news",
    description: "When the answer depends on something current, Linc can retrieve focused public evidence and keep it separate from your personal facts.",
    details: ["Current rules, limits, and financial news", "Question-specific retrieval when needed", "Source links, dates, and extracted facts"],
  },
] as const;

const factRoutingSteps = [
  ["01", "Start with the baseline", "Net worth, cash, debt, investments, home value, spending, and income give every financial question a consistent starting point."],
  ["02", "Add only what the question needs", "Account, transaction, investment, home, market, or current-public context is selected when it can materially change the answer."],
  ["03", "Normalize and calculate", "Provider records become compact financial facts. Scenario and retirement math runs in repeatable application calculations."],
  ["04", "Keep the answer checkable", "Important numbers stay tied to facts; live inputs keep their source dates, and material uncertainty is shown as a range or caveat."],
] as const;

const comparisonData = {
  chatgpt: {
    eyebrow: "PURPOSE-BUILT FINANCIAL AI VS GENERAL-PURPOSE AI",
    fit: "Choose ChatGPT for breadth. Choose Ask Linc for a financial decision you can inspect.",
  },
  origin: {
    eyebrow: "BIG-DECISION PLANNING VS BROAD MONEY MANAGEMENT",
    fit: "Choose Ask Linc when you need help with a specific decision. Choose Origin when you want broader day-to-day money management.",
  },
  portfoliopilot: {
    eyebrow: "LIFE-DECISION PLANNING VS PORTFOLIO ANALYTICS",
    fit: "Choose Ask Linc when the question involves your whole household. Choose PortfolioPilot when analyzing investments is the main job.",
  },
  monarch: {
    eyebrow: "BIG-DECISION PLANNING VS MONEY TRACKING",
    fit: "Choose Monarch when shared budgeting and tracking are the priority. Choose Ask Linc when you need to turn your numbers into a decision.",
  },
  boldin: {
    eyebrow: "CONNECTED LIFE DECISIONS VS DETAILED RETIREMENT PLANNING",
    fit: "Choose Boldin when you want to build and maintain a detailed retirement model. Choose Ask Linc when retirement is one part of a connected household decision.",
  },
} as const;

const useCases = {
  retirement: {
    slug: "retirement",
    number: "01",
    label: "RETIREMENT PLANNING",
    title: "Know what makes retirement work—before you pick the date.",
    question: "Are we saving enough to retire at 60 without cutting our lifestyle?",
    answer: "You are close. Saving $600 more each month puts the plan on track.",
    summary: "At the current pace, the plan is short by about $110K. A small monthly increase closes most of the gap without changing the retirement date.",
    metrics: [["SAVING NOW", "$2.4K/mo"], ["SAVING NEEDED", "$3K/mo"], ["RETIREMENT AGE", "60"]],
    levers: [["Retirement age", "See how 58, 60, or 62 changes the margin."], ["Spending", "Test the lifestyle the portfolio actually needs to fund."], ["Market sequence", "Stress the plan against real historical downturns."]],
    context: ["Connected accounts", "Income + spending", "Social Security", "Rates + inflation", "Historical returns"],
    tone: "mint",
  },
  home: {
    slug: "home-buying",
    number: "02",
    label: "HOME BUYING",
    title: "Find the price that fits the rest of your life.",
    question: "Can we afford a $700K home without pausing retirement savings?",
    answer: "Yes—if you put 15% down and keep at least $45K in cash.",
    summary: "That keeps a six-month emergency fund and leaves both retirement contributions unchanged. A 20% down payment would stretch cash too thin.",
    metrics: [["HOME PRICE", "$700K"], ["DOWN PAYMENT", "$105K"], ["CASH LEFT", "$48K"]],
    levers: [["Purchase price", "See the point where the plan starts to bend."], ["Mortgage rate", "Compare financing now with a lower-rate refinance case."], ["Cash vs. financing", "Balance liquidity, debt, and the retirement timeline."],
    ],
    context: ["Cash + investments", "Mortgage rates", "Monthly spending", "Property estimates", "Retirement saving"],
    tone: "blue",
  },
  family: {
    slug: "family-planning",
    number: "03",
    label: "GROWING A FAMILY",
    title: "Plan for a child without guessing what has to give.",
    question: "Can one of us take four months of leave and still afford childcare?",
    answer: "Yes—if you build an $18K leave fund before the baby arrives.",
    summary: "Saving $1,800 a month for ten months covers the unpaid leave, keeps the emergency fund intact, and avoids pausing retirement contributions.",
    metrics: [["LEAVE FUND", "$18K"], ["CHILDCARE", "$2.1K/mo"], ["RETIREMENT", "Unchanged"]],
    levers: [["Time away from work", "Compare paid and unpaid leave without losing sight of cash flow."], ["Childcare", "See when daycare costs begin and how long they overlap with leave."], ["Housing and space", "Test whether a move belongs in the same plan or can wait."]],
    context: ["Income + benefits", "Cash savings", "Monthly spending", "Childcare estimates", "Retirement contributions"],
    tone: "sand",
  },
  portfolio: {
    slug: "portfolio-analysis",
    number: "04",
    label: "PORTFOLIO ANALYSIS",
    title: "See the risk behind the ticker symbols.",
    question: "Is our portfolio taking more risk than our plan needs?",
    answer: "Yes. At 92% equities, the plan has more downside than it needs.",
    summary: "A glide toward roughly 70% equities preserves the retirement target with a more resilient first decade.",
    metrics: [["EQUITIES NOW", "92%"], ["TARGET MIX", "~70%"], ["DECISION", "De-risk"]],
    levers: [["Concentration", "Look through funds to see repeated sector and company exposure."], ["Drawdown", "Translate a market fall into dollars and goal impact."], ["Allocation", "Compare risk reduction without losing sight of the plan."],
    ],
    context: ["Brokerage holdings", "Fund-level detail", "Price history", "Asset allocation", "Retirement horizon"],
    tone: "lime",
  },
  market: {
    slug: "financial-stress-testing",
    number: "05",
    label: "FINANCIAL STRESS TESTING",
    title: "Stress-test the plan before real life does.",
    question: "What if stocks fall 25% and inflation stays high?",
    answer: "The plan still works—but the margin gets much thinner.",
    summary: "The biggest risk is being forced to sell during the downturn. A larger cash buffer and lower equity concentration materially improve resilience.",
    metrics: [["STRESS DRAWDOWN", "−25%"], ["CASH BUFFER", "14 mo"], ["PLAN RESULT", "Still viable"]],
    levers: [["Interest rates", "Connect yields and borrowing costs to your actual balance sheet."], ["Inflation", "See how spending power changes the retirement margin."], ["Market moves", "Measure what a downturn means for your holdings and timing."],
    ],
    context: ["Federal Reserve data", "Rates + yields", "Market prices", "Financial news", "Your holdings"],
    tone: "sand",
  },
} as const;

type UseCaseKey = keyof typeof useCases;

function DecisionMiniature() {
  return (
    <article className="decision-miniature">
      <div className="miniature-top"><span className="brand-mark small">L</span><b>ASK LINC · SAMPLE ANSWER</b><span>ILLUSTRATIVE</span></div>
      <p className="miniature-question">Can we afford a $700K home without pausing retirement savings?</p>
      <div className="miniature-verdict"><i>✓</i><div><span>THE SHORT ANSWER</span><strong>Yes—if you put 15% down and keep at least $45K in cash.</strong></div></div>
      <div className="miniature-numbers"><span><small>DOWN PAYMENT</small><b>$105K</b></span><span><small>CASH LEFT</small><b>$48K</b></span><span><small>RETIREMENT</small><b>On track</b></span></div>
      <div className="miniature-take"><span>LINC’S TAKE</span><p>Cap total housing costs at $4,800 a month and keep both 401(k) contributions unchanged.</p></div>
      <button type="button">∑ &nbsp;Show the math <span>+</span></button>
    </article>
  );
}

function StandardPage({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <main className={`marketing-site subpage ${className}`}><SiteHeader />{children}<SiteFooter /></main>;
}

function FeaturesPage() {
  return (
    <StandardPage className="features-page">
      <section className="subhero shell split-subhero">
        <div><p className="section-kicker">HOW ASK LINC WORKS</p><h1>See how one decision changes <em>the rest of your plan.</em></h1><p className="subhero-copy">Connect your accounts, ask a plain-language question, and get a recommendation with the assumptions and calculations attached.</p><div className="hero-actions"><MarketingGetStartedButton className="button button-primary" /><a className="text-link" href="#system">See what goes into an answer ↓</a></div></div>
        <DecisionMiniature />
      </section>
      <section className="page-section shell" id="system">
        <FeatureScenario />
        <div className="feature-proof-intro">
          <p className="section-kicker">WHAT THE ANSWER USES</p>
          <h2>Your accounts, your goals, and the assumptions that matter.</h2>
        </div>
        <div className="feature-proof-grid">
          <article className="feature-proof-card feature-model-card">
            <span className="card-index">02 / CONNECT</span>
            <h3>A living model of your finances</h3>
            <p>Cash, investments, debt, property, income, goals, and risk stay connected so every question starts with the same complete picture.</p>
            <div className="account-stack" aria-label="Sample connected financial picture">
              <span>CASH <b>$92K</b></span>
              <span>RETIREMENT <b>$285K</b></span>
              <span>DEBT <b>−$18K</b></span>
              <span>ANNUAL SAVINGS <b>$36K</b></span>
            </div>
          </article>
          <article className="feature-proof-card feature-market">
            <span className="card-index">03 / CONTEXT</span>
            <h3>Relevant market context</h3>
            <div className="market-readout" aria-label="Illustrative market context">
              <span>10Y TREASURY <b>4.18% ↗</b></span>
              <span>CORE INFLATION <b>2.7% →</b></span>
              <span>MORTGAGE RATE <b>6.42% ↘</b></span>
            </div>
            <p>When rates, inflation, or prices affect the answer, Linc includes them with a source date.</p>
          </article>
          <article className="feature-proof-card feature-trust">
            <span className="card-index">04 / VERIFY</span>
            <h3>Show the work on every answer</h3>
            <div className="verification-stack" aria-label="What you can inspect"><span><b>Inputs</b>What Linc used</span><span><b>Assumptions</b>What Linc changed</span><span><b>Math</b>How the result was calculated</span><span><b>Sources</b>Where live context came from</span></div>
          </article>
        </div>
      </section>
      <section className="context-section dark-band ecosystem-detail-section" id="data-ecosystem">
        <div className="shell">
          <div className="ecosystem-detail-heading">
            <div>
              <p className="section-kicker light">BREADTH ACROSS THE PLAN · DEPTH INSIDE THE DATA</p>
              <h2>A financial ecosystem built for the question.</h2>
            </div>
            <p>Coverage across cash, debt, investments, property, the economy, current evidence, and long-run history keeps the whole plan connected. Detail inside each integration lets Linc answer specific questions instead of stopping at top-line totals. What Linc uses depends on what you connect and what the question requires.</p>
          </div>

          <div className="coverage-grid" aria-label="Ask Linc data-source coverage">
            {ecosystemCoverage.map((item) => (
              <article className="coverage-card" key={item.number}>
                <div className="coverage-card-top"><span>{item.number}</span><small>{item.providers}</small></div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <ul>
                  {item.details.map((detail) => <li key={detail}>{detail}</li>)}
                </ul>
              </article>
            ))}
          </div>

          <div className="fact-routing">
            <div className="fact-routing-copy">
              <p className="section-kicker light">FROM SOURCE TO ANSWER</p>
              <h3>More context when it helps. Less when it doesn&apos;t.</h3>
              <p>Ask Linc keeps personal facts, dated external context, and calculated results distinct. That makes the final recommendation easier to inspect—and harder for an AI model to blur together.</p>
              <div className="fact-routing-links">
                <Link className="light-link" href="/integrations">Explore everything Linc can connect and use →</Link>
                <Link className="light-link" href="/use-cases">See the decisions Linc can help with →</Link>
              </div>
            </div>
            <div>
              <ol className="fact-routing-steps" aria-label="How data reaches an Ask Linc answer">
                {factRoutingSteps.map(([number, title, description]) => (
                  <li key={number}><span>{number}</span><div><strong>{title}</strong><p>{description}</p></div></li>
                ))}
              </ol>
              <div className="context-output"><span className="brand-mark">L</span><div><small>THE OUTPUT</small><strong>A recommendation with the relevant facts, assumptions, math, sources, and uncertainty attached.</strong></div></div>
            </div>
          </div>
        </div>
      </section>
      <PageCta />
    </StandardPage>
  );
}

function UseCasesPage() {
  return (
    <StandardPage className="use-cases-page">
      <section className="subhero centered-subhero shell"><p className="section-kicker">USE CASES</p><h1>Start with what you&apos;re <em>trying to decide.</em></h1><p className="subhero-copy">Ask a question about a home, a growing family, work, investments, or retirement. Linc checks it against the rest of your financial life.</p></section>
      <section className="use-case-index shell">{Object.values(useCases).map((item)=><Link href={`/use-cases/${item.slug}`} className={`use-case-tile ${item.tone}`} key={item.slug}><span>{item.number} / {item.label}</span><h2>{item.title}</h2><div className="use-case-question"><small>ASK LINC</small><b>“{item.question}”</b></div><strong>Explore this decision <i>→</i></strong></Link>)}</section>
      <section className="use-case-bridge"><div className="shell"><p className="section-kicker">WHY THE WHOLE PLAN MATTERS</p><h2>A home, a child, a career change, and retirement share the same money.</h2><p>Linc checks how one choice affects cash flow, savings, debt, and the goals that come after it.</p></div></section>
      <PageCta />
    </StandardPage>
  );
}

function UseCasePage({ useCase }: { useCase: UseCaseKey }) {
  const item = useCases[useCase];
  return (
    <StandardPage className={`use-case-page ${item.tone}`}>
      <section className="subhero shell use-case-hero"><div><Link href="/use-cases" className="back-link">← All use cases</Link><p className="section-kicker">{item.number} / {item.label}</p><h1>{item.title}</h1><p className="subhero-copy">Ask the question in your own words. Linc checks your accounts, goals, and the assumptions that can change the answer.</p><MarketingGetStartedButton className="button button-primary" /></div><article className="use-case-answer"><div className="miniature-top"><span className="brand-mark small">L</span><b>SAMPLE DECISION</b><span>ILLUSTRATIVE</span></div><p>{item.question}</p><div className="use-case-verdict"><small>THE SHORT ANSWER</small><h2>{item.answer}</h2><span>{item.summary}</span></div><div className="use-case-metrics">{item.metrics.map(([label,value])=><span key={label}><small>{label}</small><b>{value}</b></span>)}</div><div className="use-case-check">∑ &nbsp;Every input, assumption, and calculation is inspectable.</div></article></section>
      <section className="decision-levers shell"><div className="editorial-heading"><p className="section-kicker">WHAT MOVES THE ANSWER</p><h2>Change the assumption. See the consequence.</h2></div><div className="lever-grid">{item.levers.map(([title,copy],index)=><article key={title}><span>0{index+1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
      <section className="case-context dark-band"><div className="shell case-context-inner"><div><p className="section-kicker light">WHAT LINC CHECKS FIRST</p><h2>The numbers that can change the answer.</h2></div><RotatingContextChips items={item.context} /></div></section>
      <section className="other-cases shell"><span>EXPLORE ANOTHER DECISION</span>{Object.values(useCases).filter((candidate)=>candidate.slug!==item.slug).map((candidate)=><Link href={`/use-cases/${candidate.slug}`} key={candidate.slug}>{candidate.label}<b>→</b></Link>)}</section>
      <PageCta title={`Bring your ${item.label.toLowerCase()} question to Linc.`} />
    </StandardPage>
  );
}

function PricingPage() {
  return (
    <StandardPage className="pricing-page">
      <section className="subhero centered-subhero shell"><p className="section-kicker">SIMPLE PRICING</p><h1>One month free. Then <em>$9 a month.</em></h1><p className="subhero-copy">Ask as many questions as you need, connect your accounts, and compare what-if scenarios. Cancel anytime.</p></section>
      <section className="pricing-stage shell">
        <div className="price-argument"><p className="section-kicker">PAY FOR THE PRODUCT—NOT A PERCENTAGE OF YOUR WEALTH</p><h2>Planning help before the decision gets expensive.</h2><p>No asset minimum. No annual contract. No sales call.</p><div className="cost-comparison"><span><small>ASK LINC</small><b>$9/mo</b><i>after first month free</i></span><span className="versus">VS</span><span><small>1% OF A $500K PORTFOLIO</small><b>$5,000</b><i>per year · illustrative</i></span></div></div>
        <article className="sub-price-card"><div className="price-card-top"><span>ASK LINC</span><b>EVERYTHING INCLUDED</b></div><div className="price"><sup>$</sup>9<span>/month</span></div><p>First month free. Cancel anytime.</p><ul><li>Unlimited questions and follow-ups</li><li>Unlimited connected accounts</li><li>What-if scenarios</li><li>Dated market inputs when relevant</li><li>Retirement and risk analysis</li><li>Show the math on every answer</li><li>Privacy-first architecture</li></ul><MarketingGetStartedButton className="button button-primary price-button" /></article>
      </section>
      <section className="page-section shell compact-faq"><div><p className="section-kicker">PRICING QUESTIONS</p><h2>No tiers to decode.</h2></div><div>{faqs.slice(0,4).map(([q,a])=><details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></section>
      <PageCta title="Bring your hardest money question to Linc." />
    </StandardPage>
  );
}

function AboutPage() {
  return (
    <StandardPage className="about-page">
      <section className="subhero shell about-hero"><div><p className="section-kicker">WHY ASK LINC EXISTS</p><h1>A money answer should be <em>easy to check.</em></h1></div><p className="about-lede">Especially before a big decision. Ask Linc starts with your actual accounts, states the assumptions, runs repeatable calculations, and shows what can change the result.</p></section>
      <section className="founder-origin shell"><div className="founder-portrait"><span className="founder-portrait-photo"><Image src="/images/ethan-teng-cartoon.webp" alt="Cartoon portrait of Ethan Teng" fill sizes="150px" priority /></span><div><b>Ethan Teng</b><small>FOUNDER · ASK LINC</small></div></div><div className="origin-copy"><p className="section-kicker">THE ORIGIN</p><h2>It started with a layoff—and a bad idea.</h2><p className="lead-paragraph">After getting laid off, I pasted my own bank statements into ChatGPT to answer some tough money questions—and immediately regretted it.</p><p>The responses were polished, but the process was wrong. A general chatbot didn’t have a trustworthy model of my finances. It could blur facts with assumptions, make fragile calculations sound certain, and give me no clean way to inspect the work.</p><p>So I built Ask Linc to answer a specific question with the accounts, goals, assumptions, and calculations that actually affect it.</p><div className="signature-line"><span><Image src="/images/ethan-teng-cartoon.webp" alt="" fill sizes="41px" /></span><div><b>Ethan Teng</b><small>Builder, user, and first skeptic</small></div></div></div></section>
      <section className="page-section values-band"><div className="shell"><div className="editorial-heading"><p className="section-kicker">HOW WE BUILD</p><h2>You should be able to see why an answer changed.</h2></div><div className="belief-grid"><article><span>01</span><h3>Start with the decision</h3><p>Show the numbers that help someone choose, not another screen of charts to interpret.</p></article><article><span>02</span><h3>Use repeatable math</h3><p>Important calculations should produce the same result from the same inputs and be open to inspection.</p></article><article><span>03</span><h3>Remove identifying detail</h3><p>Replace sensitive labels before financial context reaches an AI model.</p></article><article><span>04</span><h3>Show ranges and tradeoffs</h3><p>The future is uncertain. A useful answer says what could change and how much it matters.</p></article></div></div></section>
      <PageCta title="Make the next hard question easier to answer." />
    </StandardPage>
  );
}

function FaqPage() {
  return (
    <StandardPage className="faq-page">
      <section className="subhero centered-subhero shell"><p className="section-kicker">THE QUESTIONS BEHIND THE QUESTIONS</p><h1>Good skepticism is <em>welcome here.</em></h1><p className="subhero-copy">What Ask Linc does, how it reaches an answer, and what happens to your data.</p></section>
      <section className="faq-layout shell"><aside><span>JUMP TO</span><a href="#product">Product</a><a href="#accuracy">Accuracy</a><a href="#privacy-faq">Privacy</a><a href="#billing">Billing</a></aside><div className="faq-list"><p className="faq-group" id="product">PRODUCT</p>{faqs.slice(0,2).map(([q,a])=><details key={q} open={q===faqs[0][0]}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}<p className="faq-group" id="accuracy">ACCURACY &amp; SCOPE</p>{faqs.slice(2,4).map(([q,a])=><details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}<p className="faq-group" id="privacy-faq">PRIVACY &amp; DATA</p>{faqs.slice(4,8).map(([q,a])=><details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}<p className="faq-group" id="billing">BILLING</p><details><summary>What does $9 include?<span>+</span></summary><p>Your first month is free. After that, $9/month includes unlimited questions, connected accounts, follow-ups, scenarios, market-aware analysis, and inspectable math. Cancel anytime.</p></details></div></section>
      <section className="human-help shell"><div><span>STILL WONDERING?</span><h2>Ask the human who built it.</h2></div><Link className="button button-dark" href="/contact">Contact Ethan →</Link></section>
      <PageCta />
    </StandardPage>
  );
}

function SecurityPage() {
  return (
    <StandardPage className="security-page">
      <section className="security-hero"><div className="shell split-subhero"><div><p className="section-kicker light">PRIVACY BY DESIGN</p><h1>Your finances stay yours. <em>Even from the AI.</em></h1><p>The AI doesn’t need your bank names, account numbers, or identity to reason about the decision. So it doesn’t get them.</p></div><div className="privacy-diagram"><span><i>▰</i><b>Your accounts</b><small>Read-only connection</small></span><b>→</b><span className="active"><i>◇</i><b>Privacy layer</b><small>Identity removed</small></span><b>→</b><span><i>L</i><b>Linc’s analysis</b><small>Minimum context</small></span></div></div></section>
      <section className="security-promises shell"><span><b>READ-ONLY</b>Linc can’t move money</span><span><b>NO TRAINING</b>Your data is not used for model training</span><span><b>YOUR CONNECTIONS</b>Disconnect accounts anytime</span></section>
      <section className="page-section shell"><div className="editorial-heading"><p className="section-kicker">HOW PROTECTION WORKS</p><h2>Six promises, built into the system.</h2></div><div className="security-grid">{securitySections.map(([n,t,d])=><article key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></article>)}</div></section>
      <section className="token-section"><div className="shell token-grid"><div><p className="section-kicker">WHAT ANONYMIZATION LOOKS LIKE</p><h2>Useful context in.<br/>Identity left out.</h2><p>Before analysis, sensitive labels are replaced with neutral tokens. The financial relationship remains; the identifying detail does not.</p></div><div className="token-card"><span><del>Bank of America Checking</del><b>Account_1</b></span><span><del>Chase Sapphire Preferred</del><b>Card_2</b></span><span><del>Trader Joe’s</del><b>Merchant_12</b></span><small>TRANSFORMATION OCCURS BEFORE AI ANALYSIS</small></div></div></section>
      <section className="security-contact shell"><div><p className="section-kicker">A HUMAN IS RESPONSIBLE</p><h2>Have a privacy question? Ask the person who built the system.</h2></div><div><p>If you have a question, concern, or deletion request, email the founder directly.</p><a className="text-link" href="mailto:hello@asklinc.com">hello@asklinc.com →</a></div></section>
      <PageCta />
    </StandardPage>
  );
}

function CompareIndexPage() {
  return (
    <StandardPage className="compare-index-page">
      <section className="subhero centered-subhero shell">
        <p className="section-kicker">COMPARE ASK LINC</p>
        <h1>Choose the tool built for <em>the job you need done.</em></h1>
        <p className="subhero-copy">
          Ask Linc focuses on planning a specific life decision. See how that differs from general-purpose AI, broader money management, budgeting, portfolio analytics, and detailed retirement planning.
        </p>
      </section>
      <section className="compare-index-grid shell" aria-label="Ask Linc comparisons">
        {COMPARISONS.map((page, index) => (
          <Link href={`/vs/${page.slug}`} className="compare-index-card" key={page.slug}>
            <span>{String(index + 1).padStart(2, "0")} / COMPARISON</span>
            <h2>Ask Linc <em>vs {page.competitorName}</em></h2>
            <p>{page.summary}</p>
            <strong>Read the comparison <i>→</i></strong>
          </Link>
        ))}
      </section>
      <PageCta title="Start with the financial decision in front of you." />
    </StandardPage>
  );
}

function ComparisonPage({ product }: { product: keyof typeof comparisonData }) {
  const design = comparisonData[product];
  const page = getComparison(product);
  if (!page) return null;

  return (
    <StandardPage className="comparison-page">
      <section className="subhero shell comparison-hero"><div><p className="section-kicker">{design.eyebrow}</p><h1>Ask Linc <em>vs {page.competitorName}</em></h1><p className="subhero-copy">{page.summary}</p><div className="hero-actions"><MarketingGetStartedButton className="button button-primary" />{page.relatedLinks?.length ? <div className="comparison-reading-links" aria-label="Related reading">{page.relatedLinks.map((link)=><Link className="text-link" href={link.href} key={link.href}>{link.label}</Link>)}</div> : <Link className="text-link" href="/pricing">View free-trial pricing</Link>}</div></div><div className="versus-mark"><span className="brand-mark">L</span><b>VS</b><span>{page.competitorName.slice(0,2).toUpperCase()}</span></div></section>
      <section className="comparison-strip"><div className="shell"><span>ASK LINC</span><i>Different tools for different jobs</i><span>{page.competitorName.toUpperCase()}</span></div></section>
      <section className="page-section shell comparison-section"><div className="editorial-heading"><p className="section-kicker">THE SHORT VERSION</p><h2>Start with the job you need done.</h2></div><div className="comparison-table" role="table"><div className="comparison-row comparison-head" role="row"><span>DIMENSION</span><b>ASK LINC</b><b>{page.competitorName.toUpperCase()}</b></div>{page.rows.map(({ dimension, askLinc, competitor })=><div className="comparison-row" role="row" key={dimension}><span className="comparison-dimension" role="rowheader">{dimension}</span><div className="comparison-value" role="cell"><small>ASK LINC</small><b>{askLinc}</b></div><div className="comparison-value" role="cell"><small>{page.competitorName.toUpperCase()}</small><b>{competitor}</b></div></div>)}</div></section>
      <section className="fit-section"><div className="shell"><p className="section-kicker">OUR HONEST TAKE</p><h2>{design.fit}</h2><p>{page.honestTake ?? "Ask Linc does not replace a budget app, investment platform, dedicated retirement-planning system, or human professional. It helps you compare options and inspect the calculations behind them."}</p></div></section>
      <section className="page-section shell compact-faq comparison-faq"><div><p className="section-kicker">BEFORE YOU CHOOSE</p><h2>The questions people actually ask.</h2></div><div>{page.faqs.map((faq)=><details key={faq.question}><summary>{faq.question}<span>+</span></summary><p>{faq.answer}</p></details>)}</div></section>
      <section className="other-comparisons shell"><span>COMPARE ASK LINC WITH</span>{Object.keys(comparisonData).filter((key)=>key!==product).map((key)=>{ const other = getComparison(key); return other ? <Link href={`/vs/${key}`} key={key}>{other.competitorName} <b>→</b></Link> : null; })}</section>
      <PageCta title="See which experience answers your question." />
    </StandardPage>
  );
}

function LegalPage({ type }: { type: "privacy" | "terms" }) {
  const privacy = type === "privacy";
  const sections = privacy ? [
    ["1. What we collect", "We collect the minimum information needed to deliver Ask Linc: read-only financial account data supplied through connection providers, questions and responses, and basic product usage and security logs. We do not collect or store your banking credentials."],
    ["2. How we use it", "We use this information to answer questions using your financial context, operate and improve the product, prevent fraud, and understand anonymized usage trends. We do not sell your data, share it with advertisers, or use it to train AI models."],
    ["3. Your privacy rights", "Depending on where you live, including California and the European Union, you may have rights to access, correct, export, or delete personal information and to limit certain processing. Contact hello@asklinc.com or use the in-app controls."],
    ["4. Storage and transfers", "Data is stored securely in the United States. When information is transferred internationally, Ask Linc applies appropriate safeguards."],
    ["5. Deletion and control", "You can disconnect accounts and request deletion at any time. Deleted data is permanently removed within 30 days, except for minimal records retained when required for security, fraud prevention, or legal compliance."],
    ["6. Service providers", "Ask Linc uses service providers for account connections, AI analysis, payments, hosting, and privacy-conscious analytics. These include Plaid, SnapTrade, Anthropic, Google, Stripe, Render, Vercel, and Plausible."],
    ["7. Contact", "For privacy questions or requests, email hello@asklinc.com."],
  ] : [
    ["1. What Ask Linc does", "Ask Linc connects to your accounts and helps you reason about your finances using your information and current market context."],
    ["2. Your responsibilities", "Use Ask Linc only for lawful personal purposes, do not resell or misuse the service, protect your credentials, and understand that the product provides informational analysis rather than investment, tax, or legal advice."],
    ["3. Subscription and billing", "Paid features are presented with clear pricing. You can cancel your subscription at any time; no hidden or surprise charges are intended."],
    ["4. Data and privacy", "Your use of Ask Linc is also governed by the Privacy Policy. You can access, export, or delete your information and exercise applicable CCPA and GDPR rights."],
    ["5. No guarantees", "Ask Linc works hard to provide useful analysis, but cannot guarantee uninterrupted service, perfect accuracy, or a correct interpretation of every question. Double-check major decisions with a qualified professional."],
    ["6. Changes to these terms", "If these terms materially change, Ask Linc will provide notice in the product or by email. Continued use after the change means you accept the updated terms."],
    ["7. Contact", "Questions, complaints, or requests can be sent to hello@asklinc.com."],
  ];
  return (
    <StandardPage className="legal-page"><section className="legal-hero shell"><p className="section-kicker">THE PLAIN-LANGUAGE VERSION</p><h1>{privacy ? "Privacy Policy" : "Terms of Service"}</h1><div><span>Effective July 29, 2025</span><span>Operated by Ethan Teng Consulting LLC</span></div></section><section className="legal-layout shell"><aside><b>IN THIS DOCUMENT</b>{sections.map(([title])=><a href={`#${title.slice(0,1)}`} key={title}>{title}</a>)}</aside><article><div className="legal-note"><b>{privacy ? "The short version" : "Before you continue"}</b><p>{privacy ? "We collect the minimum, never sell your data, and give you control over deletion." : "Ask Linc is decision-support software—not personalized financial, tax, or legal advice."}</p></div>{sections.map(([title,body])=><section id={title.slice(0,1)} key={title}><h2>{title}</h2><p>{body}</p></section>)}</article></section><PageCta title="Questions about the fine print? Ask a human." /></StandardPage>
  );
}

function ContactPage() {
  return (
    <StandardPage className="contact-page"><section className="contact-stage shell"><div><p className="section-kicker">CONTACT ASK LINC</p><h1>A real person reads <em>every message.</em></h1><p>Questions, feedback, privacy requests, or something not working? Send a note directly to the founder.</p><a href="mailto:hello@asklinc.com" className="contact-email">hello@asklinc.com <span>↗</span></a><div className="response-note"><span className="pulse"/><p><b>Typical response</b><small>Within one business day</small></p></div></div><MarketingContactForm /></section><section className="contact-links shell"><Link href="/faq"><span>01</span><b>Common questions</b><i>Read the FAQ →</i></Link><Link href="/how-we-protect-your-data"><span>02</span><b>Privacy &amp; security</b><i>See how data is protected →</i></Link><Link href="/pricing"><span>03</span><b>Pricing</b><i>One plan, full access →</i></Link></section></StandardPage>
  );
}

const postTones = ["lime", "blue", "mint", "ink", "sand"] as const;

function formatPostDate(value?: string | null) {
  if (!value) return "Ask Linc";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function postCategory(post: GhostPost) {
  return post.tags?.[0]?.name?.toUpperCase() || "ASK LINC BLOG";
}

export function MarketingBlogPage({ ghostPosts }: { ghostPosts: GhostPost[] }) {
  const publishedPosts = ghostPosts.filter((post) => post.slug && post.title);
  const featured = publishedPosts[0];

  return (
    <StandardPage className="blog-page">
      <section className="blog-hero shell">
        <div><p className="section-kicker">THE ASK LINC BLOG</p><h1>Better thinking about <em>money and machines.</em></h1></div>
        <p>Field notes on intelligent finance, retirement decisions, product transparency, and the systems that make AI worth trusting.</p>
      </section>
      {featured ? (
        <>
          <section className="featured-post shell">
            <Link href={`/blog/${featured.slug}`} className="post-art lime">
              <span>∑</span><i>{postCategory(featured)}</i><b>01</b>
            </Link>
            <div>
              <span className="post-category">{postCategory(featured)}</span>
              <h2>{featured.title}</h2>
              <p>{featured.excerpt}</p>
              <div className="post-meta"><span><Image src="/images/ethan-teng-cartoon.webp" alt="" fill sizes="38px" /></span><p><b>{featured.authors?.[0]?.name || "Ethan Teng"}</b><small>{formatPostDate(featured.published_at)} · {featured.reading_time || 5} min read</small></p></div>
              <Link className="text-link" href={`/blog/${featured.slug}`}>Read the analysis →</Link>
            </div>
          </section>
          <section className="post-grid shell">
            {publishedPosts.slice(1).map((post, index) => (
              <article key={post.id}>
                <Link href={`/blog/${post.slug}`} className={`post-art ${postTones[index % postTones.length]}`}>
                  <span>{String(index + 2).padStart(2, "0")}</span><b>{postCategory(post).split(" ")[0]}</b><i>↗</i>
                </Link>
                <span className="post-category">{postCategory(post)}</span>
                <h3><Link href={`/blog/${post.slug}`}>{post.title}</Link></h3>
                <p>{post.excerpt}</p>
                <small>{formatPostDate(post.published_at)} · {post.reading_time || 5} min read</small>
              </article>
            ))}
          </section>
        </>
      ) : (
        <section className="not-found shell"><span>BLOG</span><h2>New field notes are on the way.</h2></section>
      )}
      <PageCta title="Turn the reading into a real decision." />
    </StandardPage>
  );
}

export function MarketingArticlePage({ post, processedHtml }: { post: GhostPost; processedHtml: string }) {
  const author = post.authors?.[0]?.name || "Ethan Teng";

  return (
    <StandardPage className="article-page">
      <section className="article-head shell">
        <Link href="/blog" className="back-link">← Back to the blog</Link>
        <span className="post-category">{postCategory(post)}</span>
        <h1>{post.title}</h1>
        {post.excerpt && <p>{post.excerpt}</p>}
        <div className="article-byline"><span><Image src="/images/ethan-teng-cartoon.webp" alt="" fill sizes="38px" /></span><p><b>{author}</b><small>Published {formatPostDate(post.published_at)} · {post.reading_time || 5} min read</small></p></div>
      </section>
      <div className="article-art post-art blue"><span>ASK LINC / FIELD NOTE</span><b>{postCategory(post)}</b><i>∑</i></div>
      <section className="article-layout shell marketing-article-layout">
        <aside><span>ASK LINC BLOG</span><Link href="/features">See how Linc works</Link><Link href="/use-cases">Explore use cases</Link></aside>
        <article className="marketing-article-body ghost-content" dangerouslySetInnerHTML={{ __html: processedHtml }} />
      </section>
      <section className="next-reading shell"><span>KEEP EXPLORING</span><h2>Bring the question back to your own numbers.</h2><MarketingGetStartedButton className="button button-primary" /></section>
      <PageCta title="Try a real question with your own numbers." />
    </StandardPage>
  );
}

export default async function Subpage({ params }: RouteProps) {
  const { slug } = await params;
  const path = slug.join("/");
  if (path === "features") return <FeaturesPage />;
  if (path === "use-cases") return <UseCasesPage />;
  if (path === "use-cases/retirement" || path === "use-cases/retirement-planning") return <UseCasePage useCase="retirement" />;
  if (path === "use-cases/home-buying") return <UseCasePage useCase="home" />;
  if (path === "use-cases/family-planning") return <UseCasePage useCase="family" />;
  if (path === "use-cases/portfolio-analysis") return <UseCasePage useCase="portfolio" />;
  if (path === "use-cases/financial-stress-testing" || path === "use-cases/market-impact-analysis") return <UseCasePage useCase="market" />;
  if (path === "pricing") return <PricingPage />;
  if (path === "about") return <AboutPage />;
  if (path === "faq") return <FaqPage />;
  if (path === "how-we-protect-your-data") return <SecurityPage />;
  if (path === "vs") return <CompareIndexPage />;
  if (path === "privacy" || path === "privacy-policy") return <LegalPage type="privacy" />;
  if (path === "terms") return <LegalPage type="terms" />;
  if (path === "contact") return <ContactPage />;
  if (path === "vs/chatgpt") return <ComparisonPage product="chatgpt" />;
  if (path === "vs/origin") return <ComparisonPage product="origin" />;
  if (path === "vs/portfoliopilot") return <ComparisonPage product="portfoliopilot" />;
  if (path === "vs/monarch") return <ComparisonPage product="monarch" />;
  if (path === "vs/boldin") return <ComparisonPage product="boldin" />;
  return <StandardPage><section className="not-found shell"><span>404</span><h1>That page moved.</h1><Link className="button button-primary" href="/">Back to Ask Linc →</Link></section></StandardPage>;
}
