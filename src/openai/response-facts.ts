import { canonicalFactMap, validateCanonicalFactPack, type CanonicalFactPack } from './canonical-facts';
import { omitInvalidKeyNumbers, sanitizeUngroundedResponse } from './response-grounding';
import type { AskLincResponse, ResponseKeyNumber } from './structured-response';

export interface FactResponseValidationResult {
  valid: boolean;
  issues: string[];
  invalidKeyNumbers: string[];
  invalidSummary: boolean;
}

/** Appended when unverifiable statements were removed but the answer survived. */
export const UNVERIFIED_PROSE_NOTICE =
  'Note: some statements were removed from this answer because their figures could not be verified against your current financial snapshot.';

const FACT_ALIASES: Record<string, string> = {
  investment_total: 'total_investments',
  portfolio_total: 'portfolio_value',
  monthly_income: 'average_monthly_income',
  monthly_expense: 'average_monthly_expenses',
  monthly_expenses: 'average_monthly_expenses',
};

/**
 * Bare numbers below this magnitude are treated as prose, not as money that lost
 * its currency symbol. Ages, planning horizons, account counts, and allocation
 * splits ("a 60/40 mix") live here and are not claims about the user's balances.
 */
const UNTYPED_CLAIM_FLOOR = 1_000;

const MAGNITUDE_MULTIPLIERS: Record<string, number> = {
  thousand: 1_000,
  k: 1_000,
  million: 1_000_000,
  m: 1_000_000,
  billion: 1_000_000_000,
  b: 1_000_000_000,
};

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function approximatelyEqual(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 0.01;
}

/**
 * The place value a number was written at: 0.01 for "2.75", 1 for "996",
 * 10_000 for both "1,920,000" and "1.92 million".
 *
 * Trailing zeros count as rounding, but never past two significant digits, so
 * "$100" still has to land within $10 of a fact rather than within $50.
 */
function displayStep(digits: string, multiplier: number): number {
  const plain = digits.replace(/,/g, '').replace(/^-/, '');
  const decimalPoint = plain.indexOf('.');
  if (decimalPoint >= 0) return Math.pow(10, -(plain.length - decimalPoint - 1)) * multiplier;
  const trailingZeros = /0*$/.exec(plain)?.[0].length ?? 0;
  const significantFloor = Math.max(0, plain.length - 2);
  return Math.pow(10, Math.min(trailingZeros, significantFloor)) * multiplier;
}

function roundToStep(value: number, step: number): number {
  const scaled = value / step;
  return (scaled >= 0 ? Math.round(scaled) : -Math.round(-scaled)) * step;
}

/**
 * A written number is grounded when it is a canonical fact rounded to the
 * precision it was written at. "$996" and "9%" are the honest way to say
 * 995.5699… and 9.18094…, and the answer should not be thrown away for it.
 */
function matchesAtWrittenPrecision(claim: number, fact: number, step: number): boolean {
  if (approximatelyEqual(claim, fact)) return true;
  if (!(step > 0)) return false;
  return approximatelyEqual(roundToStep(fact, step), claim);
}

/** Replace model-authored metadata with the exact server-side fact contract. */
export function canonicalizeResponseNumbers(
  response: AskLincResponse,
  pack: CanonicalFactPack
): AskLincResponse {
  if (!response.key_numbers) return response;
  const facts = canonicalFactMap(pack);
  const keyNumbers: Record<string, ResponseKeyNumber> = {};
  for (const [key, metric] of Object.entries(response.key_numbers)) {
    const normalized = normalizedKey(key);
    const value = typeof metric === 'number' ? metric : metric.value;
    const provenance = typeof metric === 'number' ? '' : metric.provenance;
    const factId = provenance || FACT_ALIASES[normalized] || normalized;
    const fact = facts.get(factId);
    // A cited fact rounded for readability still resolves to the exact fact.
    const cites = fact && fact.displayable !== false &&
      matchesAtWrittenPrecision(value, fact.value, displayStep(String(value), 1));
    keyNumbers[key] = cites
      // The label travels with the id rather than being looked up again at
      // render time: the fact pack is server-side, and the client has only
      // what this contract hands it.
      ? { value: fact!.value, unit: fact!.unit, provenance: fact!.id, provenanceLabel: fact!.label }
      : typeof metric === 'number'
        ? { value: metric, unit: fact?.unit || 'usd', provenance }
        // Drop any model-authored label: unverified metadata is exactly what
        // this function exists to replace.
        : { ...metric, provenanceLabel: undefined };
  }
  return { ...response, key_numbers: keyNumbers };
}

