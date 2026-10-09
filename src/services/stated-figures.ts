/**
 * The retirement plan a user saved: "Your numbers".
 *
 * Someone with nothing linked tells Ask Linc their figures, and until now
 * those lived only in the decision they were said in: a new decision started
 * from nothing, so a calculator lead who clicked "New decision" stated their
 * retirement age and spending all over again. These are the figures worth
 * keeping between decisions. Each is saved only by the user's own action --
 * the Your numbers page or "Use these next time?" under an answer -- because
 * the same conversation also holds what-ifs ("what if I retire at 58?"), and
 * only the user can say which figure is their plan.
 *
 * The rest of what the page shows already has a home and stays there:
 * balances in manual accounts, monthly income and spending in the User
 * overrides, age in remembered personal context. This module is the plan.
 */

export const STATED_FIGURE_KEYS = [
  'retirementAge',
  'annualRetirementSpending',
  'annualContribution',
  'retirementIncome',
  'socialSecurityAnnual',
  'socialSecurityStartAge',
  'planThroughAge',
  'allocation',
] as const;

export type StatedFigureKey = (typeof STATED_FIGURE_KEYS)[number];
export type StatedFigureSource = 'page' | 'answer';

export interface StatedFigure {
  value: number | string;
  /** When the user saved it, so an answer can say how old the figure is. */
  savedAt: string;
  source: StatedFigureSource;
}

export type StatedFigures = Partial<Record<StatedFigureKey, StatedFigure>>;

export const ALLOCATION_PRESETS = ['conservative', 'balanced', 'growth'] as const;

export interface StatedFigureDefinition {
  label: string;
  kind: 'age' | 'usd_per_year' | 'choice';
  minimum?: number;
  maximum?: number;
  options?: readonly string[];
}

/**
 * Bounds are where both calculators that read a figure accept it, so a saved
 * value never reaches one only to be dropped there.
 */
export const STATED_FIGURE_DEFINITIONS: Record<StatedFigureKey, StatedFigureDefinition> = {
  retirementAge: { label: 'Age you plan to retire', kind: 'age', minimum: 30, maximum: 95 },
  annualRetirementSpending: {
    label: 'What you expect to spend a year in retirement, in today\'s dollars',
    kind: 'usd_per_year',
    minimum: 1_000,
    maximum: 10_000_000,
  },
  annualContribution: { label: 'What you save a year until you retire', kind: 'usd_per_year', minimum: 0, maximum: 5_000_000 },
  retirementIncome: {
    label: 'Pension or other income a year from when you retire, in today\'s dollars',
    kind: 'usd_per_year',
    minimum: 0,
    maximum: 10_000_000,
  },
  socialSecurityAnnual: { label: 'Social Security a year, in today\'s dollars', kind: 'usd_per_year', minimum: 0, maximum: 250_000 },
  socialSecurityStartAge: { label: 'Age Social Security starts', kind: 'age', minimum: 50, maximum: 80 },
  planThroughAge: { label: 'Plan through age', kind: 'age', minimum: 60, maximum: 110 },
  allocation: { label: 'Preset mix', kind: 'choice', options: ALLOCATION_PRESETS },
};

function isKey(value: string): value is StatedFigureKey {
  return (STATED_FIGURE_KEYS as readonly string[]).includes(value);
}

/** A value as the figure accepts it, or undefined when it does not. */
export function acceptedFigureValue(key: StatedFigureKey, value: unknown): number | string | undefined {
  const definition = STATED_FIGURE_DEFINITIONS[key];
  if (definition.kind === 'choice') {
    return typeof value === 'string' && definition.options?.includes(value) ? value : undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (definition.kind === 'age' && !Number.isInteger(value)) return undefined;
  if (definition.minimum !== undefined && value < definition.minimum) return undefined;
  if (definition.maximum !== undefined && value > definition.maximum) return undefined;
  return value;
}

/**
 * The saved figures out of their JSON column. A figure that no longer holds
 * together -- an unknown key, a value outside today's bounds -- is left out
 * rather than failing the whole read.
 */
export function parseStatedFigures(value: unknown): StatedFigures {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const figures: StatedFigures = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isKey(key) || !raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const accepted = acceptedFigureValue(key, entry.value);
    const savedAt = typeof entry.savedAt === 'string' && !Number.isNaN(Date.parse(entry.savedAt)) ? entry.savedAt : undefined;
    const source = entry.source === 'page' || entry.source === 'answer' ? entry.source : undefined;
    if (accepted === undefined || !savedAt || !source) continue;
    figures[key] = { value: accepted, savedAt, source };
  }
  return figures;
}

