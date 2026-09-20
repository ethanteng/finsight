import { DEMO_RETIREMENT_RESULTS } from './demo-retirement-results';

export type DemoFact = readonly [label: string, value: string, source: string];
export type DemoDecision = {
  id: string;
  shortTitle: string;
  date: string;
  question: string;
  metrics: Array<{ label: string; value: string; source?: string }>;
  verdict: string;
  summary: string;
  takeaways: string[];
  actions: string[];
  facts: DemoFact[];
  assumptions: string[];
  calculations: DemoFact[];
  checks: string[];
  sources: Array<{ title: string; detail: string; href?: string }>;
};

const dollars = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const millions = (value: number) => `$${(value / 1_000_000).toFixed(2)}M`;
const [early, later, lowerPay, lowerSpending] = DEMO_RETIREMENT_RESULTS;
const missed = early.result.sequencesTested - early.result.sequencesSurvived;
const lostCushion = later.result.projectedPortfolioAtRetirement - lowerPay.result.projectedPortfolioAtRetirement;

/** Fictional household assumptions shared by every view in the demo. */
export const DEMO_HOUSEHOLD = {
  currentAge: 48,
  investments: 2_291_203,
  cash: 82_651,
  homeValue: 1_644_800,
  debt: 350_305,
  mortgageBalance: 348_601,
  annualTakeHome: 195_000,
  annualSpending: 150_000,
  annualSaving: 45_000,
  monthlyHousing: 4_500,
} as const;

/** Mortgage rate and transaction costs are example assumptions, not live quotes. */
export const DEMO_HOME_PURCHASE = (() => {
  const price = 2_000_000;
  const downPayment = price * .2;
  const loan = price - downPayment;
  const annualRate = .065;
  const monthlyRate = annualRate / 12;
  const months = 360;
  const principalAndInterest = loan * monthlyRate / (1 - (1 + monthlyRate) ** -months);
  const propertyTax = price * .012 / 12;
  const insurance = 3_000 / 12;
  const maintenance = price * .01 / 12;
  const monthlyHousing = principalAndInterest + propertyTax + insurance + maintenance;
  const otherMonthlySpending = DEMO_HOUSEHOLD.annualSpending / 12 - DEMO_HOUSEHOLD.monthlyHousing;
  const monthlyShortfall = monthlyHousing + otherMonthlySpending - DEMO_HOUSEHOLD.annualTakeHome / 12;
  const saleCosts = DEMO_HOUSEHOLD.homeValue * .06;
  const saleProceeds = DEMO_HOUSEHOLD.homeValue - saleCosts - DEMO_HOUSEHOLD.mortgageBalance;
  const closingCosts = price * .03;
  const cashAfterMove = DEMO_HOUSEHOLD.cash + saleProceeds - downPayment - closingCosts;
  return { price, downPayment, loan, annualRate, months, principalAndInterest, propertyTax, insurance, maintenance, monthlyHousing, otherMonthlySpending, monthlyShortfall, saleCosts, saleProceeds, closingCosts, cashAfterMove };
})();
const home = DEMO_HOME_PURCHASE;

const retirementSources: DemoDecision['sources'] = [
  { title: 'Example household', detail: 'Age 48, $2,291,203 invested, $150,000 annual spending, and $45,000 annual contributions. These are fictional inputs, not someone’s private account data.' },
  { title: 'Retirement calculator', detail: 'Calculated with Ask Linc’s retirement engine on September 20, 2026. The balanced preset is 60% US stocks, 35% government bonds, and 5% cash.', href: '/retirement-calculator' },
  { title: 'Historical market data', detail: 'July 1926–June 2026. There are 637 overlapping 47-year histories for a plan starting at age 48 and ending at 95. Historical outcomes are not probabilities of future success.', href: '/blog/historical-market-data-retirement-modeling' },
];
const retirementAssumptions = [
  'Spending and contributions are in today’s dollars. The simulation adjusts for historical inflation.',
  '$60,000 a year of Social Security starts at 67; the plan runs through age 95.',
  'A balanced allocation is used for this example, rather than the individual holdings shown in the sample account screen.',
  'No withdrawal taxes, fees, or separate healthcare costs are modeled. Any healthcare budget must be included in spending.',
];

