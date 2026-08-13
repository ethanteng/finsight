export type AnswerBreadcrumb = {
  label: string;
  href?: string;
};

export type WithdrawalScenario = {
  rate: string;
  annualWithdrawal: string;
  monthlyWithdrawal: string;
  planningUse: string;
};

export type RetirementScenario = {
  label: string;
  annualIncomeTarget: string;
  otherIncome: string;
  portfolioWithdrawal: string;
  initialRate: string;
};

export type AnswerPageSource = {
  title: string;
  publisher: string;
  href: string;
  use: string;
};

export type RelatedAnswer = {
  question: string;
  eyebrow: string;
  href?: string;
};

export type AnswerPageData = {
  slug: string;
  category: string;
  title: string;
  titleAccent: string;
  description: string;
  reviewedOn: string;
  reviewedOnIso: string;
  readTime: string;
  breadcrumbs: AnswerBreadcrumb[];
  directAnswer: string;
  directAnswerDetail: string;
  keyNumbers: Array<{ label: string; value: string; note: string }>;
  numberStripLabel: string;
  withdrawalSection: {
    tocLabel: string;
    heading: string;
    tableCaption: string;
    noteTitle: string;
    noteBody: string;
  };
  withdrawalScenarios: WithdrawalScenario[];
  example: {
    title: string;
    intro: string;
    steps: Array<{ label: string; value: string; operator?: string }>;
    result: string;
    note: string;
  };
  scenarioTableCaption: string;
  scenarioTableFootnote: string;
  retirementScenarios: RetirementScenario[];
  factors: Array<{ number: string; title: string; body: string }>;
  checkpoints: string[];
  productBridge: {
    heading: string;
    body: string;
    priceNote: string;
  };
  faqs: Array<{ question: string; answer: string }>;
  relatedAnswers: RelatedAnswer[];
  sources: AnswerPageSource[];
};

