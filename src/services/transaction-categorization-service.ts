/**
 * Transaction Categorization Service
 * 
 * Uses GPT to intelligently categorize transactions before normalization.
 * Categorizes transactions into: income, expense, transfer_in, transfer_out, buy, sell, deposit, withdrawal, fee, refund, adjustment
 */

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

// Transaction types that transactions can be categorized into
export type TransactionType = 
  | 'income' 
  | 'expense' 
  | 'transfer_in' 
  | 'transfer_out' 
  | 'buy' 
  | 'sell' 
  | 'deposit' 
  | 'withdrawal' 
  | 'fee' 
  | 'refund' 
  | 'adjustment';

export interface Transaction {
  transaction_id?: string;
  id?: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  payment_channel?: string;
  pending?: boolean;
  category?: string[];
  category_id?: string;
  iso_currency_code?: string;
  type?: string; // For investment transactions
  subtype?: string; // For investment transactions
  [key: string]: any;
}

export interface Account {
  account_id: string;
  type: string;
  subtype?: string;
  name: string;
  [key: string]: any;
}

export interface CategorizedTransaction extends Transaction {
  transaction_type: TransactionType;
  categorization_confidence: number; // 0-1
  categorization_method: 'gpt' | 'plaid' | 'manual' | 'cached';
  categorization_reason?: string;
}

// Detailed categorization result for debugging/logging
export interface CategorizationDetail {
  transaction: {
    id: string;
    name: string;
    amount: number;
    date: string;
    category: string[];
    category_id?: string;
    personal_finance_category: { primary: string; detailed: string } | null;
    payment_channel?: string;
    merchant_name?: string;
    iso_currency_code?: string;
    pending?: boolean;
  };
  account: {
    account_id: string;
    type: string;
    subtype?: string;
    name: string;
  };
  categorization: {
    transaction_type: TransactionType;
    confidence: number;
    method: 'gpt' | 'plaid' | 'manual' | 'cached';
    reason?: string;
  };
}

export interface CategorizationBatchResult {
  transactions: CategorizedTransaction[];
  details: CategorizationDetail[];
  summary: {
    total: number;
    gptCategorized: number;
    plaidFallback: number;
    averageConfidence: number;
  };
}

interface GPTCategorizationResponse {
  transaction_type: TransactionType;
  confidence: number;
  reason: string;
}

export class TransactionCategorizationService {
  private readonly gptModel = 'gpt-4o-mini';
  private readonly confidenceThreshold = 0.7;

  /**
   * Valid transaction types
   */
  private readonly validTransactionTypes: TransactionType[] = [
    'income', 'expense', 'transfer_in', 'transfer_out', 'buy', 'sell', 
    'deposit', 'withdrawal', 'fee', 'refund', 'adjustment'
  ];

  /**
   * Check if a string is a valid TransactionType
   */
  private isValidTransactionType(value: any): value is TransactionType {
    return typeof value === 'string' && 
           this.validTransactionTypes.includes(value.toLowerCase() as TransactionType);
  }

  /**
   * Map Plaid's personal_finance_category to our transaction types
   * Simple mapping - no complex logic
   */
  private mapPlaidCategoryToTransactionType(pfcPrimary: string, pfcDetailed: string): TransactionType | null {
    const primary = (pfcPrimary || '').toLowerCase();
    const detailed = (pfcDetailed || '').toLowerCase();

    // Income categories
    if (primary.includes('income')) {
      return 'income';
    }

    // Expense categories
    if (
      primary.includes('general_merchandise') ||
      primary.includes('food_and_drink') ||
      primary.includes('home_improvement') ||
      primary.includes('medical') ||
      primary.includes('rent_and_utilities') ||
      primary.includes('transportation') ||
      primary.includes('general_services') ||
      primary.includes('entertainment') ||
      primary.includes('personal_care') ||
      primary.includes('gas_stations') ||
      primary.includes('groceries')
    ) {
      return 'expense';
    }

    // Transfer categories
    if (primary.includes('transfer')) {
      if (detailed.includes('transfer_out')) {
        return 'transfer_out';
      }
      if (detailed.includes('transfer_in')) {
        // Special case: TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS might be income (RMDs, distributions)
        // But SELL transactions should be 'sell', not income
        if (detailed.includes('investment_and_retirement_funds')) {
          // Will be determined by transaction name checking for SELL
          return 'transfer_in';
        }
        return 'transfer_in';
      }
      return 'transfer_in'; // Default to transfer_in
    }

    // Loan payments
    if (primary.includes('loan_payments')) {
      return 'expense';
    }

    // Bank fees
    if (primary.includes('bank_fees')) {
      return 'fee';
    }

    return null; // No mapping found
  }

