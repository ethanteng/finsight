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
 *
 * A balance the user entered by hand on the Finances page is neither. It
 * describes the user -- it is their own figure -- but nothing reports
 * transactions or holdings behind it, and calling it linked told someone with
 * only a typed-in balance that Linc had used "your connected investment
 * total". Entered balances are counted apart, under `entered`, and every label
 * built from them says the user entered them.
 */

import { classifyAccount, type AccountLike } from '../services/account-classifier';
import type { FinancialContextSnapshot } from './types';

export type LinkedData = NonNullable<FinancialContextSnapshot['linkedData']>;
export type EnteredBalances = NonNullable<LinkedData['entered']>;

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

const NOTHING_ENTERED: EnteredBalances = {
  accounts: 0,
  cash: 0,
  credit: 0,
  loans: 0,
  investments: 0,
};

/** The fields that say where an account came from, as the snapshot stores them. */
export interface AccountOrigin {
  source?: string | null;
  account_id?: string | null;
  institution?: string | null;
}

/**
 * Whether an account is a balance the user entered by hand rather than one a
 * provider reports. Recognized the same three ways snapshot persistence
 * recognizes one, since an older snapshot may carry only some of them.
 */
export function isEnteredBalance(account: AccountOrigin): boolean {
  return account.source === 'manual' ||
    (typeof account.account_id === 'string' && account.account_id.startsWith('manual-')) ||
    (typeof account.institution === 'string' && account.institution.toLowerCase() === 'manual');
}

/**
 * Count linked accounts by kind with the one classifier every other view of
 * the portfolio uses, so a "cash account" here is a cash account everywhere.
 * Balances the user entered are counted the same way, apart from them.
 */
export function describeLinkedData(args: {
  accounts: readonly (AccountLike & AccountOrigin)[];
  holdingCount?: number | null;
  /** Calendar months the transaction summary has any activity in. */
  transactionMonths?: number | null;
}): LinkedData {
  const linked: LinkedData = { ...NOTHING_LINKED };
  const entered: EnteredBalances = { ...NOTHING_ENTERED };
  for (const account of args.accounts) {
    const counts = isEnteredBalance(account) ? entered : linked;
    counts.accounts += 1;
    const classified = classifyAccount(account);
    if (classified.category === 'credit') counts.credit += 1;
    else if (classified.category === 'loan' || classified.category === 'mortgage') counts.loans += 1;
    else if (classified.isInvestment) counts.investments += 1;
    else if (classified.isCash) counts.cash += 1;
  }
  linked.holdings = Math.max(0, Math.trunc(args.holdingCount ?? 0));
  linked.transactionMonths = Math.max(0, Math.trunc(args.transactionMonths ?? 0));
  return entered.accounts > 0 ? { ...linked, entered } : linked;
}

/**
 * The record for a stored snapshot row: its account list, the months its
 * transaction summary covers, and how many holdings it itemizes. A row that
 * carries data but no account list is one coverage cannot be read from, not
 * proof that nothing is linked, so it gives no record (undefined) and keeps
 * the behavior that predates it. No row at all is nothing linked.
 */
export function linkedDataFromSnapshot(snapshot: {
  accounts?: unknown;
  transactionsSummary?: unknown;
  investmentPortfolio?: unknown;
  financialOverview?: unknown;
} | null | undefined): LinkedData | undefined {
  if (!snapshot) return { ...NOTHING_LINKED };
  const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts as (AccountLike & AccountOrigin)[] : [];
  const byMonth = (snapshot.transactionsSummary as { byMonth?: Record<string, unknown> } | null)?.byMonth;
  const transactionMonths = byMonth ? Object.keys(byMonth).length : 0;
  const holdingCount = (snapshot.investmentPortfolio as { holdingCount?: number } | null)?.holdingCount ?? 0;
  const overview = snapshot.financialOverview as Record<string, unknown> | null;
  const carriesData = transactionMonths > 0 || holdingCount > 0 || ['totalCash', 'totalInvestments', 'totalDebt']
    .some((key) => typeof overview?.[key] === 'number' && overview[key] !== 0);
  return accounts.length === 0 && carriesData
    ? undefined
    : describeLinkedData({ accounts, holdingCount, transactionMonths });
}

/**
 * Whether income can be read from the user's own transactions. Only a cash
 * account receives a paycheck, so a linked card alone says nothing about it,
 * and neither does a cash balance the user entered.
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

/** A kind of balance the overview totals. Debt is cards and loans together. */
export type BalanceKind = 'cash' | 'investments' | 'debt';

/**
 * What a total of one kind rests on: accounts the user linked, balances they
 * entered by hand, or both.
 */
