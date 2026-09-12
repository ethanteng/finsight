/**
 * The Coast FIRE formula, server side.
 *
 * The public calculator runs entirely in the browser — that is its promise —
 * so this exists for one reason: emailing a result. An emailed number must be
 * computed from the seven inputs by us, never copied out of a request body,
 * or the email becomes a way to send arbitrary figures under our branding.
 *
 * It is a deliberate second copy of `frontend/src/lib/coast-fire.ts`. The two
 * cannot import each other (separate TypeScript projects with separate module
 * resolution), so both are pinned to the same worked example instead:
 * `src/__tests__/unit/coast-fire.test.ts` and `frontend/src/__tests__/coast-fire.test.tsx`
 * assert the same figures for the same defaults. Change the formula in one
 * place and one of those two suites fails.
 */

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

export const COAST_FIRE_INPUT_FIELDS = [
  'currentAge',
  'retirementAge',
  'currentSavings',
  'annualRetirementSpending',
  'annualRetirementIncome',
  'realReturnRate',
  'withdrawalRate',
] as const;

/** Carries the offending field so the form can point at the box to fix. */
export class CoastFireValidationError extends Error {
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = 'CoastFireValidationError';
    this.field = field;
  }
}

/**
 * Read the seven inputs out of a request body.
 *
 * Numbers arrive as strings from an HTML number input, so each is coerced
 * here; anything that is not a finite number is refused by name rather than
 * quietly becoming NaN and poisoning every figure downstream.
 */
export function parseCoastFireInputs(raw: unknown): CoastFireInputs {
  const body = (raw && typeof raw === 'object' && !Array.isArray(raw))
    ? raw as Record<string, unknown>
    : {};

  const inputs = {} as CoastFireInputs;
  for (const field of COAST_FIRE_INPUT_FIELDS) {
    const value = body[field];
    const parsed = typeof value === 'string' ? Number(value.replace(/[$,\s%]/g, '')) : value;
    if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
      throw new CoastFireValidationError(`${field} must be a number.`, field);
    }
    inputs[field] = parsed;
  }
  return inputs;
}

/**
 * All dollar inputs and outputs are in today's dollars, so growth uses a real
 * (after-inflation) return rather than mixing nominal growth with real spending.
 */
export function calculateCoastFire(inputs: CoastFireInputs): CoastFireResult {
  if (!Number.isInteger(inputs.currentAge) || inputs.currentAge < 18 || inputs.currentAge > 90) {
    throw new CoastFireValidationError(
      'Current age must be a whole number between 18 and 90.',
      'currentAge',
    );
  }
  if (
    !Number.isInteger(inputs.retirementAge) ||
    inputs.retirementAge < 30 ||
    inputs.retirementAge > 95 ||
    inputs.retirementAge <= inputs.currentAge
  ) {
    throw new CoastFireValidationError(
      'Retirement age must be a whole number after your current age and no later than 95.',
      'retirementAge',
    );
  }

  const moneyFields = [
    ['currentSavings', inputs.currentSavings],
    ['annualRetirementSpending', inputs.annualRetirementSpending],
    ['annualRetirementIncome', inputs.annualRetirementIncome],
  ] as const;
  for (const [field, value] of moneyFields) {
    if (!Number.isFinite(value) || value < 0) {
      throw new CoastFireValidationError(
        'Savings, spending, and retirement income cannot be negative.',
        field,
      );
    }
    // The page's own inputs cap here, and an uncapped figure would render as a
    // nonsense headline number in an email nobody can edit afterwards.
    if (value > 100_000_000) {
      throw new CoastFireValidationError('That figure is larger than this calculator models.', field);
    }
  }
  if (inputs.annualRetirementSpending < 1_000) {
    throw new CoastFireValidationError(
      'Annual retirement spending must be at least $1,000.',
      'annualRetirementSpending',
    );
  }
  if (!Number.isFinite(inputs.realReturnRate) || inputs.realReturnRate < 0 || inputs.realReturnRate > 12) {
    throw new CoastFireValidationError('Real return must be between 0% and 12%.', 'realReturnRate');
  }
  if (!Number.isFinite(inputs.withdrawalRate) || inputs.withdrawalRate < 2 || inputs.withdrawalRate > 8) {
    throw new CoastFireValidationError('Withdrawal rate must be between 2% and 8%.', 'withdrawalRate');
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

/**
 * The same one-point-either-way comparison the page shows under the result.
 * A single rate is the assumption most likely to be wrong, and the email has
 * to carry that caveat as visibly as the page does.
 */
export function coastFireSensitivity(result: CoastFireResult): Array<{
  rate: number;
  coastFireNumber: number;
  reached: boolean;
  selected: boolean;
}> {
  const rates = [
    Math.max(0, result.realReturnRate - 1),
    result.realReturnRate,
    Math.min(12, result.realReturnRate + 1),
  ];

  return [...new Set(rates)].map((rate) => {
    const coastFireNumber = calculateCoastFire({ ...result, realReturnRate: rate }).coastFireNumber;
    return {
      rate,
      coastFireNumber,
      reached: result.currentSavings >= coastFireNumber,
      selected: rate === result.realReturnRate,
    };
  });
}
