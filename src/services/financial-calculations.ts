import { financialAccountIdentityKey, isNewerAccountSnapshot } from './account-identity';
import { buildCanonicalInvestmentPortfolio } from './canonical-financial-snapshot';
import type {
  Account,
  HomeData,
  Holding,
  PortfolioAnalysis,
  Security,
  Transaction,
  UnifiedFinancialData,
} from './financial-data-service';

type FinancialSourceData = {
  accounts?: Account[];
  balances?: Record<string, unknown>;
  holdings?: Holding[];
  securities?: Security[];
  transactions?: Transaction[];
};

export function analyzePortfolio(
  holdings: Holding[],
  securities: Security[],
  accounts: Account[] = []
): PortfolioAnalysis {
  return buildCanonicalInvestmentPortfolio(holdings, securities, accounts, 'USD');
}

/**
 * Pure calculation boundary for merging provider observations. Account,
 * holding, and security identity are resolved exactly once here before data is
 * persisted as a canonical snapshot.
 */
export function mergeFinancialSources(
  plaidData: FinancialSourceData | null,
  snapTradeData: FinancialSourceData | null,
  manualAccountsData: Pick<FinancialSourceData, 'accounts'> | null,
  homeValue: HomeData | null
): Omit<UnifiedFinancialData, 'metadata'> {
  const rawAccounts = [
    ...(plaidData?.accounts || []),
    ...(snapTradeData?.accounts || []),
    ...(manualAccountsData?.accounts || []),
  ];
  const accountMap = new Map<string, Account>();

  for (const account of rawAccounts) {
    const key = financialAccountIdentityKey(account);
    if (!key) {
      console.warn(`Account without provider identity skipped: ${account.name}`);
      continue;
    }
    const existing = accountMap.get(key);
    if (!existing || isNewerAccountSnapshot(existing, account)) accountMap.set(key, account);
  }

  const accounts = Array.from(accountMap.values());
  const accountIdToLogicalKey = new Map<string, string>();
  for (const account of rawAccounts) {
    const accountId = account.account_id || (account as any).plaidAccountId || account.persistentAccountId;
    const logicalKey = financialAccountIdentityKey(account);
    if (accountId && logicalKey) accountIdToLogicalKey.set(accountId, logicalKey);
  }

  const rawHoldings = [...(plaidData?.holdings || []), ...(snapTradeData?.holdings || [])];
  const holdingMap = new Map<string, Holding>();
  for (const holding of rawHoldings) {
    const accountKey = accountIdToLogicalKey.get(holding.account_id) ?? `id:${holding.account_id}`;
    const key = `${accountKey}|${holding.security_id}`;
    const existing = holdingMap.get(key);
    if (!existing) {
      holdingMap.set(key, holding);
      continue;
    }
    const existingTimestamp = Date.parse(existing.institution_price_as_of || '');
    const candidateTimestamp = Date.parse(holding.institution_price_as_of || '');
    if (!Number.isNaN(candidateTimestamp) &&
        (Number.isNaN(existingTimestamp) || candidateTimestamp >= existingTimestamp)) {
      holdingMap.set(key, holding);
    }
  }
  const holdings = Array.from(holdingMap.values());

  const securityMap = new Map<string, Security>();
  for (const security of [...(plaidData?.securities || []), ...(snapTradeData?.securities || [])]) {
    if (security.security_id && !securityMap.has(security.security_id)) {
      securityMap.set(security.security_id, security);
    }
  }
  const securities = Array.from(securityMap.values());

  const plaidTransactions = plaidData?.transactions || [];
  const bankingTransactions = plaidTransactions.filter(transaction => !transaction.isInvestmentTransaction);
  const investmentTransactions = [
    ...plaidTransactions.filter(transaction => transaction.isInvestmentTransaction),
    ...(snapTradeData?.transactions || []),
  ];

  return {
    accounts,
    balances: (plaidData?.balances || {}) as UnifiedFinancialData['balances'],
    investments: {
      holdings,
      securities,
      portfolio: analyzePortfolio(holdings, securities, accounts),
      transactions: investmentTransactions,
    },
    bankingTransactions,
    homeValue,
  };
}

export function extractWindowedInvestmentActivities(data: any, since: Date): any[] {
  const activities = Array.isArray(data?.investments?.transactions) ? data.investments.transactions : [];
  return activities.filter((activity: any) => {
    const date = new Date(activity.tradeDate || activity.settlementDate || activity.date || activity.createdAt);
    return !Number.isNaN(date.getTime()) && date >= since;
  });
}
