/**
 * Retirement Question Parser
 * Extracts retirement analysis parameters from user questions
 */

import { extractCurrentAge, extractRetirementAge, mentionsRetirement } from './retirement-language';

export interface RetirementQuestionParams {
  hasRetirementIntent: boolean;
  currentAge?: number;
  retirementAge?: number;
  annualWithdrawalAmount?: number;
  withdrawalStartAge?: number;
  lifeExpectancy?: number;
}

/**
 * A whole number, not a fragment of one.
 *
 * The lookarounds matter: without them "spend 150000 per year" matched the
 * final "0" — the only digit run with " per year" behind it — and the
 * projection ran on a $0 withdrawal instead of reporting a missing input.
 */
const AMOUNT = String.raw`(?<![\d,.])\$?\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![\d,])`;
const MULTIPLIER = String.raw`\s*(?:k|thousand|million)?`;

/** Periods that stand on their own after an amount: "$125k a year". */
const ANNUAL_PERIOD = String.raw`(?:per\s+year|a\s+year|each\s+year|every\s+year|annually|yearly|\/\s*(?:yr|year))`;

/**
 * Adjectives that only mean "annual" when they modify a noun. Bare "annual"
 * after an amount would read "$500 annual fee" as a retirement withdrawal, so
 * these are always paired with SPEND_NOUN below.
 */
const ANNUAL_ADJECTIVE = String.raw`(?:annual|yearly)`;

/** What people call the money going out once they stop working. */
const SPEND_NOUN = String.raw`(?:spend(?:ing)?|budget|expenses?|withdrawals?|income|costs?|burn)`;

/**
 * Money coming in is not money going out, and no pattern can tell them apart:
 * the difference lives in the sentence's meaning, not its words. This rejects
 * the obvious earnings phrasings so the fallback errs toward reporting the
 * amount missing — which asks the user — rather than toward a salary becoming
 * a spending target.
 */
const EARNINGS_FRAMING =
  /\b(?:income|earnings|salary|salaries|wages?|revenue|gross|pre-?tax|take-?home)\b|\b(?:earn|earns|earned|earning)\b|\b(?:i|we|he|she|they|you|it)\s+(?:make|makes|made)\b|\bbrings?\s+in\b/i;

/**
 * Words allowed between an amount and its annual qualifier. An allowlist, not
 * `.{0,N}`, so two unrelated clauses can never be stapled into one match.
 */
const AMOUNT_TO_ANNUAL_FILLER =
  String.raw`(?:\s+(?:as|is|is\s+my|of|for|in|my|our|the|a|an|new|newly|updated|revised|target|targeted|planned|total|going|forward))*`;

/**
 * How the annual number actually gets written.
 *
 * People state it as spending far more often than as a "withdrawal": "$125K
 * annual spending", "drops our yearly spending down to about $125K", "confirm
 * $125K as my target annual spending". Only the withdrawal wording used to
 * parse, so each of those turns produced no amount at all and the projection
 * asked the user for a number they had just given — repeatedly, in the same
 * conversation.
 */
/** The amount is attached to a word meaning outflow, so an earnings clause elsewhere in the sentence does not cloud it. */
const SPENDING_ANCHORED_PATTERNS: readonly RegExp[] = [
  // "$125K annual spending", "$125K as my target annual spending"
  new RegExp(`${AMOUNT}${MULTIPLIER}${AMOUNT_TO_ANNUAL_FILLER}\\s+${ANNUAL_ADJECTIVE}\\s+${SPEND_NOUN}`, 'i'),
  // "annual spending of $125K", "yearly spending down to about $125K"
  new RegExp(`${ANNUAL_ADJECTIVE}\\s+(?:retirement\\s+)?${SPEND_NOUN}[^.$\\d]{0,30}${AMOUNT}${MULTIPLIER}`, 'i'),
  // "annual withdrawal of $80k"
  new RegExp(`annual\\s+withdrawal\\s+(?:of\\s+)?${AMOUNT}${MULTIPLIER}`, 'i'),
];

