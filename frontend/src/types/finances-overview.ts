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
  /**
   * When the provider last reported observing this account. Absent on responses from
   * a server that predates the field, and null when no provider confirmed a sync --
   * the server never substitutes its own fetch time for one.
   */
  dataAsOf?: string | null;
  /** The snapshot judged this account's observation older than its own max age. */
  isDataStale?: boolean;
  /**
   * SnapTrade brokerage authorization backing this account. One authorization backs
   * several accounts, and it is what the manual-refresh endpoint takes.
   */
  brokerageAuthorizationId?: string;
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
     * Absent on responses from a server that predates the field.
     */
    newestSourceAsOf?: string | null;
    /**
     * Snapshot provenance. `stale` is deliberately not rendered anywhere: it means a
     * provider published its own data earlier than our refresh window expects, which no
     * user action can change. Only `partial` and `unavailable` are shown.
     */
    status: 'current' | 'stale' | 'partial' | 'unavailable';
    reportingCurrency: string;
    /** A newer revision is already scheduled, running, or queued on the server. */
    rebuildPending?: boolean;
  };
  warnings: Array<{ code: string; message: string }>;
  /**
   * Connections the user must re-authenticate. Optional so a response from a
   * server that predates the field renders as "nothing to flag" rather than
   * throwing mid-deploy.
   */
  connectionHealth?: {
    reauthRequiredCount: number;
    reauthRequiredInstitutions: string[];
  };
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
