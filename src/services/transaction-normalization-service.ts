/**
 * Transaction Normalization Service
 * 
 * Normalizes transaction signs for consistency across all account types:
 * - Depository/Investment accounts: Money in = positive, money out = negative
 * - Credit cards: New charges = positive (debt increases), payments = negative (debt decreases)
 */

export interface Transaction {
  transaction_id?: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  payment_channel?: string;
  pending?: boolean;
  category?: string[];
  iso_currency_code: string;
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
    const normalized = { ...transaction };

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
      // - Charges (purchases) should be positive (increases debt)
      // - Payments should be negative (decreases debt)
      // Plaid typically returns charges as positive and payments as negative, so keep as-is
      // But ensure consistency
      if (this.isPayment(transaction)) {
        // Payment: should be negative (reduces debt)
        normalized.amount = -Math.abs(transaction.amount);
      } else {
        // Charge: should be positive (increases debt)
        normalized.amount = Math.abs(transaction.amount);
      }
    } else {
      // Depository and Investment accounts:
      // - Money in (deposits, dividends) should be positive
      // - Money out (withdrawals, purchases) should be negative
      // Plaid typically returns this correctly, but ensure consistency
      if (this.isInflow(transaction)) {
        // Inflow: should be positive
        normalized.amount = Math.abs(transaction.amount);
      } else {
        // Outflow: should be negative
        normalized.amount = -Math.abs(transaction.amount);
      }
    }

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
    // Check transaction name
    const nameLower = transaction.name?.toLowerCase() || '';
    const inflowKeywords = ['deposit', 'transfer from', 'dividend', 'interest', 'refund', 'credit'];
    
    if (inflowKeywords.some(keyword => nameLower.includes(keyword))) {
      return true;
    }

    // Check categories
    if (transaction.category && Array.isArray(transaction.category)) {
      const categoryString = transaction.category.join(' ').toLowerCase();
      if (categoryString.includes('deposit') || 
          categoryString.includes('transfer') || 
          categoryString.includes('income')) {
        return true;
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

