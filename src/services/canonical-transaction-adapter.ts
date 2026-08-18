import {
  isCanonicalTransactionType,
  type CanonicalTransaction,
  type CanonicalTransactionType,
} from '../domain/financial-truth';
import { normalizeLabel } from './label-normalization';

const EXPENSE_PRIMARY_CATEGORIES = new Set([
  'entertainment',
  'food_and_drink',
  'general_merchandise',
  'general_services',
  'government_and_non_profit',
  'home_improvement',
  'loan_payments',
  'medical',
  'personal_care',
  'rent_and_utilities',
  'transportation',
  'travel',
]);

const INFLOW_TYPES = new Set<CanonicalTransactionType>([
  'income',
  'refund',
  'transfer_in',
  'deposit',
  'sell',
]);

const OUTFLOW_TYPES = new Set<CanonicalTransactionType>([
  'expense',
  'fee',
  'transfer_out',
  'withdrawal',
  'buy',
]);

function normalizeTypeCandidate(value: unknown): CanonicalTransactionType | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return isCanonicalTransactionType(normalized) ? normalized : null;
}

function getPersonalFinanceCategory(transaction: any): { primary: string; detailed: string } {
  const direct = transaction?.personal_finance_category;
  const enriched = transaction?.enriched_data?.personal_finance_category;
  const category = direct || enriched || {};
  return {
    primary: String(category.primary || '').trim().toLowerCase(),
    detailed: String(category.detailed || '').trim().toLowerCase(),
  };
}

/**
 * Transfer direction is the one classification here that cannot come from the
 * activity type alone, and the raw sign that carries it is provider-specific:
 * SnapTrade signs an activity by its effect on account cash (positive = cash in),
 * while Plaid signs an investment transaction by cash debited (positive = cash
 * out), explicitly including transfers. Every other branch classifies by type and
 * leaves the sign to canonicalCashFlowAmount, which is precisely what keeps them
 * provider-agnostic — so reading the sign here has to be provider-aware.
 */
function resolveTransferDirection(transaction: any): CanonicalTransactionType {
  const amount = typeof transaction?.amount === 'number' && Number.isFinite(transaction.amount)
    ? transaction.amount
    : null;
  // An unsigned or zero transfer has no direction we can establish. Return an
  // adjustment rather than guessing: it still keeps the row off the AI
  // categorization path without asserting a cash flow that may not exist.
  if (amount === null || amount === 0) return 'adjustment';
  const positiveMeansCashIn = transaction?.source === 'snaptrade' || Boolean(transaction?.snapTradeData);
  const movesCashIn = positiveMeansCashIn ? amount > 0 : amount < 0;
  return movesCashIn ? 'transfer_in' : 'transfer_out';
}

function resolveProviderInvestmentType(transaction: any): CanonicalTransactionType | null {
  const rawType = String(
    transaction?.type || transaction?.activity_type || transaction?.snapTradeData?.type || ''
  )
    .trim()
    .toLowerCase();
  const rawSubtype = String(
    transaction?.subtype || transaction?.activity_subtype || transaction?.snapTradeData?.subtype || ''
  )
    .trim()
    .toLowerCase();

  // Preserve trades before looking at their subtype. For example, a dividend
  // reinvestment can be reported as type=buy, subtype=dividend.
  if (['buy', 'purchase', 'rei', 'reinvestment'].includes(rawType)) return 'buy';
  if (['sell', 'redemption', 'liquidation'].includes(rawType)) return 'sell';
  if (['fee', 'commission', 'tax'].includes(rawType)) return 'fee';
  if (['dividend', 'interest', 'distribution'].includes(rawType)) return 'income';
  if (['contribution', 'deposit'].includes(rawType)) return 'deposit';
  if (['withdrawal'].includes(rawType)) return 'withdrawal';
  // Non-cash corporate actions must stay off the AI path and out of cash-flow
  // totals. A stock dividend pays in shares rather than cash, so it belongs here
  // and not with the cash-paying 'dividend' above.
  if (['split', 'stock_split', 'stock_dividend', 'merger', 'spinoff', 'spin_off'].includes(rawType)) {
    return 'adjustment';
  }
  if (rawType === 'transfer') return resolveTransferDirection(transaction);

  if (['dividend', 'interest', 'distribution'].some(value => rawSubtype.includes(value))) {
    return 'income';
  }
  if (['fee', 'commission', 'tax'].some(value => rawSubtype.includes(value))) return 'fee';
  if (['contribution', 'deposit'].some(value => rawSubtype.includes(value))) return 'deposit';
  if (rawSubtype.includes('withdrawal')) return 'withdrawal';
  if (['split', 'merger', 'spin'].some(value => rawSubtype.includes(value))) return 'adjustment';

  return null;
}

