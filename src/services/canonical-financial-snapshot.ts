import {
  computeFinancialOverview,
  evaluateSnapshotQuality,
  type CanonicalFinancialOverview,
  type SnapshotQuality,
  type SnapshotSourceObservation,
} from '../domain/financial-truth';
import { classifyAccount, type AccountLike } from './account-classifier';
import { normalizeAssetType } from './asset-class';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface SnapshotAccount extends AccountLike {
  id?: string;
  account_id?: string;
  source?: string;
  sourceConnectionId?: string;
  snapshotTimestamp?: string | Date;
  lastSyncedAt?: string | Date;
  balance?: number | null | {
    current?: number | null;
    available?: number | null;
    iso_currency_code?: string | null;
  };
}

interface SnapshotHolding {
  id?: string;
  account_id?: string;
  security_id?: string;
  institution_value?: number | null;
  institution_price_as_of?: string | Date | null;
  snapshotTimestamp?: string | Date | null;
  iso_currency_code?: string | null;
  security_type?: string | null;
}

interface SnapshotSecurity {
  security_id?: string;
  type?: string | null;
}

interface SnapshotError {
  tokenId?: string;
  accountId?: string;
  error: string;
}

/** An investment account whose itemized holdings do not explain its reported balance. */
export interface InvestmentHoldingsCoverage {
  accountId: string;
  /** Balance the institution reports for the account, in the reporting currency. */
  reportedBalance: number;
  /** Market value of the holdings the provider itemized for it. */
  holdingsValue: number;
  /** reportedBalance - holdingsValue: value carried by the balance and no holding. */
  unexplainedValue: number;
}

export interface CanonicalInvestmentPortfolio {
  reportingCurrency: string;
  totalValue: number;
  holdingCount: number;
  securityCount: number;
  assetAllocation: Array<{ type: string; value: number; percentage: number }>;
  currencyMismatchIds: string[];
  unavailableValueIds: string[];
  /** Total value included from account balances that no itemized holding explains. */
  unclassifiedValue: number;
  /** Accounts whose holdings feed materially under-covers the balance they report. */
  holdingsCoverageGaps: InvestmentHoldingsCoverage[];
}

export interface CanonicalSnapshotCore {
  computedAt: Date;
  asOf: Date | null;
  status: SnapshotQuality['status'];
  reportingCurrency: string;
  financialOverview: CanonicalFinancialOverview;
  investmentPortfolio: CanonicalInvestmentPortfolio;
  sourceObservations: SnapshotSourceObservation[];
  quality: SnapshotQuality;
}

export interface CanonicalSnapshotData {
  accounts?: SnapshotAccount[];
  investments?: {
    holdings?: SnapshotHolding[];
    securities?: SnapshotSecurity[];
    portfolio?: CanonicalInvestmentPortfolio;
  };
  homeValue?: {
    valueMid?: number | null;
    lastUpdated?: string | Date | null;
    /** True when the user set the figure by hand instead of a provider estimate. */
    isManualOverride?: boolean;
  } | null;
  metadata?: {
    partialData?: boolean;
    errors?: {
      plaid?: SnapshotError[];
      snaptrade?: SnapshotError[];
      homeValue?: SnapshotError | null;
    };
  };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function knownAccountBalance(account: SnapshotAccount): number | null {
  const balance = account.balance;
  if (typeof balance === 'number') return finiteNumber(balance);
  if (!balance || typeof balance !== 'object') return null;
  return finiteNumber(balance.current) ?? finiteNumber(balance.available);
}

function normalizedCurrency(value: unknown, fallback = 'USD'): string {
  return typeof value === 'string' && value.trim()
    ? value.trim().toUpperCase()
    : fallback;
}

function sourceCurrency(value: unknown): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim().toUpperCase()
    : null;
}

function accountCurrency(account: SnapshotAccount): string | null {
  const balance = account.balance;
  return sourceCurrency(
    balance && typeof balance === 'object' ? balance.iso_currency_code : undefined
  );
}

function accountId(account: SnapshotAccount, index: number): string {
  return String(account.account_id || account.id || `index-${index}`);
}

function holdingId(holding: SnapshotHolding, index: number): string {
  return String(
    holding.id ||
      [holding.account_id, holding.security_id].filter(Boolean).join(':') ||
      `index-${index}`
  );
}

