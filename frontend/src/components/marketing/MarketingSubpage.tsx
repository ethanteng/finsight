import { PageCta, SiteFooter, SiteHeader } from "./SiteShell";
import Link from "next/link";
import { FeatureScenario } from "./FeatureScenario";
import { MarketingContactForm } from "./MarketingContactForm";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { RotatingContextChips } from "./RotatingContextChips";
import type { GhostPost } from "@/lib/ghost";

type RouteProps = { params: Promise<{ slug: string[] }> };

const faqs = [
  ["Is this another budgeting app?", "No. Budgeting apps organize what already happened. Ask Linc helps you reason about what to do next by combining your accounts, goals, and current market conditions."],
  ["Can I try it before connecting my accounts?", "Yes. The interactive demo uses realistic sample data and does not require a credit card. Full access with your own accounts is $9 per month."],
  ["How do I know the AI isn’t confidently wrong?", "The numbers are produced by deterministic calculations, not improvised by the language model. Every answer can expose its inputs, assumptions, calculations, and sources."],
  ["Does Ask Linc give financial advice?", "Ask Linc provides informational analysis and decision support. It does not manage your money and is not a replacement for individualized investment, tax, or legal advice."],
  ["What account data can Linc access?", "Only the read-only financial data needed to answer your questions. Bank credentials are handled by connection providers and are never stored by Ask Linc."],
  ["Is my data used to train AI models?", "No. Sensitive details are anonymized before analysis, and your data is never used to train AI models."],
  ["What market information does Linc use?", "Relevant interest rates, yields, inflation readings, market conditions, and financial news are brought into the answer when they affect your decision."],
  ["Can I delete everything?", "Yes. You can disconnect accounts, export your information, and request deletion of your data at any time."],
];

const securitySections = [
  ["01", "You control the connection", "Choose which accounts to connect. Disconnect instantly. Delete your data without a support ticket or a dark pattern."],
  ["02", "Read-only by design", "Plaid and SnapTrade handle account connections. Ask Linc never stores your bank credentials and cannot move your money."],
  ["03", "Identity removed before AI", "Account names and merchant details are tokenized before analysis, so the model gets useful context without your identifying details."],
  ["04", "Minimum context, protected models", "Only the context needed for the question is shared. Your financial data is not used to train AI models."],
  ["05", "Encrypted in transit and at rest", "Data is protected with modern transport encryption and strong encryption at rest where applicable."],
  ["06", "No ads. No data brokerage.", "Ask Linc does not sell your data, share it with advertisers, or build an advertising profile around your finances."],
];

const comparisonData = {
  origin: {
    name: "Origin",
    eyebrow: "BROAD MONEY APP VS FOCUSED DECISION ENGINE",
    intro: "Origin brings tracking, planning, and AI Q&A into one broad money app. Ask Linc is narrower on purpose: inspectable financial reasoning for the decisions that don’t fit a dashboard.",
    fit: "Choose Ask Linc when your real question is ‘what should we do?’ Choose Origin when breadth and everyday money management are the primary job.",
    rows: [
      ["Core job", "Reason through household decisions", "Manage a broad financial life"],
      ["Experience", "Questions, scenarios, recommendations", "Tracking, planning, and AI Q&A"],
      ["Math transparency", "Inputs and calculations are inspectable", "Review current product details"],
      ["Pricing approach", "$9/month flat", "See Origin for current plans"],
    ],
  },
  portfoliopilot: {
    name: "PortfolioPilot",
    eyebrow: "HOUSEHOLD DECISIONS VS PORTFOLIO ANALYTICS",
    intro: "PortfolioPilot is built for portfolio analysis and stress testing. Ask Linc reasons across the whole household—cash, debt, property, retirement, goals, and the market—in plain English.",
    fit: "Choose Ask Linc for connected household questions. Choose PortfolioPilot when deep portfolio analytics are the center of the job.",
    rows: [
      ["Core job", "Household financial reasoning", "Portfolio analysis and stress testing"],
      ["Scope", "Accounts, debt, housing, goals, retirement", "Investments and portfolio scenarios"],
      ["Interaction", "Conversational decisions and follow-ups", "Analytics-led portfolio tools"],
      ["Pricing approach", "$9/month flat", "See PortfolioPilot for current plans"],
    ],
  },
  monarch: {
    name: "Monarch",
    eyebrow: "DECISION SUPPORT VS MONEY TRACKING",
    intro: "Monarch is excellent at organizing budgets, transactions, and net worth. Ask Linc starts where tracking stops: deciding what your full financial picture means for what comes next.",
    fit: "Keep Monarch if shared budgeting and tracking are the main job. Choose Ask Linc when the pain is turning all that information into a decision.",
    rows: [
      ["Core job", "Answer ‘what should we do?’", "Show ‘where did the money go?’"],
      ["Strength", "Retirement, housing, debt, and risk", "Budgets, categories, and net worth"],
      ["Output", "Recommendation with inspectable math", "Organized dashboards and trends"],
      ["Can they coexist?", "Yes—use Linc for big decisions", "Yes—use Monarch for tracking"],
    ],
  },
} as const;