/** Skip 401(k) / S&P 500 / Rule of 72 style labels that are not financial claims. */
function isNumericIdentifier(prose: string, index: number, rawValue: string): boolean {
  const before = prose.slice(Math.max(0, index - 16), index);
  const after = prose.slice(index + rawValue.length, index + rawValue.length + 16);
  const digits = rawValue.trim().replace(/,/g, '').replace(/^-/, '').toLowerCase();
  if (/^(?:401|403|457)$/.test(digits) && /^\s*\(\s*[a-z]\s*\)/i.test(after)) return true;
  if (digits === '500' && /S\s*&\s*P\s*$/i.test(before)) return true;
  if (digits === '100' && /Nasdaq\s*-?\s*$/i.test(before)) return true;
  if (digits === '2000' && /Russell\s*$/i.test(before)) return true;
  if (digits === '30' && /Dow\s*$/i.test(before)) return true;
  if (digits === '1099' && /Form\s*$/i.test(before)) return true;
  if (digits === '2' && /W\s*-?\s*$/i.test(before)) return true;
  if (digits === '10' && /^\s*-\s*[KQ]\b/i.test(after)) return true;
  if (digits === '529' && /^\s+plan\b/i.test(after)) return true;
  return digits === '72' && /Rule\s+of\s*$/i.test(before);
}

/** 401k / 403b / 457b share a magnitude suffix with "401 thousand". */
function isAccountTypeAbbreviation(digits: string, magnitude: string): boolean {
  const plain = digits.replace(/,/g, '');
  if (magnitude === 'k' && /^(401|403|457)$/.test(plain)) return true;
  return magnitude === 'b' && /^(403|457)$/.test(plain);
}

interface ProseClaim {
  value: number;
  /** Present when the claim carries an explicit unit; bare numbers stay undefined. */
  unit?: 'usd' | 'percent';
  step: number;
  hasMagnitude: boolean;
  /** True when a dash joined this number to the one before it ("$1,400-2,029"). */
  rangeLinked: boolean;
  identifier: boolean;
  calendarYear: boolean;
}

// A bare number below the floor is still money when the sentence says so:
// "afford 900 per month" is a claim, "save 3 years of expenses" is not.
const MONEY_VERB_BEFORE =
  /\b(?:afford|save|saves|saving|spend|spends|spending|pay|pays|paying|contribute|contributes|contributing|withdraw|withdraws|withdrawing|invest|invests|investing|budget|budgeting|cost|costs|costing|owe|owes)\s+(?:about\s+|roughly\s+|around\s+|another\s+|up\s+to\s+|an?\s+extra\s+)?$/i;
const PER_PERIOD_AFTER = /^\s*(?:\/|per\s+|an?\s+|each\s+|every\s+)(?:month|year|week|quarter|day|paycheck|pay\s+period)\b/i;
const NON_MONEY_NOUN_AFTER =
  /^\s*(?:years?|months?|weeks?|days?|decades?|times|holdings?|accounts?|positions?|shares?|securities|funds?|people|percent|percentage)\b/i;

const NUMBER_PATTERN = /\d[\d,]*(?:\.\d+)?/g;
const MAGNITUDE_WORD = /^\s*(thousand|million|billion)\b/i;
// An attached (or single-space) k/m/b only. Without this, "40 mix" reads as
// 40 million and "-100,000 buffer" reads as 100 billion.
const MAGNITUDE_SUFFIX = /^ ?([kmb])\b/i;

