/**
 * What the user has linked, so "not linked" is never read as "zero".
 *
 * The canonical snapshot keeps totals for cash, investments and debt, and the
 * cash-flow forecast keeps an expected month. For someone who has linked
 * nothing -- every calculator lead, and every trial in its first minutes -- or
 * only one kind of account, those totals are zero because nothing reports to
 * them, not because the user has nothing. Quoted as facts they produced
 * answers like "your net worth is $0", and a calculator reading them concluded
 * that a buyer with no cash account linked had no cash for a down payment.
 *
 * Ask Linc answers with what it has. To do that honestly it has to know which
 * of its figures describe the user and which describe an empty connection.
 * This is that record, and it is deliberately coarse: counts by kind, read
 * from the account list and the history the snapshot already holds.
 */

import { classifyAccount, type AccountLike } from '../services/account-classifier';
import type { FinancialContextSnapshot } from './types';

export type LinkedData = NonNullable<FinancialContextSnapshot['linkedData']>;

/** Nothing linked: what a user with no snapshot at all has. */
export const NOTHING_LINKED: LinkedData = {
  accounts: 0,
  cash: 0,
  credit: 0,
  loans: 0,
  investments: 0,
  holdings: 0,
  transactionMonths: 0,
};

/**
 * Count linked accounts by kind with the one classifier every other view of
 * the portfolio uses, so a "cash account" here is a cash account everywhere.
 */
export function describeLinkedData(args: {
  accounts: readonly AccountLike[];
  holdingCount?: number | null;
  /** Calendar months the transaction summary has any activity in. */
  transactionMonths?: number | null;
}): LinkedData {
  const linked = { ...NOTHING_LINKED, accounts: args.accounts.length };
  for (const account of args.accounts) {
    const classified = classifyAccount(account);
    if (classified.category === 'credit') linked.credit += 1;
    else if (classified.category === 'loan' || classified.category === 'mortgage') linked.loans += 1;
    else if (classified.isInvestment) linked.investments += 1;
    else if (classified.isCash) linked.cash += 1;
  }
  linked.holdings = Math.max(0, Math.trunc(args.holdingCount ?? 0));
  linked.transactionMonths = Math.max(0, Math.trunc(args.transactionMonths ?? 0));
  return linked;
}

/**
 * Whether income can be read from the user's own transactions. Only a cash
 * account receives a paycheck, so a linked card alone says nothing about it.
 */
export function incomeLinked(linked: LinkedData): boolean {
  return linked.transactionMonths > 0 && linked.cash > 0;
}

/**
 * Whether spending can be read from the user's own transactions. Cards count:
 * purchases made on them are spending even with no checking account linked.
 */
export function spendingLinked(linked: LinkedData): boolean {
  return linked.transactionMonths > 0 && (linked.cash > 0 || linked.credit > 0);
}

/**
 * The categories the snapshot's totals are blind to, in the user's terms.
 * Empty when everything a total reads from is linked, and when the record is
 * absent: an older snapshot path that predates it behaves as it always has.
 */
export function unlinkedCategories(linked: LinkedData | undefined): string[] {
  if (!linked) return [];
  const missing: string[] = [];
  if (linked.cash === 0) missing.push('checking or savings accounts');
  if (linked.credit === 0) missing.push('credit cards');
  if (linked.loans === 0) missing.push('loans or a mortgage');
  if (linked.investments === 0) missing.push('investment or retirement accounts');
  if (!spendingLinked(linked)) missing.push('transaction history');
  return missing;
}

export type OverviewTotal = 'netWorth' | 'totalCash' | 'totalInvestments' | 'totalDebt';

const isZeroOrMissing = (value: unknown): boolean =>
  typeof value !== 'number' || !Number.isFinite(value) || value === 0;

/**
 * Which overview totals describe the user rather than an empty connection, and
 * what net worth leaves out. A zero from a kind of account nobody linked is an
 * empty connection; a nonzero total is real money from somewhere and stays.
 * With nothing linked there is no net worth to state. Without the record,
 * every total shows, as it always has. The fact pack and the reviewer both
 * read this, so neither is shown a zero the other is told to ignore.
 */
export function linkedOverview(
  linked: LinkedData | undefined,
  overview: { totalCash?: unknown; totalInvestments?: unknown; totalDebt?: unknown }
): { shown: Set<OverviewTotal>; netWorthLeavesOut: string[] } {
  if (!linked) return { shown: new Set(['netWorth', 'totalCash', 'totalInvestments', 'totalDebt']), netWorthLeavesOut: [] };
  if (linked.accounts === 0) return { shown: new Set(), netWorthLeavesOut: [] };
  const debtLinked = linked.credit + linked.loans;
  const shown = new Set<OverviewTotal>(['netWorth']);
  if (!(linked.cash === 0 && isZeroOrMissing(overview.totalCash))) shown.add('totalCash');
  if (!(linked.investments === 0 && isZeroOrMissing(overview.totalInvestments))) shown.add('totalInvestments');
  if (!(debtLinked === 0 && isZeroOrMissing(overview.totalDebt))) shown.add('totalDebt');
  return {
    shown,
    netWorthLeavesOut: [
      linked.cash === 0 ? 'cash accounts' : null,
      linked.investments === 0 ? 'investment accounts' : null,
      debtLinked === 0 ? 'credit cards or loans' : null,
    ].filter((item): item is string => item !== null),
  };
}

/** A zero portfolio with no investment account linked: an empty connection. */
export function emptyPortfolio(linked: LinkedData | undefined, value: unknown): boolean {
  return linked?.investments === 0 && isZeroOrMissing(value);
}

/**
 * A short, model-facing statement of what is and is not linked, so a zero
 * from an empty connection is never repeated as a fact about the user. Null
 * when everything is linked or the record is absent.
 */
export function describeLinkedDataForModel(linked: LinkedData | undefined): string | null {
  if (!linked) return null;
  if (linked.accounts === 0) {
    return 'The user has not linked any accounts yet. There are no balances, transactions or holdings to read, ' +
      'so never describe their cash, investments, debt, income or spending as zero or as missing money. ' +
      'Answer from the figures they have stated, the facts supplied, and general principles, and state any assumption you rely on.';
  }
  const missing = unlinkedCategories(linked);
  if (missing.length === 0) return null;
  return `The user has linked ${linked.accounts} account${linked.accounts === 1 ? '' : 's'}, but no ${missing.join(', no ')}. ` +
    'A total or average for a category with nothing linked describes an empty connection, not the user: never ' +
    'present it as their balance, income or spending. Use what they have stated instead, and state the assumption.';
}
