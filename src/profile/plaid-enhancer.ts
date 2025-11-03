import { openai } from '../openai';

interface PlaidAccount {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  balance?: {
    current?: number;
    available?: number;
  };
  currentBalance?: number;
  availableBalance?: number;
  institution?: string;
}

interface PlaidTransaction {
  id: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  merchant_name?: string;
  category?: string[];
  pending: boolean;
  enriched_data?: {
    category?: string[];
    [key: string]: any;
  };
}

export class PlaidProfileEnhancer {
  /**
   * Enhances user profile with real-time Plaid data analysis
   * This method analyzes Plaid data in real-time without persisting raw data
   */
  async enhanceProfileFromPlaidData(
    userId: string,
    accounts: PlaidAccount[],
    transactions: PlaidTransaction[],
    existingProfile?: string
  ): Promise<string> {
    
    if (!accounts.length && !transactions.length) {
      console.log('PlaidProfileEnhancer: No Plaid data available for enhancement');
      return existingProfile || '';
    }

    console.log('PlaidProfileEnhancer: Analyzing Plaid data for profile enhancement');
    console.log('PlaidProfileEnhancer: Accounts:', accounts.length, 'Transactions:', transactions.length);

    // Analyze accounts for financial insights
    const accountAnalysis = this.analyzeAccounts(accounts);
    
    // Analyze transactions for spending patterns
    const transactionAnalysis = this.analyzeTransactions(transactions);
    
    // Combine insights
    const plaidInsights = this.combineInsights(accountAnalysis, transactionAnalysis);
    
    if (!plaidInsights.trim()) {
      console.log('PlaidProfileEnhancer: No significant insights found from Plaid data');
      return existingProfile || '';
    }

    // Use AI to integrate Plaid insights with existing profile
    const enhancedProfile = await this.integrateInsightsWithAI(
      userId,
      existingProfile || '',
      plaidInsights
    );

    console.log('PlaidProfileEnhancer: Profile enhanced with Plaid insights');
    return enhancedProfile;
  }

  private analyzeAccounts(accounts: PlaidAccount[]): string {
    if (!accounts.length) return '';

    const insights: string[] = [];
    
    // Calculate total balances by account type
    const balancesByType: Record<string, number> = {};
    const institutions: Set<string> = new Set();
    
    for (const account of accounts) {
      const balance = account.balance?.current || account.currentBalance || 0;
      const type = account.type;
      
      if (!balancesByType[type]) {
        balancesByType[type] = 0;
      }
      
      // For credit accounts, we want the outstanding amount (positive), not the raw balance
      if (type === 'credit') {
        // Credit card balances are typically negative, so we want the absolute value
        balancesByType[type] += Math.abs(balance);
      } else {
        balancesByType[type] += balance;
      }
      
      if (account.institution) {
        institutions.add(account.institution);
      }
    }

    // Generate account insights
    const totalDepository = (balancesByType['depository'] || 0) + (balancesByType['checking'] || 0) + (balancesByType['savings'] || 0);
    const totalInvestment = balancesByType['investment'] || 0;
    const totalCredit = balancesByType['credit'] || 0;
    const totalLoan = balancesByType['loan'] || 0;

    if (totalDepository > 0) {
      insights.push(`The user has total savings of $${totalDepository.toFixed(2)} in depository accounts`);
    }
    
    if (totalInvestment > 0) {
      insights.push(`The user has an investment portfolio worth $${totalInvestment.toFixed(2)}`);
    }
    
    if (totalCredit > 0) {
      insights.push(`The user has credit accounts with outstanding balances totaling $${totalCredit.toFixed(2)} (credit limit information not available)`);
    }
    
    if (totalLoan > 0) {
      insights.push(`The user has outstanding loans totaling $${totalLoan.toFixed(2)}`);
    }

    if (institutions.size > 0) {
      insights.push(`The user's financial institutions include ${Array.from(institutions).join(', ')}`);
    }

    return insights.join('. ') + '.';
  }