/**
 * Find every number written in prose, with its unit, sign, and written precision.
 *
 * A dash between two digits separates a range rather than negating the right
 * side: "2026-2029" is two calendar years, not the year 2026 and -2029.
 */
function scanProseClaims(prose: string): ProseClaim[] {
  const claims: ProseClaim[] = [];
  for (const match of prose.matchAll(NUMBER_PATTERN)) {
    const start = match.index ?? 0;
    const digits = match[0];
    let end = start + digits.length;

    const trailing = prose.slice(end);
    const word = MAGNITUDE_WORD.exec(trailing);
    const suffix = word ? null : MAGNITUDE_SUFFIX.exec(trailing);
    let magnitude: string | undefined;
    if (word) {
      magnitude = word[1].toLowerCase();
      end += word[0].length;
    } else if (suffix && !isAccountTypeAbbreviation(digits, suffix[1].toLowerCase())) {
      magnitude = suffix[1].toLowerCase();
      end += suffix[0].length;
    }
    const multiplier = magnitude ? MAGNITUDE_MULTIPLIERS[magnitude] : 1;

    const before = prose.slice(0, start);
    const hasDollar = /\$\s*$/.test(before);
    const beforeDollar = before.replace(/\$\s*$/, '');
    const dash = /([-–—])\s*$/.exec(beforeDollar);
    let negative = false;
    let rangeLinked = false;
    if (dash) {
      const beforeDash = beforeDollar.slice(0, beforeDollar.length - dash[0].length);
      // An en/em dash never negates; a hyphen only negates when a digit is not
      // sitting in front of it.
      if (dash[1] !== '-' || /\d\s*$/.test(beforeDash)) rangeLinked = true;
      else negative = true;
    }

    const after = prose.slice(end);
    let unit: 'usd' | 'percent' | undefined;
    if (hasDollar) unit = 'usd';
    if (/^\s*%/.test(after)) unit = 'percent';
    else if (/^\s*percent(?:age)?\b/i.test(after)) unit = 'percent';
    else if (/^\s*dollars?\b/i.test(after)) unit = 'usd';

    const written = Number(digits.replace(/,/g, ''));
    const value = (negative ? -1 : 1) * written * multiplier;
    if (!unit && !NON_MONEY_NOUN_AFTER.test(after) &&
      (MONEY_VERB_BEFORE.test(before) || PER_PERIOD_AFTER.test(after))) {
      unit = 'usd';
    }
    claims.push({
      value,
      unit,
      step: displayStep(digits, multiplier),
      hasMagnitude: magnitude !== undefined,
      rangeLinked,
      identifier: isNumericIdentifier(prose, start, digits),
      calendarYear: !magnitude && !negative && Number.isInteger(value) && value >= 1900 && value <= 2099,
    });
  }

  // Both ends of a range share a unit: "$50,000-100,000" and "10-15%".
  for (let i = 1; i < claims.length; i++) {
    if (claims[i].rangeLinked && !claims[i].unit) claims[i].unit = claims[i - 1].unit;
  }
  for (let i = claims.length - 1; i > 0; i--) {
    if (claims[i].rangeLinked && claims[i].unit && !claims[i - 1].unit) {
      claims[i - 1].unit = claims[i].unit;
    }
  }
  return claims;
}

/** Claims worth checking: everything with a unit, plus bare money-sized numbers. */
function claimNeedsGrounding(claim: ProseClaim): boolean {
  if (claim.identifier) return false;
  if (claim.unit) return true;
  if (claim.calendarYear) return false;
  return claim.hasMagnitude || Math.abs(claim.value) >= UNTYPED_CLAIM_FLOOR;
}

