/**
 * The machinery both public calculators use to have a model read their result.
 *
 * `/retirement-calculator` and `/coast-fire-calculator` each compute their own
 * figures deterministically and then ask a model to say what those figures
 * mean. The prose differs — one is a survival rate across a century of tested
 * histories, the other a single discounted target — but the contract around it
 * is identical, and it is the contract rather than the prose that is delicate:
 *
 *  - Every number in the draft is checked against the figures the engine
 *    produced, at the precision the draft actually wrote them to.
 *  - A draft that fails is sent back once with the offending tokens named,
 *    and then dropped. The page's deterministic answer is already complete, so
 *    a reading that cannot be grounded costs a paragraph rather than being
 *    shown wrong.
 *  - The whole thing sits behind one budget, because a visitor is waiting.
 *
 * This module owns that contract. Each calculator supplies its own facts, its
 * own system prompt, and its own run block; nothing here knows what a Coast
 * FIRE number or a survival rate is.
 */

import * as Sentry from '@sentry/node';
import { askClaude } from '../openai/claude-client';
import { getActiveModel, getActiveNumericGenerationSetting } from '../openai/model-config';

/* ------------------------------------------------------------------ *
 * Facts
 * ------------------------------------------------------------------ */

/**
 * One figure the model is allowed to state, and the ways it may write it.
 *
 * The prompt lines and the grounding allowlist are both derived from this
 * array, so a fact the model is shown is exactly a fact it may repeat and
 * there is no second list to drift.
 */
export interface CalculatorFact {
  label: string;
  /** How the fact is written into the prompt. */
  display: string;
  /** Values a plain or money token may carry for this fact. */
  values?: number[];
  /** Values a percentage token may carry for this fact. */
  percentValues?: number[];
}

export function moneyFact(label: string, value: number): CalculatorFact {
  return {
    label,
    display: `$${Math.round(value).toLocaleString('en-US')}`,
    // Both the exact figure and the rounded one it is displayed as: a draft
    // may legitimately repeat either, and the rounding tolerance below is
    // half a unit at the precision written, not half a unit of the source.
    values: [value, Math.round(value)],
  };
}

/**
 * A money figure a reader would naturally write without its sign — "$79,000
 * short" for a shortfall of −$79,000. Both signs are licensed, because the
 * sentence carries the direction in words and the page itself writes the
 * absolute value.
 */
export function signedMoneyFact(label: string, value: number): CalculatorFact {
  const rounded = Math.round(value);
  return {
    label,
    display: `$${Math.abs(rounded).toLocaleString('en-US')}`,
    values: [value, rounded, -value, -rounded],
  };
}

export function countFact(label: string, value: number): CalculatorFact {
  return { label, display: value.toLocaleString('en-US'), values: [value] };
}

export function percentFact(label: string, fraction: number, digits = 1): CalculatorFact {
  return {
    label,
    display: `${(fraction * 100).toFixed(digits)}%`,
    // The same fact in the two forms a writer reaches for. A percentage token
    // is checked against `percentValues` only, so "98.7%" can never be
    // satisfied by a dollar amount that happens to be 98.7.
    values: [fraction],
    percentValues: [fraction * 100],
  };
}

/**
 * A rate already expressed in percentage points — "5% real return" is stored
 * as 5, not as 0.05.
 *
 * The percentage-point figure is licensed as a *percentage* only, never as a
 * plain number, for the reason the published-rate labels carry no digits: a
 * bare 5 in the plain allowlist licenses "over the next 5 years" and "$5 a
 * year", neither of which this run produced. A draft writing the rate without
 * its sign — "a withdrawal rate of 4" — is rejected and asked again, which is
 * the right trade for a phrasing nobody reaches for.
 */
export function rateFact(label: string, percent: number, digits = 1): CalculatorFact {
  return {
    label,
    display: `${percent.toFixed(digits)}%`,
    values: [percent / 100],
    percentValues: [percent],
  };
}

export function plainFact(label: string, display: string, values: number[] = []): CalculatorFact {
  return { label, display, values };
}

