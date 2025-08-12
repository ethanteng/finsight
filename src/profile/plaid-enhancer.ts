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
    
    for (const transaction of transactions) {
      const amount = Math.abs(transaction.amount);
      const category = transaction.category?.[0] || 'Unknown';
      const month = transaction.date.substring(0, 7); // YYYY-MM
      
      if (!spendingByCategory[category]) {
        spendingByCategory[category] = 0;
      }
      spendingByCategory[category] += amount;
      
      if (!monthlySpending.has(month)) {
        monthlySpending.set(month, 0);
      }
      monthlySpending.set(month, monthlySpending.get(month)! + amount);
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