  private analyzeTransactions(transactions: PlaidTransaction[]): string {
    if (!transactions.length) return '';

    const insights: string[] = [];
    
    // Analyze spending patterns
    const spendingByCategory: Record<string, number> = {};
    const monthlySpending = new Map<string, number>();
    
    // ✅ Use transaction_type to filter transactions correctly
    // Only count actual expenses (not transfers, deposits, etc.)
    const isExpenseTransaction = (transaction: PlaidTransaction): boolean => {
      const transactionType = (transaction as any).transaction_type;
      
      // ✅ Primary: Use transaction_type if available (respects manual corrections)
      if (transactionType) {
        return transactionType === 'expense' || transactionType === 'fee';
      }
      
      // ✅ Fallback: If no transaction_type (backwards compatibility), use heuristics
      // This handles test data and old data that hasn't been categorized yet
      const category = transaction.category?.[0]?.toLowerCase() || '';
      const name = transaction.name?.toLowerCase() || '';
      
      // Exclude transfers, deposits, and investment transactions
      if (category.includes('transfer') || name.includes('transfer')) return false;
      if (category.includes('deposit') || name.includes('deposit')) return false;
      if (category.includes('investment') || category.includes('securities')) return false;
      if (name.includes('vanguard') || name.includes('fidelity') || name.includes('public.com')) return false;
      
      // If amount is negative, it's likely an expense
      // If amount is positive but category suggests expense (e.g., "Food and Drink"), also count it
      // This handles test data where expenses might be positive before normalization
      if (transaction.amount < 0) {
        return true; // Negative amount is likely expense
      }
      
      // For positive amounts, check if category suggests it's an expense category
      const expenseCategories = ['food', 'drink', 'restaurant', 'transportation', 'gas', 'shopping', 
                                  'clothing', 'medical', 'rent', 'utilities', 'entertainment', 'service'];
      const isExpenseCategory = expenseCategories.some(expCat => 
        category.includes(expCat) || name.includes(expCat)
      );
      
      return isExpenseCategory; // Only count positive amounts as expenses if category suggests it
    };
    
    for (const transaction of transactions) {
      const amount = Math.abs(transaction.amount);
      const category = transaction.category?.[0] || 'Unknown';
      const month = transaction.date.substring(0, 7); // YYYY-MM
      
      // ✅ Only add to category analysis if it's an actual expense transaction
      if (isExpenseTransaction(transaction)) {
        if (!spendingByCategory[category]) {
          spendingByCategory[category] = 0;
        }
        spendingByCategory[category] += amount;
      }
      
      // Only add to monthly spending if it's an expense transaction
      if (isExpenseTransaction(transaction)) {
        if (!monthlySpending.has(month)) {
          monthlySpending.set(month, 0);
        }
        monthlySpending.set(month, monthlySpending.get(month)! + amount);
      }
    }

    // Find top spending categories
    const topCategories = Object.entries(spendingByCategory)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);

    if (topCategories.length > 0) {
      const categoryInsights = topCategories.map(([category, amount]) => 
        `${category}: $${amount.toFixed(2)}`
      ).join(', ');
      insights.push(`The user's top spending categories are ${categoryInsights}`);
    }

    // Calculate average monthly spending
    if (monthlySpending.size > 0) {
      const totalSpending = Array.from(monthlySpending.values()).reduce((sum, amount) => sum + amount, 0);
      const avgMonthlySpending = totalSpending / monthlySpending.size;
      insights.push(`The user's average monthly spending is $${avgMonthlySpending.toFixed(2)}`);
    }