/**
 * A published rate, as the prompt should carry it.
 *
 * Everything a fact shows the model is a number the model may then write, the
 * label and the date included — so both are written to carry as few digits as
 * they can. The series labels are stored without digits (`thirty-year
 * Treasury yield`, not `30-year`), and the observation date is given to the
 * month, because a day-precision date licenses two more small integers and a
 * reader of a thirty-year projection has no use for the day.
 *
 * What is left licensed is the rate itself and a four-digit year, which is not
 * a figure anyone will mistake for a dollar amount or a horizon.
 */
export function marketRateFact(rate: {
  percent: number;
  asOf: string;
  label: string;
  source: string;
}): CalculatorFact {
  const asOf = monthAndYear(rate.asOf);
  const year = /^(\d{4})/.exec(rate.asOf)?.[1];
  return {
    label: `Today, for context — ${rate.label} (${rate.source})`,
    display: `${rate.percent.toFixed(2)}%, as of ${asOf}`,
    values: [rate.percent / 100, ...(year ? [Number(year)] : [])],
    percentValues: [rate.percent],
  };
}

/** `2026-09-15` as `September 2026`; anything else is passed through. */
function monthAndYear(date: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(date);
  if (!match) return date;
  const month = MONTH_NAMES[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : date;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** `1926-07` as prose, with both the year and the month number licensed. */
export function monthFact(label: string, month: string): CalculatorFact {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return plainFact(label, month);
  return {
    label,
    display: `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}`,
    values: [Number(match[1]), Number(match[2])],
  };
}

/* ------------------------------------------------------------------ *
 * Grounding
 * ------------------------------------------------------------------ */

/**
 * A number as the model wrote it.
 *
 * `halfWidth` is what rounding to the precision actually written permits: a
 * figure given as "$3.3M" is any value within $50,000 of 3,300,000, while the
 * same figure as "$3,326,192" is within half a dollar. Checking against a flat
 * tolerance would either reject honest rounding or accept a wrong million.
 */
export interface NumericToken {
  raw: string;
  value: number;
  halfWidth: number;
  isPercent: boolean;
}

const MAGNITUDES: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  m: 1_000_000,
  million: 1_000_000,
  b: 1_000_000_000,
  billion: 1_000_000_000,
};

/**
 * The precision a written figure actually commits to.
 *
 * Decimals state it outright. Trailing zeros state it too — "$140,000" is a
 * figure rounded to the nearest ten thousand, and reading it as exact to the
 * dollar rejects the most ordinary sentence a writer can produce. Rates are
 * the exception: trailing zeros mean nothing in "100%", and widening there
 * would let a round number stand in for a materially different one.
 *
 * The widening stops at two significant figures, so "$3M" cannot stand for
 * $3.36M. Within that bound an accepted figure is a correct rounding of a
 * figure the engine computed, which is exactly what the prompt licenses.
 */
function writtenStep(digits: string, decimals: number, multiplier: number, isPercent: boolean): number {
  if (decimals > 0) return Math.pow(10, -decimals) * multiplier;
  if (isPercent) return 1;

  const trailingZeros = /0*$/.exec(digits)?.[0].length ?? 0;
  const written = Math.pow(10, trailingZeros) * multiplier;
  const value = Math.abs(Number(digits) * multiplier);
  const significantFigures = value >= 1 ? Math.floor(Math.log10(value)) + 1 : 1;
  const twoSignificantFigures = Math.pow(10, Math.max(0, significantFigures - 2));
  return Math.min(written, twoSignificantFigures);
}

/**
 * Every number in a piece of prose.
 *
 * The magnitude suffix has to be followed by a non-letter, or "3 months"
 * reads as three million and a draft that said something ordinary is rejected
 * for a figure it never wrote. A rate spelled out as "percent" is read as the
 * percentage it is, so it is checked against the percentage facts rather than
 * falling through to the dollar amounts.
 */
export function extractNumericTokens(text: string): NumericToken[] {
  /*
   * The sign is captured rather than skipped. Starting the match at the first
   * digit reads "-5%" as "5%" and "$-48,000" as "$48,000", and since the
   * positive figure is usually in the allowlist — 5% is the cash weight,
   * $48,000 the contributions — a draft stating the opposite of a fact would
   * pass the check that exists to catch exactly that.
   *
   * Both sign positions refuse a hyphen that follows a digit, so the one in
   * "30-year" or "1926-1985" stays a hyphen. An en dash is never a sign, for
   * the same reason: it is how a range is written.
   */
  const pattern = new RegExp(
    String.raw`(?:(?<![\d.,])(?<neg>[-−])\s*)?` +
    String.raw`(?<dollar>\$\s*)?` +
    String.raw`(?:(?<![\d.,])(?<negAfterDollar>[-−])\s*)?` +
    String.raw`(?<num>\d[\d,]*(?:\.\d+)?|\.\d+)` +
    String.raw`\s*(?<magnitude>thousand|million|billion|[kmb])?(?![a-z])` +
    String.raw`\s*(?<percent>%|percent\b)?`,
    'gi'
  );

  const tokens: NumericToken[] = [];
  for (const match of text.matchAll(pattern)) {
    const groups = match.groups ?? {};
    const plain = (groups.num ?? '').replace(/,/g, '');
    const base = Number(plain);
    if (!Number.isFinite(base)) continue;

    const multiplier = groups.magnitude
      ? MAGNITUDES[groups.magnitude.toLowerCase()] ?? 1
      : 1;
    const dot = plain.indexOf('.');
    const decimals = dot === -1 ? 0 : plain.length - dot - 1;
    const isPercent = Boolean(groups.percent);
    const negative = Boolean(groups.neg || groups.negAfterDollar);
    // Trailing zeros are read off the integer part only: the "0" ending
    // "3.10" says something about the decimals, which are already counted.
    const integerDigits = dot === -1 ? plain : plain.slice(0, dot);

    tokens.push({
      raw: match[0].trim(),
      value: (negative ? -base : base) * multiplier,
      halfWidth: 0.5 * writtenStep(integerDigits, decimals, multiplier, isPercent),
      isPercent,
    });
  }
  return tokens;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const MAGNITUDE_WORDS: Record<string, number> = {
  hundred: 100, thousand: 1_000, million: 1_000_000, billion: 1_000_000_000,
};

const ANY_NUMBER_WORD = [...Object.keys(NUMBER_WORDS), ...Object.keys(MAGNITUDE_WORDS)].join('|');

/**
 * Whether the prose running up to a match ends in a number word, which is what
 * separates a spelled decimal from the ordinary English noun: "five point five
 * percent" is a figure, "at this point five years remain" is a sentence.
 */
function endsInNumberWord(before: string): boolean {
  const word = /([a-z]+)[-\s]*$/i.exec(before)?.[1]?.toLowerCase();
  return word !== undefined && (word in NUMBER_WORDS || word in MAGNITUDE_WORDS);
}

/**
 * A quantity spelled out in words, attached to a unit that makes it a claim.
 *
 * The tokenizer above reads digits, and the prompts ask for small counts as
 * words so that every digit on the page is a licensed figure. That leaves
 * spelled quantities unexamined: "a ninety percent chance" states a figure no
 * run produced and contains no digit to check.
 *
 * These are read as numbers and checked like any other, rather than refused on
 * sight. Refusing was the first attempt and it contradicted the instruction
 * that produces them: "seven years between retiring and claiming" is a small
 * count written as a word, exactly as rule 2 asks, and the figure behind it is
 * licensed — so rejecting the draft taught the model nothing it could act on
 * and dropped panels that were telling the truth.
 *
 * The line is still the unit. "Two levers" and "a third of the answer" carry no
 * quantity and are not read at all; "seven years", "ninety percent" and "two
 * million dollars" are quantities, and they now stand or fall on whether the
 * engine produced them.
 *
 * The separator before the unit is whitespace, never a hyphen, so the compound
 * adjective in "the thirty-year Treasury yield" — which is how the fact block
 * names the series — stays prose rather than becoming a figure. A hyphen
 * *inside* the number ("twenty-five years") is still read.
 */
const SPELLED_FIGURE = new RegExp(
  // Captured, never skipped. Without this the match restarts inside the phrase
  // and validates its tail: "negative five percent" and "five point five
  // percent" both reduced to a bare "five percent", so a draft stating the
  // opposite of a licensed rate, or a materially different one, passed the
  // check that exists to catch exactly that. The digit tokenizer captures its
  // sign for the same reason.
  String.raw`\b(?:(negative|minus|plus|point)[-\s])?` +
  String.raw`((?:${ANY_NUMBER_WORD})(?:[-\s](?:${ANY_NUMBER_WORD}))*)` +
  String.raw`\s+(%|percent|per cent|years?|months?|dollars?|hundred|thousand|million|billion)\b`,
  'gi'
);

/**
 * "twenty-five" -> 25, "one hundred thousand" -> 100000, and the magnitude the
 * phrase was written to.
 *
 * Magnitudes scale the group in front of them rather than adding alongside it,
 * which is how English works and is not what the first version did: it read
 * "one hundred thousand dollars" as 1,100 and "three hundred million" as
 * 1,000,300 — rejecting a truthful $100,000 while leaving a run that happened
 * to license $1,100 able to accept it.
 *
 * "Hundred" scales the running group; a thousand or more closes it out.
 */
function readNumberWords(phrase: string): { value: number; multiplier: number } | null {
  const words = phrase.toLowerCase().split(/[-\s]+/).filter(Boolean);
  let total = 0;
  let group = 0;
  let multiplier = 1;
  let sawNumber = false;

  for (const word of words) {
    if (word in NUMBER_WORDS) {
      group += NUMBER_WORDS[word];
      sawNumber = true;
      continue;
    }
    const magnitude = MAGNITUDE_WORDS[word];
    if (magnitude === undefined) return null;
    // A bare "million dollars" reads as one of them, the way a writer means it.
    if (magnitude >= 1_000) {
      total += (group === 0 ? 1 : group) * magnitude;
      group = 0;
    } else {
      group = (group === 0 ? 1 : group) * magnitude;
    }
    multiplier = Math.max(multiplier, magnitude);
    sawNumber = true;
  }

  if (!sawNumber) return null;
  return { value: total + group, multiplier };
}

/**
 * Every spelled-out quantity in a piece of prose, as a token the grounder can
 * check against the facts exactly like a written one.
 */
export function extractSpelledFigures(text: string): NumericToken[] {
  const tokens: NumericToken[] = [];
  for (const match of text.matchAll(SPELLED_FIGURE)) {
    const modifier = match[1]?.toLowerCase();
    const read = readNumberWords(match[2]);
    if (!read) continue;

    const unit = match[3].toLowerCase();
    const isPercent = unit === '%' || unit === 'percent' || unit === 'per cent';

    const decimal =
      modifier === 'point' &&
      endsInNumberWord(text.slice(Math.max(0, (match.index ?? 0) - 16), match.index ?? 0));
    if (decimal) {
      /*
       * A decimal spelled out. Reading "five point five" back reliably is more
       * than this is worth, and guessing is the one thing it must not do — so
       * the phrase is reported as a figure that matches nothing, which names it
       * in the retry and asks for digits instead.
       *
       * Only when a number word leads into it. "Point" is also a plain English
       * noun, and rejecting "at this point five years remain" over a licensed
       * 5 would be the false drop this whole path exists to stop.
       */
      tokens.push({ raw: match[0].trim(), value: Number.NaN, halfWidth: 0, isPercent });
      continue;
    }

    const negative = modifier === 'negative' || modifier === 'minus';
    // When the unit itself is a magnitude ("two million" with no "dollars"),
    // scale here — the capture group stops before the unit, so the reader
    // above only saw "two".
    const unitMagnitude = MAGNITUDE_WORDS[unit];
    let value = read.value;
    let multiplier = read.multiplier;
    if (unitMagnitude !== undefined) {
      value *= unitMagnitude;
      multiplier = Math.max(multiplier, unitMagnitude);
    }
    if (negative) value = -value;

    // Scored at the precision the words commit to, by the same rule a written
    // figure gets: "two million" is as coarse as "$2M", "seven" is exact.
    const digits = String(Math.round(Math.abs(value) / multiplier));
    tokens.push({
      raw: match[0].trim(),
      value,
      halfWidth: 0.5 * writtenStep(digits, 0, multiplier, isPercent),
      isPercent,
    });
  }
  return tokens;
}

export interface GroundingResult {
  grounded: boolean;
  /** The tokens that matched nothing, as written, for the retry to name. */
  ungrounded: string[];
}

/** The three fields a reading is made of, before it is attributed. */
export interface InterpretationDraft {
  headline: string;
  paragraphs: string[];
  watchOuts: string[];
}

/**
 * Check every number in the draft against the figures the engine computed.
 *
 * This reports; it does not gate. Its verdict is logged and the reading is
 * shown either way — see `runCalculatorInterpretation` for why. Read a warning
 * from it as "this reading quoted a figure no run produced", not as "this
 * reading was withheld".
 *
 * Percentage tokens are checked only against percentage facts, so a rate
 * cannot be satisfied by an unrelated dollar amount that shares its digits.
 * Within each kind the check is by value rather than by fact, so a draft that
 * attaches a true figure to the wrong label — quoting the median portfolio as
 * the first-year draw, say — reads as grounded here.
 */
export function groundDraft(draft: InterpretationDraft, facts: CalculatorFact[]): GroundingResult {
  const plain: number[] = [];
  const percents: number[] = [];
  for (const fact of facts) {
    for (const value of fact.values ?? []) plain.push(value);
    for (const value of fact.percentValues ?? []) percents.push(value);
  }

  const text = [draft.headline, ...draft.paragraphs, ...draft.watchOuts].join('\n');
  const ungrounded: string[] = [];
  // Written and spelled figures are the same claim in two scripts, and are
  // held to the same list.
  for (const token of [...extractNumericTokens(text), ...extractSpelledFigures(text)]) {
    const allowed = token.isPercent ? percents : plain;
    // A hair over the half-width, so a value sitting exactly on a rounding
    // boundary is not rejected by floating-point noise.
    const slack = token.halfWidth * 1.000001;
    if (!allowed.some((value) => Math.abs(token.value - value) <= slack)) {
      ungrounded.push(token.raw);
    }
  }

  return { grounded: ungrounded.length === 0, ungrounded: [...new Set(ungrounded)] };
}

/* ------------------------------------------------------------------ *
 * The model call
 * ------------------------------------------------------------------ */

/**
 * Pull the JSON object out of a response that may be fenced or prefaced.
 * Returns null rather than throwing: an unparseable draft is a dropped panel,
 * not a failed request.
 */
export function parseDraft(raw: string): InterpretationDraft | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const candidate = parsed as Record<string, unknown>;
  const headline = typeof candidate.headline === 'string' ? candidate.headline.trim() : '';
  const strings = (value: unknown): string[] => (Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim())
    : []);

  const paragraphs = strings(candidate.paragraphs);
  if (!headline || paragraphs.length === 0) return null;
  return { headline, paragraphs, watchOuts: strings(candidate.watchOuts) };
}