export interface StatedFigureUpdate {
  figures: StatedFigures;
  /** Fields the update named but could not accept, with why, in the user's terms. */
  rejected: Partial<Record<string, string>>;
}

function rangeText(key: StatedFigureKey): string {
  const { kind, minimum, maximum, options } = STATED_FIGURE_DEFINITIONS[key];
  if (kind === 'choice') return `one of ${options?.join(', ')}`;
  const show = (value: number) => (kind === 'usd_per_year' ? `$${value.toLocaleString('en-US')}` : String(value));
  const whole = kind === 'age' ? 'a whole number ' : '';
  return `${whole}from ${show(minimum ?? 0)} to ${show(maximum ?? 0)}`;
}

/**
 * Apply a change: a value sets a figure, null clears it. Every figure named is
 * checked before anything is applied, so a request with one bad field changes
 * nothing; an unchanged value keeps its original date.
 */
export function applyStatedFigureUpdate(
  current: StatedFigures,
  changes: Record<string, unknown>,
  source: StatedFigureSource,
  now: Date = new Date()
): StatedFigureUpdate {
  const rejected: Partial<Record<string, string>> = {};
  const next: StatedFigures = { ...current };
  for (const [key, value] of Object.entries(changes)) {
    if (!isKey(key)) {
      rejected[key] = 'Not a figure Your numbers keeps.';
      continue;
    }
    if (value === null) {
      delete next[key];
      continue;
    }
    const accepted = acceptedFigureValue(key, value);
    if (accepted === undefined) {
      rejected[key] = `${STATED_FIGURE_DEFINITIONS[key].label} must be ${rangeText(key)}.`;
      continue;
    }
    if (current[key]?.value === accepted) continue;
    next[key] = { value: accepted, savedAt: now.toISOString(), source };
  }
  return { figures: Object.keys(rejected).length > 0 ? current : next, rejected };
}

/** A saved number for a calculator to plan with, and when it was saved. */
export function savedNumber(
  figures: StatedFigures | undefined,
  key: StatedFigureKey
): { value: number; savedAt: string } | undefined {
  const figure = figures?.[key];
  return figure && typeof figure.value === 'number' ? { value: figure.value, savedAt: figure.savedAt } : undefined;
}

/** A saved choice (the preset mix), and when it was saved. */
export function savedChoice(
  figures: StatedFigures | undefined,
  key: StatedFigureKey
): { value: string; savedAt: string } | undefined {
  const figure = figures?.[key];
  return figure && typeof figure.value === 'string' ? { value: figure.value, savedAt: figure.savedAt } : undefined;
}

/** "Oct 9, 2026": the date a figure was saved, in the words an answer uses. */
export function savedOn(savedAt: string): string {
  return new Date(savedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function joinPhrases(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * The sentence an answer adds when it planned with figures from Your numbers:
 * what it took and when the user saved it, so a figure from months ago reads
 * as one, and the user knows where to change it. Empty when it took none.
 */
export function describeSavedFigures(items: ReadonlyArray<{ phrase: string; savedAt: string }>): string {
  if (items.length === 0) return '';
  const dates = items.map((item) => item.savedAt).sort();
  const latest = dates[dates.length - 1];
  const when = dates[0] === latest ? `saved ${savedOn(latest)}` : `last saved ${savedOn(latest)}`;
  return ` From Your numbers: ${joinPhrases(items.map((item) => item.phrase))}, ${when}.`;
}
