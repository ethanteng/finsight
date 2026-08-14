import type { Account } from '../services/financial-data-service';
import type { AccountSummaryItem } from './types';

export function buildAccountSummaries(
  accounts: Account[],
  displayBalances: Record<string, unknown> = {}
): AccountSummaryItem[] {
  return accounts.map(account => {
    const id = account.account_id || account.id;
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

    return {
      id,
      name: account.name,
      type: account.type,
      subtype: account.subtype || account.type,
      balance,
      institution: account.institution,
      interestRate: (account as Account & { interestRate?: number }).interestRate,
    };
  });
}