/** Resolve only deterministic classifications; unknown activity remains unknown. */
export function resolveCanonicalTransactionType(transaction: any): CanonicalTransactionType | null {
  const explicitCandidates = [
    transaction?.aiCategory,
    transaction?.canonicalTransactionType,
    transaction?.transaction_type,
  ];
  for (const candidate of explicitCandidates) {
    const normalized = normalizeTypeCandidate(candidate);
    if (normalized) return normalized;
  }

  if (transaction?.isInvestmentTransaction) {
    const investmentType = normalizeTypeCandidate(transaction?.type);
    if (investmentType) return investmentType;
  }

  const providerInvestmentType = resolveProviderInvestmentType(transaction);
  if (providerInvestmentType) return providerInvestmentType;

  const { primary, detailed } = getPersonalFinanceCategory(transaction);
  if (primary === 'income' || primary.startsWith('income_')) return 'income';
  if (primary === 'bank_fees' || primary.includes('fee')) return 'fee';
  if (detailed.includes('refund') || detailed.includes('reimbursement')) return 'refund';
  // A credit-card payment settles purchases already counted as expenses. Treat
  // it as a transfer so cash-flow summaries do not double-count spending.
  if (detailed.includes('credit_card_payment')) return 'transfer_out';
  if (primary.includes('transfer')) {
    if (detailed.includes('transfer_out')) return 'transfer_out';
    if (detailed.includes('transfer_in')) return 'transfer_in';
    return null;
  }
  if (EXPENSE_PRIMARY_CATEGORIES.has(primary)) return 'expense';

  const categoryId = String(transaction?.category_id || transaction?.categoryId || '')
    .trim()
    .toLowerCase();
  if (categoryId.includes('income')) return 'income';
  if (categoryId.includes('bank_fee')) return 'fee';
  if (categoryId.includes('transfer_out')) return 'transfer_out';
  if (categoryId.includes('transfer_in')) return 'transfer_in';
  if (EXPENSE_PRIMARY_CATEGORIES.has(categoryId)) return 'expense';

  return null;
}

export function canonicalCashFlowAmount(
  amount: number,
  type: CanonicalTransactionType
): number {
  if (!Number.isFinite(amount)) throw new Error('Transaction amount must be finite');
  if (INFLOW_TYPES.has(type)) return Math.abs(amount);
  if (OUTFLOW_TYPES.has(type)) return -Math.abs(amount);
  return amount;
}

function humanizeCategory(value: string): string {
  return normalizeLabel(value, 'Uncategorized');
}

function categoryLabel(transaction: any): string {
  const { detailed, primary } = getPersonalFinanceCategory(transaction);

  if (Array.isArray(transaction?.category)) {
    const categories = transaction.category.filter(
      (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())
    );
    const category = categories[categories.length - 1];
    if (category) {
      const normalizedCategory = category.trim().toLowerCase();
      if (primary && normalizedCategory === detailed) {
        const detailedSuffix = detailed.startsWith(`${primary}_`)
          ? detailed.slice(`${primary}_`.length)
          : detailed;
        return humanizeCategory(detailedSuffix);
      }
      // Humanize every label, not just the underscore forms. Plaid's legacy
      // taxonomy ("Food and Drink") and personal_finance_category
      // ("FOOD_AND_DRINK") describe the same category and can both appear in one
      // account's history, so returning the legacy spelling verbatim split the
      // category into two buckets that consumers then keyed case-insensitively.
      return humanizeCategory(category);
    }
  }
  if (typeof transaction?.category === 'string' && transaction.category.trim()) {
    const categories = transaction.category.split(',');
    const category = categories[categories.length - 1]?.trim();
    if (category) return humanizeCategory(category);
  }
  if (detailed) {
    const detailedSuffix = primary && detailed.startsWith(`${primary}_`)
      ? detailed.slice(`${primary}_`.length)
      : detailed;
    return humanizeCategory(detailedSuffix);
  }
  if (primary) return humanizeCategory(primary);
  return 'Uncategorized';
}

export function toCanonicalTransaction(transaction: any): CanonicalTransaction | null {
  const type = resolveCanonicalTransactionType(transaction);
  if (!type) return null;

  const id = String(
    transaction?.transaction_id ||
      transaction?.investment_transaction_id ||
      transaction?.id ||
      ''
  ).trim();
  const accountId = String(transaction?.account_id || transaction?.accountId || '').trim();
  const effectiveDate =
    transaction?.date ||
    transaction?.authorized_date ||
    transaction?.posted_date ||
    transaction?.trade_date ||
    transaction?.transaction_date ||
    transaction?.createdAt;
  const sourceAmount = Number(
    transaction?.source_amount ?? transaction?.sourceAmount ?? transaction?.amount
  );
  const storedCashFlowAmount = transaction?.cash_flow_amount ?? transaction?.cashFlowAmount;
  const cashFlowAmount = canonicalCashFlowAmount(
    Number(storedCashFlowAmount ?? sourceAmount),
    type
  );
  const currency = String(
    transaction?.iso_currency_code || transaction?.currency || 'USD'
  ).toUpperCase();

  if (!id || !accountId || !effectiveDate || !Number.isFinite(sourceAmount) || !Number.isFinite(cashFlowAmount)) {
    return null;
  }

  return {
    id,
    accountKey: accountId,
    effectiveDate,
    type,
    sourceAmount,
    cashFlowAmount,
    currency,
    category: categoryLabel(transaction),
    pending: transaction?.pending === true,
  };
}
