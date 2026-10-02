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
 *   exclude_transfer -- leave a payee's transfers out of the cash position.
 *
 * A payee is named by the ledger's counterparty key and a direction, which is
 * what a recurring stream is grouped on, so a choice holds across refreshes
 * for as long as the provider keeps describing the payee the same way. A
 * one-off is named by its transaction id.
 */
export const FORECAST_ADJUSTMENT_KINDS = ['exclude_payee', 'include_one_off', 'continue_stream', 'exclude_transfer'] as const;
export type ForecastAdjustmentKind = (typeof FORECAST_ADJUSTMENT_KINDS)[number];

export const FORECAST_ADJUSTMENTS_PER_USER_LIMIT = 200;
const KEY_MAX_LENGTH = 200;

export interface ForecastAdjustment {
  id: string;
  kind: ForecastAdjustmentKind;
  /** The payee's direction; for a transfer, `income` is money in. */
  flow: CashFlowDirection;
  /** A payee's counterparty key, or a one-off's transaction id. */
  key: string;
  /** What the item was called when the user made the choice. */
  label: string;
}

export type ForecastAdjustmentInput = Pick<ForecastAdjustment, 'kind' | 'flow' | 'key'>;

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
  return { ok: true, value: { kind: body.kind as ForecastAdjustmentKind, flow: body.flow, key } };
}

/** A payee in one direction, as the ledger keys it. */
export function payeeKey(flow: CashFlowDirection, counterpartyKey: string): string {
  return `${flow}|${counterpartyKey}`;
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
}

export function forecastAdjustmentSets(adjustments: readonly ForecastAdjustment[]): ForecastAdjustmentSets {
  /** The keys of one kind's choices: payees by direction, or bare transaction ids. */
  const keys = (kind: ForecastAdjustmentKind, byPayee: boolean) => new Set(adjustments
    .filter(adjustment => adjustment.kind === kind)
    .map(adjustment => (byPayee ? payeeKey(adjustment.flow, adjustment.key) : adjustment.key)));
  return {
    excludedPayees: keys('exclude_payee', true),
    includedOneOffs: keys('include_one_off', false),
    excludedTransfers: keys('exclude_transfer', true),
  };
}