export type BalanceBasis = 'linked' | 'entered' | 'linked_and_entered';

function countOf(
  counts: Pick<EnteredBalances, 'cash' | 'credit' | 'loans' | 'investments'>,
  kind: BalanceKind
): number {
  return kind === 'debt' ? counts.credit + counts.loans : counts[kind];
}

/**
 * What a total of this kind rests on, or null when nothing of the kind is
 * linked or entered. Without the record, linked, as it has always been read.
 */
export function balanceBasis(linked: LinkedData | undefined, kind: BalanceKind): BalanceBasis | null {
  if (!linked) return 'linked';
  const isLinked = countOf(linked, kind) > 0;
  const isEntered = countOf(linked.entered ?? NOTHING_ENTERED, kind) > 0;
  if (isLinked && isEntered) return 'linked_and_entered';
  if (isLinked) return 'linked';
  return isEntered ? 'entered' : null;
}

/**
 * The words that go after a total so a figure the user entered is never
 * presented as a linked account. Empty for a total from linked accounts alone.
 */
export function balanceBasisNote(linked: LinkedData | undefined, kind: BalanceKind): string {
  const basis = balanceBasis(linked, kind);
  if (basis === 'entered') return ' (entered by the user, not linked)';
  if (basis === 'linked_and_entered') return ' (linked accounts plus balances the user entered)';
  return '';
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The kinds of balance the user entered, in their terms. */
function enteredKinds(linked: LinkedData): string[] {
  const entered = linked.entered;
  if (!entered) return [];
  return [
    entered.cash > 0 ? 'cash' : null,
    entered.investments > 0 ? 'investment' : null,
    entered.credit + entered.loans > 0 ? 'debt' : null,
  ].filter((item): item is string => item !== null);
}

/**
 * The categories the snapshot's totals are blind to, in the user's terms:
 * nothing linked or entered for them. Transaction history is listed whenever
 * spending cannot be read, since an entered balance has none. Empty when
 * everything a total reads from is covered, and when the record is absent: an
 * older snapshot path that predates it behaves as it always has.
 */
export function unlinkedCategories(linked: LinkedData | undefined): string[] {
  if (!linked) return [];
  const missing: string[] = [];
  if (balanceBasis(linked, 'cash') === null) missing.push('checking or savings accounts');
  if (linked.credit === 0 && (linked.entered?.credit ?? 0) === 0) missing.push('credit cards');
  if (linked.loans === 0 && (linked.entered?.loans ?? 0) === 0) missing.push('loans or a mortgage');
  if (balanceBasis(linked, 'investments') === null) missing.push('investment or retirement accounts');
  if (!spendingLinked(linked)) missing.push('transaction history');
  return missing;
}

export type OverviewTotal = 'netWorth' | 'totalCash' | 'totalInvestments' | 'totalDebt';

const isZeroOrMissing = (value: unknown): boolean =>
  typeof value !== 'number' || !Number.isFinite(value) || value === 0;

/**
 * Which overview totals describe the user rather than an empty connection, and
 * what net worth leaves out. A zero from a kind of account nobody linked or
 * entered is an empty connection; a nonzero total is real money from somewhere
 * and stays. With nothing linked or entered there is no net worth to state.
 * Without the record, every total shows, as it always has. The fact pack and
 * the reviewer both read this, so neither is shown a zero the other is told to
 * ignore.
 */
export function linkedOverview(
  linked: LinkedData | undefined,
  overview: { totalCash?: unknown; totalInvestments?: unknown; totalDebt?: unknown }
): { shown: Set<OverviewTotal>; netWorthLeavesOut: string[] } {
  if (!linked) return { shown: new Set(['netWorth', 'totalCash', 'totalInvestments', 'totalDebt']), netWorthLeavesOut: [] };
  if (linked.accounts === 0 && !linked.entered?.accounts) return { shown: new Set(), netWorthLeavesOut: [] };
  const covered = (kind: BalanceKind) => balanceBasis(linked, kind) !== null;
  const shown = new Set<OverviewTotal>(['netWorth']);
  if (covered('cash') || !isZeroOrMissing(overview.totalCash)) shown.add('totalCash');
  if (covered('investments') || !isZeroOrMissing(overview.totalInvestments)) shown.add('totalInvestments');
  if (covered('debt') || !isZeroOrMissing(overview.totalDebt)) shown.add('totalDebt');
  return {
    shown,
    netWorthLeavesOut: [
      covered('cash') ? null : 'cash accounts',
      covered('investments') ? null : 'investment accounts',
      covered('debt') ? null : 'credit cards or loans',
    ].filter((item): item is string => item !== null),
  };
}

/** Whether net worth carries a home value: it adds a known one to the account totals. */
export function netWorthIncludesHome(overview: { homeValue?: unknown }): boolean {
  return typeof overview.homeValue === 'number' && Number.isFinite(overview.homeValue) && overview.homeValue > 0;
}

/** The sources net worth is built from, in words, home value included where it counts. */
function netWorthSources(linked: LinkedData | undefined, includesHome: boolean): string {
  const sources = [
    (linked?.accounts ?? 0) > 0 || !linked?.entered?.accounts ? 'linked accounts' : null,
    linked?.entered?.accounts ? 'balances the user entered' : null,
    includesHome ? 'the home value' : null,
  ].filter((item): item is string => item !== null);
  return joinList(sources);
}

/**
 * How net worth is labelled in the fact pack: what it is built from, and what
 * it leaves out. Just "Net worth" when every kind is covered by linked accounts.
 * A home value is part of the figure whenever one is known, so a label naming
 * the account sources also names it, or a $500,000 home would read as money
 * the user typed in.
 */
export function netWorthFactLabel(
  linked: LinkedData | undefined,
  leavesOut: readonly string[],
  includesHome = false
): string {
  const missing = leavesOut.join(', no ');
  const sources = netWorthSources(linked, includesHome);
  if (!linked?.entered?.accounts) {
    return leavesOut.length > 0 ? `Net worth across ${sources} only (no ${missing} linked)` : 'Net worth';
  }
  if (linked.accounts === 0) {
    return `Net worth from ${sources}, with nothing linked${leavesOut.length > 0 ? ` (no ${missing} entered)` : ''}`;
  }
  return `Net worth across ${sources}${leavesOut.length > 0 ? ` (no ${missing} linked or entered)` : ''}`;
}

/** The same scope for the reviewer's overview line, or null when there is nothing to qualify. */
export function netWorthReviewerNote(
  linked: LinkedData | undefined,
  leavesOut: readonly string[],
  includesHome = false
): string | null {
  const missing = leavesOut.join(', no ');
  const sources = netWorthSources(linked, includesHome);
  if (!linked?.entered?.accounts) {
    return leavesOut.length > 0 ? `${sources} only; no ${missing} linked` : null;
  }
  if (linked.accounts === 0) {
    return `${sources}, nothing linked${leavesOut.length > 0 ? `; no ${missing} entered` : ''}`;
  }
  return `${sources}${leavesOut.length > 0 ? `; no ${missing} linked or entered` : ''}`;
}

/** A zero portfolio with no investment account linked or entered: an empty connection. */
export function emptyPortfolio(linked: LinkedData | undefined, value: unknown): boolean {
  return linked !== undefined && balanceBasis(linked, 'investments') === null && isZeroOrMissing(value);
}

/**
 * A short, model-facing statement of what is and is not linked, so a zero
 * from an empty connection is never repeated as a fact about the user, and a
 * balance the user entered is never called a linked account. Null when
 * everything is linked or the record is absent.
 */
export function describeLinkedDataForModel(linked: LinkedData | undefined): string | null {
  if (!linked) return null;
  const kinds = enteredKinds(linked);
  const enteredNote = kinds.length > 0
    ? `The user entered their ${joinList(kinds)} balances by hand; they are not linked. Call them the balances ` +
      'the user entered, never a linked or connected account. Nothing reports transactions or holdings behind ' +
      'them, so they say nothing about income, spending or what is held.'
    : null;
  if (linked.accounts === 0) {
    if (!enteredNote) {
      return 'The user has not linked any accounts yet. There are no balances, transactions or holdings to read, ' +
        'so never describe their cash, investments, debt, income or spending as zero or as missing money. ' +
        'Answer from the figures they have stated, the facts supplied, and general principles, and state any assumption you rely on.';
    }
    return `The user has not linked any accounts yet. ${enteredNote} Never describe their income or spending, or ` +
      'a kind of balance they did not enter, as zero or as missing money. Answer from the balances they entered, ' +
      'the figures they have stated, the facts supplied, and general principles, and state any assumption you rely on.';
  }
  const missing = unlinkedCategories(linked);
  const linkedNote = missing.length > 0
    ? `The user has linked ${linked.accounts} account${linked.accounts === 1 ? '' : 's'}, but no ${missing.join(', no ')}. ` +
      'A total or average for a category with nothing linked describes an empty connection, not the user: never ' +
      'present it as their balance, income or spending. Use what they have stated instead, and state the assumption.'
    : null;
  const notes = [linkedNote, enteredNote].filter((note): note is string => note !== null);
  return notes.length > 0 ? notes.join(' ') : null;
}
