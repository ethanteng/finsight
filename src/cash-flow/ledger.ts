import { classifyAccount } from '../services/account-classifier';
import { toCanonicalTransaction } from '../services/canonical-transaction-adapter';
import { calendarDateFrom, type CalendarDate } from './calendar';

/**
 * The accounts everyday money moves through: cash accounts and credit cards.
 *
 * Investment accounts are left out because their income (dividends, interest)
 * mostly stays invested rather than reaching spending money. Loan and mortgage
 * accounts are left out because the payment that matters is already the
 * expense on the checking account that sent it; the loan-side leg would count
 * it twice.
 */
export type CashFlowAccountKind = 'cash' | 'credit';

export interface CashFlowAccount {
  id: string;
  name: string;
  institution: string | null;
  kind: CashFlowAccountKind;
  subtype: string | null;
  mask: string | null;
}

export type CashFlowDirection = 'income' | 'spending';

export interface CashFlowEntry {
  id: string;
  accountId: string;
  date: CalendarDate;
  flow: CashFlowDirection;
  /**
   * Effect on the flow, in the reporting currency: income received, or
   * spending. A refund is negative spending, as in the canonical summary.
   */
  amount: number;
  /** Normalized counterparty used to recognize repeats; empty when unknown. */
  counterpartyKey: string;
  /** The provider's merchant or description, for display. */
  label: string;
  category: string;
}

export interface CashFlowLedger {
  accounts: CashFlowAccount[];
  entries: CashFlowEntry[];
  /**
   * Earliest day any in-scope account has history for, from every posted
   * transaction including transfers. Null when there is none.
   */
  coverageStart: CalendarDate | null;
  /** Latest posted in-scope transaction date. */
  latestTransactionDate: CalendarDate | null;
  excluded: {
    /** In scope but with no canonical classification; reported, not guessed. */
    unclassified: number;
    /** In scope but not in the reporting currency. */
    currencyMismatch: number;
  };
}

const COUNTERPARTY_NOISE = new Set([
  'ach', 'pos', 'debit', 'purchase', 'pmt', 'ppd', 'ccd', 'web', 'id', 'ref', 'des', 'indn',
  'co', 'inc', 'llc', 'ltd', 'www', 'com', 'xx', 'xxxx',
]);

const LABEL_MAX_LENGTH = 60;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A key that stays the same across one payee's repeats. Digits carry dates,
 * check and reference numbers that change every time, so they are dropped
 * along with ACH boilerplate.
 */
export function counterpartyKey(merchantName: unknown, name: unknown): string {
  const raw = text(merchantName) || text(name);
  return raw
    .toLowerCase()
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z&]+/g, ' ')
    .split(' ')
    .filter(token => token && !COUNTERPARTY_NOISE.has(token))
    .join(' ');
}

/**
 * A bank description without its reference numbers and ACH field names:
 * "GUSTO DES:PAYROLL ID:88231 INDN:SMITH" reads "GUSTO PAYROLL SMITH". The
 * numbers say nothing to the user, and some identify accounts; the label is
 * shown on the page and handed to the model.
 */
function cleanDescription(name: string): string {
  return name
    .split(/[\s:#*/]+/)
    .filter(token => token && !/\d/.test(token) && !COUNTERPARTY_NOISE.has(token.toLowerCase()))
    .join(' ');
}

function displayLabel(transaction: any): string {
  const label = text(transaction?.merchant_name) || cleanDescription(text(transaction?.name)) || 'Unnamed transaction';
  return label.length > LABEL_MAX_LENGTH ? `${label.slice(0, LABEL_MAX_LENGTH - 1)}…` : label;
}

function accountId(account: any): string {
  return text(account?.account_id) || text(account?.id);
}

export function cashFlowAccounts(accounts: readonly any[]): CashFlowAccount[] {
  const inScope: CashFlowAccount[] = [];
  const seen = new Set<string>();
  for (const account of accounts) {
    const id = accountId(account);
    if (!id || seen.has(id)) continue;
    const { category } = classifyAccount(account);
    if (category !== 'cash' && category !== 'credit') continue;
    seen.add(id);
    inScope.push({
      id,
      name: text(account?.name) || 'Account',
      institution: text(account?.institution) || null,
      kind: category,
      subtype: text(account?.subtype) || null,
      mask: text(account?.mask) || null,
    });
  }
  return inScope;
}

/**
 * Turn the snapshot's posted transactions into income and spending entries for
 * the in-scope accounts, using the canonical classification. Transfers, card
 * payments, trades and adjustments are neither income nor spending, exactly as
 * in the canonical summary, so they never become entries.
 */
export function buildCashFlowLedger(
  transactions: readonly any[],
  accounts: readonly any[],
  reportingCurrency = 'USD'
): CashFlowLedger {
  const inScopeAccounts = cashFlowAccounts(accounts);
  const inScopeIds = new Set(inScopeAccounts.map(account => account.id));
  const entries: CashFlowEntry[] = [];
  const seenTransactionIds = new Set<string>();
  const excluded = { unclassified: 0, currencyMismatch: 0 };
  let coverageStart: CalendarDate | null = null;
  let latestTransactionDate: CalendarDate | null = null;

  for (const transaction of transactions) {
    if (transaction?.pending === true) continue;
    const rawAccountId = text(transaction?.account_id) || text(transaction?.accountId);
    if (!inScopeIds.has(rawAccountId)) continue;

    const date = calendarDateFrom(
      transaction?.date ?? transaction?.authorized_date ?? transaction?.posted_date
    );
    if (!date) continue;
    if (!coverageStart || date < coverageStart) coverageStart = date;
    if (!latestTransactionDate || date > latestTransactionDate) latestTransactionDate = date;

    const canonical = toCanonicalTransaction(transaction);
    if (!canonical) {
      excluded.unclassified += 1;
      continue;
    }
    if (seenTransactionIds.has(canonical.id)) continue;
    seenTransactionIds.add(canonical.id);
    if (canonical.currency !== reportingCurrency.toUpperCase()) {
      excluded.currencyMismatch += 1;
      continue;
    }

    let flow: CashFlowDirection;
    let amount: number;
    if (canonical.type === 'income') {
      flow = 'income';
      amount = canonical.cashFlowAmount;
    } else if (canonical.type === 'expense' || canonical.type === 'fee') {
      flow = 'spending';
      amount = Math.abs(canonical.cashFlowAmount);
    } else if (canonical.type === 'refund') {
      flow = 'spending';
      amount = -Math.abs(canonical.cashFlowAmount);
    } else {
      continue;
    }

    entries.push({
      id: canonical.id,
      accountId: canonical.accountKey,
      date,
      flow,
      amount,
      counterpartyKey: counterpartyKey(transaction?.merchant_name, transaction?.name),
      label: displayLabel(transaction),
      category: canonical.category?.trim() || 'Uncategorized',
    });
  }

  entries.sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  return { accounts: inScopeAccounts, entries, coverageStart, latestTransactionDate, excluded };
}