  /**
   * Categorize a single transaction using GPT
   */
  async categorizeTransaction(
    transaction: Transaction,
    account?: Account
  ): Promise<CategorizedTransaction> {
    // ✅ CRITICAL: Check for manual correction first (stored in aiCategory field)
    // Manual corrections completely override GPT categorization
    const manualCategory = (transaction as any).aiCategory;
    if (manualCategory && this.isValidTransactionType(manualCategory)) {
      console.log(`TransactionCategorizationService: Using manual correction for transaction "${transaction.name}": ${manualCategory}`);
      return {
        ...transaction,
        transaction_type: manualCategory.toLowerCase() as TransactionType,
        categorization_confidence: 1.0, // Manual corrections have full confidence
        categorization_method: 'gpt', // Keep as 'gpt' for consistency, but we could add 'manual' if needed
        categorization_reason: (transaction as any).aiCategoryReason || 'Manually corrected by user'
      };
    }

    try {
      // Build context for GPT
      const accountType = account?.type || 'unknown';
      const accountSubtype = account?.subtype || '';
      const pfc = (transaction as any).personal_finance_category;
      const pfcPrimary = pfc?.primary || '';
      const pfcDetailed = pfc?.detailed || '';
      
      const prompt = `You are a financial transaction categorization expert. Analyze the following transaction and categorize it into ONE of these types:
- income: Wages, salary, dividends, interest, distributions, RMDs, Social Security, pensions (money earned)
- expense: Purchases, bills, services, insurance, rent, utilities (money spent)
- transfer_in: Money moving into account from another account (NOT income-generating - just moving money between accounts)
- transfer_out: Money moving out of account to another account (NOT expense-generating - just moving money between accounts)
- buy: Purchasing investments/securities (capital transaction)
- sell: Selling investments/securities (capital transaction, NOT income)
- deposit: Cash deposits (moving money, not earning)
- withdrawal: Cash withdrawals (moving money, not spending)
- fee: Charges, fees, commissions
- refund: Returns, refunds, reimbursements
- adjustment: Corrections, reversals, adjustments

Transaction details:
- Name: "${transaction.name}"
- Amount: $${transaction.amount}
- Date: ${transaction.date}
- Account Type: ${accountType}${accountSubtype ? ` (${accountSubtype})` : ''}
- Plaid Category: ${pfcPrimary ? `${pfcPrimary}${pfcDetailed ? ` / ${pfcDetailed}` : ''}` : 'None'}
- Transaction Type: ${transaction.type || 'N/A'}

IMPORTANT RULES:
1. If transaction name contains "SELL" or "SALE", it must be categorized as "sell" (capital transaction, NOT income)
2. TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS transactions:
   - If it's a SELL transaction: categorize as "sell" (capital transaction)
   - If it's NOT a sell (RMD, distribution, dividend payout, annuity payment): categorize as "income" (money earned, not just moving money)
   - RMDs (Required Minimum Distributions), distributions, dividend payouts, and annuity payments are INCOME, not transfers
3. Social Security, wages, salary, dividends, interest, RMDs, distributions are "income"
4. Purchases, bills, services are "expense"
5. Simple transfers between your own accounts (moving money from checking to savings, etc.) are "transfer_in" or "transfer_out" (NOT income/expense)
6. Buying investments is "buy", selling investments is "sell"
7. Income-generating transfers (RMDs, distributions, annuity payments) from investment/retirement accounts should be "income", not "transfer_in"

Respond with ONLY a valid JSON object in this exact format (no markdown, no explanation):
{
  "transaction_type": "income|expense|transfer_in|transfer_out|buy|sell|deposit|withdrawal|fee|refund|adjustment",
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}`;

      const response = await openai.chat.completions.create({
        model: this.gptModel,
        messages: [
          {
            role: 'system',
            content: 'You are a financial transaction categorization expert. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1, // Low temperature for consistency
        max_tokens: 150
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from GPT');
      }

      // Parse JSON response (handle markdown code blocks if present)
      let jsonContent = content.trim();
      if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      }

      const gptResult: GPTCategorizationResponse = JSON.parse(jsonContent);
      
      // Validate transaction_type
      const validTypes: TransactionType[] = ['income', 'expense', 'transfer_in', 'transfer_out', 'buy', 'sell', 'deposit', 'withdrawal', 'fee', 'refund', 'adjustment'];
      if (!validTypes.includes(gptResult.transaction_type)) {
        throw new Error(`Invalid transaction_type from GPT: ${gptResult.transaction_type}`);
      }

      // If confidence is low or GPT failed, fall back to Plaid category
      if (gptResult.confidence < this.confidenceThreshold) {
        console.log(`TransactionCategorizationService: Low confidence (${gptResult.confidence}) for "${transaction.name}", using Plaid fallback`);
        return this.categorizeWithPlaidFallback(transaction, account);
      }

      return {
        ...transaction,
        transaction_type: gptResult.transaction_type,
        categorization_confidence: gptResult.confidence,
        categorization_method: 'gpt',
        categorization_reason: gptResult.reason
      };

    } catch (error) {
      console.error(`TransactionCategorizationService: GPT categorization failed for "${transaction.name}":`, error);
      // Fall back to Plaid category mapping
      return this.categorizeWithPlaidFallback(transaction, account);
    }
  }

  /**
   * Fallback categorization using Plaid's personal_finance_category
   */
  private categorizeWithPlaidFallback(
    transaction: Transaction,
    account?: Account
  ): CategorizedTransaction {
    const pfc = (transaction as any).personal_finance_category;
    const pfcPrimary = pfc?.primary || '';
    const pfcDetailed = pfc?.detailed || '';

    // Try to map Plaid category
    let transactionType: TransactionType = 'expense'; // Default fallback
    let mapped = false;

    if (pfcPrimary) {
      const mappedType = this.mapPlaidCategoryToTransactionType(pfcPrimary, pfcDetailed);
      if (mappedType) {
        transactionType = mappedType;
        mapped = true;

        // Special handling: Check transaction name for specific indicators
        const nameLower = (transaction.name || '').toLowerCase();
        
        // SELL transactions should be "sell", not "transfer_in"
        if (nameLower.includes('sell') || nameLower.includes('sale')) {
          transactionType = 'sell';
        }
        // RMDs, distributions, dividend payouts, annuity payments are income, not transfers
        else if (
          mappedType === 'transfer_in' &&
          pfcDetailed?.toLowerCase().includes('investment_and_retirement_funds') &&
          (
            nameLower.includes('rmd') ||
            nameLower.includes('required minimum') ||
            nameLower.includes('distribution') ||
            nameLower.includes('dividend') ||
            nameLower.includes('annuity') ||
            nameLower.includes('payout')
          )
        ) {
          // Income-generating transfer (RMD, distribution, etc.) - categorize as income
          transactionType = 'income';
        }
      }
    }

    // If no mapping found, default based on amount sign
    if (!mapped) {
      transactionType = transaction.amount > 0 ? 'income' : 'expense';
    }

    return {
      ...transaction,
      transaction_type: transactionType,
      categorization_confidence: 0.5, // Lower confidence for fallback
      categorization_method: 'plaid',
      categorization_reason: mapped 
        ? `Mapped from Plaid category: ${pfcPrimary}${pfcDetailed ? ` / ${pfcDetailed}` : ''}`
        : `Default fallback based on amount sign`
    };
  }

  /**
   * Categorize a batch of transactions
   * Processes transactions individually but can batch GPT API calls for efficiency
   */
  async categorizeTransactionBatch(
    transactions: Transaction[],
    accountsMap: Map<string, Account>
  ): Promise<CategorizedTransaction[]> {
    if (transactions.length === 0) {
      return [];
    }

    console.log(`TransactionCategorizationService: Categorizing ${transactions.length} transactions`);

    // Process transactions individually (per user requirement)
    // In the future, we could batch GPT API calls for better performance
    const categorized: CategorizedTransaction[] = [];
    let gptCount = 0;
    let plaidCount = 0;

    for (const transaction of transactions) {
      const account = accountsMap.get(transaction.account_id);
      const categorizedTx = await this.categorizeTransaction(transaction, account);
      
      if (categorizedTx.categorization_method === 'gpt') {
        gptCount++;
      } else {
        plaidCount++;
      }
      
      categorized.push(categorizedTx);

      // Add small delay to avoid rate limiting (adjust based on API limits)
      if (gptCount % 10 === 0 && gptCount > 0) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay every 10 transactions
      }
    }

    console.log(`TransactionCategorizationService: Categorized ${transactions.length} transactions - GPT: ${gptCount}, Plaid fallback: ${plaidCount}`);

    return categorized;
  }

  /**
   * Categorize a batch of transactions with detailed results for logging/debugging
   * Returns both categorized transactions and detailed categorization information
   */
  async categorizeTransactionBatchWithDetails(
    transactions: Transaction[],
    accountsMap: Map<string, Account>
  ): Promise<CategorizationBatchResult> {
    if (transactions.length === 0) {
      return {
        transactions: [],
        details: [],
        summary: {
          total: 0,
          gptCategorized: 0,
          plaidFallback: 0,
          averageConfidence: 0
        }
      };
    }

    console.log(`TransactionCategorizationService: Categorizing ${transactions.length} transactions with details`);

    const categorized: CategorizedTransaction[] = [];
    const details: CategorizationDetail[] = [];
    let gptCount = 0;
    let plaidCount = 0;
    let totalConfidence = 0;

    for (const transaction of transactions) {
      const account = accountsMap.get(transaction.account_id);
      const categorizedTx = await this.categorizeTransaction(transaction, account);
      
      if (categorizedTx.categorization_method === 'gpt') {
        gptCount++;
      } else {
        plaidCount++;
      }
      
      categorized.push(categorizedTx);
      totalConfidence += categorizedTx.categorization_confidence;

      // Build detailed result for logging
      const pfc = (transaction as any).personal_finance_category;
      details.push({
        transaction: {
          id: transaction.id || transaction.transaction_id || 'unknown',
          name: transaction.name,
          amount: transaction.amount,
          date: transaction.date,
          category: transaction.category || [],
          category_id: transaction.category_id,
          personal_finance_category: pfc ? {
            primary: pfc.primary || '',
            detailed: pfc.detailed || ''
          } : null,
          payment_channel: transaction.payment_channel,
          merchant_name: transaction.merchant_name,
          iso_currency_code: transaction.iso_currency_code,
          pending: transaction.pending
        },
        account: {
          account_id: account?.account_id || transaction.account_id,
          type: account?.type || 'unknown',
          subtype: account?.subtype,
          name: account?.name || 'Unknown Account'
        },
        categorization: {
          transaction_type: categorizedTx.transaction_type,
          confidence: categorizedTx.categorization_confidence,
          method: categorizedTx.categorization_method,
          reason: categorizedTx.categorization_reason
        }
      });

      // Add small delay to avoid rate limiting
      if (gptCount % 10 === 0 && gptCount > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`TransactionCategorizationService: Categorized ${transactions.length} transactions - GPT: ${gptCount}, Plaid fallback: ${plaidCount}`);

    return {
      transactions: categorized,
      details,
      summary: {
        total: transactions.length,
        gptCategorized: gptCount,
        plaidFallback: plaidCount,
        averageConfidence: transactions.length > 0 ? totalConfidence / transactions.length : 0
      }
    };
  }
}
