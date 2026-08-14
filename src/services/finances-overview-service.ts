import {
  averageMonthlyCashFlow,
  type CashFlowSummary,
  type SnapshotQuality,
} from '../domain/financial-truth';
import { classifyAccount } from './account-classifier';
import { buildCanonicalInvestmentPortfolio } from './canonical-financial-snapshot';

export type FinancesSnapshotStatus = SnapshotQuality['status'];

export interface FinancesAccount {
  id?: string;
  account_id?: string;
  name?: string;
  type?: string;
  subtype?: string;
  institution?: string;
  source?: 'plaid' | 'snaptrade' | 'manual' | string;
  displayBalance?: number | null;
  balance?:
    | number
    | null
    | {
        current?: number | null;
        available?: number | null;
        limit?: number | null;
        iso_currency_code?: string | null;
      };
  [key: string]: unknown;
}

export interface FinancesManualAccount {
  id: string;
  name: string;
  amount: number;
  type: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface FinancesHomeData {
  address: string;
  value: number;
  valueLow: number | null;
  valueHigh: number | null;
  lastUpdated: string;
  isManualOverride: boolean;
  isSnapshotAligned: boolean;
}

export interface FinancesSnapshotLike {
  computedAt: string | Date;
  asOf?: string | Date | null;
  status?: string | null;
  reportingCurrency?: string | null;
  financialOverview: Record<string, unknown>;
  investmentPortfolio: Record<string, unknown>;
  accounts?: unknown;
  holdings?: unknown;
  securities?: unknown;
  transactions?: unknown;
  transactionsSummary?: unknown;
  activities?: unknown;
  quality?: unknown;
  sourceObservations?: unknown;
  meta?: unknown;
}

export interface FinancesOverviewInput {
  snapshot: FinancesSnapshotLike;
  manualAccounts?: readonly FinancesManualAccount[];
  overrides?: {
    monthlyIncome: number | null;
    monthlyExpense: number | null;
  };
  currentHome?: FinancesHomeData | null;
  userTimeZone?: string | null;
}

export interface FinancesAccountGroup {
  accounts: FinancesAccount[];
  totalBalance: number | null;
  unavailableBalanceCount: number;
}

export interface FinancesOverview {
  userTimeZone: string | null;
  revision: {
    id: string;
    computedAt: string;
    asOf: string | null;
    status: FinancesSnapshotStatus;
    reportingCurrency: string;
  };
  warnings: Array<{ code: string; message: string }>;
  financialOverview: {
    netWorth: number;
    totalCash: number;
    totalInvestments: number;
    totalDebt: number;
    homeValue: number | null;
  };
  investmentPortfolio: Record<string, unknown>;
  accountGroups: {
    cash: FinancesAccountGroup;
    investments: FinancesAccountGroup;
    debt: FinancesAccountGroup;
    other: FinancesAccountGroup;
  };
  cashFlow: {
    monthCount: number;
    calculatedMonthlyIncome: number | null;
    calculatedMonthlyExpense: number | null;
    calculatedMonthlyOperatingCashFlow: number | null;
    monthlyIncomeOverride: number | null;
    monthlyExpenseOverride: number | null;
    effectiveMonthlyIncome: number | null;
    effectiveMonthlyExpense: number | null;
  };
  home: FinancesHomeData | null;
  manualAccounts: FinancesManualAccount[];
}

export interface FinancesAccountDetails {
  revisionId: string;
  accountId: string;
  transactions: any[];
  holdings: any[];
  investmentTransactions: any[];
  portfolio: ReturnType<typeof buildCanonicalInvestmentPortfolio>;
}

function iso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function requiredFinite(value: unknown, field: string): number {
  const result = finite(value);
  if (result === null) throw new Error(`Finances snapshot ${field} is unavailable`);
  return result;
}

function accountId(account: FinancesAccount): string {
  return String(account.account_id || account.id || '');
}

function accountBalance(account: FinancesAccount): number | null {
  if (Object.prototype.hasOwnProperty.call(account, 'displayBalance')) {
    return finite(account.displayBalance);
  }
  if (typeof account.balance === 'number') return finite(account.balance);
  if (!account.balance || typeof account.balance !== 'object') return null;
  return finite(account.balance.current) ?? finite(account.balance.available);
}

function totalKnownBalances(accounts: readonly FinancesAccount[], absolute = false): number | null {
  const balances = accounts.map(accountBalance).filter((value): value is number => value !== null);
  if (accounts.length > 0 && balances.length === 0) return null;
  return balances.reduce((total, value) => total + (absolute ? Math.abs(value) : value), 0);
}

function unavailableBalanceCount(accounts: readonly FinancesAccount[]): number {
  return accounts.filter(account => accountBalance(account) === null).length;
}

export function buildAccountDisplayBalances(
  accountsInput: unknown,
  holdingsInput: unknown,
  reportingCurrencyInput: unknown
): Record<string, number | null> {
  const accounts = Array.isArray(accountsInput) ? accountsInput as FinancesAccount[] : [];
  const holdings = Array.isArray(holdingsInput) ? holdingsInput as any[] : [];
  const reportingCurrency = typeof reportingCurrencyInput === 'string'
    ? reportingCurrencyInput.toUpperCase()
    : 'USD';
  const balances: Record<string, number | null> = {};

  for (const account of accounts) {
    const id = accountId(account);
    if (!id) continue;
    const classified = classifyAccount(account);
    const rawBalance = accountBalance(account);
    if (classified.isInvestment && account.source !== 'manual') {
      const values = holdings
        .filter(holding => accountIdMatches(holding?.account_id, id))
        .filter(holding => String(holding?.iso_currency_code || '').toUpperCase() === reportingCurrency)
        .map(holding => finite(holding?.institution_value))
        .filter((value): value is number => value !== null);
      balances[id] = values.length > 0 ? values.reduce((total, value) => total + value, 0) : null;
    } else if ((classified.isDebt || classified.balance < 0) && rawBalance !== null) {
      balances[id] = Math.abs(rawBalance);
    } else {
      balances[id] = rawBalance;
    }
  }
  return balances;
}

function normalizeStatus(value: unknown): FinancesSnapshotStatus {
  return value === 'stale' || value === 'partial' || value === 'unavailable' ? value : 'current';
}

export function averageCanonicalTransactionSummary(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const summary = value as any;
  if (!summary.byMonth || typeof summary.byMonth !== 'object') return null;
  const byMonth = Object.fromEntries(
    Object.entries(summary.byMonth).map(([month, raw]) => {
      const entry = raw && typeof raw === 'object' ? raw as any : {};
      return [month, {
        income: finite(entry.income) ?? 0,
        expenses: finite(entry.expense) ?? 0,
        operatingCashFlow: finite(entry.operatingCashFlow) ?? 0,
      }];
    })
  );
  const canonical: CashFlowSummary = {
    currency: typeof summary.reportingCurrency === 'string' ? summary.reportingCurrency : 'USD',
    incomeTotal: finite(summary.incomeTotal) ?? 0,
    expenseTotal: finite(summary.expenseTotal) ?? 0,
    operatingCashFlow: finite(summary.operatingCashFlow) ?? 0,
    byExpenseCategory: summary.byCategory && typeof summary.byCategory === 'object'
      ? summary.byCategory
      : {},
    byMonth,
    includedTransactionIds: Array.isArray(summary.includedTransactionIds)
      ? summary.includedTransactionIds
      : [],
    excludedTransactionIds: Array.isArray(summary.excludedTransactionIds)
      ? summary.excludedTransactionIds
      : [],
  };
  return averageMonthlyCashFlow(canonical);
}

function snapshotHome(snapshot: FinancesSnapshotLike, currentHome?: FinancesHomeData | null): FinancesHomeData | null {
  const meta = snapshot.meta && typeof snapshot.meta === 'object' ? snapshot.meta as any : {};
  const stored = meta.home && typeof meta.home === 'object' ? meta.home as any : null;
  const candidate = stored || currentHome;
  const canonicalValue = finite(snapshot.financialOverview.homeValue);
  if (canonicalValue === null) return null;

  const candidateValue = finite(candidate?.valueMid) ?? finite(candidate?.value);
  const isSnapshotAligned = candidateValue !== null && Math.abs(candidateValue - canonicalValue) < 0.01;
  const isManualOverride = Boolean(candidate?.isManualOverride) && isSnapshotAligned;
  const lastUpdated = iso(candidate?.lastUpdated) || iso(snapshot.computedAt)!;

  return {
    address: typeof candidate?.address === 'string' ? candidate.address : '',
    value: canonicalValue,
    // Provider estimates may have a range. A manual number is a point value,
    // not a lower/upper estimate, so never manufacture a range for it.
    valueLow: !isSnapshotAligned || isManualOverride ? null : finite(candidate?.valueLow),
    valueHigh: !isSnapshotAligned || isManualOverride ? null : finite(candidate?.valueHigh),
    lastUpdated,
    isManualOverride,
    isSnapshotAligned,
  };
}

function groupAccounts(snapshot: FinancesSnapshotLike) {
  const groups = {
    cash: [] as FinancesAccount[],
    investments: [] as FinancesAccount[],
    debt: [] as FinancesAccount[],
    other: [] as FinancesAccount[],
  };
  const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts as FinancesAccount[] : [];
  const meta = snapshot.meta && typeof snapshot.meta === 'object' ? snapshot.meta as any : {};
  const storedDisplayBalances = meta.accountDisplayBalances && typeof meta.accountDisplayBalances === 'object'
    ? meta.accountDisplayBalances as Record<string, unknown>
    : {};

  for (const account of accounts) {
    const classified = classifyAccount(account);
    const id = accountId(account);
    let displayBalance = Object.prototype.hasOwnProperty.call(storedDisplayBalances, id)
      ? finite(storedDisplayBalances[id])
      : accountBalance(account);
    if (classified.isDebt && displayBalance !== null) displayBalance = Math.abs(displayBalance);
    const displayAccount = { ...account, displayBalance };
    // Canonical truth treats an overdraft as debt, not negative cash.
    if (classified.isCash && classified.balance < 0) groups.debt.push({ ...displayAccount, displayBalance: Math.abs(classified.balance) });
    else if (classified.isCash) groups.cash.push(displayAccount);
    else if (classified.isInvestment) groups.investments.push(displayAccount);
    else if (classified.isDebt) groups.debt.push(displayAccount);
    else groups.other.push(displayAccount);
  }
  return groups;
}

export function buildFinancesOverview(input: FinancesOverviewInput): FinancesOverview {
  const { snapshot } = input;
  const computedAt = iso(snapshot.computedAt);
  if (!computedAt) throw new Error('Finances snapshot computedAt is invalid');

  const overview = snapshot.financialOverview || {};
  const totalCash = requiredFinite(overview.totalCash, 'totalCash');
  const totalInvestments = requiredFinite(overview.totalInvestments, 'totalInvestments');
  const totalDebt = requiredFinite(overview.totalDebt, 'totalDebt');
  const netWorth = requiredFinite(overview.netWorth, 'netWorth');
  const groups = groupAccounts(snapshot);
  const averages = averageCanonicalTransactionSummary(snapshot.transactionsSummary);
  const monthlyIncomeOverride = input.overrides?.monthlyIncome ?? null;
  const monthlyExpenseOverride = input.overrides?.monthlyExpense ?? null;
  const home = snapshotHome(snapshot, input.currentHome);
  const manualAccounts = (input.manualAccounts || []).map(account => ({ ...account }));

  const warnings: FinancesOverview['warnings'] = [];
  const status = normalizeStatus(snapshot.status);
  if (status === 'partial') warnings.push({ code: 'partial', message: 'Some connected sources were unavailable when this snapshot was created.' });
  if (status === 'stale') warnings.push({ code: 'stale', message: 'Some connected-source data is older than its expected refresh window.' });
  if (status === 'unavailable') warnings.push({ code: 'unavailable', message: 'Connected-source data was unavailable for this snapshot.' });

  const quality = snapshot.quality && typeof snapshot.quality === 'object' ? snapshot.quality as any : {};
  const unavailableSources = Array.isArray(quality.unavailableSourceIds) ? quality.unavailableSourceIds.length : 0;
  if (unavailableSources > 0 && status === 'current') {
    warnings.push({ code: 'optional-sources-unavailable', message: `${unavailableSources} optional data source${unavailableSources === 1 ? ' was' : 's were'} unavailable.` });
  }

  const transactionSummary = snapshot.transactionsSummary && typeof snapshot.transactionsSummary === 'object'
    ? snapshot.transactionsSummary as any
    : null;
  const excludedClassificationCount = Array.isArray(transactionSummary?.unclassifiedTransactionIds)
    ? transactionSummary.unclassifiedTransactionIds.length
    : 0;
  const excludedCurrencyCount = Array.isArray(transactionSummary?.currencyMismatchTransactionIds)
    ? transactionSummary.currencyMismatchTransactionIds.length
    : 0;
  if (excludedClassificationCount > 0) {
    warnings.push({ code: 'unclassified-transactions', message: `${excludedClassificationCount} transaction${excludedClassificationCount === 1 ? ' was' : 's were'} excluded from income and spending because categorization was unavailable.` });
  }
  if (excludedCurrencyCount > 0) {
    warnings.push({ code: 'currency-mismatch', message: `${excludedCurrencyCount} transaction${excludedCurrencyCount === 1 ? ' was' : 's were'} excluded because currency conversion was unavailable.` });
  }
  if (home && !home.isSnapshotAligned) {
    warnings.push({ code: 'home-metadata-out-of-sync', message: 'Home details changed after this financial snapshot; refresh totals to align them.' });
  }

  const snapshotManualIds = new Set(
    [...groups.cash, ...groups.investments, ...groups.debt, ...groups.other]
      .filter(account => account.source === 'manual')
      .map(accountId)
  );
  const manualAccountsAligned = manualAccounts.every(account => snapshotManualIds.has(`manual-${account.id}`))
    && snapshotManualIds.size === manualAccounts.length;
  if (!manualAccountsAligned) {
    warnings.push({ code: 'manual-accounts-out-of-sync', message: 'Manual accounts changed after this financial snapshot; refresh totals to align them.' });
  }

  return {
    userTimeZone: input.userTimeZone?.trim() || null,
    revision: {
      id: computedAt,
      computedAt,
      asOf: iso(snapshot.asOf),
      status,
      reportingCurrency: typeof snapshot.reportingCurrency === 'string'
        ? snapshot.reportingCurrency
        : 'USD',
    },
    warnings,
    financialOverview: {
      netWorth,
      totalCash,
      totalInvestments,
      totalDebt,
      homeValue: finite(overview.homeValue),
    },
    investmentPortfolio: snapshot.investmentPortfolio || {},
    accountGroups: {
      cash: { accounts: groups.cash, totalBalance: totalCash, unavailableBalanceCount: unavailableBalanceCount(groups.cash) },
      investments: { accounts: groups.investments, totalBalance: totalInvestments, unavailableBalanceCount: unavailableBalanceCount(groups.investments) },
      debt: { accounts: groups.debt, totalBalance: totalDebt, unavailableBalanceCount: unavailableBalanceCount(groups.debt) },
      other: { accounts: groups.other, totalBalance: totalKnownBalances(groups.other), unavailableBalanceCount: unavailableBalanceCount(groups.other) },
    },
    cashFlow: {
      monthCount: averages?.monthCount ?? 0,
      calculatedMonthlyIncome: averages?.averageIncome ?? null,
      calculatedMonthlyExpense: averages?.averageExpenses ?? null,
      calculatedMonthlyOperatingCashFlow: averages?.averageOperatingCashFlow ?? null,
      monthlyIncomeOverride,
      monthlyExpenseOverride,
      effectiveMonthlyIncome: monthlyIncomeOverride ?? averages?.averageIncome ?? null,
      effectiveMonthlyExpense: monthlyExpenseOverride ?? averages?.averageExpenses ?? null,
    },
    home,
    manualAccounts,
  };
}

function accountIdMatches(candidate: unknown, requested: string): boolean {
  if (typeof candidate !== 'string') return false;
  if (candidate === requested) return true;
  return candidate.replace(/^snaptrade-/, '') === requested.replace(/^snaptrade-/, '');
}

export function buildFinancesAccountDetails(
  snapshot: FinancesSnapshotLike,
  requestedAccountId: string
): FinancesAccountDetails | null {
  const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts as FinancesAccount[] : [];
  const account = accounts.find(candidate =>
    accountIdMatches(candidate.account_id, requestedAccountId)
      || accountIdMatches(candidate.id, requestedAccountId)
  );
  if (!account) return null;

  const resolvedId = accountId(account);
  const forAccount = (entry: any) => accountIdMatches(entry?.account_id, resolvedId);
  const transactions = (Array.isArray(snapshot.transactions) ? snapshot.transactions : [])
    .filter(forAccount)
    .sort((left: any, right: any) => Date.parse(right?.date || '') - Date.parse(left?.date || ''));
  const holdings = (Array.isArray(snapshot.holdings) ? snapshot.holdings : []).filter(forAccount);
  const investmentTransactions = (Array.isArray(snapshot.activities) ? snapshot.activities : [])
    .filter(forAccount)
    .sort((left: any, right: any) => Date.parse(right?.date || '') - Date.parse(left?.date || ''));
  const securities = Array.isArray(snapshot.securities) ? snapshot.securities : [];
  const reportingCurrency = typeof snapshot.reportingCurrency === 'string'
    ? snapshot.reportingCurrency
    : 'USD';

  return {
    revisionId: iso(snapshot.computedAt)!,
    accountId: resolvedId,
    transactions,
    holdings,
    investmentTransactions,
    portfolio: buildCanonicalInvestmentPortfolio(holdings, securities, [account], reportingCurrency),
  };
}