/**
 * Why a draft was sent back — and there is only one reason left.
 *
 * A response that is not the object asked for cannot be shown at all, so there
 * is nothing to lose by asking again. A draft whose figures do not match the
 * fact block used to be sent back the same way; it no longer is, and the
 * second kind went with it. See `runCalculatorInterpretation`.
 */
type DraftFeedback = { kind: 'unparseable' };

function feedbackLines(feedback?: DraftFeedback): string[] {
  if (feedback?.kind === 'unparseable') {
    return [
      '',
      'Your previous response could not be read. Return the JSON object described above and',
      'nothing else: no preamble, no explanation, no code fence, no trailing commentary.',
    ];
  }
  return [];
}

const DEFAULT_MAX_OUTPUT_TOKENS = 2_000;

/**
 * The hard ceiling on one visitor's wait for this panel, across both attempts.
 *
 * Without it the SDK's own default applies — ten minutes per request, and it
 * retries a timeout — so a provider that stalls rather than refusing would
 * leave "Reading your result…" on the page and an unauthenticated request open
 * for as long as it cared to. A reading the model never returns is dropped; a
 * stall has to reach that same path, not hang.
 */
const TOTAL_BUDGET_MS = 25_000;

/**
 * Below this, there is no point starting an attempt: the model cannot write
 * and return a JSON object in the time left, and trying spends the budget on a
 * request that will time out anyway.
 */