function claimIsSupported(claim: ProseClaim, pack: CanonicalFactPack): boolean {
  return pack.facts.some((fact) =>
    fact.displayable !== false &&
    (claim.unit === undefined || fact.unit === claim.unit) &&
    matchesAtWrittenPrecision(claim.value, fact.value, claim.step));
}

function unsupportedClaims(prose: string, pack: CanonicalFactPack): ProseClaim[] {
  return scanProseClaims(prose)
    .filter(claimNeedsGrounding)
    .filter((claim) => !claimIsSupported(claim, pack));
}

const UNSUPPORTED_VALUE_SUFFIX = 'is not present in the canonical fact pack.';

/** One format, written once, so a reader of these issues cannot drift from the writer. */
function unsupportedValuePrefix(kind: string): string {
  return `User-facing ${kind} value `;
}

function claimIssue(claim: ProseClaim): string {
  const kind = claim.unit ?? 'numeric';
  return `${unsupportedValuePrefix(kind)}${claim.value} ${UNSUPPORTED_VALUE_SUFFIX}`;
}

/**
 * True when the model reached for a number nobody supplied — the signature of a
 * missing fact, as opposed to a miscited or malformed one.
 */
export function hasUnsupportedValueIssue(issues: readonly string[]): boolean {
  return issues.some((issue) => issue.endsWith(UNSUPPORTED_VALUE_SUFFIX));
}

/**
 * True when one of the numbers nobody supplied was a percentage.
 *
 * Which tier could have supplied a missing number is not knowable from the
 * number itself, but its unit narrows it usefully. Inflation, the fed funds
 * rate, mortgage and CD yields, tax brackets, contribution limits expressed as
 * rates — the figures the outside-context tiers carry — are percentages. A
 * missing dollar amount is almost always personal: a balance, a transaction, a
 * projection total. Widening the external tiers for one of those would spend a
 * search call on nearly every escalation and teach the routing metrics nothing.
 */
export function hasUnsupportedPercentValue(issues: readonly string[]): boolean {
  const prefix = unsupportedValuePrefix('percent');
  return issues.some((issue) => issue.startsWith(prefix) && issue.endsWith(UNSUPPORTED_VALUE_SUFFIX));
}

function proseFields(response: AskLincResponse): string[] {
  return [response.summary, ...(response.insights || []), ...(response.suggested_actions || [])];
}

/** Validate every structured number and every money/percentage in user-facing prose. */
export function validateResponseFacts(
  response: AskLincResponse,
  pack: CanonicalFactPack
): FactResponseValidationResult {
  const issues = validateCanonicalFactPack(pack);
  const invalidKeyNumbers: string[] = [];
  let invalidSummary = !response.summary?.trim();
  if (invalidSummary) issues.push('The response summary is empty.');
  const facts = canonicalFactMap(pack);

  for (const [key, metric] of Object.entries(response.key_numbers || {})) {
    const normalizedMetric = typeof metric === 'number'
      ? { value: metric, unit: 'usd' as const, provenance: '' }
      : metric;
    const fact = facts.get(normalizedMetric.provenance);
    if (!fact || fact.displayable === false) {
      issues.push(`${key} does not cite a canonical fact.`);
      invalidKeyNumbers.push(key);
      continue;
    }
    if (!approximatelyEqual(normalizedMetric.value, fact.value)) {
      issues.push(`${key} must equal cited fact ${fact.id}.`);
      invalidKeyNumbers.push(key);
    }
    if (normalizedMetric.unit !== fact.unit) {
      issues.push(`${key} must use unit ${fact.unit}.`);
      invalidKeyNumbers.push(key);
    }
  }

  for (const claim of unsupportedClaims(proseFields(response).join('\n'), pack)) {
    issues.push(claimIssue(claim));
    invalidSummary = true;
  }

  if (invalidKeyNumbers.length > 0) invalidSummary = true;
  return {
    valid: issues.length === 0,
    issues: Array.from(new Set(issues)),
    invalidKeyNumbers: Array.from(new Set(invalidKeyNumbers)),
    invalidSummary,
  };
}

