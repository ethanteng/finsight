import {
  isCanonicalTransactionType,
  type CanonicalTransaction,
  type CanonicalTransactionType,
} from '../domain/financial-truth';

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

function categoryLabel(transaction: any): string {
  const { detailed, primary } = getPersonalFinanceCategory(transaction);
  if (detailed) return detailed;
  if (primary) return primary;
  if (Array.isArray(transaction?.category)) {
    return transaction.category.find((value: unknown) => typeof value === 'string' && value.trim()) || 'Uncategorized';
  }
  if (typeof transaction?.category === 'string' && transaction.category.trim()) {
    return transaction.category.split(',')[0].trim();
  }
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
  const cashFlowAmount =
    storedCashFlowAmount == null
      ? canonicalCashFlowAmount(Number(transaction?.amount), type)
      : Number(storedCashFlowAmount);
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