    // Analyze income patterns
    // ✅ CRITICAL: Use transaction_type to filter for actual INCOME transactions
    // This respects manual corrections and ensures accuracy
    const incomeTransactions = transactions.filter(transaction => {
      // ✅ First check transaction_type (most reliable, includes manual corrections)
      const transactionType = (transaction as any).transaction_type;
      if (transactionType === 'income') {
        return true;
      }
      
      // If no transaction_type, fall back to legacy logic for backwards compatibility
      // (This shouldn't happen if categorization is running, but included as safety net)
      if (transaction.amount <= 0) return false; // Must be positive
      
      const name = transaction.name?.toLowerCase() || '';
      
      // ✅ Check ALL categories in the array, not just the first one
      const allBasicCategories = Array.isArray(transaction.category) 
        ? transaction.category.map(c => (c || '').toLowerCase()).join(' ')
        : ((transaction.category?.[0] || '').toLowerCase());
      
      const allEnrichedCategories = Array.isArray(transaction.enriched_data?.category)
        ? transaction.enriched_data.category.map(c => (c || '').toLowerCase()).join(' ')
        : ((transaction.enriched_data?.category?.[0] || '').toLowerCase());
      
      // ✅ STEP 1: Check if Plaid explicitly categorized this as INCOME
      const plaidSaysIncome = 
        allBasicCategories.includes('income') ||
        allBasicCategories.includes('salary') ||
        allBasicCategories.includes('wages') ||
        allBasicCategories.includes('paycheck') ||
        allBasicCategories.includes('interest') ||
        allBasicCategories.includes('dividend') ||
        allBasicCategories.includes('social security') ||
        allBasicCategories.includes('government benefits') ||
        allBasicCategories.includes('retirement') ||
        allBasicCategories.includes('pension');
      
      // If Plaid says it's income, trust it! (unless it's explicitly a refund)
      if (plaidSaysIncome) {
        if (name.includes('refund') || name.includes('reversal') || name.includes('return payment')) {
          return false;
        }
        return true;
      }
      
      // ✅ STEP 2: Check transaction name for known income sources
      const isIncomeByName =
        name.includes('salary') ||
        name.includes('wages') ||
        name.includes('payroll') ||
        name.includes('social security') ||
        name.includes('ssa ') ||
        name.includes('interest credit') ||
        name.includes('interest deposit') ||
        name.includes('dividend') ||
        name.includes('annuity') ||
        name.includes('rmd') ||
        name.includes('pension') ||
        name.includes('unemployment') ||
        name.includes('disability') ||
        name.includes('vanguard') && (name.includes('distribution') || name.includes('rmd')) ||
        name.includes('fidelity') && (name.includes('distribution') || name.includes('rmd')) ||
        name.includes('schwab') && (name.includes('distribution') || name.includes('rmd')) ||
        name.includes('equitable') && (name.includes('distribution') || name.includes('rmd')) ||
        name.includes('riversource') ||
        name.includes('amp life');
      
      if (isIncomeByName) {
        return true;
      }
      
      // ❌ STEP 3: Exclude non-income positive transactions
      if (allBasicCategories.includes('transfer') || allEnrichedCategories.includes('transfer')) {
        return false;
      }
      
      if (name.includes('deposit') || name.includes('cash deposit') || name.includes('check deposit')) {
        return false;
      }
      
      if (name.includes('refund') || name.includes('return') || name.includes('reversal') || name.includes('correction')) {
        return false;
      }
      
      // If transaction_type is set but not 'income', exclude it
      if (transactionType && transactionType !== 'income') {
        return false;
      }
      
      return false; // Default: exclude if unsure
    });
    
