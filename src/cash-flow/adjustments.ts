import type { CashFlowDirection } from './ledger';

/**
 * The user's choices about what the forecast counts. They change what the
 * forecast learns from, never the history it shows: past income and spending
 * stay as they happened. Something that is not really income or spending, a
 * transfer to the user's own account say, is a category change instead, which
 * corrects the history everywhere.
 *
 *   exclude_payee    -- leave a payee out of what the forecast learns: its
 *                       regular income or bill is not projected, and its
 *                       transactions do not feed the typical rates;
 *   include_one_off  -- count a transaction the forecast left out as a one-off
 *                       in the typical rates after all;
 *   continue_stream  -- keep projecting a regular item that has stopped;
 *   exclude_transfer -- leave a payee's transfers out of the cash position;
 *   exclude_category -- leave a category out of the typical rates: its
 *                       transactions do not feed them, though a regular bill
 *                       in it is still projected;
 *   spread_payee     -- say how often a payee's amounts come: each one that
 *                       is not part of a regular item counts in the typical
 *                       rate spread over that many months from its date,
 *                       instead of over the basis, and is never a one-off.
 *
 * A payee is named by the ledger's counterparty key and a direction, which is
 * what a recurring stream is grouped on, so a choice holds across refreshes
 * for as long as the provider keeps describing the payee the same way. A
 * one-off is named by its transaction id, and a category by its label's key.
 */
export const FORECAST_ADJUSTMENT_KINDS = [
  'exclude_payee', 'include_one_off', 'continue_stream', 'exclude_transfer', 'exclude_category', 'spread_payee',
] as const;
export type ForecastAdjustmentKind = (typeof FORECAST_ADJUSTMENT_KINDS)[number];

/**
 * How often a spread payee's amounts can come, in months: six times a year,
 * four, three, twice, once, or every other year. Every two months is shorter
 * than the basis, but a 90-day window holds one or two such amounts, so it reads
 * them as half again too little or too much; spread over its own two months,
 * each counts once. Every three months is about the basis itself, and still
 * says something it can't: an amount that size is how the payee comes, never a
 * one-off. Anything monthly or more often repeats enough for the basis, or is a
 * regular item.
 */
export const SPREAD_MONTHS = [2, 3, 4, 6, 12, 24] as const;
export type SpreadMonths = (typeof SPREAD_MONTHS)[number];

/** The days one amount from a payee spread over `months` counts for. */
export function spreadDays(months: number): number {
  return (months * 365) / 12;
}

export const FORECAST_ADJUSTMENTS_PER_USER_LIMIT = 200;
const KEY_MAX_LENGTH = 200;

export interface ForecastAdjustment {
  id: string;
  kind: ForecastAdjustmentKind;
  /** The payee's direction; for a transfer, `income` is money in. */
  flow: CashFlowDirection;
  /** A payee's counterparty key, a one-off's transaction id, or a category's label key. */
  key: string;
  /** What the item was called when the user made the choice. */
  label: string;
  /** For spread_payee, how many months each amount is spread over; null for every other kind. */
  spreadMonths: number | null;
}

export type ForecastAdjustmentInput = Pick<ForecastAdjustment, 'kind' | 'flow' | 'key' | 'spreadMonths'>;

export type ForecastAdjustmentValidation =
  | { ok: true; value: ForecastAdjustmentInput }
  | { ok: false; error: string };

export function validateForecastAdjustmentInput(raw: unknown): ForecastAdjustmentValidation {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Choose what to change in the forecast' };
  const body = raw as Record<string, unknown>;
  if (typeof body.kind !== 'string' || !(FORECAST_ADJUSTMENT_KINDS as readonly string[]).includes(body.kind)) {
    return { ok: false, error: 'Choose what to change in the forecast' };
  }
  if (body.flow !== 'income' && body.flow !== 'spending') {
    return { ok: false, error: 'Choose whether this is money in or money out' };
  }
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key || key.length > KEY_MAX_LENGTH) return { ok: false, error: 'Choose an item from your forecast' };
  const kind = body.kind as ForecastAdjustmentKind;
  if (kind !== 'spread_payee') return { ok: true, value: { kind, flow: body.flow, key, spreadMonths: null } };
  if (!(SPREAD_MONTHS as readonly unknown[]).includes(body.spreadMonths)) {
    return { ok: false, error: 'Choose how often it comes' };
  }
  return { ok: true, value: { kind, flow: body.flow, key, spreadMonths: body.spreadMonths as SpreadMonths } };
}

/** A payee in one direction, as the ledger keys it. */
export function payeeKey(flow: CashFlowDirection, counterpartyKey: string): string {
  return `${flow}|${counterpartyKey}`;
}

/** A category in one direction, keyed by its label's key. */
export function categoryKey(flow: CashFlowDirection, key: string): string {
  return `${flow}|${key}`;
}

/**
 * Whether a set of payee choices names this payee, by its key or by the key
 * it had before (src/cash-flow/ledger.ts), so a choice saved under the old
 * key keeps applying.
 */
export function namesPayee(
  choices: ReadonlySet<string>,
  flow: CashFlowDirection,
  payee: { counterpartyKey: string; legacyCounterpartyKey?: string }
): boolean {
  return Boolean(payee.counterpartyKey && choices.has(payeeKey(flow, payee.counterpartyKey)))
    || Boolean(payee.legacyCounterpartyKey && choices.has(payeeKey(flow, payee.legacyCounterpartyKey)));
}

/** The choices as lookups the engine applies. */
export interface ForecastAdjustmentSets {
  excludedPayees: ReadonlySet<string>;
  includedOneOffs: ReadonlySet<string>;
  excludedTransfers: ReadonlySet<string>;
  /** Categories by `categoryKey`. */
  excludedCategories: ReadonlySet<string>;
  /** Payees by `payeeKey`, to the choice that spreads them. */
  spreadPayees: ReadonlyMap<string, ForecastAdjustment>;
}

/**
 * The choice that spreads this payee, by its key or the key it had before;
 * the one under its key when both are saved.
 */
export function spreadOf(
  spreadPayees: ReadonlyMap<string, ForecastAdjustment>,
  flow: CashFlowDirection,
  payee: { counterpartyKey: string; legacyCounterpartyKey?: string }
): ForecastAdjustment | null {
  return (payee.counterpartyKey ? spreadPayees.get(payeeKey(flow, payee.counterpartyKey)) : undefined)
    ?? (payee.legacyCounterpartyKey ? spreadPayees.get(payeeKey(flow, payee.legacyCounterpartyKey)) : undefined)
    ?? null;
}

export function forecastAdjustmentSets(adjustments: readonly ForecastAdjustment[]): ForecastAdjustmentSets {
  /** The keys of one kind's choices: payees or categories by direction, or bare transaction ids. */
  const keys = (kind: ForecastAdjustmentKind, withFlow: boolean) => new Set(adjustments
    .filter(adjustment => adjustment.kind === kind)
    .map(adjustment => (withFlow ? categoryKey(adjustment.flow, adjustment.key) : adjustment.key)));
  return {
    excludedPayees: keys('exclude_payee', true),
    includedOneOffs: keys('include_one_off', false),
    excludedTransfers: keys('exclude_transfer', true),
    excludedCategories: keys('exclude_category', true),
    spreadPayees: new Map(adjustments
      .filter(adjustment => adjustment.kind === 'spread_payee' && adjustment.spreadMonths !== null)
      .map(adjustment => [payeeKey(adjustment.flow, adjustment.key), adjustment])),
  };
}