/**
 * Multi-letter abbreviations that are never the last word of a sentence.
 *
 * Single-letter initialisms ("U.S.", "e.g.") are caught by the letter test in
 * `isAbbreviationPeriod`; these are the ones that survive it.
 *
 * The bar for membership is narrow on purpose. An entry here overrides every
 * other signal, so it may only hold shortenings that always govern something
 * after them: "vs. Treasury bills", "approx. $40,000", "Ms. Chen". Shortenings
 * that can close a sentence -- "etc.", "Acme Inc.", "the Treasury Dept." --
 * are deliberately absent, because they need no entry: when one of them really
 * is mid-sentence, the text after it continues in lowercase and
 * `continuesInLowercase` holds the sentence together on that evidence instead.
 */
const NEVER_SENTENCE_FINAL_ABBREVIATIONS = new Set([
  'approx', 'cf', 'dr', 'est', 'incl', 'mr', 'mrs', 'ms', 'vs',
]);

/** "U.S." and "e.g." end in a single letter; a real sentence rarely does. */
function isAbbreviationPeriod(text: string, index: number, punctuation: string): boolean {
  if (punctuation !== '.') return false;
  const before = text.slice(0, index);
  if (/(?:^|[^A-Za-z])[A-Za-z]$/.test(before)) return true;
  const word = /([A-Za-z]+)$/.exec(before)?.[1];
  return word !== undefined && NEVER_SENTENCE_FINAL_ABBREVIATIONS.has(word.toLowerCase());
}

/**
 * True while the punctuation at `index` sits inside a bracket that opened
 * earlier in the text. "(average income of $9,000 vs. expenses of $12,000)"
 * is one parenthetical: cutting it in half leaves a stray ")" behind.
 */
function isInsideBrackets(text: string, index: number): boolean {
  let depth = 0;
  for (let i = 0; i < index; i++) {
    const character = text[i];
    if (character === '(' || character === '[') depth++;
    else if ((character === ')' || character === ']') && depth > 0) depth--;
  }
  return depth > 0;
}

/**
 * A sentence starts with a capital, a digit, or a symbol — never a lowercase
 * word. When the text after the punctuation continues in lowercase, the period
 * belonged to an abbreviation this module has not enumerated.
 *
 * A ticker-style brand is the exception that does open a sentence in
 * lowercase: "iShares", "eBay", "eTrade". The capital later in the word marks
 * it as a name rather than an ordinary word, and answers about a portfolio
 * name such funds often enough that merging there would cost a grounded
 * sentence.
 */
function continuesInLowercase(text: string, end: number): boolean {
  const nextWord = /^\s+([a-z][A-Za-z'’]*)/.exec(text.slice(end))?.[1];
  return nextWord !== undefined && !/[A-Z]/.test(nextWord);
}

/**
 * Split on sentence punctuation that ends a sentence. A period inside "$1.92"
 * is followed by a digit, so decimals stay intact.
 *
 * Every test here errs toward keeping text together, because these sentences
 * are the unit that grounding removes: an over-eager split hands the user the
 * back half of a sentence whose subject was just deleted, while an under-eager
 * one only removes a clause that would have survived on its own.
 */
function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?]+(?=\s|$)/g)) {
    const index = match.index ?? 0;
    if (isAbbreviationPeriod(text, index, match[0])) continue;
    if (isInsideBrackets(text, index)) continue;
    const end = index + match[0].length;
    if (continuesInLowercase(text, end)) continue;
    sentences.push(text.slice(start, end));
    start = end;
  }
  if (start < text.length) sentences.push(text.slice(start));
  return sentences;
}

/** Guards against a stray fragment ("U.S.") passing for a surviving answer. */
function hasSubstantiveContent(text: string): boolean {
  return (text.match(/[A-Za-z0-9$][^\s]*/g) || []).length >= 3;
}