/**
 * Allocation bucket for value an account reports but no holding itemizes.
 */
const UNCLASSIFIED_ASSET_TYPE = 'Unclassified';

/** Below this, a coverage gap is rounding or pricing skew rather than missing positions. */
const COVERAGE_GAP_MIN = 1;
const COVERAGE_GAP_RATIO = 0.005;

function coverageGapThreshold(reportedBalance: number): number {
  return Math.max(COVERAGE_GAP_MIN, Math.abs(reportedBalance) * COVERAGE_GAP_RATIO);
}

/**
 * Institution-reported investment market value. `available` is ignored: on
 * brokerages it can mean buying power or withdrawable cash, not the account's
 * total, and must not inflate investments when `current` is missing.
 */
function knownReportedInvestmentBalance(account: SnapshotAccount): number | null {
  const balance = account.balance;
  if (typeof balance === 'number') return finiteNumber(balance);
  if (!balance || typeof balance !== 'object') return null;
  return finiteNumber(balance.current);
}

/**
 * SnapTrade payloads sometimes omit the `snaptrade-` prefix on one side of the
 * feed. Strip it only when matching within SnapTrade — never equate a bare
 * Plaid account id with a SnapTrade-prefixed id that happens to share a suffix.
 */
export function holdingBelongsToInvestmentAccount(
  holdingAccountId: unknown,
  account: Pick<SnapshotAccount, 'account_id' | 'id' | 'source'>
): boolean {
  if (typeof holdingAccountId !== 'string' || !holdingAccountId) return false;
  const accountKey = account.account_id || account.id;
  if (typeof accountKey !== 'string' || !accountKey) return false;
  if (holdingAccountId === accountKey) return true;

  const isSnapTradeAccount =
    account.source === 'snaptrade' || accountKey.startsWith('snaptrade-');
  const isSnapTradeHolding = holdingAccountId.startsWith('snaptrade-');
  if (account.source === 'plaid' || (!isSnapTradeAccount && !isSnapTradeHolding)) {
    return false;
  }
  return (
    holdingAccountId.replace(/^snaptrade-/, '') ===
    accountKey.replace(/^snaptrade-/, '')
  );
}

/**
 * Dedup key for reconciling an account at most once. SnapTrade prefix variants
 * of the same account collapse; a Plaid id never collapses into SnapTrade.
 */
function accountReconciliationKey(account: SnapshotAccount): string | null {
  const id = account.account_id || account.id;
  if (typeof id !== 'string' || !id) return null;
  if (account.source === 'snaptrade' || id.startsWith('snaptrade-')) {
    return `snaptrade:${id.replace(/^snaptrade-/, '')}`;
  }
  return `${account.source || 'unknown'}:${id}`;
}

/**
 * What a provider-held investment account is worth.
 *
 * The institution's reported balance is the authority on the account's total;
 * itemized holdings describe how that total is composed. Some plans -- employer
 * 401(k)s in particular -- itemize only part of the account, so deriving the
 * total from holdings alone silently drops whatever the feed does not list.
 * Preferring the balance keeps that value in net worth, and holdings still
 * stand in when no balance is reported.
 *
 * A holdings sum slightly above the balance is pricing skew between two feeds
 * observed at different moments, not extra value. Keeping the larger figure
 * there avoids manufacturing a negative residual that no allocation bucket
 * could represent.
 *
 * Returns null only when neither figure is usable.
 */
export function resolveInvestmentAccountValue(
  account: SnapshotAccount,
  holdingsValue: number | null,
  reportingCurrency = 'USD'
): number | null {
  const currency = normalizedCurrency(reportingCurrency);
  // A balance in another currency is not comparable to a reporting-currency
  // holdings total, so it cannot stand in for one.
  const balance =
    accountCurrency(account) === currency ? knownReportedInvestmentBalance(account) : null;
  if (balance === null) return holdingsValue;
  if (holdingsValue === null) return balance;
  return Math.max(balance, holdingsValue);
}

function validObservationDate(value: unknown): string | Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

/**
 * Build the investment total once, excluding values that are unknown or
 * unconverted, and reconciling each provider-held account against the balance
 * its institution reports.
 */