const MIN_ATTEMPT_MS = 4_000;

function maxOutputTokens(): number {
  const configured = getActiveNumericGenerationSetting('calculatorNarrative', 'maxOutputTokens');
  return configured !== null && configured > 0 ? configured : DEFAULT_MAX_OUTPUT_TOKENS;
}

/**
 * Write a reading, or return null if the model did not return one.
 *
 * The caller supplies what is specific to its calculator — the prompt, the
 * facts, and the block describing this particular run — and gets back whatever
 * the model wrote, or nothing if it wrote nothing usable.
 *
 * The figures are checked against the fact block and the mismatches are
 * logged, but they no longer decide whether the reading is shown. That is a
 * deliberate product call: these are free, unauthenticated pages, and a
 * visitor seeing no reading at all was judged worse than one that may carry a
 * figure the engine did not produce. The prompt still asks for the figures
 * from the list and nothing else, and it is the only thing asking.
 *
 * `groundDraft` stays wired in so the rate is visible in the logs rather than
 * unknown. Nothing reads its verdict to gate on.
 */
export async function runCalculatorInterpretation(params: {
  /** Names this calculator in warnings and in Sentry. */
  label: string;
  systemPrompt: string;
  /** The run-specific block. Feedback for a retry is appended to it here. */
  userMessage: string;
  facts: CalculatorFact[];
}): Promise<{ draft: InterpretationDraft; model: string } | null> {
  const model = getActiveModel('calculatorNarrative');
  let feedback: DraftFeedback | undefined;

  const deadline = Date.now() + TOTAL_BUDGET_MS;

  // One retry, and only for a response that could not be read at all. An
  // unparseable response leaves nothing to show, so asking again costs the
  // visitor a wait for something rather than a wait for nothing.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    // Each attempt gets what is left of the whole budget rather than a fixed
    // slice, so a fast first attempt leaves the retry room to finish and a
    // slow one cannot start a second request the visitor would wait out.
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) {
      console.warn('%s interpretation: out of time before attempt %d.', params.label, attempt + 1);
      return null;
    }

    let raw: string;
    try {
      raw = await askClaude(
        params.systemPrompt,
        [params.userMessage, ...feedbackLines(feedback)].join('\n'),
        {
          slot: 'calculatorNarrative',
          maxTokens: maxOutputTokens(),
          timeoutMs: remaining,
          // The SDK retries a timeout by default, which would multiply the
          // ceiling just set. Retrying is also the wrong answer here: this
          // panel is optional and the page is waiting.
          maxRetries: 0,
        }
      );
    } catch (error) {
      // The provider is the one thing here that fails for reasons unrelated to
      // this run, so it is worth seeing in Sentry; the visitor still gets
      // their deterministic result.
      console.warn(`${params.label} interpretation: model call failed:`, error);
      Sentry.captureException(error);
      return null;
    }

    const draft = parseDraft(raw);
    if (!draft) {
      // One more chance, inside the same budget and the same two-attempt
      // ceiling. A response that is not the object asked for is usually a
      // formatting slip, and there is nothing to show without it.
      console.warn('%s interpretation: response did not parse as the expected object.', params.label);
      feedback = { kind: 'unparseable' };
      continue;
    }

    // Advisory only. Logged so that a model drifting off the fact block for a
    // whole class of runs shows up as a rate rather than as nothing at all —
    // the page itself now gives no sign either way.
    const grounding = groundDraft(draft, params.facts);
    if (!grounding.grounded) {
      const message =
        `${params.label} interpretation: shipped with unverified figures ` +
        `(tokens=${grounding.ungrounded.join(', ')}) (model=${model})`;
      console.warn(message);
      Sentry.captureMessage(message, 'warning');
    }

    return { draft, model };
  }

  const message = `${params.label} interpretation: unparseable after retry (model=${model})`;
  console.warn(message);
  Sentry.captureMessage(message, 'warning');
  return null;
}

/**
 * A reading cache that forgets its oldest entry rather than growing.
 *
 * Results are a pure function of the run, and landing-page visitors reach for
 * round numbers, so the same run is interpreted once. Bounded and dropped on
 * restart, exactly like the result caches these shadow.
 */
export class InterpretationCache<T> {
  private readonly entries = new Map<string, T>();

  constructor(private readonly max = 300) {}

  get(key: string): T | undefined {
    return this.entries.get(key);
  }

  set(key: string, value: T): void {
    if (this.entries.size >= this.max) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, value);
  }

  clear(): void {
    this.entries.clear();
  }
}