export const DEMO_DECISIONS: DemoDecision[] = [
  {
    id: 'retirement', shortTitle: 'Retire at 55 or keep the travel budget?', date: 'Sep 20',
    question: 'We have $2.29M invested. Can we retire at 55 and keep spending $150,000 a year, including travel?',
    verdict: 'I’d keep 55 on the table, but I wouldn’t treat $150,000 a year as untouchable.',
    summary: `That plan ran out of money in ${missed} of ${early.result.sequencesTested} tested histories. At $130,000 a year, none ran out. If the full $150,000 budget matters more than leaving at 55, retiring at 58 also lasted in every tested history. The choice is whether three years of work are worth keeping that extra $1,667 a month.`,
    metrics: [
      { label: '55 · $150K spending', value: `${missed} ran short`, source: '637 historical tests' },
      { label: '55 · $130K spending', value: '0 ran short', source: 'Same historical tests' },
      { label: '58 · $150K spending', value: '0 ran short', source: 'Same historical tests' },
      { label: 'Spending tradeoff', value: '$1,667/mo', source: '$20,000 ÷ 12' },
    ],
    takeaways: [
      'The first 12 years are the stretch to plan for: your portfolio covers the full budget until Social Security starts at 67. After that, the $150,000 plan needs $90,000 a year from investments.',
      `Working to 58 brings the median projected portfolio from ${millions(early.result.projectedPortfolioAtRetirement)} to ${millions(later.result.projectedPortfolioAtRetirement)}. That is what those three extra working years buy in this comparison.`,
      'The $130,000 result assumes lower spending throughout retirement. It does not prove that cutting back only after a market drop would be enough.',
    ],
    actions: [
      'Separate the $150,000 budget into costs you must cover and spending you could actually give up. Find the $20,000 before relying on the leaner plan.',
      'Check how you would fund withdrawals before 59½ and healthcare before 65. Those details could change the retirement date.',
    ],
    facts: [['Investments today', '$2,291,203', 'Sample accounts'], ['Current age', '48', 'Example profile'], ['Annual contributions', '$45,000', 'Example budget'], ['Spending being compared', '$150,000 / $130,000', 'Your question'], ['Retirement ages', '55 / 58', 'Your question']],
    assumptions: retirementAssumptions,
    calculations: [
      ['Retire at 55, spend $150,000', `${early.result.sequencesSurvived} of 637 lasted`, 'Historical simulation'],
      ['Retire at 55, spend $130,000', `${lowerSpending.result.sequencesSurvived} of 637 lasted`, 'Same inputs, lower spending'],
      ['Retire at 58, spend $150,000', `${later.result.sequencesSurvived} of 637 lasted`, 'Same inputs, later retirement'],
      ['Budget difference', '$20,000/year ≈ $1,667/month', '$150,000 − $130,000'],
      ['Portfolio draw from age 67', '$90,000/year', '$150,000 − $60,000 Social Security'],
    ],
    checks: ['All three comparisons use the same starting assets, contributions, allocation, and end age.', 'The counts show past outcomes, not odds of future success. Home equity is excluded from retirement assets.'],
    sources: retirementSources,
  },
  {
    id: 'career-change', shortTitle: 'Can I take a $40K pay cut?', date: 'Sep 20',
    question: 'I’m burned out. Could I take a job with $40,000 less take-home pay and still retire at 58?',
    verdict: 'The pay cut looks workable. The immediate concern is your monthly budget, not the retirement date.',
    summary: `Your saving would fall from $45,000 to $5,000 a year. Even at that lower amount, the age-58 plan lasted through all 637 tested histories at $150,000 annual spending. The tradeoff is about ${dollars(lostCushion)} less in the median retirement portfolio, plus only $417 a month left after spending today.`,
    metrics: [
      { label: 'New annual saving', value: '$5,000', source: '$155,000 take-home − $150,000 spending' },
      { label: 'Monthly room left', value: '$417', source: '$5,000 ÷ 12' },
      { label: 'Age-58 portfolio', value: millions(lowerPay.result.projectedPortfolioAtRetirement), source: 'Median historical projection' },
      { label: 'Histories that ran short', value: '0 of 637', source: 'With reduced contributions' },
    ],
    takeaways: [
      `Your existing $2.29M does much of the work. The median age-58 projection is ${millions(lowerPay.result.projectedPortfolioAtRetirement)} with the pay cut, versus ${millions(later.result.projectedPortfolioAtRetirement)} in the current job.`,
      'The $40,000 is a drop in take-home pay, not gross salary. A change in health insurance, bonuses, or employer retirement contributions needs to be counted separately.',
      'With just $417 a month left over, a $5,000 annual increase in benefits or other costs would use up the entire savings budget. I’d settle those details before accepting.',
    ],
    actions: [
      'Compare the offer’s take-home pay and benefits with your current job. Confirm that the total annual reduction really is $40,000.',
      'Keep your $82,651 cash reserve separate. This comparison assumes you cover day-to-day costs from pay and leave investments untouched until 58.',
    ],
    facts: [['Investments today', '$2,291,203', 'Sample accounts'], ['Current take-home pay', '$195,000/year', 'Example budget'], ['New take-home pay', '$155,000/year', 'Proposed job'], ['Annual spending', '$150,000', 'Example budget'], ['Target retirement age', '58', 'Your question']],
    assumptions: [...retirementAssumptions, 'The lower take-home pay starts now and continues until 58. The example does not include an additional change in benefits.'],
    calculations: [
      ['Current annual saving', '$45,000', '$195,000 − $150,000'],
      ['Saving after the pay cut', '$5,000', '$155,000 − $150,000'],
      ['Monthly room left', '$417', '$5,000 ÷ 12, rounded'],
      ['Median portfolio with current saving', dollars(later.result.projectedPortfolioAtRetirement), 'Age-58 simulation'],
      ['Median portfolio with lower saving', dollars(lowerPay.result.projectedPortfolioAtRetirement), 'Same simulation, $5,000 annual contributions'],
      ['Difference in median portfolios', dollars(lostCushion), 'Current-job projection minus lower-pay projection'],
    ],
    checks: ['Spending, retirement age, Social Security, and allocation stay the same. Only contributions change.', 'The reduced-contribution plan lasted in all 637 historical tests. It is not a guarantee.'],
    sources: retirementSources,
  },
  {
    id: 'home-buying', shortTitle: 'The bank says $2M. Does our budget?', date: 'Sep 20',
    question: 'The bank says we can buy a $2M house. If we sell our current home and put 20% down, can we still keep saving for retirement?',
    verdict: 'I wouldn’t make this move on the current budget. The down payment works; the monthly payment doesn’t.',
    summary: `After selling, paying off the old mortgage, and covering the new down payment and closing costs, you would have about ${dollars(home.cashAfterMove)} in cash. But the new home costs roughly ${dollars(home.monthlyHousing)} a month all-in. That puts you ${dollars(home.monthlyShortfall)} over your monthly take-home pay before saving anything for retirement.`,
    metrics: [
      { label: 'Cash after the move', value: dollars(home.cashAfterMove), source: 'Sale proceeds + cash − purchase costs' },
      { label: 'New monthly housing', value: dollars(home.monthlyHousing), source: 'Mortgage + tax + insurance + upkeep' },
      { label: 'Monthly shortfall', value: dollars(home.monthlyShortfall), source: 'Before retirement saving' },
      { label: 'Housing budget to keep saving', value: '$4,500/mo', source: 'Current income and other spending' },
    ],
    takeaways: [
      `The proposed $1.6M mortgage alone costs about ${dollars(home.principalAndInterest)} a month at the example’s 6.5% rate over 30 years. Property tax, insurance, and maintenance add another ${dollars(home.propertyTax + home.insurance + home.maintenance)}.`,
      'Your current $4,500 housing cost leaves room for $8,000 of other monthly spending and $3,750 of saving. The new payment uses all of that saving and still leaves a gap.',
      'You could use the sale proceeds to subsidize the payment, but then the move would be spending down your assets. I’d compare a lower price or much larger down payment before making an offer.',
    ],
    actions: [
      'Ask for an all-in monthly estimate, including property tax, insurance, and maintenance. A loan approval does not account for the retirement saving you want to keep.',
      'Use $4,500 a month as the starting housing budget, then decide explicitly whether a more expensive home is worth lower spending elsewhere or a later retirement.',
    ],
    facts: [['Current home value', '$1,644,800', 'Sample property estimate'], ['Mortgage to pay off', '$348,601', 'Sample debt breakdown'], ['Available cash', '$82,651', 'Sample accounts'], ['New home price', '$2,000,000', 'Your question'], ['Monthly take-home pay', '$16,250', 'Example budget'], ['Other monthly spending', '$8,000', 'Current spending less housing']],
    assumptions: ['The current home sells for its estimated value, with 6% selling costs. The new purchase has 3% closing costs and a 20% down payment.', 'A 30-year mortgage at 6.5%, annual property tax of 1.2%, $3,000 annual insurance, and maintenance of 1% of the home price. These are example assumptions, not quotes.', 'No home-sale tax, moving costs, renovation costs, or HOA fees are included. Retirement investments remain untouched.'],
    calculations: [
      ['Net proceeds from current home', dollars(home.saleProceeds), '$1,644,800 − $98,688 selling costs − $348,601 mortgage'],
      ['Cash after the move', dollars(home.cashAfterMove), `${dollars(home.saleProceeds)} + $82,651 − $400,000 down − $60,000 closing`],
      ['Mortgage principal and interest', `${dollars(home.principalAndInterest)}/month`, '$1,600,000 × r ÷ (1 − (1 + r)⁻³⁶⁰), r = 6.5% ÷ 12'],
      ['Total monthly housing', dollars(home.monthlyHousing), `${dollars(home.principalAndInterest)} + $2,000 tax + $250 insurance + $1,667 upkeep`],
      ['Monthly shortfall before saving', dollars(home.monthlyShortfall), `${dollars(home.monthlyHousing)} + $8,000 other spending − $16,250 take-home`],
    ],
    checks: ['Home equity is used for the purchase; retirement assets are not counted toward the down payment.', 'The sale proceeds are a one-time sum. They are not counted as monthly income.', 'Mortgage and cost calculations use unrounded values; displayed dollars are rounded.'],
    sources: [
      { title: 'Example household', detail: 'The same sample accounts shown in Finances: $82,651 cash, $2,291,203 invested, $1,644,800 home value, and $350,305 debt. The debt includes a $348,601 mortgage and $1,704 of card balances.' },
      { title: 'Example purchase assumptions', detail: 'The $2M price, 6.5% rate, taxes, insurance, upkeep, and transaction costs are illustrative. An actual answer depends on the property and lender quotes you supply.' },
      { title: 'Calculations', detail: 'Standard fixed-rate mortgage payment, sale-proceeds arithmetic, and a monthly budget comparison. The Math tab shows every input and calculation.' },
    ],
  },
];
