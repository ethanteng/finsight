import type { PublicAccountType, PublicPortfolio } from './client';

/**
 * Map Public's portfolio payloads onto the account shape the rest of the pipeline
 * consumes, so a directly-read Public account is indistinguishable downstream from
 * one that arrived through a provider aggregator.
 */

/** Account id prefix, mirroring `snaptrade-` and `manual-`. */
export const PUBLIC_ACCOUNT_ID_PREFIX = 'public-';

export function publicAccountId(accountId: string): string {
  return `${PUBLIC_ACCOUNT_ID_PREFIX}${accountId}`;
}

/**
 * Display names, because Public's API returns an account *type* and no label.
 *
 * SnapTrade surfaced these as "Treasury Account", "High_yield Account" and
 * "Bond_account Account" -- the last two visibly derived from an enum. Naming them
 * here keeps the direct feed from inheriting that, and matches what Public shows
 * its own users.
 */
const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  BROKERAGE: 'Brokerage Account',
  TRADITIONAL_IRA: 'Traditional IRA',
  ROTH_IRA: 'Roth IRA',
  ENTITY: 'Entity Account',
  RIA_ASSET: 'Managed Account',
  TREASURY: 'Treasury Account',
  HIGH_YIELD: 'High Yield Cash Account',
  BOND_ACCOUNT: 'Bond Account',
};

/**
 * Our account subtype per Public account type.
 *
 * The managed-yield products are not brokerage accounts and should not be typed as
 * such: a Treasury account holds Treasuries, and High Yield is a cash product.
 * Getting this right is what lets allocation and the retirement model treat them
 * as something other than equity.
 */
const ACCOUNT_SUBTYPES: Record<string, string> = {
  BROKERAGE: 'brokerage',
  TRADITIONAL_IRA: 'ira',
  ROTH_IRA: 'roth',
  ENTITY: 'brokerage',
  RIA_ASSET: 'managed',
  TREASURY: 'treasury',
  HIGH_YIELD: 'cash management',
  BOND_ACCOUNT: 'bond',
};

export function publicAccountLabel(accountType: string | null | undefined): string {
  const key = String(accountType || '').toUpperCase();
  return ACCOUNT_TYPE_LABELS[key] || 'Public Account';
}

export function publicAccountSubtype(accountType: string | null | undefined): string {
  const key = String(accountType || '').toUpperCase();
  return ACCOUNT_SUBTYPES[key] || 'brokerage';
}

/**
 * Our account `type` per Public account type.
 *
 * High Yield Cash is a cash product, not an investment one, and the distinction
 * is load-bearing: `classifyAccount` tests `type === 'investment'` before it ever
 * looks at cash subtypes, so an investment-typed account carrying the
 * `cash management` subtype never reaches the cash branch. It would count toward
 * investments instead of `totalCash`, understating the user's cash position in
 * every answer that reasons about liquidity or an emergency fund.
 *
 * Treasury and Bond accounts stay investments: they are yield products, but the
 * assets behind them are securities.
 */
const ACCOUNT_KINDS: Record<string, string> = {
  HIGH_YIELD: 'depository',
};

export function publicAccountKind(accountType: string | null | undefined): string {
  const key = String(accountType || '').toUpperCase();
  return ACCOUNT_KINDS[key] || 'investment';
}

/**
 * The account's value.
 *
 * `totalAccountValue` as reported wins over anything derived. The managed-yield
 * accounts this integration exists for hold their value as a balance rather than
 * as itemized positions, so summing positions would report them as zero -- the
 * same class of error as the SnapTrade path reporting them as null.
 */
export function publicAccountBalance(portfolio: PublicPortfolio): number | null {
  if (portfolio.totalAccountValue !== null) return portfolio.totalAccountValue;
  const positionsTotal = portfolio.positions.reduce(
    (sum, position) => sum + (position.currentValue ?? 0),
    0,
  );
  const cash = portfolio.cash ?? 0;
  const derived = positionsTotal + cash;
  // Only report a derived value when something actually backed it. Zero here means
  // "nothing was reported", which must stay null so the snapshot marks it
  // unavailable rather than publishing a confident zero.
  return portfolio.positions.length > 0 || portfolio.cash !== null ? derived : null;
}

