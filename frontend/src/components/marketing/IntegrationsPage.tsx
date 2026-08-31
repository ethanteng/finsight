import Link from "next/link";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { PageCta, SiteFooter, SiteHeader } from "./SiteShell";

const connectedPicture = [
  {
    number: "01",
    label: "BANKING + BORROWING",
    title: "Cash flow, cards, and loans",
    description: "Bring checking, savings, credit cards, loans, and other balances into one view of the money moving through your life.",
    examples: ["Checking + savings", "Credit cards", "Loans + debt", "Manual balances"],
    understands: [
      "Balances and available cash",
      "Transactions, merchants, and spending categories",
      "Month-by-month income, expenses, and cash flow",
    ],
    question: "Where is our spending drifting—and what can we safely commit to next?",
  },
  {
    number: "02",
    label: "INVESTMENTS",
    title: "See what you own and where the risk is",
    description: "See brokerage accounts, investment positions, and cash alongside the details that make those holdings meaningful to a plan.",
    examples: ["Brokerage accounts", "Retirement accounts", "Positions + cash", "Funds + ETFs"],
    understands: [
      "Your investment mix and any oversized bets",
      "Fund fees and where each fund invests",
      "Current prices and recent performance",
    ],
    question: "Am I taking more risk—or paying more in fund fees—than my plan needs?",
  },
  {
    number: "03",
    label: "PROPERTY + THE REST",
    title: "The parts that do not live at a bank",
    description: "Round out net worth with a home value and the accounts or assets that cannot be linked automatically.",
    examples: ["Primary home", "Other property", "Cash on hand", "Other assets"],
    understands: [
      "A dated home-value estimate and range",
      "A property match based on nearby comparable homes",
      "How manually added balances affect net worth and goals",
    ],
    question: "What does this home decision do to our cash, net worth, and retirement plan?",
  },
] as const;

const outsideContext = [
  {
    number: "01",
    title: "Rates and borrowing costs",
    source: "Federal Reserve data · Massive",
    description: "Current mortgage, credit-card, CD, Treasury, and Fed rates help Linc compare your choices with what is available now.",
    matters: "Useful for refinancing, debt payoff, saving, and home-buying questions.",
  },
  {
    number: "02",
    title: "Markets and the investments you own",
    source: "Tiingo · FMP · market news",
    description: "Current prices, fund details, performance history, and news help explain what is happening with the investments you own.",
    matters: "Useful for performance, concentration, fees, and portfolio-risk questions.",
  },
  {
    number: "03",
    title: "Long-term market history",
    source: "Kenneth French · Robert Shiller",
    description: "Real histories for U.S. and international stocks, government bonds, Treasury bills, and inflation support retirement what-ifs.",
    matters: "Useful for seeing how a plan held up in many real markets—not one AI-made forecast.",
  },
  {
    number: "04",
    title: "Current rules and news",
    source: "Focused web sources · dated financial news",
    description: "When a question depends on a changing rule, limit, rate, or current event, Linc can look up the answer and show the source date.",
    matters: "Useful when the right answer depends on what is true now.",
  },
] as const;

