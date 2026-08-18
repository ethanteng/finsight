import type { Account } from '../services/financial-data-service';
import type { AccountSummaryItem } from './types';

function resolveAccountId(account: Account): string {
  return String(
    account.account_id
    || (account as Account & { plaidAccountId?: string }).plaidAccountId
    || (account as Account & { persistentAccountId?: string }).persistentAccountId
    || account.id
    || ''
  );
}

export function buildAccountSummaries(
  accounts: Account[],
  displayBalances: Record<string, unknown> = {}
): AccountSummaryItem[] {
  return accounts.map(account => {
    const id = resolveAccountId(account);
    const storedDisplayBalance = Object.prototype.hasOwnProperty.call(displayBalances, id)
      ? displayBalances[id]
      : undefined;
    const preferredBalance = typeof storedDisplayBalance === 'number' && Number.isFinite(storedDisplayBalance)
      ? storedDisplayBalance
      : typeof account.balance?.current === 'number' && Number.isFinite(account.balance.current)
        ? account.balance.current
        : account.balance?.available;
    const balance = typeof preferredBalance === 'number' && Number.isFinite(preferredBalance)
      ? preferredBalance
      : null;
    const liabilityDetails = account.liabilityDetails;
    const primaryLiability = liabilityDetails?.[0];
    const primaryApr = primaryLiability?.aprs?.find(apr => apr.type === 'purchase_apr')
      ?? primaryLiability?.aprs?.[0];

    return {
      id,
      name: account.name,
      type: account.type,
      subtype: account.subtype || account.type,
      balance,
      institution: account.institution,
      interestRate: primaryLiability?.interestRatePercentage
        ?? primaryApr?.percentage
        ?? (account as Account & { interestRate?: number }).interestRate,
      liabilityDetails,
    };
  });
}