/**
 * A sentence that opens by pointing back at the one before it. "Your equity
 * allocation is 59%. That's risky this close to retirement." — remove the first
 * and the second is left referring to nothing.
 *
 * Anchored on a demonstrative used as a subject, so a determiner keeps its
 * sentence: "This means you are over-weighted" depends on what came before,
 * "This year, review your beneficiaries" does not. Bare "it" and "they" are
 * left out entirely — they are as often a dummy subject as a reference, and
 * deleting sound advice is worse than leaving a loose sentence.
 */
const DEPENDENT_OPENER = new RegExp(
  String.raw`^\s*(?:` +
    String.raw`(?:that|this|these|those)\s*(?:'s|’s|\b(?:is|are|was|were|means|leaves|makes|puts|gives|adds|brings|represents|reflects|suggests|would|will|could|should|can|may|might)\b)` +
    String.raw`|which\b|doing so\b|as a result\b|hence\b|therefore\b` +
  String.raw`)`,
  'i'
);

/**
 * A sentence salvage cut out of the delivered answer, recorded so an admin can
 * see what the user did not receive and why. `unsupportedValues` names the
 * numbers that failed grounding, in the same wording as the validation issues.
 */
export interface RemovedProseSentence {
  field: 'summary' | 'insight' | 'suggested_action';
  /** Position within insights/suggested_actions; absent for the summary. */
  index?: number;
  text: string;
  reason: 'unsupported_value' | 'dependent_on_removed';
  unsupportedValues?: string[];
}

/** A key number dropped because it did not cite, match, or unit-match a fact. */
export interface RemovedKeyNumber {
  key: string;
  value: number | null;
  unit?: string;
  provenance?: string;
  issues: string[];
}

/** What salvage removed from an answer before the user saw it. */
export interface SalvageRemovals {
  sentences: RemovedProseSentence[];
  keyNumbers: RemovedKeyNumber[];
  /** The discarded summary, present only when the whole answer was replaced. */
  replacedSummary?: string;
}

/** "$120,000" reads better in a removal record than the bare parsed value. */
function describeClaim(claim: ProseClaim): string {
  if (claim.unit === 'usd') return `$${claim.value.toLocaleString('en-US')}`;
  if (claim.unit === 'percent') return `${claim.value}%`;
  return String(claim.value);
}

/**
 * Drop only the sentences carrying an unverifiable number; keep the rest.
 *
 * `startsAfterRemoval` carries the previous entry's state in, because insights
 * arrive as separate array items and a claim and its dependent sentence are
 * just as likely to be two bullets as two sentences in one.
 */
function stripSentences(
  text: string,
  pack: CanonicalFactPack,
  startsAfterRemoval = false
): { text: string; removed: RemovedSentenceReason[]; endedRemoved: boolean } {
  const kept: string[] = [];
  const removed: RemovedSentenceReason[] = [];
  let previousRemoved = startsAfterRemoval;
  for (const sentence of splitSentences(text)) {
    const unsupported = sentence.trim() ? unsupportedClaims(sentence, pack) : [];
    if (unsupported.length > 0) {
      removed.push({
        text: sentence.trim(),
        reason: 'unsupported_value',
        unsupportedValues: Array.from(new Set(unsupported.map(describeClaim))),
      });
      previousRemoved = true;
      continue;
    }
    // Its antecedent just went; on its own it reads as a fragment, and a
    // reviewer or a user will read it as one.
    if (previousRemoved && sentence.trim() && DEPENDENT_OPENER.test(sentence)) {
      removed.push({ text: sentence.trim(), reason: 'dependent_on_removed' });
      continue;
    }
    previousRemoved = false;
    kept.push(sentence);
  }
  // Close the gaps left by removed sentences without flattening paragraphs.
  const joined = kept.join('').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { text: joined, removed, endedRemoved: previousRemoved };
}

type RemovedSentenceReason = Omit<RemovedProseSentence, 'field' | 'index'>;