const integrationInventory = [
  {
    name: "Plaid",
    category: "Accounts + cash flow",
    data: [
      "Connected account names and types",
      "Balances, available cash, credit limits, and currency",
      "Transactions, merchants, categories, dates, and pending status",
      "Investment holdings and market values when supported",
    ],
    question: "How much is in checking versus savings, and why were our expenses higher last month?",
  },
  {
    name: "SnapTrade",
    category: "Brokerage connections",
    data: [
      "Brokerage and retirement account balances",
      "Positions, quantities, prices, and market values",
      "Cash held inside investment accounts",
      "Security names, types, and ticker symbols",
    ],
    question: "What percentage of my portfolio is in NVDA, and how much cash is sitting uninvested?",
  },
  {
    name: "Financial Modeling Prep",
    category: "Fund details",
    data: [
      "Fund name, type, asset class, and geographic focus",
      "Expense ratios",
      "Country allocation weights",
      "Sector allocation weights",
    ],
    question: "How exposed is my portfolio to technology or Japan, and what am I paying in fund fees?",
  },
  {
    name: "Tiingo",
    category: "Prices + market news",
    data: [
      "Current quotes and previous closes for connected holdings",
      "Adjusted price history and recent returns",
      "Broad-market quotes",
      "Ticker-linked financial news",
    ],
    question: "How have my largest holdings performed recently, and what news could affect them?",
  },
  {
    name: "FRED",
    category: "Rates + the economy",
    data: [
      "Inflation, unemployment, and the federal funds rate",
      "Mortgage and credit-card rate benchmarks",
      "10-year Treasury yields",
      "National 12-month CD rates",
    ],
    question: "Is my mortgage rate competitive, and how should today’s rate environment affect my cash plan?",
  },
  {
    name: "Kenneth French Data Library",
    category: "Long-run market history",
    data: [
      "Broad U.S. stock-market returns",
      "Developed international stock-market returns",
      "One-month U.S. Treasury-bill returns",
      "Monthly histories used in retirement stress tests",
    ],
    question: "How would my retirement plan have held up across many past stock-market environments?",
  },
  {
    name: "Robert Shiller",
    category: "Bonds + inflation history",
    data: [
      "Historical 10-year U.S. government-bond returns",
      "Monthly consumer-price inflation",
      "Long-run bond and inflation history aligned with market returns",
    ],
    question: "What happens to my retirement plan when inflation is high and markets are under pressure?",
  },
  {
    name: "Massive",
    category: "Yield curve + expectations",
    data: [
      "U.S. Treasury yields across short- and long-term maturities",
      "Market and model-based inflation expectations",
      "Broad-market closing data when another quote is unavailable",
    ],
    question: "What does the shape of the yield curve imply, and what inflation is the market expecting?",
  },
  {
    name: "Brave Search",
    category: "Current public evidence",
    data: [
      "Question-specific public search results",
      "Current financial rules, limits, rates, and news",
      "Source links, publication dates, and relevant excerpts",
    ],
    question: "What is the current IRA contribution limit, and have any rules changed since last year?",
  },
  {
    name: "RentCast",
    category: "Home valuation",
    data: [
      "Estimated property value",
      "An 85% low-to-high estimate range",
      "A standardized address and validated property match",
      "Comparable-home information used to produce the estimate",
    ],
    question: "What is my home worth, how uncertain is that estimate, and what does it mean for my net worth?",
  },
] as const;

const decisionExamples = [
  {
    label: "HOME",
    question: "Can we afford a $700K home without pausing retirement savings?",
    context: ["Cash", "Spending", "Mortgage rates", "Property value", "Retirement"],
  },
  {
    label: "CASH FLOW",
    question: "Why were our expenses higher last month—and is it becoming a pattern?",
    context: ["Transactions", "Merchants", "Income", "Monthly totals", "Cash reserve"],
  },
  {
    label: "PORTFOLIO",
    question: "How concentrated are we after looking through the funds we own?",
    context: ["Positions", "Fund exposure", "Allocation", "Fees", "Current prices"],
  },
  {
    label: "RETIREMENT",
    question: "What would let us retire two years sooner without making the plan fragile?",
    context: ["Savings", "Spending", "Asset mix", "Inflation", "Market history"],
  },
] as const;

const answerSteps = [
  ["01", "Start with your question", "Ask in plain language. The decision—not the data source—sets the direction."],
  ["02", "Use the parts of your finances that matter", "Linc starts with connected balances, spending, investments, property, goals, and anything else that could change the answer."],
  ["03", "Add what is happening now", "Rates, markets, current rules, or long-term history are included only when they help answer the question."],
  ["04", "Show the answer and the math", "You can see the important numbers, what Linc assumed, the math, the source dates, and what could change."],
] as const;