const useCases = {
  retirement: {
    slug: "retirement",
    number: "01",
    label: "RETIREMENT PLANNING",
    title: "Know what makes retirement work—before you pick the date.",
    question: "Can we retire at 60 without cutting our lifestyle?",
    answer: "Yes—with a $1.7M projected cushion in the base case.",
    summary: "The bigger issue is not the date. It is reducing concentration risk before the first five years of withdrawals.",
    metrics: [["PROJECTED AT 60", "$6.3M"], ["PLAN REQUIRES", "$4.6M"], ["SUCCESS RANGE", "75–85%"]],
    levers: [["Retirement age", "See how 58, 60, or 62 changes the margin."], ["Spending", "Test the lifestyle the portfolio actually needs to fund."], ["Market sequence", "Stress the plan against real historical downturns."]],
    context: ["Connected accounts", "Income + spending", "Social Security", "Rates + inflation", "Historical returns"],
    tone: "mint",
  },
  home: {
    slug: "home-buying",
    number: "02",
    label: "HOME BUYING",
    title: "Find the price that fits the rest of your life.",
    question: "Can we buy the lake house without delaying retirement?",
    answer: "Yes—if you keep the purchase below $780K.",
    summary: "A 40% cash down payment protects the retirement plan while keeping a 14-month liquidity buffer.",
    metrics: [["PURCHASE CEILING", "$780K"], ["DOWN PAYMENT", "$210K"], ["RETIREMENT SHIFT", "+8 mo"]],
    levers: [["Purchase price", "See the point where the plan starts to bend."], ["Mortgage rate", "Compare financing now with a lower-rate refinance case."], ["Cash vs. financing", "Balance liquidity, debt, and the retirement timeline."],
    ],
    context: ["Cash + investments", "Current mortgage rates", "Home value", "Property estimates", "Retirement goal"],
    tone: "blue",
  },
  portfolio: {
    slug: "portfolio-analysis",
    number: "03",
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
    number: "04",
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
      <div className="miniature-top"><span className="brand-mark small">L</span><b>ASK LINC · SAMPLE ANSWER</b><span>LIVE</span></div>
      <p className="miniature-question">Can we afford the lake house without delaying retirement?</p>
      <div className="miniature-verdict"><i>✓</i><div><span>THE SHORT ANSWER</span><strong>Yes—if you keep the purchase below $780K.</strong></div></div>
      <div className="miniature-numbers"><span><small>DOWN PAYMENT</small><b>$210K</b></span><span><small>RETIREMENT SHIFT</small><b>+8 months</b></span><span><small>CASH BUFFER</small><b>14 months</b></span></div>
      <div className="miniature-take"><span>LINC’S TAKE</span><p>Keep the primary mortgage intact, fund 40% in cash, and revisit if rates fall below 5.2%.</p></div>
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
        <div><p className="section-kicker">FINANCIAL REASONING, BUILT TO BE CHECKED</p><h1>From a hard question to a <em>defensible decision.</em></h1><p className="subhero-copy">Ask Linc connects the facts of your financial life, brings in the market context that matters, and makes the recommendation—and the work behind it—easy to inspect.</p><div className="hero-actions"><a className="button button-primary" href="https://asklinc.com/demo">See a real answer <span>→</span></a><a className="text-link" href="#system">Explore the system ↓</a></div></div>
        <DecisionMiniature />
      </section>
      <section className="page-section shell" id="system">
        <FeatureScenario />
        <div className="feature-proof-intro">
          <p className="section-kicker">WHAT MAKES THE ANSWER DIFFERENT</p>
          <h2>Every answer starts with more of the truth.</h2>
        </div>
        <div className="feature-proof-grid">
          <article className="feature-proof-card feature-model-card">
            <span className="card-index">02 / CONNECT</span>
            <h3>A living model of your finances</h3>
            <p>Cash, investments, debt, property, income, goals, and risk stay connected so every question starts with the same complete picture.</p>
            <div className="account-stack" aria-label="Sample connected financial picture">
              <span>INVESTMENTS <b>$3.18M</b></span>
              <span>PROPERTY <b>$1.24M</b></span>
              <span>DEBT <b>−$444K</b></span>
              <span>ANNUAL SAVINGS <b>$82K</b></span>
            </div>
          </article>
          <article className="feature-proof-card feature-market">
            <span className="card-index">03 / CONTEXT</span>
            <h3>The market, as it is now</h3>
            <div className="market-readout" aria-label="Sample current market context">
              <span>10Y TREASURY <b>4.18% ↗</b></span>
              <span>CORE INFLATION <b>2.7% →</b></span>
              <span>MORTGAGE RATE <b>6.42% ↘</b></span>
            </div>
            <p>Current rates, inflation, and market conditions enter the answer only when relevant.</p>
          </article>
          <article className="feature-proof-card feature-trust">
            <span className="card-index">04 / VERIFY</span>
            <h3>Show the work on every answer</h3>
            <div className="verification-stack" aria-label="What you can inspect"><span><b>Inputs</b>What Linc used</span><span><b>Assumptions</b>What Linc changed</span><span><b>Math</b>How the result was calculated</span><span><b>Sources</b>Where live context came from</span></div>
          </article>
        </div>
      </section>
      <section className="context-section dark-band"><div className="shell context-layout"><div className="context-copy"><p className="section-kicker light">A LOT OF DATA. ONE USEFUL CONTEXT.</p><h2>Linc connects the sources so you don’t have to.</h2><p>Your accounts, holdings, property, and the live market arrive as one decision context—not nine more dashboards to check.</p><Link className="light-link" href="/use-cases">See what Linc can answer →</Link></div><div className="context-map" aria-label="Data sources connected by Ask Linc"><div className="context-row"><b>YOUR MONEY</b><span>Plaid<small>banking + debt</small></span><span>SnapTrade<small>investments</small></span></div><div className="context-row"><b>WHAT YOU OWN</b><span>RentCast<small>home values</small></span><span>FMP + Tiingo<small>funds + price history</small></span></div><div className="context-row"><b>THE WORLD NOW</b><span>FRED<small>rates + inflation</small></span><span>Alpha Vantage + Massive<small>market data</small></span></div><div className="context-output"><span className="brand-mark">L</span><div><small>THE OUTPUT</small><strong>One answer, with the relevant context already attached.</strong></div></div></div></div></section>
      <PageCta />
    </StandardPage>
  );
}

