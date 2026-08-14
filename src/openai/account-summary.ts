import type { Account } from '../services/financial-data-service';
import type { AccountSummaryItem } from './types';

export function buildAccountSummaries(accounts: Account[]): AccountSummaryItem[] {
  return accounts.map(account => {
    const availableBalance = account.balance?.available;
    const preferredBalance =
      typeof availableBalance === 'number' && Number.isFinite(availableBalance) &&
      (account.type === 'depository' || account.type === 'checking' || account.type === 'savings')
        ? availableBalance
        : account.balance?.current;
    const balance = typeof preferredBalance === 'number' && Number.isFinite(preferredBalance)
      ? preferredBalance
      : null;

    return {
      id: account.account_id || account.id,
      name: account.name,
      type: account.type,
      subtype: account.subtype || account.type,
      balance,
      institution: account.institution,
      interestRate: (account as Account & { interestRate?: number }).interestRate,
    };
  });
}
