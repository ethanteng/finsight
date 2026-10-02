import { classifyAccount } from '../services/account-classifier';
import { toCanonicalTransaction } from '../services/canonical-transaction-adapter';
import { calendarDateFrom, daysBetween, type CalendarDate } from './calendar';

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
  /** The balance the provider reported: cash held, or what a card owes. Null when it gave none. */
  balance: number | null;
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
  /** The key this payee had before reference words were dropped whole; set only where it differs. */
  legacyCounterpartyKey?: string;
  /** The provider's merchant or description, for display. */
  label: string;
  category: string;
  /** Interest a credit card charged. The card model can project it from the card's APR instead. */
  interest?: boolean;
}

/**
 * Money moving between accounts rather than earned or spent: transfers, and
 * payments to credit cards. Neither income nor spending, but each one changes
 * the balance of the account it touches.
 */
export interface CashFlowMovement {
  id: string;
  accountId: string;
  date: CalendarDate;
  /** Signed effect on the account: positive moves money into it, negative out of it. */
  amount: number;
  /** A card payment: money a credit card received, or money a cash account sent to a card. */
  cardPayment: boolean;
  /**
   * The other leg of a card payment between two connected accounts, matched
   * by amount and date. A cash account's card payment with no match paid
   * something not connected here, so it leaves the user's cash like any
   * outgoing transfer.
   */
  pairedWith: string | null;
  counterpartyKey: string;
  /** The key this payee had before reference words were dropped whole; set only where it differs. */
  legacyCounterpartyKey?: string;
  label: string;
}

export interface CashFlowLedger {
  accounts: CashFlowAccount[];
  entries: CashFlowEntry[];
  movements: CashFlowMovement[];
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
/** Canonical types that move money between accounts. */
const MOVEMENT_TYPES = new Set(['transfer_in', 'transfer_out', 'deposit', 'withdrawal']);
/** A card payment's two legs post within this many days of each other. */
const PAYMENT_PAIRING_DAYS = 5;

function detailedCategory(transaction: any): string {
  const category = transaction?.personal_finance_category || transaction?.enriched_data?.personal_finance_category;
  return String(category?.detailed || '').trim().toLowerCase();
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function lettersKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z&]+/g, ' ')
    .split(' ')
    .filter(token => token && !COUNTERPARTY_NOISE.has(token))
    .join(' ');
}

/**
 * A key that stays the same across one payee's repeats. A word with a digit
 * in it is a reference, not part of the name: an ACH id ("ID:ABC123XYZ"), an
 * order or confirmation number, a date. It changes with every payment, so it
 * is dropped whole, as the display label drops it, along with ACH
 * boilerplate. Dropping only its digits would keep letters that differ every
 * time and split one payee into many. A name made only of such words
 * (1Password, 7-Eleven) keeps its letters instead, so it still has a key.
 */
export function counterpartyKey(merchantName: unknown, name: unknown): string {
  const raw = text(merchantName) || text(name);
  const words = raw.toLowerCase().split(/[\s:#*/]+/).filter(word => word && !/\d/.test(word));
  return lettersKey(words.join(' ')) || lettersKey(raw);
}

/**
 * The key a payee had before reference words were dropped whole: only their
 * digits went. Choices the user saved under it still apply. Undefined where
 * it is the same as the current key.
 */
export function legacyCounterpartyKey(merchantName: unknown, name: unknown): string | undefined {
  const legacy = lettersKey(text(merchantName) || text(name));
  return legacy && legacy !== counterpartyKey(merchantName, name) ? legacy : undefined;
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

function withLegacyKey(transaction: any): { legacyCounterpartyKey?: string } {
  const legacy = legacyCounterpartyKey(transaction?.merchant_name, transaction?.name);
  return legacy ? { legacyCounterpartyKey: legacy } : {};
}

function displayLabel(transaction: any): string {
  const label = text(transaction?.merchant_name) || cleanDescription(text(transaction?.name)) || 'Unnamed transaction';
  return label.length > LABEL_MAX_LENGTH ? `${label.slice(0, LABEL_MAX_LENGTH - 1)}…` : label;
}

function reportedBalance(account: any): number | null {
  const current = account?.balance && typeof account.balance === 'object' ? account.balance.current : account?.balance;
  return typeof current === 'number' && Number.isFinite(current) ? current : null;
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
      balance: reportedBalance(account),
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
  const creditIds = new Set(inScopeAccounts.filter(account => account.kind === 'credit').map(account => account.id));
  const entries: CashFlowEntry[] = [];
  const movements: CashFlowMovement[] = [];
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

    if (MOVEMENT_TYPES.has(canonical.type)) {
      // A provider amount is positive when money leaves the account, so the
      // raw sign says which way a transfer went on either kind of account.
      const movementAmount = -canonical.sourceAmount;
      if (movementAmount === 0) continue;
      const onCard = creditIds.has(canonical.accountKey);
      movements.push({
        id: canonical.id,
        accountId: canonical.accountKey,
        date,
        amount: movementAmount,
        cardPayment: onCard
          ? movementAmount > 0
          : movementAmount < 0 && detailedCategory(transaction).includes('credit_card_payment'),
        pairedWith: null,
        counterpartyKey: counterpartyKey(transaction?.merchant_name, transaction?.name),
        ...withLegacyKey(transaction),
        label: displayLabel(transaction),
      });
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
      ...withLegacyKey(transaction),
      label: displayLabel(transaction),
      category: canonical.category?.trim() || 'Uncategorized',
      ...(flow === 'spending' && creditIds.has(canonical.accountKey)
        && detailedCategory(transaction) === 'bank_fees_interest_charge' && { interest: true }),
    });
  }

  const byDate = (left: { date: string; id: string }, right: { date: string; id: string }) =>
    left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
  entries.sort(byDate);
  movements.sort(byDate);
  pairCardPayments(movements, creditIds);
  return { accounts: inScopeAccounts, entries, movements, coverageStart, latestTransactionDate, excluded };
}

/**
 * Match each payment a card received to the cash account's payment that sent
 * it: the same amount, within a few days. Nothing in the provider data links
 * the two legs, and matching on similarity alone would be a guess, so only an
 * exact amount close in time counts.
 */
function pairCardPayments(movements: CashFlowMovement[], creditIds: ReadonlySet<string>): void {
  const sent = movements.filter(movement => movement.cardPayment && !creditIds.has(movement.accountId));
  for (const received of movements) {
    if (!received.cardPayment || !creditIds.has(received.accountId)) continue;
    const match = sent.find(candidate =>
      candidate.pairedWith === null &&
      Math.abs(Math.abs(candidate.amount) - received.amount) < 0.005 &&
      Math.abs(daysBetween(candidate.date, received.date)) <= PAYMENT_PAIRING_DAYS
    );
    if (!match) continue;
    match.pairedWith = received.id;
    received.pairedWith = match.id;
  }
}