/** An amount and a period, with nothing saying which direction the money moves. */
const PERIOD_ONLY_PATTERNS: readonly RegExp[] = [
  // "$150k per year", "$100k annually", "$100,000 withdrawal"
  new RegExp(`${AMOUNT}${MULTIPLIER}\\s*(?:${ANNUAL_PERIOD}|withdrawals?)`, 'i'),
  // "withdraw $100k" — could equally be an ATM trip
  new RegExp(`withdraw(?:al)?\\s+(?:of\\s+)?${AMOUNT}${MULTIPLIER}`, 'i'),
];

const WITHDRAWAL_START_PATTERNS = [
  /start\s+withdraw(?:ing|als)?\s+at\s+age\s+(\d+)/i,
  /withdrawal\s+start(?:s|ing)?\s+at\s+age\s+(\d+)/i,
];

const LIFE_EXPECTANCY_PATTERNS = [
  /life\s+expectancy\s+(?:of\s+)?(\d+)/i,
  /live\s+until\s+(\d+)/i,
  /expect\s+to\s+live\s+until\s+(\d+)/i,
];

function parseWithdrawalMultiplier(matchedText: string): number {
  const t = matchedText.toLowerCase();
  if (/\bmillion\b/.test(t)) return 1_000_000;
  // "100k" — \b does not sit between digit and "k", so match digit+k explicitly
  if (/(?:\d\s*)k\b/.test(t) || /\bthousand\b/.test(t)) return 1_000;
  return 1;
}

function firstAmountMatch(qLower: string, patterns: readonly RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = qLower.match(pattern);
    if (!match) continue;
    const amount = parseFloat(match[1].replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    return amount * parseWithdrawalMultiplier(match[0]);
  }
  return undefined;
}

function extractAnnualWithdrawalAmount(qLower: string): number | undefined {
  // An amount the sentence itself calls spending is safe even alongside a
  // salary: "I earn $200k a year and plan annual retirement spending of $80k"
  // states both, and only one of them is the projection's input.
  const anchored = firstAmountMatch(qLower, SPENDING_ANCHORED_PATTERNS);
  if (anchored != null) return anchored;

  // A bare amount-and-period in an earnings sentence is the salary far more
  // often than the target. The extractor reads which from context; this
  // fallback can only refuse, and refusing asks the user.
  if (EARNINGS_FRAMING.test(qLower)) return undefined;
  return firstAmountMatch(qLower, PERIOD_ONLY_PATTERNS);
}

/**
 * A bare number is only read as an annual spend when it is big enough to be
 * one. "62" answers "what age do you plan to retire?"; "2,100" is a monthly
 * figure or a single bill. Both clear the missing-input check once parsed, so
 * without a floor the projection runs on them silently instead of asking.
 *
 * This bounds only bare numeric replies. A sentence that says what the number
 * is — "spend $8,000 per year in retirement" — is read by the patterns above
 * at any size, so a genuinely frugal plan is never rejected for being small.
 */
const MIN_BARE_ANNUAL_AMOUNT = 10_000;

/**
 * A reply whose whole content is the number the assistant just asked for:
 * "125,000", "125k", "about $125000". Routing already treats these as
 * contextual follow-ups; without this they still parse as missing amounts.
 */
