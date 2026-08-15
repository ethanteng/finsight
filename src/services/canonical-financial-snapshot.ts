import {
  computeFinancialOverview,
  evaluateSnapshotQuality,
  type CanonicalFinancialOverview,
  type SnapshotQuality,
  type SnapshotSourceObservation,
} from '../domain/financial-truth';
import { classifyAccount, type AccountLike } from './account-classifier';

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

export interface CanonicalInvestmentPortfolio {
  reportingCurrency: string;
  totalValue: number;
  holdingCount: number;
  securityCount: number;
  assetAllocation: Array<{ type: string; value: number; percentage: number }>;
  currencyMismatchIds: string[];
  unavailableValueIds: string[];
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

function validObservationDate(value: unknown): string | Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

/** Build the investment total once, excluding values that are unknown or unconverted. */
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
      .map(security => [String(security.security_id), security.type || 'Unknown'])
  );
  const allocation = new Map<string, number>();
  const includedSecurityIds = new Set<string>();
  const currencyMismatchIds: string[] = [];
  const unavailableValueIds: string[] = [];
  let totalValue = 0;
  let holdingCount = 0;

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
    if (holding.security_id) includedSecurityIds.add(String(holding.security_id));
    const assetType = String(
      securityTypes.get(String(holding.security_id || '')) || holding.security_type || 'Unknown'
    );
    allocation.set(assetType, (allocation.get(assetType) || 0) + value);
  });

  accounts.forEach((account, index) => {
    if (account.source !== 'manual' || !classifyAccount(account).isInvestment) return;
    const id = accountId(account, index);
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
    const accountMaxAgeMs = account.source === 'manual' ? null : balanceMaxAgeMs;
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
