import { PageCta, SiteFooter, SiteHeader } from "./SiteShell";
import Image from "next/image";
import Link from "next/link";
import { FeatureScenario } from "./FeatureScenario";
import { MarketingContactForm } from "./MarketingContactForm";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { RotatingContextChips } from "./RotatingContextChips";
import type { GhostPost } from "@/lib/ghost";
import { getComparison } from "@/lib/comparisons";
import type { Pricing } from "@/config/pricing";
import { getPricing } from "@/lib/pricing";
import { RetirementDecisionCrossSell } from "./RetirementDecisionCrossSell";

type RouteProps = { params: Promise<{ slug: string[] }> };

function buildFaqs(pricing: Pricing): string[][] {
  return [
    ["Is this another budgeting app?", "No. Budgeting apps organize what already happened. Ask Linc helps you think through what to do next—such as how much house you can afford, whether a career change works, or how a new expense affects retirement."],
    ["Can I try it before connecting my accounts?", `Yes. Start with a free 1-month trial, then Ask Linc is ${pricing.label} for full access with your own accounts. Cancel anytime.`],
    ["How do I know the AI isn’t confidently wrong?", "Ask Linc works out important numbers the same way each time instead of making up the math in a chat. You can see the numbers it used, what it assumed, the math, and the sources."],
    ["Does Ask Linc give financial advice?", "Ask Linc helps you explore options and understand the tradeoffs. It does not manage your money or replace personal investment, tax, or legal advice."],
    ["What account data can Linc access?", "Only the read-only financial data needed to answer your questions. Bank credentials are handled by connection providers and are never stored by Ask Linc."],
    ["Is my data used to train AI models?", "No. Personal details are removed before AI sees your financial information, and your data is never used to train AI models."],
    ["What market information does Linc use?", "Relevant interest rates, yields, inflation readings, market conditions, and financial news are brought into the answer when they affect your decision."],
    ["Can I delete everything?", "You can disconnect accounts immediately and request deletion at any time. Deletion is completed within 30 days, except for minimal records that may be required for security, fraud prevention, or legal compliance."],
  ];
}

const securitySections = [
  ["01", "You control the connection", "Choose which accounts to connect and disconnect them whenever you want. You can also request deletion at any time."],
  ["02", "Read-only by design", "Plaid and SnapTrade handle account connections. Ask Linc never stores your bank credentials and cannot move your money."],
  ["03", "Personal details removed before AI", "Account names and merchant details are replaced with neutral labels before AI sees them."],
  ["04", "Only what is needed", "Ask Linc shares only the information needed to answer your question. Your financial data is not used to train AI models."],
  ["05", "Encrypted in transit and at rest", "Data is protected with modern transport encryption and strong encryption at rest where applicable."],
  ["06", "No ads. No data brokerage.", "Ask Linc does not sell your data, share it with advertisers, or build an advertising profile around your finances."],
];

const ecosystemCoverage = [
  {
    number: "01",
    title: "Accounts and cash flow",
    providers: "Plaid",
    description: "Checking, savings, cards, and loans brought together in one clear picture.",
    details: ["Accounts, balances, cards, and loans", "Transactions, merchants, and category spending", "Monthly income, expenses, and cash flow"],
  },
  {
    number: "02",
    title: "Investments and retirement accounts",
    providers: "SnapTrade · FMP · Tiingo",
    description: "See what you own, where you may be taking the same bet twice, what your funds cost, and how they are doing.",
    details: ["Brokerage and retirement accounts", "Fund fees and where your money is invested", "Current prices, history, and related news"],
  },
  {
    number: "03",
    title: "Property value",
    providers: "RentCast",
    description: "Housing and net-worth questions can use a current estimate without pretending a property value is more precise than it is.",
    details: ["Estimate based on nearby comparable homes", "A dated value range, not false precision", "A checked match for the right property"],
  },
  {
    number: "04",
    title: "Rates and the economy",
    providers: "FRED · Massive",
    description: "Current published rates help compare borrowing, saving, and inflation choices.",
    details: ["Inflation, unemployment, and Fed policy", "Mortgage, credit-card, Treasury, and CD rates", "What markets expect for rates and inflation"],
  },
  {
    number: "05",
    title: "Long-term market history",
    providers: "Kenneth French · Robert Shiller",
    description: "Retirement what-ifs use real market history instead of an AI-made forecast.",
    details: ["U.S. and international stocks", "Government bonds and Treasury bills", "Retirement periods adjusted for inflation"],
  },
  {
    number: "06",
    title: "Current rules and news",
    providers: "Brave Search · market news",
    description: "When the answer depends on what is true today, Linc can look up the relevant rule, limit, rate, or news.",
    details: ["Current rules, limits, and financial news", "Only the search your question needs", "Links, dates, and the useful facts"],
  },
] as const;