export function buildCanonicalInvestmentPortfolio(
  holdings: readonly SnapshotHolding[] = [],
  securities: readonly SnapshotSecurity[] = [],
  accounts: readonly SnapshotAccount[] = [],
  reportingCurrency = 'USD'
): CanonicalInvestmentPortfolio {
  const currency = normalizedCurrency(reportingCurrency);
  const securityTypes = new Map(
    securities
      .filter(security => Boolean(security.security_id))
      .map(security => [String(security.security_id), security.type || null])
  );
  const allocation = new Map<string, number>();
  const includedSecurityIds = new Set<string>();
  const currencyMismatchIds: string[] = [];
  const unavailableValueIds: string[] = [];
  const holdingsCoverageGaps: InvestmentHoldingsCoverage[] = [];
  const countedHoldings: Array<{ accountId: string; value: number }> = [];
  let totalValue = 0;
  let holdingCount = 0;
  let unclassifiedValue = 0;

  holdings.forEach((holding, index) => {
    const id = holdingId(holding, index);
    if (sourceCurrency(holding.iso_currency_code) !== currency) {
      currencyMismatchIds.push(`holding:${id}`);
      return;
    }
    const value = finiteNumber(holding.institution_value);
    if (value === null) {
      unavailableValueIds.push(`holding:${id}`);
      return;
    }
    totalValue += value;
    holdingCount += 1;
    if (typeof holding.account_id === 'string' && holding.account_id) {
      countedHoldings.push({ accountId: holding.account_id, value });
    }
    if (holding.security_id) includedSecurityIds.add(String(holding.security_id));
    // Normalize so the same asset class from different providers (Plaid's "etf"
    // vs SnapTrade's "ETF") lands in one bucket instead of several.
    const assetType = normalizeAssetType(
      securityTypes.get(String(holding.security_id || '')) || holding.security_type
    );
    allocation.set(assetType, (allocation.get(assetType) || 0) + value);
  });

  // An account may legitimately appear once per source pass; reconcile each one
  // exactly once so a repeated entry cannot add its residual twice.
  const reconciledAccountKeys = new Set<string>();

  accounts.forEach((account, index) => {
    if (!classifyAccount(account).isInvestment) return;
    const id = accountId(account, index);

    if (account.source === 'manual') {
      if (accountCurrency(account) !== currency) {
        currencyMismatchIds.push(`account:${id}`);
        return;
      }
      const value = knownAccountBalance(account);
      if (value === null) {
        unavailableValueIds.push(`account:${id}`);
        return;
      }
      const assetValue = Math.max(0, value);
      totalValue += assetValue;
      allocation.set('Manual Investments', (allocation.get('Manual Investments') || 0) + assetValue);
      return;
    }

    // Without a provider account id there is no way to tell which holdings
    // belong to this account, so its balance cannot be reconciled against them.
    const matchKey = accountReconciliationKey(account);
    if (!matchKey || reconciledAccountKeys.has(matchKey)) return;
    reconciledAccountKeys.add(matchKey);

    const holdingsValue = countedHoldings
      .filter(holding => holdingBelongsToInvestmentAccount(holding.accountId, account))
      .reduce((sum, holding) => sum + holding.value, 0);
    const resolved = resolveInvestmentAccountValue(account, holdingsValue, currency);
    if (resolved === null) return;
    const unexplained = resolved - holdingsValue;
    if (unexplained <= 0) return;

    // The balance is authoritative for the total, so this value belongs in it.
    // It has no security behind it, so it cannot be attributed to an asset class.
    totalValue += unexplained;
    unclassifiedValue += unexplained;
    allocation.set(
      UNCLASSIFIED_ASSET_TYPE,
      (allocation.get(UNCLASSIFIED_ASSET_TYPE) || 0) + unexplained
    );

    // A positive residual means the balance won the resolution above, so the
    // resolved figure is exactly the balance the institution reported.
    if (unexplained > coverageGapThreshold(resolved)) {
      holdingsCoverageGaps.push({
        accountId: id,
        reportedBalance: resolved,
        holdingsValue,
        unexplainedValue: unexplained,
      });
    }
  });

  return {
    reportingCurrency: currency,
    totalValue,
    holdingCount,
    securityCount: includedSecurityIds.size,
    assetAllocation: Array.from(allocation.entries()).map(([type, value]) => ({
      type,
      value,
      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
    })),
    currencyMismatchIds,
    unavailableValueIds,
    unclassifiedValue,
    holdingsCoverageGaps,
  };
}

