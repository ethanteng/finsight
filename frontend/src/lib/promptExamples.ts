/** Illustrative prompt/response examples used across marketing pages. */

export interface PromptExample {
  prompt: string;
  response: string;
  keyNumbers: { label: string; value: string }[];
  insights: string[];
  suggestedActions: string[];
}

export const RETIREMENT_EXAMPLE: PromptExample = {
  prompt: "We are 42 and 44. Are we saving enough to retire at 60 without cutting our current lifestyle?",
  response:
    "You are close, but the current savings rate leaves the plan about $110,000 short at age 60. Increasing retirement contributions by $600 a month closes most of the gap. Retiring at 62 would also put the current plan on track without changing contributions.",
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
    "Yes, if you put 15% down and keep total housing costs below $4,800 a month. That leaves about $48,000 after closing—roughly six months of current spending—and lets both of you keep your existing retirement contributions.",
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
    "Probably. At 88% stocks, a major downturn near retirement could delay the plan even though your savings rate is healthy. Moving toward 75% stocks over the next three years keeps the age-60 target while reducing the size of a likely drawdown.",
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
    "Stress-test the age-60 plan against a 25% stock-market decline every year.",
  ],
};

export const GEOPOLITICAL_RETIREMENT_EXAMPLE: PromptExample = {
  prompt: "What would a 15% stock-market drop and a year of higher inflation do to our retirement plan?",
  response:
    "The age-60 plan still works, but the cushion falls from about $200,000 to $45,000. The main risk is needing cash while investments are down. Keeping nine months of expenses outside the portfolio makes the plan much less sensitive to the timing of the drop.",
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
    "Yes, but only if you cut optional spending and build another $12,000 in cash first. With those changes, the emergency fund covers the one-income gap and childcare for 11 months without using retirement savings.",
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
    cta: "Check Your Home Buying Readiness",
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
