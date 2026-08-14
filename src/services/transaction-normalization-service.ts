/**
 * Transaction Normalization Service
 * 
 * Normalizes transaction signs for consistency across all account types:
 * - Depository/Investment accounts: Money in = positive, money out = negative
 * - Credit cards: New charges = positive (debt increases), payments = negative (debt decreases)
 */

import {
  canonicalCashFlowAmount,
  resolveCanonicalTransactionType,
} from './canonical-transaction-adapter';

export interface Transaction {
  transaction_id?: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  payment_channel?: string;
  pending?: boolean;
  category?: string[];
  category_id?: string;
  iso_currency_code: string;
  source_amount?: number;
  cash_flow_amount?: number;
  [key: string]: any;
}

export interface Account {
  account_id: string;
  type: string;
  subtype: string;
  name: string;
  [key: string]: any;
}

export class TransactionNormalizationService {
  /**
   * Normalize a single transaction based on account type
   */
  normalizeTransaction(transaction: Transaction, accountType: string, accountSubtype?: string): Transaction {
    const sourceAmount = transaction.source_amount ?? transaction.amount;
    const normalized = { ...transaction, source_amount: sourceAmount };

    // ✅ CRITICAL: Convert personal_finance_category to category if category is empty
    // This matches the logic in processTransactionData from plaid.ts
    // Plaid returns categories in personal_finance_category, but we need them in the category field
    let basicCategory = transaction.category || [];
    let basicCategoryId = transaction.category_id;
    
    const pfc = (transaction as any).personal_finance_category;
    if ((!basicCategory || basicCategory.length === 0 || basicCategory[0] === null) && pfc) {
      basicCategory = [
        pfc.primary,
        pfc.detailed
      ].filter(Boolean);
      basicCategoryId = pfc.primary;
      // Update the normalized transaction with the converted category
      normalized.category = basicCategory;
      normalized.category_id = basicCategoryId;
    }

    // Credit card normalization
    if (accountType === 'credit') {
      // For credit cards:
      // - Charges (purchases/expenses) should be positive (increases debt)
      // - Payments should be negative (decreases debt)
      // ✅ CRITICAL: Use transaction_type if available to correctly identify expenses vs payments
      const transactionType = (transaction as any).transaction_type;
      if (transactionType) {
        const typeLower = String(transactionType).toLowerCase();
        // Payments reduce debt (negative)
        if (typeLower === 'transfer_out' || typeLower === 'withdrawal') {
          normalized.amount = -Math.abs(transaction.amount);
        } else {
          // Charges/expenses increase debt (positive)
          normalized.amount = Math.abs(transaction.amount);
        }
      } else {
        // Fallback to isPayment() if transaction_type not available
        if (this.isPayment(transaction)) {
          // Payment: should be negative (reduces debt)
          normalized.amount = -Math.abs(transaction.amount);
        } else {
          // Charge: should be positive (increases debt)
          normalized.amount = Math.abs(transaction.amount);
        }
      }
    } else {
      // Depository and Investment accounts:
      // - Money in (deposits, dividends) should be positive
      // - Money out (withdrawals, purchases) should be negative
      // Plaid typically returns this correctly, but ensure consistency
      const isInflowResult = this.isInflow(transaction);
      if (isInflowResult) {
        // Inflow: should be positive
        const originalAmount = normalized.amount;
        normalized.amount = Math.abs(transaction.amount);
        // ✅ DEBUG: Log if we're correcting a negative income transaction
        if (originalAmount < 0 && (transaction as any).transaction_type?.toLowerCase() === 'income') {
          console.log(`TransactionNormalizationService: Corrected negative income transaction "${transaction.name}": ${originalAmount} → ${normalized.amount}`);
        }
      } else {
        // Outflow: should be negative
        normalized.amount = -Math.abs(transaction.amount);
      }
    }

    const canonicalType = resolveCanonicalTransactionType(transaction);
    normalized.cash_flow_amount = canonicalType
      ? canonicalCashFlowAmount(sourceAmount, canonicalType)
      : transaction.cash_flow_amount;

    return normalized;
  }

  /**
   * Normalize a batch of transactions
   */
  normalizeTransactionBatch(
    transactions: Transaction[], 
    accountsMap: Map<string, Account>
  ): Transaction[] {
    return transactions.map(transaction => {
      const account = accountsMap.get(transaction.account_id);
      
      if (!account) {
        console.warn(`TransactionNormalizationService: Account not found for transaction ${transaction.transaction_id || 'unknown'}`);
        return transaction;
      }

      return this.normalizeTransaction(transaction, account.type, account.subtype);
    });
  }