function buildSourceObservations(
  data: CanonicalSnapshotData,
  portfolio: CanonicalInvestmentPortfolio,
  reportingCurrency: string,
  balanceMaxAgeMs: number,
  investmentMaxAgeMs: number,
  homeValueMaxAgeMs: number
): SnapshotSourceObservation[] {
  const observations: SnapshotSourceObservation[] = [];
  const accounts = data.accounts || [];
  const holdings = data.investments?.holdings || [];

  accounts.forEach((account, index) => {
    const id = accountId(account, index);
    const asOf = validObservationDate(account.snapshotTimestamp || account.lastSyncedAt);
    // A manual account has no provider to go stale against: its value changes
    // only when the user edits it, so holding it to the balance refresh window
    // would mark it stale a day after entry and leave no way to clear that.
    //
    // A brokerage account's balance is its holdings value, and its timestamp is
    // the provider's last successful holdings sync, which advances at most daily
    // and not at all over a weekend. Judging it by the cash-balance window would
    // report a correctly-synced brokerage as stale most of the time, so it ages
    // on the investment window instead.
    const accountMaxAgeMs = account.source === 'manual'
      ? null
      : account.source === 'snaptrade'
        ? Math.max(balanceMaxAgeMs, investmentMaxAgeMs)
        : balanceMaxAgeMs;
    observations.push({
      id: `account:${id}`,
      required: true,
      status: asOf ? 'available' : 'unavailable',
      asOf,
      maxAgeMs: accountMaxAgeMs,
      error: asOf ? null : 'Account source timestamp is unavailable',
    });

    const classified = classifyAccount(account);
    if (classified.category === 'unknown') {
      observations.push({
        id: `account:${id}:classification`,
        required: true,
        status: 'unavailable',
        asOf: null,
        maxAgeMs: accountMaxAgeMs,
        error: 'Account type could not be classified for canonical metrics',
      });
    }
    if (knownAccountBalance(account) === null) {
      observations.push({
        id: `account:${id}:balance`,
        required: true,
        status: 'unavailable',
        asOf: null,
        maxAgeMs: accountMaxAgeMs,
        error: 'Account balance is unavailable',
      });
    }
    if (accountCurrency(account) !== reportingCurrency) {
      observations.push({
        id: `account:${id}:currency`,
        required: true,
        status: 'unavailable',
        asOf: null,
        maxAgeMs: accountMaxAgeMs,
        error: `Account balance has not been converted to ${reportingCurrency}`,
      });
    }
  });

  holdings.forEach((holding, index) => {
    const id = holdingId(holding, index);
    const asOf = validObservationDate(
      holding.institution_price_as_of || holding.snapshotTimestamp
    );
    observations.push({
      id: `holding:${id}`,
      required: true,
      status: asOf ? 'available' : 'unavailable',
      asOf,
      maxAgeMs: investmentMaxAgeMs,
      error: asOf ? null : 'Holding price timestamp is unavailable',
    });
  });

  for (const gap of portfolio.holdingsCoverageGaps || []) {
    observations.push({
      id: `account:${gap.accountId}:holdings-coverage`,
      // Not required: the institution's reported balance is authoritative and is
      // already in the total, so nothing is missing from net worth. What this
      // records is that the itemized positions explain only part of the account,
      // which asset allocation and retirement analytics read.
      required: false,
      status: 'unavailable',
      asOf: null,
      maxAgeMs: investmentMaxAgeMs,
      error:
        `Itemized holdings cover ${gap.holdingsValue.toFixed(2)} of the ` +
        `${gap.reportedBalance.toFixed(2)} ${reportingCurrency} balance this account reports; ` +
        `${gap.unexplainedValue.toFixed(2)} is counted but unclassified`,
    });
  }

  for (const id of [...portfolio.currencyMismatchIds, ...portfolio.unavailableValueIds]) {
    observations.push({
      id: `${id}:value`,
      required: true,
      status: 'unavailable',
      asOf: null,
      maxAgeMs: investmentMaxAgeMs,
      error: portfolio.currencyMismatchIds.includes(id)
        ? `Value has not been converted to ${reportingCurrency}`
        : 'Value is unavailable',
    });
  }

  const homeValue = data.homeValue;
  const homeAsOf = validObservationDate(homeValue?.lastUpdated);
  const hasKnownHomeValue = finiteNumber(homeValue?.valueMid) !== null;
  observations.push({
    id: 'home-value',
    required: hasKnownHomeValue,
    status: hasKnownHomeValue && homeAsOf ? 'available' : 'unavailable',
    asOf: hasKnownHomeValue && homeAsOf ? homeAsOf : null,
    // A manual override is the user's own figure, so it does not expire. Only a
    // provider estimate can drift away from what the home is currently worth.
    maxAgeMs: homeValue?.isManualOverride ? null : homeValueMaxAgeMs,
    error: data.metadata?.errors?.homeValue?.error ||
      (homeValue && !hasKnownHomeValue ? 'Home value midpoint is unavailable' : null),
  });

  const providerErrors: Array<[string, SnapshotError]> = [
    ...(data.metadata?.errors?.plaid || []).map(error => ['plaid', error] as [string, SnapshotError]),
    ...(data.metadata?.errors?.snaptrade || []).map(error => ['snaptrade', error] as [string, SnapshotError]),
  ];
  providerErrors.forEach(([provider, error], index) => {
    const suffix = error.tokenId || error.accountId || index;
    observations.push({
      id: `${provider}:error:${suffix}`,
      required: true,
      status: 'unavailable',
      asOf: null,
      maxAgeMs: balanceMaxAgeMs,
      error: error.error,
    });
  });

  if (data.metadata?.partialData && providerErrors.length === 0) {
    observations.push({
      id: 'financial-data:partial',
      required: true,
      status: 'unavailable',
      asOf: null,
      maxAgeMs: balanceMaxAgeMs,
      error: 'A required financial data source returned partial data',
    });
  }

  return observations;
}