    if (incomeTransactions.length > 0) {
      const monthlyIncome = new Map<string, number>();
      
      for (const transaction of incomeTransactions) {
        const month = transaction.date.substring(0, 7); // YYYY-MM
        if (!monthlyIncome.has(month)) {
          monthlyIncome.set(month, 0);
        }
        monthlyIncome.set(month, monthlyIncome.get(month)! + transaction.amount);
      }
      
      if (monthlyIncome.size > 0) {
        const totalIncome = Array.from(monthlyIncome.values()).reduce((sum, amount) => sum + amount, 0);
        const avgMonthlyIncome = totalIncome / monthlyIncome.size;
        insights.push(`The user's average monthly income is $${avgMonthlyIncome.toFixed(2)}`);
        
        // Identify specific income sources using both transaction names and categories
        const incomeSources = new Map<string, number>();
        for (const transaction of incomeTransactions) {
          const name = transaction.name?.toLowerCase() || '';
          
          // ✅ Check ALL categories in the array for better matching
          const allBasicCats = Array.isArray(transaction.category) 
            ? transaction.category.map(c => (c || '').toLowerCase()).join(' ')
            : ((transaction.category?.[0] || '').toLowerCase());
          
          const allEnrichedCats = Array.isArray(transaction.enriched_data?.category)
            ? transaction.enriched_data.category.map(c => (c || '').toLowerCase()).join(' ')
            : ((transaction.enriched_data?.category?.[0] || '').toLowerCase());
          
          // IMPORTANT: For income detection, prioritize basic categories over enriched when basic shows income
          // Enriched categories sometimes misclassify income (e.g., "Interest Credit" as "Bank Fees")
          let category = allBasicCats;
          if (allBasicCats.includes('income') || allBasicCats.includes('interest') || allBasicCats.includes('dividend')) {
            // Trust basic category when it explicitly indicates income
            category = allBasicCats;
          } else if (allEnrichedCats && !allEnrichedCats.includes('bank fees') && !allEnrichedCats.includes('fee')) {
            // Use enriched only if it doesn't suggest a fee/expense
            category = allEnrichedCats;
          }
          
          let source = 'Other Income';
          
          // Check transaction name first (most reliable)
          if (name.includes('social security') || name.includes('ssa')) {
            source = 'Social Security';
          } else if (name.includes('interest deposit') || name.includes('interest credit')) {
            source = 'Interest Income';
          } else if (name.includes('annuity') || name.includes('amp life') || name.includes('riversource')) {
            source = 'Annuity/RMD';
          } else if (name.includes('vanguard') && name.includes('rmd')) {
            source = 'Annuity/RMD';
          } else if (name.includes('vanguard') || name.includes('public')) {
            source = 'Investment Income';
          } else if (name.includes('salary') || name.includes('payroll') || name.includes('wages')) {
            source = 'Salary/Wages';
          } else if (name.includes('dividend')) {
            source = 'Investment Income';
          }
          // Then check categories if name didn't match
          else if (category.includes('social security')) {
            source = 'Social Security';
          } else if (category.includes('interest')) {
            source = 'Interest Income';
          } else if (category.includes('annuity') || category.includes('insurance')) {
            source = 'Annuity/RMD';
          } else if (category.includes('wages') || category.includes('salary')) {
            source = 'Salary/Wages';
          } else if (category.includes('dividend')) {
            source = 'Investment Income';
          } else if (category.includes('government')) {
            source = 'Government Benefits';
          } else if (category.includes('transfer in') || category.includes('income')) {
            source = 'Other Income';
          }
          
          incomeSources.set(source, (incomeSources.get(source) || 0) + transaction.amount);
        }
        
        const topIncomeSources = Array.from(incomeSources.entries())
          .sort(([,a], [,b]) => b - a)
          .slice(0, 3);
        
        if (topIncomeSources.length > 0) {
          const incomeSourceInsights = topIncomeSources.map(([source, amount]) => 
            `${source}: $${amount.toFixed(2)}`
          ).join(', ');
          insights.push(`The user's income sources include ${incomeSourceInsights}`);
        }
      }
    }

    return insights.join('. ') + '.';
  }

  private combineInsights(accountAnalysis: string, transactionAnalysis: string): string {
    const insights: string[] = [];
    
    if (accountAnalysis) {
      insights.push(accountAnalysis);
    }
    
    if (transactionAnalysis) {
      insights.push(transactionAnalysis);
    }

    return insights.join(' ');
  }

  private async integrateInsightsWithAI(
    userId: string,
    existingProfile: string,
    plaidInsights: string
  ): Promise<string> {
    
    const prompt = `
    Integrate the following Plaid financial insights into the user's existing profile.
    
    Existing profile:
    ${existingProfile || 'No existing profile.'}
    
    Plaid financial insights:
    ${plaidInsights}
    
    Instructions:
    - Integrate the Plaid insights naturally into the profile
    - Maintain the existing profile information
    - Add financial context like account balances, spending patterns, and institutions
    - Keep the profile in natural language format
    - Don't duplicate information that's already in the profile
    
    Return ONLY the updated profile text in natural language format.
    `;
    
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      });
      
      return response.choices[0].message.content || existingProfile;
    } catch (error) {
      console.error('PlaidProfileEnhancer: Error integrating insights with AI:', error);
      // Fallback: append insights to existing profile
      return existingProfile + (existingProfile ? ' ' : '') + plaidInsights;
    }
  }

  /**
   * Real-time analysis of Plaid data for immediate profile enhancement
   * This method is called during account connection and transaction fetching
   */
  async analyzePlaidDataForProfile(
    userId: string,
    accounts: PlaidAccount[],
    transactions: PlaidTransaction[]
  ): Promise<string> {
    console.log('PlaidProfileEnhancer: Starting real-time Plaid data analysis');
    
    // Analyze data without persisting
    const enhancedProfile = await this.enhanceProfileFromPlaidData(
      userId,
      accounts,
      transactions
    );
    
    console.log('PlaidProfileEnhancer: Real-time analysis complete');
    return enhancedProfile;
  }
} 