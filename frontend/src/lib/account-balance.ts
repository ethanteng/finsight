/**
 * Canonical account balance resolution, shared by every surface that renders an
 * account balance.
 *
 * `current` is authoritative and `available` is only a fallback, matching
 * `accountBalance()` in src/services/finances-overview-service.ts. `available`
 * is reported net of holds, so preferring it makes a page disagree with the
 * Finances totals for any account with a pending deposit.
 *
 * A missing balance resolves to null rather than 0 so callers can render "no
 * balance reported" instead of an account that looks empty.
 */

export interface AccountBalanceShape {
  displayBalance?: number | null;
  balance?: number | null | {
    current?: number | null;
    available?: number | null;
  };
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function resolveAccountBalance(account: AccountBalanceShape): number | null {
  // A precomputed display balance already went through the canonical rules.
  if (Object.prototype.hasOwnProperty.call(account, 'displayBalance')) {
    return finite(account.displayBalance);
  }
  if (typeof account.balance === 'number') return finite(account.balance);
  if (!account.balance || typeof account.balance !== 'object') return null;
  return finite(account.balance.current) ?? finite(account.balance.available);
}
