export interface CoastFireInputs {
  currentAge: number;
  retirementAge: number;
  currentSavings: number;
  annualRetirementSpending: number;
  annualRetirementIncome: number;
  realReturnRate: number;
  withdrawalRate: number;
}

export interface CoastFireResult extends CoastFireInputs {
  yearsToRetirement: number;
  portfolioSpendingNeed: number;
  retirementTarget: number;
  coastFireNumber: number;
  projectedSavingsAtRetirement: number;
  differenceToday: number;
  differenceAtRetirement: number;
  fundedRatio: number;
  hasReachedCoastFire: boolean;
}

export const DEFAULT_COAST_FIRE_INPUTS: CoastFireInputs = {
  currentAge: 40,
  retirementAge: 65,
  currentSavings: 400_000,
  annualRetirementSpending: 80_000,
  annualRetirementIncome: 30_000,
  realReturnRate: 5,
  withdrawalRate: 4,
};

/**
 * The intentionally simple Coast FIRE calculation shown on the public page.
 * All dollar inputs and outputs are in today's dollars, so growth uses a real
 * (after-inflation) return rather than mixing nominal growth with real spending.
 */
export function calculateCoastFire(inputs: CoastFireInputs): CoastFireResult {
  if (!Number.isInteger(inputs.currentAge) || inputs.currentAge < 18 || inputs.currentAge > 90) {
    throw new Error("Current age must be a whole number between 18 and 90.");
  }
  if (
    !Number.isInteger(inputs.retirementAge) ||
    inputs.retirementAge < 30 ||
    inputs.retirementAge > 95 ||
    inputs.retirementAge <= inputs.currentAge
  ) {
    throw new Error("Retirement age must be a whole number after your current age and no later than 95.");
  }

  const moneyInputs = [
    inputs.currentSavings,
    inputs.annualRetirementSpending,
    inputs.annualRetirementIncome,
  ];
  if (moneyInputs.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Savings, spending, and retirement income cannot be negative.");
  }
  if (inputs.annualRetirementSpending < 1_000) {
    throw new Error("Annual retirement spending must be at least $1,000.");
  }
  if (!Number.isFinite(inputs.realReturnRate) || inputs.realReturnRate < 0 || inputs.realReturnRate > 12) {
    throw new Error("Real return must be between 0% and 12%.");
  }
  if (!Number.isFinite(inputs.withdrawalRate) || inputs.withdrawalRate < 2 || inputs.withdrawalRate > 8) {
    throw new Error("Withdrawal rate must be between 2% and 8%.");
  }

  const yearsToRetirement = inputs.retirementAge - inputs.currentAge;
  const portfolioSpendingNeed = Math.max(
    0,
    inputs.annualRetirementSpending - inputs.annualRetirementIncome,
  );
  const retirementTarget = portfolioSpendingNeed / (inputs.withdrawalRate / 100);
  const growthFactor = (1 + inputs.realReturnRate / 100) ** yearsToRetirement;
  const coastFireNumber = retirementTarget / growthFactor;
  const projectedSavingsAtRetirement = inputs.currentSavings * growthFactor;
  const differenceToday = inputs.currentSavings - coastFireNumber;
  const differenceAtRetirement = projectedSavingsAtRetirement - retirementTarget;
  const fundedRatio = coastFireNumber === 0
    ? Number.POSITIVE_INFINITY
    : inputs.currentSavings / coastFireNumber;

  return {
    ...inputs,
    yearsToRetirement,
    portfolioSpendingNeed,
    retirementTarget,
    coastFireNumber,
    projectedSavingsAtRetirement,
    differenceToday,
    differenceAtRetirement,
    fundedRatio,
    hasReachedCoastFire: differenceToday >= 0,
  };
}

export type CoastFireFaq = {
  question: string;
  answer: string;
};

export const COAST_FIRE_FAQ: CoastFireFaq[] = [
  {
    question: "What is Coast FIRE?",
    answer:
      "Coast FIRE is the point where the retirement savings you already have could grow to your retirement target without additional contributions, assuming your timeline and investment returns hold. You still need income to cover life before retirement; the idea is that retirement saving may no longer need to drive every work and spending decision.",
  },
  {
    question: "How is my Coast FIRE number calculated?",
    answer:
      "The calculator subtracts retirement income available from the day you retire from your annual spending, divides the remainder by your withdrawal rate to estimate the portfolio needed at retirement, then discounts that target back to today using your real return and years until retirement.",
  },
  {
    question: "Should I stop contributing when I reach Coast FIRE?",
    answer:
      "Not necessarily. Reaching the number means one simplified set of assumptions works. Taxes, fees, account access, healthcare, income timing, a poor early market sequence, and changes in your life can all change the decision. Treat the result as a reason to explore your options, not an instruction to stop saving.",
  },
  {
    question: "What real return should I use?",
    answer:
      "Real return is investment growth after inflation. A lower assumption produces a higher Coast FIRE number and a more conservative result. The calculator shows nearby return scenarios so you can see how sensitive your answer is instead of relying on one rate unnoticed.",
  },
  {
    question: "Can I include Social Security or a pension?",
    answer:
      "Yes, but only enter income expected to be available from the retirement age in this calculation. If Social Security, a pension, or another income source starts later, the simple formula will overstate its help because it does not model the gap years separately.",
  },
  {
    question: "Is the Coast FIRE calculator free?",
    answer:
      "Yes. It is free, requires no account, and runs in your browser. Ask Linc's planning experience is the next step when you want to replace the simple assumptions with your actual holdings, spending, income, taxes, and scenarios.",
  },
];