export function stripUnverifiedProse(
  response: AskLincResponse,
  pack: CanonicalFactPack
): { response: AskLincResponse; removed: number; removedSentences: RemovedProseSentence[] } {
  const removedSentences: RemovedProseSentence[] = [];
  /** Each list is its own chain; a bullet can depend on the bullet above it. */
  const stripList = (items: readonly string[], field: 'insight' | 'suggested_action'): string[] => {
    let carriedRemoval = false;
    const kept: string[] = [];
    items.forEach((item, index) => {
      const result = stripSentences(item, pack, carriedRemoval);
      removedSentences.push(...result.removed.map((sentence) => ({ field, index, ...sentence })));
      carriedRemoval = result.endedRemoved || (result.text.trim() === '' && item.trim() !== '');
      if (result.text) kept.push(result.text);
    });
    return kept;
  };

  const summaryResult = stripSentences(response.summary || '', pack);
  removedSentences.push(...summaryResult.removed.map((sentence) => ({ field: 'summary' as const, ...sentence })));
  return {
    response: {
      ...response,
      summary: summaryResult.text,
      insights: stripList(response.insights || [], 'insight'),
      suggested_actions: stripList(response.suggested_actions || [], 'suggested_action'),
    },
    removed: removedSentences.length,
    removedSentences,
  };
}

/**
 * Keep as much of a failed answer as is provably grounded.
 *
 * Verified key numbers and verified sentences are worth more to the user than
 * the "try again" placeholder, so the placeholder is reserved for the case where
 * the summary itself does not survive.
 */
export function salvageUngroundedResponse(
  response: AskLincResponse,
  pack: CanonicalFactPack,
  result: FactResponseValidationResult
): AskLincResponse {
  return salvageUngroundedResponseWithDetail(response, pack, result).response;
}

/** Which key numbers were dropped, and what each of them was cited as. */
function describeRemovedKeyNumbers(
  response: AskLincResponse,
  result: FactResponseValidationResult
): RemovedKeyNumber[] {
  return result.invalidKeyNumbers.map((key) => {
    const metric = response.key_numbers?.[key];
    const normalized = typeof metric === 'number' ? { value: metric } : metric;
    return {
      key,
      value: typeof normalized?.value === 'number' ? normalized.value : null,
      ...(normalized && 'unit' in normalized && normalized.unit ? { unit: normalized.unit } : {}),
      ...(normalized && 'provenance' in normalized && normalized.provenance
        ? { provenance: normalized.provenance }
        : {}),
      issues: result.issues.filter((issue) => issue.startsWith(`${key} `)),
    };
  });
}

/**
 * Salvage, with a record of everything it took out.
 *
 * The delivered answer only shows what survived, so the removals are the one
 * place an admin can see what the safeguards actually caught.
 */
export function salvageUngroundedResponseWithDetail(
  response: AskLincResponse,
  pack: CanonicalFactPack,
  result: FactResponseValidationResult
): { response: AskLincResponse; removals: SalvageRemovals } {
  const base = omitInvalidKeyNumbers(response, result.invalidKeyNumbers);
  const { response: stripped, removed, removedSentences } = stripUnverifiedProse(base, pack);
  const keyNumbers = describeRemovedKeyNumbers(response, result);
  if (!hasSubstantiveContent(stripped.summary || '')) {
    return {
      response: sanitizeUngroundedResponse(base, result),
      removals: {
        sentences: removedSentences,
        keyNumbers,
        ...(response.summary?.trim() ? { replacedSummary: response.summary.trim() } : {}),
      },
    };
  }
  const removals: SalvageRemovals = { sentences: removedSentences, keyNumbers };
  // Nothing was cut from the prose, so dropping the miscited key numbers was enough.
  if (removed === 0) return { response: stripped, removals };
  return {
    response: { ...stripped, summary: `${stripped.summary.trim()}\n\n${UNVERIFIED_PROSE_NOTICE}` },
    removals,
  };
}
