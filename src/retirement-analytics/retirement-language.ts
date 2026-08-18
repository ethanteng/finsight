/**
 * One definition of how people write about retiring.
 *
 * This existed in three places — the question router, the question parser, and
 * the former free-form profile extractor — and each copy had drifted. Two of them tested for the
 * substrings "retire" and "retirement", which "retiring" contains neither of, so
 * a question whose stated goal was "retiring by age 62" routed as a
 * non-retirement question in one place and returned no parameters at all in
 * another. A third only allowed a single connector between the verb and the
 * number, so "retiring by age 62" could not match "by" and "age" together.
 *
 * Every fallback parser now imports from here. Semantic context routing is
 * handled by the context planner; these patterns exist only when extraction is
 * unavailable and the deterministic retirement parser must recover locally.
 */

/** "retire the mortgage" is debt payoff, not retirement planning. */
const DEBT_PAYOFF =
  /\bretir\w+\s+(?:my|our|the|this|that|their)\s+(?:mortgage|loans?|debts?|note|card|balance)\b/gi;

/**
 * Runway questions: the thing a projection answers, asked without the word for
 * it. "At my current rate of spend, how long will my money last?" matched none
 * of the vocabulary, so the engine that exists to answer exactly that question
 * never ran and the answer was assembled from aggregates instead.
 *
 * Matched by shape rather than by word list, for the same reason the spending
 * patterns are: it is a duration, an asset, and a word for running out — in
 * either order, with anything between them. Naming the assets is what keeps
 * "how long will my mortgage last" out; that one is a loan term.
 */
const ASSET = String.raw`(?:money|savings|portfolio|nest\s+egg|assets?|investments?|funds?|cash|hsas?|401\(?k\)?|403\(?b\)?|iras?|roth\s+iras?|brokerage(?:\s+account)?s?)`;
const DURATION = String.raw`(?:how\s+long|how\s+much\s+longer|how\s+many\s+(?:more\s+)?(?:years|months))`;
/**
 * Running out. "last" has to refuse the time idiom: without this, "how many
 * months of savings did I use last year" is a duration, an asset and the word
 * "last" in the right order, and routes as a runway question.
 */
const DEPLETES = String.raw`(?:lasts?(?!\s+(?:month|months|year|years|week|weeks|quarter|night|time|few|couple))|hold\s+out|holds\s+out|hold\s+up|holds\s+up|stretch(?:es)?)`;
/** Bounded, and stops at sentence punctuation so it cannot span two questions. */
const GAP = String.raw`[^?!.]{0,60}?`;

const RUNWAY_PATTERNS = [
  // "how long will my money last", "how many years will the portfolio hold out"
  new RegExp(String.raw`\b${DURATION}\b${GAP}\b${ASSET}\b${GAP}\b${DEPLETES}\b`, 'i'),
  // "will my savings last 20 years?", "will the portfolio last until I am 90?".
  // The same question with the duration on the other side of the asset, which is
  // how people ask it when they already have a number in mind.
  new RegExp(String.raw`\b(?:will|would|can|could|is|are)\b${GAP}\b(?:my|our|the)\s+${ASSET}\b${GAP}\b${DEPLETES}\b`, 'i'),
  // "how long can I live off my savings". The asset is required: living on a
  // pension, on welfare, or on one income is a question about that income, and
  // the projection would answer it by asking for a portfolio.
  new RegExp(String.raw`\b${DURATION}\b${GAP}\blive\s+(?:off|on)\b${GAP}\b${ASSET}\b`, 'i'),
  // "will I run out of money?", "am I going to outlive my savings?"
  new RegExp(String.raw`\brun(?:ning)?\s+out\s+of\s+(?:my\s+|our\s+|the\s+)?${ASSET}\b`, 'i'),
  new RegExp(String.raw`\boutliv\w*\s+(?:my|our|the)\s+${ASSET}\b`, 'i'),
];

/**
 * An emergency fund is drawn down by a job loss, not by a retirement plan, so
 * "how long will my emergency fund last" is the same shape asking a different
 * question. Removing the phrase leaves the rest of the sentence to match on its
 * own: "how long will my emergency fund and my portfolio last" is still a
 * runway question.
 */
const EMERGENCY_RESERVE = /\bemergency\s+(?:funds?|savings|cash|reserves?)\b/gi;

function mentionsRunway(text: string): boolean {
  const scoped = text.replace(EMERGENCY_RESERVE, ' ');
  return RUNWAY_PATTERNS.some((pattern) => pattern.test(scoped));
}

/**
 * A deliberately broad fallback intent pattern. It does not select context in
 * production; the semantic planner does that before this parser can run.
 */
const RETIREMENT_INTENT =
  /\b(?:retir\w*|withdrawals?|draw\s*down|nest\s+egg|financial\s+independence|stop\s+working|quit\s+working)\b/i;

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

/**
 * Does this text talk about retiring, in any of the ways people phrase it?
 *
 * Including the ways that never say so. A runway question is a retirement
 * question whatever words it uses, and it is the one shape the vocabulary can
 * never be edited into covering: there is no term to add, only a shape.
 */
export function mentionsRetirement(text: string): boolean {
  if (!text) return false;
  const stripped = withoutDebtPayoff(text);
  return RETIREMENT_INTENT.test(stripped) || mentionsRunway(stripped);
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