  /**
   * Check if a transaction is a payment (for credit cards)
   */
  private isPayment(transaction: Transaction): boolean {
    // Check payment channel
    if (transaction.payment_channel === 'online' || transaction.payment_channel === 'in store') {
      return false; // These are purchases
    }

    // Check transaction name
    const nameLower = transaction.name?.toLowerCase() || '';
    const paymentKeywords = ['payment', 'autopay', 'online payment', 'bank transfer'];
    
    if (paymentKeywords.some(keyword => nameLower.includes(keyword))) {
      return true;
    }

    // Check categories
    if (transaction.category && Array.isArray(transaction.category)) {
      const categoryString = transaction.category.join(' ').toLowerCase();
      if (categoryString.includes('payment') || categoryString.includes('transfer')) {
        return true;
      }
    }

    // Default: if amount is negative in original data, likely a payment
    // (This is a fallback heuristic)
    return transaction.amount < 0;
  }

  /**
   * Check if a transaction is an inflow (for depository/investment accounts)
   */
  private isInflow(transaction: Transaction): boolean {
    // ✅ PREFER: Check transaction_type if available (from categorization service)
    // This is the most reliable indicator since it was determined before normalization
    const transactionType = (transaction as any).transaction_type;
    if (transactionType) {
      // ✅ CRITICAL FIX: Make check case-insensitive to handle any case variations
      const typeLower = String(transactionType).toLowerCase();
      // Income, deposits, transfers_in are inflows
      if (typeLower === 'income' || typeLower === 'deposit' || typeLower === 'transfer_in') {
        return true;
      }
      // Expenses, withdrawals, transfers_out are outflows
      if (typeLower === 'expense' || typeLower === 'withdrawal' || typeLower === 'transfer_out') {
        return false;
      }
      // Buy/sell/fee/refund/adjustment need further context (check amount sign)
      // For these, continue to check other indicators below
    }

    // ✅ FALLBACK: Check personal_finance_category (if transaction_type not available)
    // Plaid categorizes income in personal_finance_category, which we convert to category later
    // Income transactions should ALWAYS be positive, even if Plaid returns them as negative
    const pfc = (transaction as any).personal_finance_category;
    if (pfc) {
      const pfcPrimary = (pfc.primary || '').toLowerCase();
      const pfcDetailed = (pfc.detailed || '').toLowerCase();
      if (pfcPrimary.includes('income') || pfcDetailed.includes('income')) {
        return true; // Income is ALWAYS an inflow, regardless of amount sign from Plaid
      }
    }
    
    // Check transaction name
    const nameLower = transaction.name?.toLowerCase() || '';
    const inflowKeywords = ['deposit', 'transfer from', 'dividend', 'interest', 'refund', 'credit', 'social security', 'wages', 'salary', 'payroll'];
    
    if (inflowKeywords.some(keyword => nameLower.includes(keyword))) {
      return true;
    }

    // Check categories (including converted ones)
    if (transaction.category && Array.isArray(transaction.category)) {
      const categoryString = transaction.category.join(' ').toLowerCase();
      // ✅ TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS is income (distributions/RMDs) - treat as inflow
      if (categoryString.includes('transfer_in_investment_and_retirement_funds')) {
        return true;
      }
      if (categoryString.includes('deposit') || 
          categoryString.includes('transfer') || 
          categoryString.includes('income')) {
        return true;
      }
    }
    
    // ✅ Also check personal_finance_category for TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS
    if (pfc) {
      const pfcDetailed = (pfc.detailed || '').toLowerCase();
      if (pfcDetailed.includes('transfer_in_investment_and_retirement_funds')) {
        return true; // Investment/retirement distributions are inflows
      }
    }

    // Check payment channel (ACH, wire = typically deposits)
    if (transaction.payment_channel === 'other') {
      // Could be a deposit, check amount sign
      return transaction.amount > 0;
    }

    // Default: if amount is positive in original data, likely an inflow
    return transaction.amount > 0;
  }

  /**
   * Validate that transaction signs are normalized correctly
   * Returns array of issues found (empty if all valid)
   */
  validateNormalization(
    transactions: Transaction[], 
    accountsMap: Map<string, Account>
  ): string[] {
    const issues: string[] = [];

    for (const transaction of transactions) {
      const account = accountsMap.get(transaction.account_id);
      
      if (!account) {
        continue;
      }

      if (account.type === 'credit') {
        // Credit cards: charges should be positive, payments negative
        const isPayment = this.isPayment(transaction);
        if (isPayment && transaction.amount > 0) {
          issues.push(`Credit card payment should be negative: ${transaction.transaction_id || transaction.name}`);
        } else if (!isPayment && transaction.amount < 0) {
          issues.push(`Credit card charge should be positive: ${transaction.transaction_id || transaction.name}`);
        }
      } else {
        // Depository/Investment: deposits positive, withdrawals negative
        const isInflow = this.isInflow(transaction);
        if (isInflow && transaction.amount < 0) {
          issues.push(`Deposit/inflow should be positive: ${transaction.transaction_id || transaction.name}`);
        } else if (!isInflow && transaction.amount > 0) {
          issues.push(`Withdrawal/outflow should be negative: ${transaction.transaction_id || transaction.name}`);
        }
      }
    }

    return issues;
  }
}