function extractBareSpendingAnswer(question: string): number | undefined {
  const trimmed = question.trim();
  if (!trimmed || trimmed.length > 100 || /\?\s*$/.test(trimmed)) return undefined;

  const match = trimmed.match(
    /^(?:yes[,.\s!]*|yeah[,.\s!]*|correct[,.\s!]*|confirm(?:ed)?[,.\s!]*|i\s+(?:can\s+)?confirm[,.\s!]*)*(?:about\s+)?(?:\$?\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k|thousand|million)?\s*[.]?\s*$/i
  );
  if (!match) return undefined;

  const amount = parseFloat(match[1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  const suffix = match[2]?.toLowerCase();
  const multiplier =
    suffix === 'million' ? 1_000_000 : suffix === 'k' || suffix === 'thousand' ? 1_000 : 1;
  const annual = amount * multiplier;
  return annual >= MIN_BARE_ANNUAL_AMOUNT ? annual : undefined;
}

function firstNumber(qLower: string, patterns: readonly RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = qLower.match(pattern);
    if (match) return parseInt(match[1], 10);
  }
  return undefined;
}

/**
 * Pull every parameter a question can carry, whether or not it reads as a
 * retirement question on its own. Mid-thread turns ("let's say it drops our
 * yearly spending to $125K") rarely repeat the word "retirement"; the caller
 * decides whether the thread is about retirement.
 */
function extractParams(question: string): Omit<RetirementQuestionParams, 'hasRetirementIntent'> {
  const qLower = question.toLowerCase();

  const currentAge = extractCurrentAge(qLower) ?? undefined;
  const retirementAge = extractRetirementAge(qLower) ?? undefined;
  const annualWithdrawalAmount =
    extractAnnualWithdrawalAmount(qLower) ?? extractBareSpendingAnswer(question);

  // Withdrawals start at retirement unless the question says otherwise.
  const withdrawalStartAge = firstNumber(qLower, WITHDRAWAL_START_PATTERNS) ?? retirementAge;
  const lifeExpectancy = firstNumber(qLower, LIFE_EXPECTANCY_PATTERNS);

  return { currentAge, retirementAge, annualWithdrawalAmount, withdrawalStartAge, lifeExpectancy };
}

/**
 * Parse retirement-related parameters from a user question
 */
export function parseRetirementQuestion(question: string): RetirementQuestionParams {
  // Intent and both ages come from the shared matchers; this used to keep its
  // own substring list and returned early when it missed, so "retiring by age
  // 62" produced no parameters at all.
  const hasRetirementIntent = mentionsRetirement(question.toLowerCase());

  if (!hasRetirementIntent) {
    return { hasRetirementIntent: false };
  }

  return { hasRetirementIntent: true, ...extractParams(question) };
}

/**
 * Read the parameters out of the whole conversation, not just the last message.
 *
 * A question is asked over several turns: the number arrives in one ("let's say
 * it drops our yearly spending to about $125K"), the instruction in the next
 * ("re-run my retirement analysis"). Parsing only the current message meant the
 * follow-up looked parameterless and the projection asked for the number again,
 * turn after turn, while it sat one message up in the same thread.
 *
 * The current message always wins; older turns only fill what it leaves blank.
 *
 * Unlike {@link parseRetirementQuestion} this does not require the message
 * itself to mention retiring. "Yes, I can confirm $125K as my target annual
 * spending" is an answer to a retirement question that never repeats the word,
 * and dropping its number because of that is how the loop stayed stuck. Routing
 * decides the thread is about retirement; `hasRetirementIntent` still reports
 * what this one message said, for callers that care.
 *
 * @param question the message being answered
 * @param recentQuestions the user's previous questions, most recent first
 */
export function parseRetirementConversation(
  question: string,
  recentQuestions: readonly string[] = []
): RetirementQuestionParams {
  const merged: RetirementQuestionParams = {
    hasRetirementIntent: mentionsRetirement(question.toLowerCase()),
    ...extractParams(question),
  };
  for (const previous of recentQuestions) {
    // Only the four inputs the projection actually blocks on end the walk;
    // life expectancy is optional and defaults downstream, so waiting for it
    // would keep scanning turns that can no longer change the outcome.
    if (
      merged.currentAge != null &&
      merged.retirementAge != null &&
      merged.annualWithdrawalAmount != null &&
      merged.withdrawalStartAge != null
    ) {
      break;
    }
    if (!previous) continue;
    // Every turn here belongs to one declared decision, so an unrelated salary
    // sentence from another line of questioning cannot reach this loop. The
    // topical gate that used to stand here — and the second extractor added to
    // rescue what it over-blocked — were both guarding against cross-decision
    // bleed that the thread boundary now prevents outright.
    const older = extractParams(previous);
    merged.currentAge = merged.currentAge ?? older.currentAge;
    merged.retirementAge = merged.retirementAge ?? older.retirementAge;
    merged.annualWithdrawalAmount = merged.annualWithdrawalAmount ?? older.annualWithdrawalAmount;
    merged.withdrawalStartAge = merged.withdrawalStartAge ?? older.withdrawalStartAge;
    merged.lifeExpectancy = merged.lifeExpectancy ?? older.lifeExpectancy;
  }

  // A retirement age recovered from an earlier turn still implies its own
  // withdrawal start, the same way it does within a single question.
  merged.withdrawalStartAge = merged.withdrawalStartAge ?? merged.retirementAge;
  return merged;
}
