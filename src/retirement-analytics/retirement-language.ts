/**
 * One definition of how people write about retiring.
 *
 * This existed in three places — the question router, the question parser, and
 * the profile extractor — and each copy had drifted. Two of them tested for the
 * substrings "retire" and "retirement", which "retiring" contains neither of, so
 * a question whose stated goal was "retiring by age 62" routed as a
 * non-retirement question in one place and returned no parameters at all in
 * another. A third only allowed a single connector between the verb and the
 * number, so "retiring by age 62" could not match "by" and "age" together.
 *
 * Every site now imports from here. Deliberately dependency-free: the router
 * calls this on every question.
 */

/** "retire the mortgage" is debt payoff, not retirement planning. */
const DEBT_PAYOFF =
  /\bretir\w+\s+(?:my|our|the|this|that|their)\s+(?:mortgage|loans?|debts?|note|card|balance)\b/gi;

/** retire, retires, retired, retiring, retirement, retiree. */
const RETIREMENT_WORD = /\bretir\w*/i;

const RETIREMENT_SYNONYM =
  /\b(?:withdrawals?|drawdown|draw\s+down|nest\s+egg|financial\s+independence)\b/i;

const STOPS_WORKING = /\b(?:stop|quit)\s+working\b/i;

/**
 * Connectors people put between the verb and the age, in any combination:
 * "retire at 65", "retiring by age 62", "retire around age 58".
 */
const RETIREMENT_AGE_PATTERNS = [
  /retir\w*(?:\s+(?:at|by|around|about|near|before|no\s+later\s+than))*(?:\s+age)?\s+(\d{2,3})\b/i,
  /retirement\s+age\s+(?:of\s+)?(\d{2,3})\b/i,
  /planning\s+to\s+retire\s+(?:at|by)\s+(?:age\s+)?(\d{2,3})\b/i,
];

/**
 * Bare "age N" is deliberately absent: in "retire at age 68" it would read the
 * target as the person's current age.
 */
const CURRENT_AGE_PATTERNS = [
  /(?:i'?m|i am)\s+(\d{2,3})\b/i,
  /(?:^|[^\w-])(\d{2,3})\s*(?:years?\s*old|y\.?o\.?)\b/i,
  /(\d{2,3})-year-old/i,
];

/** Retiring before 30 is far more likely a misparse than a plan. */
const RETIREMENT_AGE_RANGE = { min: 30, max: 100 };
const CURRENT_AGE_RANGE = { min: 18, max: 120 };

/** Strip the debt sense so "retire my mortgage so I can retire at 62" still counts. */
function withoutDebtPayoff(text: string): string {
  return text.replace(DEBT_PAYOFF, ' ');
}

/** Does this text talk about retiring, in any of the ways people phrase it? */
export function mentionsRetirement(text: string): boolean {
  if (!text) return false;
  return RETIREMENT_WORD.test(withoutDebtPayoff(text)) ||
    RETIREMENT_SYNONYM.test(text) ||
    STOPS_WORKING.test(text);
}

function firstMatchInRange(
  text: string,
  patterns: readonly RegExp[],
  range: { min: number; max: number }
): number | null {
  if (!text) return null;
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value >= range.min && value <= range.max) return value;
  }
  return null;
}

/** The age the person plans to retire at, from a question or a profile. */
export function extractRetirementAge(text: string): number | null {
  return firstMatchInRange(text, RETIREMENT_AGE_PATTERNS, RETIREMENT_AGE_RANGE);
}

/** The person's age today, from a question or a profile. */
export function extractCurrentAge(text: string): number | null {
  return firstMatchInRange(text, CURRENT_AGE_PATTERNS, CURRENT_AGE_RANGE);
}