function EcosystemMap() {
  return (
    <div className="integration-map" aria-label="Ask Linc brings the useful parts of your finances into one answer">
      <div className="integration-map-top"><span>YOUR MONEY IN ONE PICTURE</span><small>BUILT AROUND YOUR QUESTION</small></div>
      <div className="integration-map-stage">
        <span className="integration-map-node map-cash"><small>YOUR MONEY</small><b>Cash flow</b></span>
        <span className="integration-map-node map-investments"><small>YOUR MONEY</small><b>Investments</b></span>
        <span className="integration-map-node map-property"><small>YOUR LIFE</small><b>Property</b></span>
        <span className="integration-map-core"><i className="brand-mark" aria-hidden="true">L</i><b>Your question</b><small>Only what matters</small></span>
        <span className="integration-map-node map-rates"><small>WHAT IS HAPPENING NOW</small><b>Rates + economy</b></span>
        <span className="integration-map-node map-current"><small>WHAT IS HAPPENING NOW</small><b>Current rules</b></span>
        <span className="integration-map-node map-history"><small>THE LONG VIEW</small><b>Market history</b></span>
      </div>
      <div className="integration-map-output"><small>THE RESULT</small><strong>One answer that understands how the pieces affect each other.</strong></div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <main className="marketing-site subpage integrations-page">
      <SiteHeader />

      <section className="integration-hero shell">
        <div>
          <p className="section-kicker">THE DATA BEHIND THE ANSWER</p>
          <h1>Your finances live in many places. <em>Your answer shouldn&apos;t.</em></h1>
          <p className="subhero-copy">Connect your accounts, add anything that cannot be linked, and Ask Linc will bring together the numbers that matter for your question.</p>
          <div className="hero-actions">
            <MarketingGetStartedButton className="button button-primary" trackingLocation="integrations_hero" />
            <Link className="text-link" href="/features">See how Linc reaches an answer</Link>
          </div>
        </div>
        <EcosystemMap />
      </section>

      <section className="integration-principles" aria-label="How Ask Linc handles connected financial data">
        <div className="shell">
          <span><strong>READ-ONLY CONNECTIONS</strong><small>Linc cannot move your money</small></span>
          <span><strong>YOUR CHOICE</strong><small>Connect, add, or disconnect data</small></span>
          <span><strong>ONLY WHAT MATTERS</strong><small>No unnecessary data</small></span>
          <span><strong>UP TO DATE</strong><small>See when outside information was checked</small></span>
        </div>
      </section>

      <section className="integration-owned-section shell">
        <div className="integration-section-heading">
          <div>
            <p className="section-kicker">START WITH YOUR FINANCIAL PICTURE</p>
            <h2>Connect the accounts. Add the rest.</h2>
          </div>
          <p>Bring together everyday accounts, long-term investments, your home, and anything you add yourself—so the answer is not based on one balance.</p>
        </div>

        <div className="connected-source-grid" aria-label="Financial accounts and information you can use with Ask Linc">
          {connectedPicture.map((item) => (
            <article className="connected-source-card" key={item.number}>
              <div className="connected-source-top"><span>{item.number} / {item.label}</span></div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <div className="connection-tags" aria-label={`Examples for ${item.title}`}>{item.examples.map((example) => <span key={example}>{example}</span>)}</div>
              <div className="connected-understands">
                <small>WHAT LINC CAN USE</small>
                <ul>{item.understands.map((detail) => <li key={detail}>{detail}</li>)}</ul>
              </div>
              <blockquote>“{item.question}”</blockquote>
            </article>
          ))}
        </div>
      </section>

      <section className="integration-context-section dark-band">
        <div className="shell">
          <div className="integration-section-heading on-dark">
            <div>
              <p className="section-kicker light">THEN ADD WHAT IS HAPPENING NOW</p>
              <h2>Current rates, markets, rules, and news—when they matter.</h2>
            </div>
            <p>Your accounts show where you are. Current rates, markets, rules, and long-term history can change what makes sense next.</p>
          </div>

          <div className="outside-context-grid" aria-label="Financial and economic information Ask Linc can use">
            {outsideContext.map((item) => (
              <article key={item.number}>
                <div><span>{item.number}</span><small>{item.source}</small></div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <strong>{item.matters}</strong>
              </article>
            ))}
          </div>

          <div className="integration-context-note">
            <span className="brand-mark" aria-hidden="true">L</span>
            <p><small>ONLY WHAT MATTERS</small><strong>Linc does not use every available data point just because it can. It uses only what could change the answer.</strong></p>
          </div>
        </div>
      </section>

      <section className="integration-inventory-section">
        <div className="shell">
          <div className="integration-section-heading">
            <div>
              <p className="section-kicker">THE COMPLETE SOURCE LIST</p>
              <h2>Every connection, and what it can help answer.</h2>
            </div>
            <p>These are the accounts and information Ask Linc can use. It pulls in only what matters for the question you ask.</p>
          </div>

          <div className="integration-table-wrap">
            <table className="integration-table">
              <caption className="sr-only">Ask Linc integrations, the financial data used from each source, and example questions</caption>
              <thead>
                <tr>
                  <th scope="col">Integration</th>
                  <th scope="col">What Ask Linc uses</th>
                  <th scope="col">Example question</th>
                </tr>
              </thead>
              <tbody>
                {integrationInventory.map((integration) => (
                  <tr key={integration.name}>
                    <td data-label="Integration">
                      <span className="integration-table-source"><strong>{integration.name}</strong><small>{integration.category}</small></span>
                    </td>
                    <td data-label="What Ask Linc uses">
                      <ul>{integration.data.map((item) => <li key={item}>{item}</li>)}</ul>
                    </td>
                    <td data-label="Example question"><blockquote>“{integration.question}”</blockquote></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="integration-table-note">What is available depends on the accounts you connect and what each institution provides. Outside information keeps its source date, and estimates are shown as ranges when needed.</p>
        </div>
      </section>

      <section className="integration-decisions-section shell">
        <div className="integration-section-heading">
          <div>
            <p className="section-kicker">WHY ONE ACCOUNT IS NOT ENOUGH</p>
            <h2>Your money does not fit in one account.</h2>
          </div>
          <p>A useful answer often needs to weigh cash, debt, investments, property, goals, and what is happening now.</p>
        </div>

        <div className="integration-question-grid" aria-label="Questions Ask Linc can answer with connected context">
          {decisionExamples.map((item, index) => (
            <article key={item.label}>
              <span>{String(index + 1).padStart(2, "0")} / {item.label}</span>
              <h3>“{item.question}”</h3>
              <div><small>LINC CAN CONNECT</small>{item.context.map((fact) => <b key={fact}>{fact}</b>)}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="integration-answer-section">
        <div className="shell">
          <div className="integration-answer-heading">
            <p className="section-kicker">FROM QUESTION TO ANSWER</p>
            <h2>The connections stay behind the scenes. <em>You can still see how the answer was worked out.</em></h2>
          </div>
          <ol className="integration-answer-flow" aria-label="How Ask Linc turns connected data into an answer">
            {answerSteps.map(([number, title, description]) => (
              <li key={number}><span>{number}</span><strong>{title}</strong><p>{description}</p></li>
            ))}
          </ol>
          <div className="integration-privacy-bridge">
            <div><small>YOUR DATA, YOUR CONTROL</small><strong>Account connections are read-only. You decide what to connect, and your financial data is never used to train AI models.</strong></div>
            <Link href="/how-we-protect-your-data">See how your data is protected <span>→</span></Link>
          </div>
        </div>
      </section>

      <PageCta title="Bring the whole picture to your next financial question." />
      <SiteFooter />
    </main>
  );
}