export const canIRetireWithTwoMillion: AnswerPageData = {
  slug: "can-i-retire-with-2-million",
  category: "Retirement answer",
  title: "Can I retire with $2 million?",
  titleAccent: "Start with what it needs to support.",
  description:
    "See how spending, retirement age, Social Security, taxes, inflation, healthcare, and withdrawal rates determine whether $2 million is enough to retire.",
  reviewedOn: "August 13, 2026",
  reviewedOnIso: "2026-08-13",
  readTime: "10 min read",
  breadcrumbs: [
    { label: "Home", href: "/" },
    { label: "Retirement", href: "/use-cases/retirement" },
    { label: "Can I retire with $2 million?" },
  ],
  directAnswer:
    "Yes—for many households, $2 million can be enough to retire. But the balance alone cannot answer the question.",
  directAnswerDetail:
    "A $2 million portfolio produces $60,000 of first-year withdrawals at 3%, $70,000 at 3.5%, or $80,000 at 4%. Add Social Security, pensions, or other income, then test the result against your spending, taxes, healthcare, inflation, retirement date, and investment risk.",
  keyNumbers: [
    { label: "3% initial withdrawal", value: "$60K/yr", note: "$5,000 a month before tax" },
    { label: "3.5% initial withdrawal", value: "$70K/yr", note: "$5,833 a month before tax" },
    { label: "4% initial withdrawal", value: "$80K/yr", note: "$6,667 a month before tax" },
  ],
  numberStripLabel: "Example $2 million withdrawal amounts",
  withdrawalSection: {
    tocLabel: "What $2M can support",
    heading: "What can $2 million support?",
    tableCaption: "First-year withdrawals from a $2 million portfolio",
    noteTitle: "Keep the language precise.",
    noteBody: "“4%” describes an initial withdrawal equal to $80,000. It is not the same thing as earning 4%, and it is not a guarantee that the balance never falls.",
  },
  withdrawalScenarios: [
    { rate: "3.0%", annualWithdrawal: "$60,000", monthlyWithdrawal: "$5,000", planningUse: "Lower starting draw; more room for a long horizon or weak early returns." },
    { rate: "3.5%", annualWithdrawal: "$70,000", monthlyWithdrawal: "$5,833", planningUse: "A middle scenario for testing spending against other income." },
    { rate: "4.0%", annualWithdrawal: "$80,000", monthlyWithdrawal: "$6,667", planningUse: "A common planning reference—not a guarantee that money will last." },
    { rate: "4.5%", annualWithdrawal: "$90,000", monthlyWithdrawal: "$7,500", planningUse: "A higher draw that needs more flexibility or a shorter horizon." },
    { rate: "5.0%", annualWithdrawal: "$100,000", monthlyWithdrawal: "$8,333", planningUse: "More pressure on the portfolio, especially after early market losses." },
  ],
  example: {
    title: "A simple $110K retirement-income example",
    intro:
      "Suppose your household wants $110,000 a year of gross income and expects $30,000 from Social Security or a pension.",
    steps: [
      { label: "Annual income target", value: "$110,000" },
      { label: "Social Security + pension", value: "$30,000", operator: "−" },
      { label: "Needed from portfolio", value: "$80,000", operator: "=" },
      { label: "$80,000 ÷ $2,000,000", value: "4.0%", operator: "=" },
    ],
    result: "The initial portfolio withdrawal rate is 4%.",
    note:
      "This is only a starting frame. It does not yet include your actual tax mix, investment fees, healthcare costs, spending changes, or the timing of each income source.",
  },
  scenarioTableCaption: "Illustrative income needs with $30,000 of annual income outside the portfolio",
  scenarioTableFootnote: "All scenarios use the same $2 million starting portfolio and $30,000 of illustrative annual income outside the portfolio. Gross income target means income before taxes. Real plans should model when each income source begins.",
  retirementScenarios: [
    { label: "Lower spending", annualIncomeTarget: "$70,000", otherIncome: "$30,000", portfolioWithdrawal: "$40,000", initialRate: "2.0%" },
    { label: "Moderate spending", annualIncomeTarget: "$90,000", otherIncome: "$30,000", portfolioWithdrawal: "$60,000", initialRate: "3.0%" },
    { label: "Higher spending", annualIncomeTarget: "$110,000", otherIncome: "$30,000", portfolioWithdrawal: "$80,000", initialRate: "4.0%" },
    { label: "Very high spending", annualIncomeTarget: "$130,000", otherIncome: "$30,000", portfolioWithdrawal: "$100,000", initialRate: "5.0%" },
  ],
  factors: [
    { number: "01", title: "How much you actually spend", body: "Separate essential spending from flexible spending, and include irregular costs such as home repairs, travel, vehicles, and family support." },
    { number: "02", title: "When retirement starts", body: "Retiring at 55 can mean more years of withdrawals and a healthcare bridge before Medicare. Retiring later shortens the draw period and may increase Social Security income." },
    { number: "03", title: "Income beyond the portfolio", body: "Social Security, pensions, rental income, and part-time work reduce what your investments need to provide—but each source may begin on a different date." },
    { number: "04", title: "Taxes and account location", body: "A dollar withdrawn from a traditional IRA, Roth IRA, and taxable account can have a different after-tax value. The order of withdrawals can matter." },
    { number: "05", title: "Inflation and market sequence", body: "A poor run of returns early in retirement can hurt more when withdrawals are happening at the same time. Flexible spending and cash reserves can create room to adjust." },
    { number: "06", title: "Healthcare and long-term care", body: "Premiums, out-of-pocket costs, and care needs vary widely. People retiring before 65 also need a plan for coverage before Medicare eligibility." },
  ],
  checkpoints: [
    "Estimate annual spending in today’s dollars, including taxes and irregular expenses.",
    "Add each reliable income source and the age when it begins.",
    "Map the gap that must come from investments year by year—not only in year one.",
    "Test lower returns, higher inflation, a long life, and an early bear market.",
    "Decide which expenses can flex if the plan falls outside its target range.",
  ],
  productBridge: {
    heading: "$2 million is a number. Retirement is a connected plan.",
    body: "Ask Linc can use your accounts, spending, income, and goals to compare retirement dates and show the assumptions and calculations behind the result.",
    priceNote: "1 month free, then $9/month. Cancel anytime.",
  },
  faqs: [
    { question: "How much income can $2 million generate in retirement?", answer: "A $2 million portfolio equals $60,000 of first-year withdrawals at 3%, $70,000 at 3.5%, $80,000 at 4%, or $100,000 at 5%, before tax. Those are planning illustrations, not promised returns or guaranteed lifetime income." },
    { question: "How long will $2 million last in retirement?", answer: "There is no fixed number of years. The result depends on withdrawals, investment returns, inflation, fees, taxes, and whether spending adjusts after poor markets. A year-by-year projection and stress test are more useful than dividing the balance by annual spending." },
    { question: "Can I retire at 55 with $2 million?", answer: "Possibly, but retiring at 55 usually creates a longer investment horizon, a healthcare gap before Medicare, and more years before Social Security begins. A lower initial withdrawal rate and flexible spending can become more important." },
    { question: "Is the 4% rule safe for a $2 million portfolio?", answer: "The 4% rule is a historical planning reference, not a safety guarantee. Your time horizon, asset mix, fees, taxes, and willingness to change spending all affect the outcome. Test several rates and market sequences instead of treating 4% as a pass/fail rule." },
    { question: "Does the $80,000 from a 4% withdrawal include Social Security?", answer: "No. The $80,000 figure is the first-year portfolio withdrawal alone. Social Security, pensions, and other income would be added separately, while taxes and expenses still need to be accounted for." },
  ],
  relatedAnswers: [
    { question: "How Ask Linc tests a retirement decision", eyebrow: "See the product", href: "/use-cases/retirement" },
    { question: "Check your retirement readiness", eyebrow: "Use your details", href: "/retirement-readiness" },
    { question: "Questions to ask before retiring", eyebrow: "Explore prompts", href: "/prompts/retirement" },
    { question: "Can I retire with $1 million?", eyebrow: "Answer page", href: "/can-i-retire-with-1-million" },
    { question: "Can I retire at 55?", eyebrow: "Answer page", href: undefined },
  ],
  sources: [
    { title: "Get a benefits estimate", publisher: "Social Security Administration", href: "https://www.ssa.gov/prepare/get-benefits-estimate", use: "Personalized Social Security estimates and claiming-age scenarios." },
    { title: "Publication 590-B: Distributions from IRAs", publisher: "Internal Revenue Service", href: "https://www.irs.gov/publications/p590b", use: "IRA distribution, tax, early-withdrawal, and required-minimum-distribution rules." },
    { title: "Medicare costs", publisher: "Medicare.gov", href: "https://www.medicare.gov/basics/costs/medicare-costs", use: "Current premiums, deductibles, coinsurance, and plan-cost context." },
    { title: "CPI Inflation Calculator", publisher: "U.S. Bureau of Labor Statistics", href: "https://www.bls.gov/data/inflation_calculator_inside.htm", use: "Consumer Price Index context for expressing spending in today’s dollars." },
  ],
};