export function buildCanonicalSnapshotCore(
  data: CanonicalSnapshotData,
  options: {
    computedAt?: Date;
    reportingCurrency?: string;
    balanceMaxAgeMs?: number;
    investmentMaxAgeMs?: number;
    homeValueMaxAgeMs?: number;
  } = {}
): CanonicalSnapshotCore {
  const computedAt = options.computedAt || new Date();
  const reportingCurrency = normalizedCurrency(options.reportingCurrency);
  const accounts = data.accounts || [];
  const precomputedPortfolio = data.investments?.portfolio;
  const portfolio = precomputedPortfolio?.reportingCurrency === reportingCurrency
    ? precomputedPortfolio
    : buildCanonicalInvestmentPortfolio(
        data.investments?.holdings || [],
        data.investments?.securities || [],
        accounts,
        reportingCurrency
      );
  let totalCash = 0;
  let totalDebt = 0;

  accounts.forEach(account => {
    if (accountCurrency(account) !== reportingCurrency) return;
    const balance = knownAccountBalance(account);
    if (balance === null) return;
    const classified = classifyAccount(account);
    if (classified.isInvestment) return;
    if (classified.isDebt) totalDebt += Math.abs(balance);
    else if (classified.isCash) {
      totalCash += Math.max(0, balance);
      if (balance < 0) totalDebt += Math.abs(balance);
    }
  });

  const midpoint = finiteNumber(data.homeValue?.valueMid);
  const homeValue = midpoint !== null && midpoint >= 0 ? midpoint : null;
  const financialOverview = computeFinancialOverview({
    reportingCurrency,
    totalCash,
    totalInvestments: portfolio.totalValue,
    homeValue,
    totalDebt,
  });
  const sourceObservations = buildSourceObservations(
    data,
    portfolio,
    reportingCurrency,
    options.balanceMaxAgeMs ?? 24 * HOUR_MS,
    options.investmentMaxAgeMs ?? 4 * DAY_MS,
    options.homeValueMaxAgeMs ?? 30 * DAY_MS
  );
  const quality = evaluateSnapshotQuality(sourceObservations, computedAt);

  return {
    computedAt,
    asOf: quality.asOf,
    status: quality.status,
    reportingCurrency,
    financialOverview,
    investmentPortfolio: portfolio,
    sourceObservations,
    quality,
  };
}
