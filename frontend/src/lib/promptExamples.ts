/** Illustrative prompt/response examples used across marketing pages. */

export interface PromptExample {
  prompt: string;
  response: string;
  keyNumbers: { label: string; value: string }[];
  insights: string[];
  suggestedActions: string[];
}

export const RETIREMENT_EXAMPLE: PromptExample = {
  prompt: "We are 42 and 44. Are we saving enough to retire at 60 without cutting our spending?",
  response:
    "I’d try the extra $600 a month before giving up two years of retirement. Your current plan is about $110,000 short at 60; increasing contributions from $2,400 to $3,000 a month closes most of that gap. If that squeeze isn’t realistic, 62 works in this example without changing contributions.",
  keyNumbers: [
    { label: "Saving now", value: "$2,400/mo" },
    { label: "Saving needed", value: "$3,000/mo" },
    { label: "Target retirement", value: "Age 60" },
  ],
  insights: [
    "The retirement date is more sensitive to monthly saving than to small changes in investment returns.",
    "Current housing costs fall before retirement, which improves the later years of the plan.",
    "A two-year delay is the strongest backup option if income or childcare costs change.",
  ],
  suggestedActions: [
    "Increase automatic retirement contributions by $300 per paycheck across the household.",
    "Recheck the plan after the mortgage or childcare expense changes.",
    "Compare ages 60, 61, and 62 before deciding whether the extra saving is worth it.",
  ],
};

export const HOME_BUYING_EXAMPLE: PromptExample = {
  prompt: "Can we afford a $700,000 home without pausing retirement savings or draining our emergency fund?",
  response:
    "I’d choose 15% down, not 20%. You’d keep $48,000 after closing, or six months of your $8,000 spending. Putting another $35,000 into the house leaves just $13,000 in cash. Keep the all-in housing payment within $4,800 a month to preserve your retirement contributions.",
  keyNumbers: [
    { label: "Home price", value: "$700,000" },
    { label: "Down payment", value: "$105,000" },
    { label: "Cash after closing", value: "$48,000" },
  ],
  insights: [
    "Putting 20% down lowers the payment but leaves too little cash for repairs or a job interruption.",
    "Property taxes, insurance, and maintenance add more to the monthly cost than the mortgage quote alone shows.",
    "The purchase works without changing retirement contributions, but it reduces room for another large expense in the next two years.",
  ],
  suggestedActions: [
    "Set a $4,800 ceiling for mortgage, taxes, insurance, and homeowners association fees combined.",
    "Keep at least $45,000 outside the down payment and closing budget.",
    "Run the same plan with childcare or parental leave included if either is likely soon.",
  ],
};

export const PORTFOLIO_EXAMPLE: PromptExample = {
  prompt: "Is our investment mix taking more risk than we need for retirement at 60?",
  response:
    "I’d use new contributions to bring stocks from 88% toward 75%, rather than sell everything at once. The age-60 plan still works in this example at 75%. Your main issue is overlapping funds holding the same large companies: owning more funds hasn’t spread the risk as much as it looks.",
  keyNumbers: [
    { label: "Stocks now", value: "88%" },
    { label: "Three-year target", value: "75%" },
    { label: "Years to retirement", value: "16" },
  ],
  insights: [
    "Several funds hold the same large companies, so the portfolio is less diversified than the account count suggests.",
    "New contributions can do most of the rebalancing without selling taxable holdings.",
    "The goal does not require taking the maximum possible risk.",
  ],
  suggestedActions: [
    "Direct new workplace-plan contributions toward bonds and broad international funds.",
    "Review overlapping holdings before adding another fund.",
    "Each year, check how a 25% stock-market drop would affect the age-60 plan.",
  ],
};

export const GEOPOLITICAL_RETIREMENT_EXAMPLE: PromptExample = {
  prompt: "What would a 15% stock-market drop and a year of higher inflation do to our retirement plan?",
  response:
    "I’d build the nine-month cash reserve before adding more stock exposure. In this example, the market drop and higher inflation shrink your projected cushion from $200,000 to $45,000. Age 60 still works, but a large expense could force you to sell investments while they’re down.",
  keyNumbers: [
    { label: "Stress decline", value: "−15%" },
    { label: "Cushion after stress", value: "$45,000" },
    { label: "Cash target", value: "9 months" },
  ],
  insights: [
    "The plan is more affected by selling during a downturn than by one year of higher inflation.",
    "Continuing contributions during the decline improves the recovery path.",
    "A larger cash reserve protects near-term choices without requiring a prediction about markets.",
  ],
  suggestedActions: [
    "Build the cash reserve before increasing investment risk.",
    "Keep automatic contributions running through the stress scenario.",
    "Revisit the retirement date only if the downturn overlaps with an income loss.",
  ],
};

export const STRESS_TEST_EXAMPLE: PromptExample = {
  prompt: "Could we handle one income disappearing for a year while paying for childcare?",
  response:
    "I wouldn’t commit to a full year yet. Even after cutting optional spending and adding $12,000 to your $42,000 cash reserve, you have 11 months covered. Close the final month’s gap and price replacement health insurance before one of you leaves; the current estimate doesn’t settle either cost.",
  keyNumbers: [
    { label: "Current cash", value: "$42,000" },
    { label: "Extra cash needed", value: "$12,000" },
    { label: "Coverage", value: "11 months" },
  ],
  insights: [
    "Childcare and housing are the two costs that make the one-income year tight.",
    "Pausing retirement contributions helps less than trimming travel and delaying a car purchase.",
    "The plan needs a separate reserve for health-insurance changes if the lost job provides benefits.",
  ],
  suggestedActions: [
    "Save $1,000 a month for the next year in a dedicated income-gap fund.",
    "Price health coverage and childcare before choosing which income to rely on.",
    "Delay the planned car purchase until both incomes return.",
  ],
};

export const PROMPT_PAGES = [
  {
    slug: "retirement",
    title: "Are we saving enough to retire?",
    description: "Compare a retirement date with the savings rate and lifestyle it requires.",
    cta: "Check Your Retirement Plan",
    example: RETIREMENT_EXAMPLE,
    useCaseHref: "/use-cases/retirement",
  },
  {
    slug: "home-buying",
    title: "How much house can we afford?",
    description: "See the home price, cash reserve, and monthly cost that fit the rest of the plan.",
    cta: "Check Your Home Budget",
    example: HOME_BUYING_EXAMPLE,
    useCaseHref: "/use-cases/home-buying",
  },
  {
    slug: "portfolio-analysis",
    title: "Are our investments taking too much risk?",
    description: "Connect investment risk to the goal the portfolio is meant to fund.",
    cta: "Analyze Your Portfolio",
    example: PORTFOLIO_EXAMPLE,
    useCaseHref: "/use-cases/portfolio-analysis",
  },
  {
    slug: "financial-stress-testing",
    title: "Could we live on one income for a year?",
    description: "Test an income change against childcare, housing, cash, and retirement saving.",
    cta: "Stress Test Your Plan",
    example: STRESS_TEST_EXAMPLE,
    useCaseHref: "/use-cases/financial-stress-testing",
  },
  {
    slug: "geopolitical-retirement",
    title: "What if markets fall and inflation stays high?",
    description: "See how a market shock changes the plan without pretending to predict the news.",
    cta: "Check Your Retirement Plan",
    example: GEOPOLITICAL_RETIREMENT_EXAMPLE,
    useCaseHref: "/use-cases/financial-stress-testing",
  },
] as const;