export interface MappedPublicAccount {
  account_id: string;
  id: string;
  name: string;
  type: string;
  subtype: string;
  balance: { current: number | null; available?: number; iso_currency_code: string };
  institution: string;
  source: 'public';
  persistentAccountId: string;
  /**
   * When we read it. For a direct API there is no provider-side sync to date the
   * value from -- the read *is* the observation -- unlike SnapTrade, where the
   * balance can predate our fetch by hours.
   */
  snapshotTimestamp: string;
  lastSyncedAt: string;
  publicAccountType: PublicAccountType | string | null;
  /**
   * True when the balance is a sum of tax-lot positions rather than a total
   * Public reported. Cannot see uninvested cash, so it may understate.
   */
  valuedFromTaxLots?: boolean;
}

/**
 * When the value we are publishing was actually observed.
 *
 * A tax-lot fallback carries Public's own valuation date, which is the truthful
 * "as of" for that number -- our fetch time would overstate its freshness, the
 * same mistake #146 and #150 exist to correct.
 *
 * A bare `YYYY-MM-DD` is anchored to midday UTC rather than midnight. Date-only
 * ISO strings parse as UTC midnight, which `toLocaleDateString` then renders as
 * the *previous* day everywhere west of Greenwich -- so an account valued today
 * would display as yesterday for every US user.
 */
export function publicObservationTime(portfolio: PublicPortfolio, fetchedAt: string): string {
  const asOf = portfolio.taxLotsAsOf;
  if (!asOf) return fetchedAt;
  const anchored = /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? `${asOf}T12:00:00.000Z` : asOf;
  const parsed = new Date(anchored);
  return Number.isNaN(parsed.getTime()) ? fetchedAt : parsed.toISOString();
}

export function mapPublicAccount(portfolio: PublicPortfolio, fetchedAt: string): MappedPublicAccount {
  const id = publicAccountId(portfolio.accountId);
  const balance = publicAccountBalance(portfolio);
  const observedAt = publicObservationTime(portfolio, fetchedAt);
  return {
    account_id: id,
    id,
    name: publicAccountLabel(portfolio.accountType),
    type: publicAccountKind(portfolio.accountType),
    subtype: publicAccountSubtype(portfolio.accountType),
    // `available` is left unset when there is no balance rather than carrying a
    // null: the shared Account type models an absent available balance as absent,
    // and a null would read as a confident zero downstream.
    balance: { current: balance, ...(balance === null ? {} : { available: balance }), iso_currency_code: 'USD' },
    institution: 'Public',
    source: 'public',
    persistentAccountId: id,
    snapshotTimestamp: observedAt,
    lastSyncedAt: observedAt,
    publicAccountType: portfolio.accountType,
    valuedFromTaxLots: portfolio.valuedFromTaxLots === true,
  };
}

export interface MappedPublicHolding {
  id: string;
  account_id: string;
  security_id: string;
  institution_value: number | null;
  institution_price: number | null;
  /** When we read it. A direct read is its own observation, so this is the fetch time. */
  institution_price_as_of: string;
  /** Public reports cost basis, but the stopgap ingests balances and positions only. */
  cost_basis: number | null;
  quantity: number | null;
  iso_currency_code: string;
  security_name?: string;
  security_type?: string;
  ticker_symbol?: string;
}

export function mapPublicHoldings(portfolio: PublicPortfolio, observedAt: string): MappedPublicHolding[] {
  const accountId = publicAccountId(portfolio.accountId);
  return portfolio.positions
    .filter(position => position.symbol || position.name)
    .map(position => {
      // Public has no security id, so the symbol carries that role. Namespaced to
      // keep it from colliding with a Plaid or SnapTrade security id.
      const securityId = `public-${position.symbol || position.name}`;
      return {
        id: `${accountId}|${securityId}`,
        account_id: accountId,
        security_id: securityId,
        institution_value: position.currentValue,
        institution_price: position.lastPrice,
        institution_price_as_of: observedAt,
        // Public does report cost basis; the stopgap deliberately does not ingest
        // it, so this stays null rather than implying we looked and found none.
        cost_basis: null,
        quantity: position.quantity,
        iso_currency_code: 'USD',
        security_name: position.name ?? undefined,
        security_type: position.instrumentType ?? undefined,
        ticker_symbol: position.symbol ?? undefined,
      };
    });
}