const factRoutingSteps = [
  ["01", "Start with your money", "Net worth, cash, debt, investments, home value, spending, and income give every question a clear starting point."],
  ["02", "Add only what matters", "Linc brings in account details, rates, markets, or current rules only when they could change the answer."],
  ["03", "Work out the numbers", "Linc turns connected records into clear facts, then runs the retirement or what-if math."],
  ["04", "Show where the answer came from", "Important numbers stay tied to their sources, and uncertain estimates are shown as a range with an explanation."],
] as const;

const comparisonData = {
  chatgpt: {
    eyebrow: "A MONEY TOOL VS A GENERAL CHATBOT",
    fit: { competitor: "Choose ChatGPT for breadth.", askLinc: "Choose Ask Linc when you need to check the work.", order: "competitor-first" },
  },
  origin: {
    eyebrow: "ONE BIG DECISION VS ALL-IN-ONE MONEY MANAGEMENT",
    fit: { competitor: "Choose Origin when you want broader day-to-day money management.", askLinc: "Choose Ask Linc when you need help with a specific decision.", order: "ask-linc-first" },
  },
  portfoliopilot: {
    eyebrow: "YOUR WHOLE MONEY PICTURE VS YOUR INVESTMENTS",
    fit: { competitor: "Choose PortfolioPilot when analyzing investments is the main job.", askLinc: "Choose Ask Linc when the question involves your whole household.", order: "ask-linc-first" },
  },
  monarch: {
    eyebrow: "WHAT TO DO NEXT VS TRACKING WHAT HAPPENED",
    fit: { competitor: "Choose Monarch when shared budgeting and tracking are the priority.", askLinc: "Choose Ask Linc when you need to turn your numbers into a decision.", order: "competitor-first" },
  },
  boldin: {
    eyebrow: "A CONNECTED MONEY QUESTION VS A DETAILED RETIREMENT PLAN",
    fit: { competitor: "Choose Boldin when you want to build and maintain a detailed retirement model.", askLinc: "Choose Ask Linc when retirement is one part of a connected household decision.", order: "competitor-first" },
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
    levers: [["Retirement age", "See how 58, 60, or 62 changes the cushion."], ["Spending", "Try different spending levels and see what your investments need to cover."], ["A bad start in the markets", "See how the plan holds up if markets fall early in retirement."]],
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
    levers: [["Purchase price", "See the point where the plan starts to feel tight."], ["Mortgage rate", "Compare buying now with refinancing later at a lower rate."], ["Down payment", "Balance cash on hand, debt, and your retirement date."],
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
    summary: "Gradually moving toward roughly 70% stocks keeps the retirement target while reducing the damage from an early market drop.",
    metrics: [["STOCKS NOW", "92%"], ["TARGET MIX", "~70%"], ["DECISION", "Lower risk"]],
    levers: [["Concentration", "Look inside your funds to find repeated bets on the same sectors or companies."], ["A market drop", "See what a downturn would mean in dollars and for your goals."], ["Investment mix", "Compare lower-risk options without losing sight of the plan."],
    ],
    context: ["Brokerage holdings", "Fund-level detail", "Price history", "Asset allocation", "Retirement horizon"],
    tone: "lime",
  },
  market: {
    slug: "financial-stress-testing",
    number: "05",
    label: "WHAT-IF PLANNING",
    title: "Try the bad what-ifs before they happen.",
    question: "What if stocks fall 25% and inflation stays high?",
    answer: "The plan still works—but the margin gets much thinner.",
    summary: "The biggest risk is having to sell while markets are down. More cash and fewer big stock bets make the plan safer.",
    metrics: [["MARKET DROP", "−25%"], ["CASH BUFFER", "14 mo"], ["PLAN RESULT", "Still works"]],
    levers: [["Interest rates", "See how changing rates affect your debt, savings, and investments."], ["Inflation", "See how higher prices change what you can spend in retirement."], ["Market moves", "Measure what a downturn means for what you own and when you need the money."],
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
        <div><p className="section-kicker">HOW ASK LINC WORKS</p><h1>See how one decision changes <em>the rest of your plan.</em></h1><p className="subhero-copy">Connect your accounts, ask a question in your own words, and get a clear answer with the numbers shown.</p><div className="hero-actions"><MarketingGetStartedButton className="button button-primary" csOverrideId="cta-start-free-trial-hero" /><a className="text-link" href="#system">See what goes into an answer ↓</a></div></div>
        <DecisionMiniature />
      </section>
      <section className="page-section shell" id="system">
        <FeatureScenario />
        <div className="feature-proof-intro">
          <p className="section-kicker">WHAT THE ANSWER USES</p>
          <h2>Your accounts, your goals, and what could change the answer.</h2>
        </div>
        <div className="feature-proof-grid">
          <article className="feature-proof-card feature-model-card">
            <span className="card-index">02 / CONNECT</span>
            <h3>Your full money picture</h3>
            <p>Cash, investments, debt, property, income, and goals stay together so every question starts with the same numbers.</p>
            <div className="account-stack" aria-label="Sample connected financial picture">
              <span>CASH <b>$92K</b></span>
              <span>RETIREMENT <b>$285K</b></span>
              <span>DEBT <b>−$18K</b></span>
              <span>ANNUAL SAVINGS <b>$36K</b></span>
            </div>
          </article>
          <article className="feature-proof-card feature-market">
            <span className="card-index">03 / TODAY</span>
            <h3>Today&apos;s rates and markets</h3>
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
            <div className="verification-stack" aria-label="What Show the Math includes"><span><b>Your numbers</b>What Linc used</span><span><b>Assumptions</b>What Linc had to estimate</span><span><b>Math</b>How Linc worked out the answer</span><span><b>Sources</b>Where current information came from</span></div>
            <Link className="feature-trust-link" href="/trust">See how answers are checked →</Link>
          </article>
        </div>
      </section>
      <section className="context-section dark-band ecosystem-detail-section" id="data-ecosystem">
        <div className="shell">
          <div className="ecosystem-detail-heading">
            <div>
              <p className="section-kicker light">THE RIGHT INFORMATION FOR THE QUESTION</p>
              <h2>Bring the whole money picture into one answer.</h2>
            </div>
            <p>Ask Linc can use cash, debt, investments, property, rates, current rules, and market history. It brings in only what could change the answer.</p>
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
              <h3>More information when it helps. Less when it doesn&apos;t.</h3>
              <p>Ask Linc keeps your numbers, outside information, and the math separate. That makes it easier to see where the answer came from.</p>
              <div className="fact-routing-links">
                <Link className="light-link" href="/integrations">See what Linc can connect and use →</Link>
                <Link className="light-link" href="/use-cases">See the decisions Linc can help with →</Link>
              </div>
            </div>
            <div>
              <ol className="fact-routing-steps" aria-label="How data reaches an Ask Linc answer">
                {factRoutingSteps.map(([number, title, description]) => (
                  <li key={number}><span>{number}</span><div><strong>{title}</strong><p>{description}</p></div></li>
                ))}
              </ol>
              <div className="context-output"><span className="brand-mark">L</span><div><small>THE ANSWER</small><strong>A clear recommendation with the numbers, math, sources, and what could change it.</strong></div></div>
            </div>
          </div>
        </div>
      </section>
      <PageCta csOverrideId="cta-start-free-trial-mid" />
    </StandardPage>
  );
}

function UseCasesPage() {
  return (
    <StandardPage className="use-cases-page">
      <section className="subhero centered-subhero shell"><p className="section-kicker">WHAT YOU CAN ASK</p><h1>Start with what you&apos;re <em>trying to decide.</em></h1><p className="subhero-copy">Ask a question about a home, a growing family, work, investments, or retirement. Linc checks it against the rest of your financial life.</p></section>
      <section className="use-case-index shell">{Object.values(useCases).map((item)=><Link href={`/use-cases/${item.slug}`} className={`use-case-tile ${item.tone}`} key={item.slug}><span>{item.number} / {item.label}</span><h2>{item.title}</h2><div className="use-case-question"><small>ASK LINC</small><b>“{item.question}”</b></div><strong>Explore this decision <i>→</i></strong></Link>)}</section>
      <section className="use-case-bridge"><div className="shell"><p className="section-kicker">WHY THE WHOLE PLAN MATTERS</p><h2>A home, a child, a career change, and retirement share the same money.</h2><p>Linc checks how one choice affects cash flow, savings, debt, and the goals that come after it.</p></div></section>
      <PageCta csOverrideId="cta-start-free-trial-mid" />
    </StandardPage>
  );
}

function UseCasePage({ useCase }: { useCase: UseCaseKey }) {
  const item = useCases[useCase];
  return (
    <StandardPage className={`use-case-page ${item.tone}`}>
      <section className="subhero shell use-case-hero"><div><Link href="/use-cases" className="back-link">← All questions</Link><p className="section-kicker">{item.number} / {item.label}</p><h1>{item.title}</h1><p className="subhero-copy">Ask the question in your own words. Linc checks your accounts, goals, and the things that could change the answer.</p><MarketingGetStartedButton className="button button-primary" csOverrideId="cta-start-free-trial-hero" /></div><article className="use-case-answer"><div className="miniature-top"><span className="brand-mark small">L</span><b>SAMPLE DECISION</b><span>ILLUSTRATIVE</span></div><p>{item.question}</p><div className="use-case-verdict"><small>THE SHORT ANSWER</small><h2>{item.answer}</h2><span>{item.summary}</span></div><div className="use-case-metrics">{item.metrics.map(([label,value])=><span key={label}><small>{label}</small><b>{value}</b></span>)}</div><div className="use-case-check">∑ &nbsp;Open Show the Math to see the numbers behind the answer.</div></article></section>
      <section className="decision-levers shell"><div className="editorial-heading"><p className="section-kicker">WHAT MOVES THE ANSWER</p><h2>Change one thing. See what happens.</h2></div><div className="lever-grid">{item.levers.map(([title,copy],index)=><article key={title}><span>0{index+1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
      <section className="case-context dark-band"><div className="shell case-context-inner"><div><p className="section-kicker light">WHAT LINC CHECKS FIRST</p><h2>The numbers that can change the answer.</h2></div><RotatingContextChips items={item.context} /></div></section>
      <section className="other-cases shell"><span>EXPLORE ANOTHER DECISION</span>{Object.values(useCases).filter((candidate)=>candidate.slug!==item.slug).map((candidate)=><Link href={`/use-cases/${candidate.slug}`} key={candidate.slug}>{candidate.label}<b>→</b></Link>)}</section>
      {useCase === "retirement" && <RetirementDecisionCrossSell />}
      <PageCta title={`Bring your ${item.label.toLowerCase()} question to Linc.`} csOverrideId="cta-start-free-trial-mid" />
    </StandardPage>
  );
}

function PricingPage({ pricing }: { pricing: Pricing }) {
  const faqs = buildFaqs(pricing);
  return (
    <StandardPage className="pricing-page">
      <section className="subhero centered-subhero shell"><p className="section-kicker">SIMPLE PRICING</p><h1>One month free. Then <em>{pricing.dollars} a {pricing.intervalLabel}.</em></h1><p className="subhero-copy">Ask as many questions as you need, connect your accounts, and compare what-if scenarios. Cancel anytime.</p></section>
      <section className="pricing-stage shell">
        <div className="price-argument"><p className="section-kicker">A FLAT MONTHLY PRICE</p><h2>Planning help before the decision gets expensive.</h2><p>No minimum balance. No annual contract. No sales call.</p><div className="cost-comparison"><span><small>ASK LINC</small><b>{pricing.label}</b><i>after first month free</i></span><span className="versus">VS</span><span><small>1% OF A $500K PORTFOLIO</small><b>$5,000</b><i>per year · illustrative</i></span></div></div>
        <article className="sub-price-card" data-cs-override-id="pricing-card-premium"><div className="price-card-top"><span>ASK LINC</span><b>EVERYTHING INCLUDED</b></div><div className="price"><sup>{pricing.symbol}</sup>{pricing.amountText}<span>/{pricing.intervalLabel}</span></div><p>First month free. Cancel anytime.</p><ul><li>Unlimited questions and follow-ups</li><li>Unlimited connected accounts</li><li>What-if scenarios</li><li>Current rates and market data when needed</li><li>Retirement and investment what-ifs</li><li>Show the math on every answer</li><li>Your financial data is never used to train AI</li></ul><MarketingGetStartedButton className="button button-primary price-button" csOverrideId="cta-start-free-trial-pricing-premium" /></article>
      </section>
      <section className="page-section shell compact-faq"><div><p className="section-kicker">PRICING QUESTIONS</p><h2>No tiers to decode.</h2></div><div>{faqs.slice(0,4).map(([q,a])=><details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></section>
      <PageCta title="Bring your hardest money question to Linc." csOverrideId="cta-start-free-trial-mid" />
    </StandardPage>
  );
}

function AboutPage() {
  return (
    <StandardPage className="about-page">
      <section className="subhero shell about-hero"><div><p className="section-kicker">WHY ASK LINC EXISTS</p><h1>A money answer should be <em>easy to check.</em></h1></div><p className="about-lede">Especially before a big decision. Ask Linc starts with your actual accounts, shows what it assumed, works out the numbers the same way each time, and explains what could change the result.</p></section>
      <section className="founder-origin shell"><div className="founder-portrait"><span className="founder-portrait-photo"><Image src="/images/ethan-teng-cartoon.webp" alt="Cartoon portrait of Ethan Teng" fill sizes="150px" priority /></span><div><b>Ethan Teng</b><small>FOUNDER · ASK LINC</small><a className="founder-linkedin" href="https://www.linkedin.com/in/ethanteng/" target="_blank" rel="noopener noreferrer"><Image src="/logos/linkedin.png" alt="" width={16} height={16} /><span>Connect on LinkedIn</span></a></div></div><div className="origin-copy"><p className="section-kicker">THE ORIGIN</p><h2>It started with a layoff—and a bad idea.</h2><p className="lead-paragraph">After getting laid off, I pasted my own bank statements into ChatGPT to answer some tough money questions—and immediately regretted it.</p><p>The responses sounded polished, but the chatbot did not know my full financial picture. It could mix up facts and guesses, make bad math sound certain, and give me no easy way to check the answer.</p><p>So I built Ask Linc to answer a specific question using the accounts, goals, and numbers that actually affect it.</p><div className="signature-line"><span><Image src="/images/ethan-teng-cartoon.webp" alt="" fill sizes="41px" /></span><div><b>Ethan Teng</b><small>Builder, user, and first skeptic</small></div></div></div></section>
      <section className="page-section values-band"><div className="shell"><div className="editorial-heading"><p className="section-kicker">HOW WE BUILD</p><h2>You should be able to see why an answer changed.</h2></div><div className="belief-grid"><article><span>01</span><h3>Start with the decision</h3><p>Show the numbers that help someone choose, not another screen of charts to interpret.</p></article><article><span>02</span><h3>Use the same math every time</h3><p>The same numbers should produce the same result, and you should be able to see the work.</p><Link className="belief-link" href="/trust">How answers are checked →</Link></article><article><span>03</span><h3>Remove personal details</h3><p>Replace sensitive labels before your financial information reaches AI.</p></article><article><span>04</span><h3>Show ranges and tradeoffs</h3><p>The future is uncertain. A useful answer says what could change and how much it matters.</p></article></div></div></section>
      <PageCta title="Make the next hard question easier to answer." csOverrideId="cta-start-free-trial-mid" />
    </StandardPage>
  );
}

function FaqPage({ pricing }: { pricing: Pricing }) {
  const faqs = buildFaqs(pricing);
  return (
    <StandardPage className="faq-page">
      <section className="subhero centered-subhero shell"><p className="section-kicker">THE QUESTIONS BEHIND THE QUESTIONS</p><h1>Good skepticism is <em>welcome here.</em></h1><p className="subhero-copy">What Ask Linc does, how it reaches an answer, and what happens to your data.</p></section>
      <section className="faq-layout shell"><aside><span>JUMP TO</span><a href="#product">Product</a><a href="#accuracy">Accuracy</a><a href="#privacy-faq">Privacy</a><a href="#billing">Billing</a></aside><div className="faq-list"><p className="faq-group" id="product">PRODUCT</p>{faqs.slice(0,2).map(([q,a])=><details key={q} open={q===faqs[0][0]}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}<p className="faq-group" id="accuracy">ACCURACY &amp; SCOPE</p>{faqs.slice(2,4).map(([q,a])=><details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}<p className="faq-group" id="privacy-faq">PRIVACY &amp; DATA</p>{faqs.slice(4,8).map(([q,a])=><details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}<p className="faq-group" id="billing">BILLING</p><details><summary>What does {pricing.label} include?<span>+</span></summary><p>Your first month is free. After that, {pricing.label} includes unlimited questions, connected accounts, follow-ups, what-if scenarios, current rates and market data, and Show the Math. Cancel anytime.</p></details></div></section>
      <section className="human-help shell"><div><span>STILL WONDERING?</span><h2>Ask the human who built it.</h2></div><Link className="button button-dark" href="/contact">Contact Ethan →</Link></section>
      <PageCta csOverrideId="cta-start-free-trial-mid" />
    </StandardPage>
  );
}

function SecurityPage() {
  return (
    <StandardPage className="security-page">
      <section className="security-hero"><div className="shell split-subhero"><div><p className="section-kicker light">YOUR DATA STAYS YOURS</p><h1>Your finances stay yours. <em>Even from the AI.</em></h1><p>AI does not need your bank names, account numbers, or identity to answer the question. So it does not get them.</p></div><div className="privacy-diagram"><span><i>▰</i><b>Your accounts</b><small>Read-only connection</small></span><b>→</b><span className="active"><i>◇</i><b>Personal details removed</b><small>Before AI sees them</small></span><b>→</b><span><i>L</i><b>Your answer</b><small>Only what is needed</small></span></div></div></section>
      <section className="security-promises shell"><span><b>READ-ONLY</b>Linc can’t move money</span><span><b>NO TRAINING</b>Your data is not used for model training</span><span><b>YOUR CONNECTIONS</b>Disconnect accounts anytime</span></section>
      <section className="page-section shell"><div className="editorial-heading"><p className="section-kicker">HOW PROTECTION WORKS</p><h2>Six promises, built into the product.</h2></div><div className="security-grid">{securitySections.map(([n,t,d])=><article key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></article>)}</div></section>
      <section className="token-section"><div className="shell token-grid"><div><p className="section-kicker">WHAT AI SEES</p><h2>Useful numbers in.<br/>Personal details left out.</h2><p>Before AI sees your financial information, sensitive names are replaced with generic labels. The useful financial details remain; your identity does not.</p></div><div className="token-card"><span><del>Bank of America Checking</del><b>Account_1</b></span><span><del>Chase Sapphire Preferred</del><b>Card_2</b></span><span><del>Trader Joe’s</del><b>Merchant_12</b></span><small>PERSONAL DETAILS ARE REMOVED BEFORE AI SEES THEM</small></div></div></section>
      <section className="security-contact shell"><div><p className="section-kicker">A HUMAN IS RESPONSIBLE</p><h2>Have a privacy question? Ask the person who built the system.</h2></div><div><p>If you have a question, concern, or deletion request, email the founder directly.</p><a className="text-link" href="mailto:hello@asklinc.com">hello@asklinc.com →</a></div></section>
      <PageCta csOverrideId="cta-start-free-trial-mid" />
    </StandardPage>
  );
}

function CompareIndexPage() {
  const comparisonOrder = ["monarch", "origin", "chatgpt", "portfoliopilot", "boldin"];
  const orderedComparisons = comparisonOrder
    .map((slug) => getComparison(slug))
    .filter((page): page is NonNullable<typeof page> => Boolean(page));

  return (
    <StandardPage className="compare-index-page">
      <section className="subhero centered-subhero shell">
        <p className="section-kicker">COMPARE ASK LINC</p>
        <h1>Choose the tool built for <em>the job you need done.</em></h1>
        <p className="subhero-copy">
          Ask Linc helps with a specific money decision. See how that differs from ChatGPT, all-in-one money apps, budget trackers, investment tools, and retirement planners.
        </p>
      </section>
      <section className="compare-index-grid shell" aria-label="Ask Linc comparisons">
        {orderedComparisons.map((page, index) => (
          <Link href={`/vs/${page.slug}`} className="compare-index-card" key={page.slug}>
            <span>{String(index + 1).padStart(2, "0")} / COMPARISON</span>
            <h2>Ask Linc <em>vs {page.competitorName}</em></h2>
            <p>{page.summary}</p>
            <strong>Read the comparison <i>→</i></strong>
          </Link>
        ))}
      </section>
      <PageCta title="Start with the financial decision in front of you." csOverrideId="cta-start-free-trial-mid" />
    </StandardPage>
  );
}

function ComparisonPage({ product, pricing }: { product: keyof typeof comparisonData; pricing: Pricing }) {
  const design = comparisonData[product];
  const page = getComparison(product, pricing);
  if (!page) return null;

  return (
    <StandardPage className="comparison-page">
      <section className="subhero shell comparison-hero"><div><p className="section-kicker">{design.eyebrow}</p><h1>Ask Linc <em>vs {page.competitorName}</em></h1><p className="subhero-copy">{page.summary}</p><div className="hero-actions"><MarketingGetStartedButton className="button button-primary" csOverrideId="cta-start-free-trial-hero" />{page.relatedLinks?.length ? <div className="comparison-reading-links" aria-label="Related reading">{page.relatedLinks.map((link)=><Link className="text-link" href={link.href} key={link.href}>{link.label}</Link>)}</div> : <Link className="text-link" href="/pricing">View free-trial pricing</Link>}</div></div><div className="versus-mark"><span className="brand-mark">L</span><b>VS</b><span>{page.competitorName.slice(0,2).toUpperCase()}</span></div></section>
      <section className="comparison-strip"><div className="shell"><span>ASK LINC</span><i>Different tools for different jobs</i><span>{page.competitorName.toUpperCase()}</span></div></section>
      <section className="page-section shell comparison-section"><div className="editorial-heading"><p className="section-kicker">THE SHORT VERSION</p><h2>Start with the job you need done.</h2></div><div className="comparison-table" role="table"><div className="comparison-row comparison-head" role="row"><span>DIMENSION</span><b>ASK LINC</b><b>{page.competitorName.toUpperCase()}</b></div>{page.rows.map(({ dimension, askLinc, competitor })=><div className="comparison-row" role="row" key={dimension}><span className="comparison-dimension" role="rowheader">{dimension}</span><div className="comparison-value" role="cell"><small>ASK LINC</small><b>{askLinc}</b></div><div className="comparison-value" role="cell"><small>{page.competitorName.toUpperCase()}</small><b>{competitor}</b></div></div>)}</div></section>
      <section className="fit-section"><div className="shell"><p className="section-kicker">OUR HONEST TAKE</p><h2>{design.fit.order === "competitor-first" ? <><span>{design.fit.competitor}</span>{" "}<em>{design.fit.askLinc}</em></> : <><em>{design.fit.askLinc}</em>{" "}<span>{design.fit.competitor}</span></>}</h2><p>{page.honestTake ?? "Ask Linc does not replace a budget app, investment platform, dedicated retirement planner, or human professional. It helps you compare options and see how the answer was worked out."}</p></div></section>
      <section className="page-section shell compact-faq comparison-faq"><div><p className="section-kicker">BEFORE YOU CHOOSE</p><h2>The questions people actually ask.</h2></div><div>{page.faqs.map((faq)=><details key={faq.question}><summary>{faq.question}<span>+</span></summary><p>{faq.answer}</p></details>)}</div></section>
      <section className="other-comparisons shell"><span>COMPARE ASK LINC WITH</span>{Object.keys(comparisonData).filter((key)=>key!==product).map((key)=>{ const other = getComparison(key, pricing); return other ? <Link href={`/vs/${key}`} key={key}>{other.competitorName} <b>→</b></Link> : null; })}</section>
      <PageCta title="See which experience answers your question." csOverrideId="cta-start-free-trial-mid" />
    </StandardPage>
  );
}

function LegalPage({ type }: { type: "privacy" | "terms" }) {
  const privacy = type === "privacy";
  const sections = privacy ? [
    ["1. What we collect", "We collect the minimum information needed to deliver Ask Linc: read-only financial account data supplied through connection providers, questions and responses, and basic product usage and security logs. We do not collect or store your banking credentials."],
    ["2. How we use it", "We use this information to answer questions using your finances, operate and improve the product, prevent fraud, and understand usage without tying it to your identity. We do not sell your data, share it with advertisers, or use it to train AI models."],
    ["3. Your privacy rights", "Depending on where you live, including California and the European Union, you may have rights to access, correct, export, or delete personal information and to limit certain processing. Contact hello@asklinc.com or use the in-app controls."],
    ["4. Storage and transfers", "Data is stored securely in the United States. When information is transferred internationally, Ask Linc applies appropriate safeguards."],
    ["5. Deletion and control", "You can disconnect accounts and request deletion at any time. Deleted data is permanently removed within 30 days, except for minimal records retained when required for security, fraud prevention, or legal compliance."],
    ["6. Service providers", "Ask Linc uses service providers for account connections, AI analysis, payments, and hosting. These include Plaid, SnapTrade, Anthropic, Google, Stripe, Render, and Vercel."],
    ["7. Contact", "For privacy questions or requests, email hello@asklinc.com."],
  ] : [
    ["1. What Ask Linc does", "Ask Linc connects to your accounts and helps you think through money questions using your information and current rates and market data."],
    ["2. Your responsibilities", "Use Ask Linc only for lawful personal purposes, do not resell or misuse the service, protect your credentials, and understand that the product provides informational analysis rather than investment, tax, or legal advice."],
    ["3. Subscription and billing", "Paid features are presented with clear pricing. You can cancel your subscription at any time; no hidden or surprise charges are intended."],
    ["4. Data and privacy", "Your use of Ask Linc is also governed by the Privacy Policy. You can access, export, or delete your information and exercise applicable CCPA and GDPR rights."],
    ["5. No guarantees", "Ask Linc works hard to provide useful analysis, but cannot guarantee uninterrupted service, perfect accuracy, or a correct interpretation of every question. Double-check major decisions with a qualified professional."],
    ["6. Changes to these terms", "If these terms change in an important way, Ask Linc will provide notice in the product or by email. Continued use after the change means you accept the updated terms."],
    ["7. Contact", "Questions, complaints, or requests can be sent to hello@asklinc.com."],
  ];
  return (
    <StandardPage className="legal-page"><section className="legal-hero shell"><p className="section-kicker">THE PLAIN-LANGUAGE VERSION</p><h1>{privacy ? "Privacy Policy" : "Terms of Service"}</h1><div><span>Effective July 29, 2025</span><span>Operated by Ethan Teng Consulting LLC</span></div></section><section className="legal-layout shell"><aside><b>IN THIS DOCUMENT</b>{sections.map(([title])=><a href={`#${title.slice(0,1)}`} key={title}>{title}</a>)}</aside><article><div className="legal-note"><b>{privacy ? "The short version" : "Before you continue"}</b><p>{privacy ? "We collect the minimum, never sell your data, and give you control over deletion." : "Ask Linc is decision-support software—not personalized financial, tax, or legal advice."}</p></div>{sections.map(([title,body])=><section id={title.slice(0,1)} key={title}><h2>{title}</h2><p>{body}</p></section>)}</article></section><PageCta title="Questions about the fine print? Ask a human." csOverrideId="cta-start-free-trial-mid" /></StandardPage>
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
      <PageCta title="Turn the reading into a real decision." csOverrideId="blog-cta-end" />
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
      <section className="next-reading shell"><span>KEEP EXPLORING</span><h2>Bring the question back to your own numbers.</h2><MarketingGetStartedButton className="button button-primary" csOverrideId="blog-cta-inline" /></section>
      <PageCta title="Try a real question with your own numbers." csOverrideId="blog-cta-end" />
    </StandardPage>
  );
}

export default async function Subpage({ params }: RouteProps) {
  const { slug } = await params;
  const path = slug.join("/");
  // One price lookup per page render, shared by every section that shows it.
  const pricing = await getPricing();
  if (path === "features") return <FeaturesPage />;
  if (path === "use-cases") return <UseCasesPage />;
  if (path === "use-cases/retirement" || path === "use-cases/retirement-planning") return <UseCasePage useCase="retirement" />;
  if (path === "use-cases/home-buying") return <UseCasePage useCase="home" />;
  if (path === "use-cases/family-planning") return <UseCasePage useCase="family" />;
  if (path === "use-cases/portfolio-analysis") return <UseCasePage useCase="portfolio" />;
  if (path === "use-cases/financial-stress-testing" || path === "use-cases/market-impact-analysis") return <UseCasePage useCase="market" />;
  if (path === "pricing") return <PricingPage pricing={pricing} />;
  if (path === "about") return <AboutPage />;
  if (path === "faq") return <FaqPage pricing={pricing} />;
  if (path === "how-we-protect-your-data") return <SecurityPage />;
  if (path === "vs") return <CompareIndexPage />;
  if (path === "privacy" || path === "privacy-policy") return <LegalPage type="privacy" />;
  if (path === "terms") return <LegalPage type="terms" />;
  if (path === "contact") return <ContactPage />;
  if (path === "vs/chatgpt") return <ComparisonPage product="chatgpt" pricing={pricing} />;
  if (path === "vs/origin") return <ComparisonPage product="origin" pricing={pricing} />;
  if (path === "vs/portfoliopilot") return <ComparisonPage product="portfoliopilot" pricing={pricing} />;
  if (path === "vs/monarch") return <ComparisonPage product="monarch" pricing={pricing} />;
  if (path === "vs/boldin") return <ComparisonPage product="boldin" pricing={pricing} />;
  return <StandardPage><section className="not-found shell"><span>404</span><h1>That page moved.</h1><Link className="button button-primary" href="/">Back to Ask Linc →</Link></section></StandardPage>;
}