export const canIRetireWithOneMillion: AnswerPageData = {
  slug: "can-i-retire-with-1-million",
  category: "Retirement answer",
  title: "Can I retire with $1 million?",
  titleAccent: "Focus on the gap your savings must cover.",
  description:
    "See how spending, Social Security, retirement age, taxes, healthcare, and withdrawal rates determine whether $1 million is enough to retire.",
  reviewedOn: "August 13, 2026",
  reviewedOnIso: "2026-08-13",
  readTime: "9 min read",
  breadcrumbs: [
    { label: "Home", href: "/" },
    { label: "Retirement", href: "/use-cases/retirement" },
    { label: "Can I retire with $1 million?" },
  ],
  directAnswer:
    "Yes—$1 million can be enough to retire if your spending gap is modest and other income covers a meaningful share of your needs.",
  directAnswerDetail:
    "A $1 million portfolio produces $30,000 of first-year withdrawals at 3%, $35,000 at 3.5%, or $40,000 at 4%. Add Social Security, a pension, or part-time income, then compare the total with your spending, taxes, healthcare, housing costs, and retirement timeline.",
  keyNumbers: [
    { label: "3% initial withdrawal", value: "$30K/yr", note: "$2,500 a month before tax" },
    { label: "3.5% initial withdrawal", value: "$35K/yr", note: "$2,917 a month before tax" },
    { label: "4% initial withdrawal", value: "$40K/yr", note: "$3,333 a month before tax" },
  ],
  numberStripLabel: "Example $1 million withdrawal amounts",
  withdrawalSection: {
    tocLabel: "What $1M can support",
    heading: "What can $1 million support?",
    tableCaption: "First-year withdrawals from a $1 million portfolio",
    noteTitle: "Portfolio income is only part of the plan.",
    noteBody: "A 4% initial withdrawal equals $40,000 before tax. Social Security or a pension may lift total income, while housing, healthcare, taxes, and irregular expenses reduce what is available to spend.",
  },
  withdrawalScenarios: [
    { rate: "3.0%", annualWithdrawal: "$30,000", monthlyWithdrawal: "$2,500", planningUse: "Lower starting draw; more room for a long retirement or weak early returns." },
    { rate: "3.5%", annualWithdrawal: "$35,000", monthlyWithdrawal: "$2,917", planningUse: "A middle scenario when reliable income covers core expenses." },
    { rate: "4.0%", annualWithdrawal: "$40,000", monthlyWithdrawal: "$3,333", planningUse: "A common planning reference—not guaranteed lifetime income." },
    { rate: "4.5%", annualWithdrawal: "$45,000", monthlyWithdrawal: "$3,750", planningUse: "A higher draw that needs meaningful spending flexibility." },
    { rate: "5.0%", annualWithdrawal: "$50,000", monthlyWithdrawal: "$4,167", planningUse: "More pressure on the portfolio, especially after early market losses." },
  ],
  example: {
    title: "A simple $70K retirement-income example",
    intro:
      "Suppose your household wants $70,000 a year of gross income and expects $30,000 from Social Security or a pension.",
    steps: [
      { label: "Annual income target", value: "$70,000" },
      { label: "Social Security + pension", value: "$30,000", operator: "−" },
      { label: "Needed from portfolio", value: "$40,000", operator: "=" },
      { label: "$40,000 ÷ $1,000,000", value: "4.0%", operator: "=" },
    ],
    result: "The initial portfolio withdrawal rate is 4%.",
    note:
      "This starting frame does not yet include your actual tax mix, investment fees, healthcare costs, spending changes, or the date each income source begins.",
  },
  scenarioTableCaption: "Illustrative income needs with $30,000 of annual income outside the portfolio",
  scenarioTableFootnote: "All scenarios use the same $1 million starting portfolio and $30,000 of illustrative annual income outside the portfolio. Gross income target means income before taxes. Real plans should model when each income source begins.",
  retirementScenarios: [
    { label: "Lower spending", annualIncomeTarget: "$50,000", otherIncome: "$30,000", portfolioWithdrawal: "$20,000", initialRate: "2.0%" },
    { label: "Moderate spending", annualIncomeTarget: "$60,000", otherIncome: "$30,000", portfolioWithdrawal: "$30,000", initialRate: "3.0%" },
    { label: "Higher spending", annualIncomeTarget: "$70,000", otherIncome: "$30,000", portfolioWithdrawal: "$40,000", initialRate: "4.0%" },
    { label: "Very high spending", annualIncomeTarget: "$80,000", otherIncome: "$30,000", portfolioWithdrawal: "$50,000", initialRate: "5.0%" },
  ],
  factors: [
    { number: "01", title: "Your essential spending", body: "Start with housing, food, insurance, healthcare, utilities, and taxes. A $1 million plan is stronger when reliable income covers most of this floor." },
    { number: "02", title: "Housing and debt", body: "A paid-off home can make $1 million support a very different retirement than a large mortgage, rent payment, or other fixed debt." },
    { number: "03", title: "Income beyond the portfolio", body: "Social Security, pensions, rental income, and part-time work reduce what investments must provide—but each source may begin on a different date." },
    { number: "04", title: "When retirement starts", body: "An earlier retirement creates more years of withdrawals and may require a healthcare bridge before Medicare. Working longer can improve several parts of the plan at once." },
    { number: "05", title: "Taxes and account location", body: "A dollar from a traditional IRA, Roth IRA, and taxable account can have a different after-tax value. Withdrawal order can affect how far the balance goes." },
    { number: "06", title: "How much spending can flex", body: "Travel, gifts, vehicles, and other optional costs can create room to reduce withdrawals after a poor market year without cutting essential spending." },
  ],
  checkpoints: [
    "Estimate annual essential and flexible spending in today’s dollars.",
    "Add Social Security, pensions, and other income at the age each source begins.",
    "Map the remaining income gap that investments must cover each year.",
    "Test lower returns, higher inflation, a long life, and an early bear market.",
    "Set clear spending adjustments before the portfolio falls outside its target range.",
  ],
  productBridge: {
    heading: "$1 million is a milestone. Retirement is a connected plan.",
    body: "Ask Linc can use your accounts, spending, income, and goals to compare retirement dates and show the assumptions and calculations behind the result.",
    priceNote: "1 month free, then $9/month. Cancel anytime.",
  },
  faqs: [
    { question: "How much income can $1 million generate in retirement?", answer: "A $1 million portfolio equals $30,000 of first-year withdrawals at 3%, $35,000 at 3.5%, $40,000 at 4%, or $50,000 at 5%, before tax. These are planning illustrations, not promised returns or guaranteed lifetime income." },
    { question: "How long will $1 million last in retirement?", answer: "There is no fixed number of years. The result depends on withdrawals, investment returns, inflation, fees, taxes, and whether spending changes after poor markets. A year-by-year projection is more useful than simply dividing the balance by annual spending." },
    { question: "Can a couple retire with $1 million?", answer: "Possibly. A couple’s result depends on combined spending, both Social Security benefits, pensions, housing costs, taxes, healthcare, and longevity. The important figure is the annual gap the portfolio must cover after reliable income." },
    { question: "Can I retire at 60 with $1 million?", answer: "Possibly, especially with moderate spending and Social Security or pension income. Retiring at 60 still requires planning for healthcare before Medicare and for the timing of Social Security benefits." },
    { question: "Is the 4% rule safe for a $1 million portfolio?", answer: "The 4% rule is a historical planning reference, not a guarantee. Your time horizon, asset mix, fees, taxes, and willingness to adjust spending all affect the result. Test several withdrawal rates and market sequences." },
  ],
  relatedAnswers: [
    { question: "Can I retire with $2 million?", eyebrow: "Answer page", href: "/can-i-retire-with-2-million" },
    { question: "How Ask Linc tests a retirement decision", eyebrow: "See the product", href: "/use-cases/retirement" },
    { question: "Check your retirement readiness", eyebrow: "Use your details", href: "/retirement-readiness" },
    { question: "Questions to ask before retiring", eyebrow: "Explore prompts", href: "/prompts/retirement" },
    { question: "Can I retire at 55?", eyebrow: "Answer page", href: undefined },
  ],
  sources: [
    { title: "Get a benefits estimate", publisher: "Social Security Administration", href: "https://www.ssa.gov/prepare/get-benefits-estimate", use: "Personalized Social Security estimates and claiming-age scenarios." },
    { title: "Publication 590-B: Distributions from IRAs", publisher: "Internal Revenue Service", href: "https://www.irs.gov/publications/p590b", use: "IRA distribution, tax, early-withdrawal, and required-minimum-distribution rules." },
    { title: "Medicare costs", publisher: "Medicare.gov", href: "https://www.medicare.gov/basics/costs/medicare-costs", use: "Current premiums, deductibles, coinsurance, and plan-cost context." },
    { title: "CPI Inflation Calculator", publisher: "U.S. Bureau of Labor Statistics", href: "https://www.bls.gov/data/inflation_calculator_inside.htm", use: "Consumer Price Index context for expressing spending in today’s dollars." },
  ],
};

export function buildAnswerPageSchemas(page: AnswerPageData) {
  const url = `https://asklinc.com/${page.slug}`;

  return {
    article: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: page.title,
      description: page.description,
      url,
      mainEntityOfPage: url,
      dateModified: page.reviewedOnIso,
      author: { "@type": "Organization", name: "Ask Linc", url: "https://asklinc.com" },
      publisher: { "@type": "Organization", name: "Ask Linc", url: "https://asklinc.com", logo: { "@type": "ImageObject", url: "https://asklinc.com/logo.png" } },
    },
    breadcrumbs: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: page.breadcrumbs.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.label,
        item: item.href ? `https://asklinc.com${item.href}` : url,
      })),
    },
    faq: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faqs.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  };
}
