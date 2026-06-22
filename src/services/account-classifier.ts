/**
 * Single source of truth for classifying financial accounts into
 * cash / investment / debt buckets.
 *
 * Historically several places classified accounts independently
 * (FinancialSummaryService, SummaryCacheService, the canonical snapshot
 * transformer, and the manual-investment branch of analyzePortfolio) using
 * slightly different type/subtype lists and precedence. They drifted: e.g. a
 * depository account carrying a retirement-style subtype — an HSA holding a
 * cash balance with no investment holdings — was treated as cash by some code
 * paths but dropped entirely by SummaryCacheService, silently removing the
 * balance from net worth. Routing every consumer through this module keeps the
 * overview, snapshot, and LLM-facing canonical views consistent.
 */

export type AccountCategory =
  | 'cash'
  | 'brokerage'
  | 'retirement'
  | 'mortgage'
  | 'credit'
  | 'loan'
  | 'unknown';

export interface AccountLike {
  type?: string | null;
  subtype?: string | null;
  balance?: { current?: number | null; available?: number | null } | number | null;
}

export interface ClassifiedAccount {
  category: AccountCategory;
  /** Normalized balance (current, falling back to available). Sign is preserved. */
  balance: number;
  /** Counts toward total cash (depository / cash-like accounts). */
  isCash: boolean;
  /** Investment account whose value is tracked via holdings/portfolio, not balance. */
  isInvestment: boolean;
  /** Counts toward total debt (mortgage / credit / loan). */
  isDebt: boolean;
  /** Bucket key for the canonical liabilities map (debt accounts; 'overdraft' for negative cash). */
  liabilityKey?: string;
}

/** Subtypes that indicate a tax-advantaged / retirement investment account. */
export const RETIREMENT_SUBTYPES = ['401k', 'ira', 'roth', 'roth ira', 'traditional ira', 'pension', 'annuity', 'hsa', '529'];
/** Subtypes that are cash-like even when the account type is not "depository". */
const CASH_SUBTYPES = ['checking', 'savings', 'cd', 'money market', 'cash management', 'prepaid'];
const MORTGAGE_SUBTYPES = ['mortgage', 'home equity'];
const LOAN_SUBTYPES = ['student', 'personal', 'auto'];

/** Extract a numeric balance from an account (handles { current, available } or a raw number). */
export function getAccountBalance(acc: AccountLike): number {
  const b = acc?.balance;
  if (typeof b === 'number' && !Number.isNaN(b)) return b;
  if (b && typeof b === 'object') {
    const current = (b as { current?: number | null }).current;
    if (typeof current === 'number' && !Number.isNaN(current)) return current;
    const available = (b as { available?: number | null }).available;
    if (typeof available === 'number' && !Number.isNaN(available)) return available;
  }
  return 0;
}

/**
 * Classify a single account into a canonical category plus coarse cash/investment/debt flags.
 *
 * Precedence:
 *   1. Investment accounts are identified by TYPE (never subtype alone). Their value is
 *      captured via holdings/portfolio totals, so they are excluded from cash/debt. Driving
 *      this off `type` prevents a depository account that merely carries a retirement-style
 *      subtype (e.g. an HSA holding cash with no holdings) from being dropped from net worth.
 *   2. Debt (credit / mortgage / loan) is checked before cash so credit/loan accounts never
 *      fall through to the cash bucket.
 *   3. Cash covers depository-type accounts and known cash-like subtypes. Overdrafts (negative
 *      balance) are surfaced via `liabilityKey` so callers can also add them to debt.
 */
export function classifyAccount(acc: AccountLike): ClassifiedAccount {
  const type = (acc?.type || '').toLowerCase();
  const subtype = (acc?.subtype || '').toLowerCase();
  const balance = getAccountBalance(acc);
  const base = { balance, isCash: false, isInvestment: false, isDebt: false };

  if (type === 'investment') {
    const category: AccountCategory = RETIREMENT_SUBTYPES.some((r) => subtype.includes(r)) ? 'retirement' : 'brokerage';
    return { ...base, category, isInvestment: true };
  }

  if (type === 'credit' || subtype === 'credit card') {
    return { ...base, category: 'credit', isDebt: true, liabilityKey: 'credit' };
  }
  if (MORTGAGE_SUBTYPES.some((m) => subtype.includes(m))) {
    return { ...base, category: 'mortgage', isDebt: true, liabilityKey: 'mortgage' };
  }
  if (type === 'loan' || LOAN_SUBTYPES.some((s) => subtype.includes(s))) {
    return { ...base, category: 'loan', isDebt: true, liabilityKey: subtype || 'loan' };
  }

  if (type === 'depository' || CASH_SUBTYPES.includes(subtype)) {
    return { ...base, category: 'cash', isCash: true, liabilityKey: balance < 0 ? 'overdraft' : undefined };
  }

  return { ...base, category: 'unknown' };
}
