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
  categorization_method: 'gpt' | 'plaid';
  categorization_reason?: string;
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
- transfer_in: Money moving into account from another account (NOT income-generating)
- transfer_out: Money moving out of account to another account (NOT expense-generating)
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
2. TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS that are SELL transactions should be "sell", not "income"
3. Social Security, wages, salary, dividends, interest are "income"
4. Purchases, bills, services are "expense"
5. Transfers between accounts are "transfer_in" or "transfer_out" (NOT income/expense)
6. Buying investments is "buy", selling investments is "sell"

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

        // Special handling: Check if it's a SELL transaction
        const nameLower = (transaction.name || '').toLowerCase();
        if (nameLower.includes('sell') || nameLower.includes('sale')) {
          transactionType = 'sell';
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
}