function UseCasesPage() {
  return (
    <StandardPage className="use-cases-page">
      <section className="subhero centered-subhero shell"><p className="section-kicker">USE CASES</p><h1>Start with the decision. <em>Not the data entry.</em></h1><p className="subhero-copy">Ask Linc brings your finances and the live context together around the question in front of you.</p></section>
      <section className="use-case-index shell">{Object.values(useCases).map((item)=><Link href={`/use-cases/${item.slug}`} className={`use-case-tile ${item.tone}`} key={item.slug}><span>{item.number} / {item.label}</span><h2>{item.title}</h2><div className="use-case-question"><small>ASK LINC</small><b>“{item.question}”</b></div><strong>Explore this decision <i>→</i></strong></Link>)}</section>
      <section className="use-case-bridge"><div className="shell"><p className="section-kicker">THE COMMON THREAD</p><h2>The answer to one question already understands the others.</h2><p>A home purchase changes retirement. A market drop changes risk. A debt decision changes liquidity. Linc keeps the whole model connected.</p></div></section>
      <PageCta />
    </StandardPage>
  );
}

function UseCasePage({ useCase }: { useCase: UseCaseKey }) {
  const item = useCases[useCase];
  return (
    <StandardPage className={`use-case-page ${item.tone}`}>
      <section className="subhero shell use-case-hero"><div><Link href="/use-cases" className="back-link">← All use cases</Link><p className="section-kicker">{item.number} / {item.label}</p><h1>{item.title}</h1><p className="subhero-copy">Ask the real question. Linc pulls together the accounts, assumptions, and current conditions that determine the answer.</p><a className="button button-primary" href="https://asklinc.com/demo">Try it with sample data →</a></div><article className="use-case-answer"><div className="miniature-top"><span className="brand-mark small">L</span><b>SAMPLE DECISION</b><span>LIVE CONTEXT</span></div><p>{item.question}</p><div className="use-case-verdict"><small>THE SHORT ANSWER</small><h2>{item.answer}</h2><span>{item.summary}</span></div><div className="use-case-metrics">{item.metrics.map(([label,value])=><span key={label}><small>{label}</small><b>{value}</b></span>)}</div><div className="use-case-check">∑ &nbsp;Every input, assumption, and calculation is inspectable.</div></article></section>
      <section className="decision-levers shell"><div className="editorial-heading"><p className="section-kicker">WHAT MOVES THE ANSWER</p><h2>Change the assumption. See the consequence.</h2></div><div className="lever-grid">{item.levers.map(([title,copy],index)=><article key={title}><span>0{index+1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
      <section className="case-context dark-band"><div className="shell case-context-inner"><div><p className="section-kicker light">CONTEXT LINC BRINGS IN</p><h2>No exports. No tab juggling.</h2></div><RotatingContextChips items={item.context} /></div></section>
      <section className="other-cases shell"><span>EXPLORE ANOTHER DECISION</span>{Object.values(useCases).filter((candidate)=>candidate.slug!==item.slug).map((candidate)=><Link href={`/use-cases/${candidate.slug}`} key={candidate.slug}>{candidate.label}<b>→</b></Link>)}</section>
      <PageCta title={`Bring your ${item.label.toLowerCase()} question to Linc.`} />
    </StandardPage>
  );
}

function PricingPage() {
  return (
    <StandardPage className="pricing-page">
      <section className="subhero centered-subhero shell"><p className="section-kicker">SIMPLE PRICING</p><h1>One plan. <em>Full access.</em></h1><p className="subhero-copy">See a real answer free with sample data. Connect your own accounts when you’re ready.</p></section>
      <section className="pricing-stage shell">
        <div className="price-argument"><p className="section-kicker">PAY FOR THE PRODUCT—NOT A PERCENTAGE OF YOUR WEALTH</p><h2>A serious tool at a deliberately small price.</h2><p>No asset minimum. No annual contract. No sales call.</p><div className="cost-comparison"><span><small>ASK LINC</small><b>$108</b><i>per year</i></span><span className="versus">VS</span><span><small>1% OF A $2M PORTFOLIO</small><b>$20,000</b><i>per year · illustrative</i></span></div></div>
        <article className="sub-price-card"><div className="price-card-top"><span>ASK LINC</span><b>EVERYTHING INCLUDED</b></div><div className="price"><sup>$</sup>9<span>/month</span></div><p>Cancel anytime.</p><ul><li>Unlimited questions and follow-ups</li><li>Unlimited connected accounts</li><li>What-if scenarios</li><li>Market-aware financial reasoning</li><li>Retirement and risk analysis</li><li>Show the math on every answer</li><li>Privacy-first architecture</li></ul><MarketingGetStartedButton className="button button-primary price-button" /></article>
      </section>
      <section className="page-section shell compact-faq"><div><p className="section-kicker">PRICING QUESTIONS</p><h2>No tiers to decode.</h2></div><div>{faqs.slice(0,4).map(([q,a])=><details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></section>
      <PageCta title="Try the answer before you buy the tool." />
    </StandardPage>
  );
}

function AboutPage() {
  return (
    <StandardPage className="about-page">
      <section className="subhero shell about-hero"><div><p className="section-kicker">WHY ASK LINC EXISTS</p><h1>Financial answers should be more than <em>convincing.</em></h1></div><p className="about-lede">They should understand your whole picture, use reliable calculations, reflect the world as it is today, and let you inspect the numbers before you act.</p></section>
      <section className="founder-origin shell"><div className="founder-portrait"><span>ET</span><div><b>Ethan Teng</b><small>FOUNDER · ASK LINC</small></div></div><div className="origin-copy"><p className="section-kicker">THE ORIGIN</p><h2>It started with a layoff—and a bad idea.</h2><p className="lead-paragraph">After getting laid off, I pasted my own bank statements into ChatGPT to answer some tough money questions—and immediately regretted it.</p><p>The responses were polished, but the process was wrong. A general chatbot didn’t have a trustworthy model of my finances. It could blur facts with assumptions, make fragile calculations sound certain, and give me no clean way to inspect the work.</p><p>So I built Ask Linc: a way to get decision-ready answers from your actual finances, with current market context and calculations you can verify.</p><div className="signature-line"><span>ET</span><div><b>Ethan Teng</b><small>Builder, user, and first skeptic</small></div></div></div></section>
      <section className="page-section values-band"><div className="shell"><div className="editorial-heading"><p className="section-kicker">WHAT WE BELIEVE</p><h2>Trust is a product decision.</h2></div><div className="belief-grid"><article><span>01</span><h3>Answers over dashboards</h3><p>Your finances are not improved by another screen of charts. The product should help you decide.</p></article><article><span>02</span><h3>Math should be boring</h3><p>Important calculations should be fixed, reproducible, and inspectable—not generated on the fly.</p></article><article><span>03</span><h3>Privacy is architecture</h3><p>Protecting identity and minimizing context should happen before data reaches a model.</p></article><article><span>04</span><h3>Clarity beats certainty</h3><p>A good answer shows ranges, risks, and assumptions instead of pretending the future is knowable.</p></article></div></div></section>
      <PageCta title="Make the next hard question easier to answer." />
    </StandardPage>
  );
}

function FaqPage() {
  return (
    <StandardPage className="faq-page">
      <section className="subhero centered-subhero shell"><p className="section-kicker">THE QUESTIONS BEHIND THE QUESTIONS</p><h1>Good skepticism is <em>welcome here.</em></h1><p className="subhero-copy">What Ask Linc does, how it reaches an answer, and what happens to your data.</p></section>
      <section className="faq-layout shell"><aside><span>JUMP TO</span><a href="#product">Product</a><a href="#accuracy">Accuracy</a><a href="#privacy-faq">Privacy</a><a href="#billing">Billing</a></aside><div className="faq-list"><p className="faq-group" id="product">PRODUCT</p>{faqs.slice(0,2).map(([q,a])=><details key={q} open={q===faqs[0][0]}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}<p className="faq-group" id="accuracy">ACCURACY &amp; SCOPE</p>{faqs.slice(2,4).map(([q,a])=><details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}<p className="faq-group" id="privacy-faq">PRIVACY &amp; DATA</p>{faqs.slice(4,8).map(([q,a])=><details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}<p className="faq-group" id="billing">BILLING</p><details><summary>What does $9 include?<span>+</span></summary><p>Full access: unlimited questions, connected accounts, follow-ups, scenarios, market-aware analysis, and inspectable math. Cancel anytime.</p></details></div></section>
      <section className="human-help shell"><div><span>STILL WONDERING?</span><h2>Ask the human who built it.</h2></div><Link className="button button-dark" href="/contact">Contact Ethan →</Link></section>
      <PageCta />
    </StandardPage>
  );
}

function SecurityPage() {
  return (
    <StandardPage className="security-page">
      <section className="security-hero"><div className="shell split-subhero"><div><p className="section-kicker light">PRIVACY BY DESIGN</p><h1>Your finances stay yours. <em>Even from the AI.</em></h1><p>The AI doesn’t need your bank names, account numbers, or identity to reason about the decision. So it doesn’t get them.</p></div><div className="privacy-diagram"><span><i>▰</i><b>Your accounts</b><small>Read-only connection</small></span><b>→</b><span className="active"><i>◇</i><b>Privacy layer</b><small>Identity removed</small></span><b>→</b><span><i>L</i><b>Linc’s analysis</b><small>Minimum context</small></span></div></div></section>
      <section className="security-promises shell"><span><b>READ-ONLY</b>Linc can’t move money</span><span><b>NO TRAINING</b>Your data never trains AI</span><span><b>FULL CONTROL</b>Export or delete anytime</span></section>
      <section className="page-section shell"><div className="editorial-heading"><p className="section-kicker">HOW PROTECTION WORKS</p><h2>Six promises, built into the system.</h2></div><div className="security-grid">{securitySections.map(([n,t,d])=><article key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></article>)}</div></section>
      <section className="token-demo"><div className="shell token-grid"><div><p className="section-kicker">WHAT ANONYMIZATION LOOKS LIKE</p><h2>Useful context in.<br/>Identity left out.</h2><p>Before analysis, sensitive labels are replaced with neutral tokens. The financial relationship remains; the identifying detail does not.</p></div><div className="token-card"><span><del>Bank of America Checking</del><b>Account_1</b></span><span><del>Chase Sapphire Preferred</del><b>Card_2</b></span><span><del>Trader Joe’s</del><b>Merchant_12</b></span><small>TRANSFORMATION OCCURS BEFORE AI ANALYSIS</small></div></div></section>
      <section className="security-contact shell"><div><p className="section-kicker">QUESTIONS DESERVE A HUMAN ANSWER</p><h2>Privacy is a relationship, not a legal checkbox.</h2></div><div><p>If you have a question, concern, or deletion request, email the founder directly.</p><a className="text-link" href="mailto:hello@asklinc.com">hello@asklinc.com →</a></div></section>
      <PageCta />
    </StandardPage>
  );
}

function ComparisonPage({ product }: { product: keyof typeof comparisonData }) {
  const data = comparisonData[product];
  return (
    <StandardPage className="comparison-page">
      <section className="subhero shell comparison-hero"><div><p className="section-kicker">{data.eyebrow}</p><h1>Ask Linc <em>vs {data.name}</em></h1><p className="subhero-copy">{data.intro}</p><div className="hero-actions"><a className="button button-primary" href="https://asklinc.com/demo">See a real answer →</a><Link className="text-link" href="/pricing">View $9 pricing</Link></div></div><div className="versus-mark"><span className="brand-mark">L</span><b>VS</b><span>{data.name.slice(0,2).toUpperCase()}</span></div></section>
      <section className="comparison-strip"><div className="shell"><span>ASK LINC</span><i>Different tools for different jobs</i><span>{data.name.toUpperCase()}</span></div></section>
      <section className="page-section shell comparison-section"><div className="editorial-heading"><p className="section-kicker">THE SHORT VERSION</p><h2>Start with the job you need done.</h2></div><div className="comparison-table" role="table"><div className="comparison-row comparison-head" role="row"><span>DIMENSION</span><b>ASK LINC</b><b>{data.name.toUpperCase()}</b></div>{data.rows.map(([dimension,linc,other])=><div className="comparison-row" role="row" key={dimension}><span>{dimension}</span><b>{linc}</b><b>{other}</b></div>)}</div></section>
      <section className="fit-section"><div className="shell"><p className="section-kicker">OUR HONEST TAKE</p><h2>{data.fit}</h2><p>Ask Linc is not trying to replace every financial product. It is purpose-built for decision support with transparent math.</p></div></section>
      <section className="other-comparisons shell"><span>COMPARE ASK LINC WITH</span>{Object.entries(comparisonData).filter(([key])=>key!==product).map(([key,value])=><Link href={`/vs/${key}`} key={key}>{value.name} <b>→</b></Link>)}</section>
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
  return post.tags?.[0]?.name?.toUpperCase() || "ASK LINC JOURNAL";
}

export function MarketingBlogPage({ ghostPosts }: { ghostPosts: GhostPost[] }) {
  const publishedPosts = ghostPosts.filter((post) => post.slug && post.title);
  const featured = publishedPosts[0];

  return (
    <StandardPage className="blog-page">
      <section className="blog-hero shell">
        <div><p className="section-kicker">THE ASK LINC JOURNAL</p><h1>Better thinking about <em>money and machines.</em></h1></div>
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
              <div className="post-meta"><span>ET</span><p><b>{featured.authors?.[0]?.name || "Ethan Teng"}</b><small>{formatPostDate(featured.published_at)} · {featured.reading_time || 5} min read</small></p></div>
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
        <section className="not-found shell"><span>JOURNAL</span><h2>New field notes are on the way.</h2></section>
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
        <Link href="/blog" className="back-link">← Back to the journal</Link>
        <span className="post-category">{postCategory(post)}</span>
        <h1>{post.title}</h1>
        {post.excerpt && <p>{post.excerpt}</p>}
        <div className="article-byline"><span>ET</span><p><b>{author}</b><small>Published {formatPostDate(post.published_at)} · {post.reading_time || 5} min read</small></p></div>
      </section>
      <div className="article-art post-art blue"><span>ASK LINC / FIELD NOTE</span><b>{postCategory(post)}</b><i>∑</i></div>
      <section className="article-layout shell marketing-article-layout">
        <aside><span>ASK LINC JOURNAL</span><Link href="/features">See how Linc works</Link><Link href="/use-cases">Explore use cases</Link></aside>
        <article className="marketing-article-body ghost-content" dangerouslySetInnerHTML={{ __html: processedHtml }} />
      </section>
      <section className="next-reading shell"><span>KEEP EXPLORING</span><h2>Bring the question back to your own numbers.</h2><Link href="/demo">Try Ask Linc →</Link></section>
      <PageCta title="See what transparent financial reasoning feels like." />
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
  if (path === "use-cases/portfolio-analysis") return <UseCasePage useCase="portfolio" />;
  if (path === "use-cases/financial-stress-testing" || path === "use-cases/market-impact-analysis") return <UseCasePage useCase="market" />;
  if (path === "pricing") return <PricingPage />;
  if (path === "about") return <AboutPage />;
  if (path === "faq") return <FaqPage />;
  if (path === "how-we-protect-your-data") return <SecurityPage />;
  if (path === "privacy" || path === "privacy-policy") return <LegalPage type="privacy" />;
  if (path === "terms") return <LegalPage type="terms" />;
  if (path === "contact") return <ContactPage />;
  if (path === "vs/origin") return <ComparisonPage product="origin" />;
  if (path === "vs/portfoliopilot") return <ComparisonPage product="portfoliopilot" />;
  if (path === "vs/monarch") return <ComparisonPage product="monarch" />;
  return <StandardPage><section className="not-found shell"><span>404</span><h1>That page moved.</h1><Link className="button button-primary" href="/">Back to Ask Linc →</Link></section></StandardPage>;
}
