import type { ManualAccount } from './manual-account';

export interface FinancesAccount {
  id?: string;
  account_id?: string;
  name?: string;
  type?: string;
  subtype?: string;
  institution?: string;
  source?: 'plaid' | 'snaptrade' | 'manual' | string;
  displayBalance?: number | null;
  balance?: number | null | {
    current?: number | null;
    available?: number | null;
    limit?: number | null;
    iso_currency_code?: string | null;
  };
  accountNumber?: string;
}

export interface FinancesAccountGroup {
  accounts: FinancesAccount[];
  totalBalance: number | null;
  unavailableBalanceCount: number;
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

export interface FinancesOverview {
  userTimeZone: string | null;
  revision: {
    id: string;
    /** Oldest expiring source observation — how old the oldest part of this snapshot is. */
    asOf: string | null;
    computedAt: string;
    /**
     * Newest expiring source observation — when something in this snapshot last updated.
     * Absent on responses from a server that predates the field. Staleness comes from
     * `status`, never from this timestamp.
     */
    newestSourceAsOf?: string | null;
    status: 'current' | 'stale' | 'partial' | 'unavailable';
    reportingCurrency: string;
    /** A newer revision is already scheduled, running, or queued on the server. */
    rebuildPending?: boolean;
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
  manualAccounts: ManualAccount[];
}

export interface FinancesAccountDetails {
  revisionId: string;
  accountId: string;
  transactions: Array<Record<string, unknown>>;
  holdings: Array<Record<string, unknown>>;
  investmentTransactions: Array<Record<string, unknown>>;
  portfolio: {
    reportingCurrency: string;
    totalValue: number;
    assetAllocation: Array<{ type: string; value: number; percentage: number }>;
    holdingCount: number;
    securityCount: number;
    currencyMismatchIds: string[];
    unavailableValueIds: string[];
  };
}
