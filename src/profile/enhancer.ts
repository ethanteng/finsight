import { getPrismaClient } from '../prisma-client';
import { ProfileManager } from './manager';

export interface InvestmentProfile {
  totalPortfolioValue: number;
  assetAllocation: Array<{
    type: string;
    value: number;
    percentage: number;
  }>;
  holdingCount: number;
  securityCount: number;
  lastUpdated: Date;
}

export interface InvestmentActivity {
  totalTransactions: number;
  totalVolume: number;
  activityByType: Record<string, { count: number; totalAmount: number }>;
  averageTransactionSize: number;
  lastUpdated: Date;
}

export interface DebtProfile {
  totalDebt: number;
  highInterestDebt: number;
  averageInterestRate: number;
  debtTypes: Record<string, number>;
  lastUpdated: Date;
}

export interface DebtOptimization {
  highestInterestDebt: string;
  recommendedPayoffOrder: string[];
  estimatedSavings: number;
  lastUpdated: Date;
}

export interface SpendingProfile {
  totalSpending: number;
  spendingByCategory: Record<string, number>;
  averageTransactionSize: number;
  merchantInsights: Record<string, any>;
  lastUpdated: Date;
}

/**
 * Enhances user profile with investment data without persisting raw data
 * Only stores analyzed insights and portfolio summaries
 */
export const enhanceProfileWithInvestmentData = async (
  userId: string, 
  holdings: any[], 
  transactions: any[]
): Promise<void> => {
  try {
    const prisma = getPrismaClient();
    const profileManager = new ProfileManager();
    
    // Get current profile
    const currentProfile = await profileManager.getOrCreateProfile(userId);
    
    // Analyze portfolio and activity
    const portfolioAnalysis = analyzePortfolio(holdings);
    const activityAnalysis = analyzeInvestmentActivity(transactions);
    
    // Create investment insights for profile
    const investmentInsights = generateInvestmentInsights(portfolioAnalysis, activityAnalysis);
    
    // Update profile with new insights (not raw data)
    const updatedProfile = currentProfile + '\n\n' + investmentInsights;
    await profileManager.updateProfile(userId, updatedProfile);
    
    // Update profile timestamp only
    await prisma.userProfile.updateMany({
      where: { userId },
      data: {
        lastUpdated: new Date()
      }
    });
    
    console.log(`Enhanced profile for user ${userId} with investment insights`);
  } catch (error) {
    console.error('Error enhancing profile with investment data:', error);
    throw error;
  }
};

/**
 * Enhances user profile with liability data without persisting raw data
 * Only stores analyzed insights and debt summaries
 */
export const enhanceProfileWithLiabilityData = async (
  userId: string, 
  liabilities: any[]
): Promise<void> => {
  try {
    const prisma = getPrismaClient();
    const profileManager = new ProfileManager();
    
    // Get current profile
    const currentProfile = await profileManager.getOrCreateProfile(userId);
    
    // Analyze debt obligations
    const debtAnalysis = analyzeDebtObligations(liabilities);
    const optimizationAnalysis = analyzeDebtOptimization(liabilities);
    
    // Create debt insights for profile
    const debtInsights = generateDebtInsights(debtAnalysis, optimizationAnalysis);
    
    // Update profile with new insights (not raw data)
    const updatedProfile = currentProfile + '\n\n' + debtInsights;
    await profileManager.updateProfile(userId, updatedProfile);
    
    // Update profile timestamp only
    await prisma.userProfile.updateMany({
      where: { userId },
      data: {
        lastUpdated: new Date()
      }
    });
    
    console.log(`Enhanced profile for user ${userId} with liability insights`);
  } catch (error) {
    console.error('Error enhancing profile with liability data:', error);
    throw error;
  }
};

/**
 * Enhances user profile with transaction enrichment data without persisting raw data
 * Only stores analyzed insights and spending patterns
 */
export const enhanceProfileWithEnrichmentData = async (
  userId: string, 
  enrichedTransactions: any[]
): Promise<void> => {
  try {
    const prisma = getPrismaClient();
    const profileManager = new ProfileManager();
    
    // Get current profile
    const currentProfile = await profileManager.getOrCreateProfile(userId);
    
    // Analyze spending patterns
    const spendingAnalysis = analyzeSpendingPatterns(enrichedTransactions);
    
    // Create spending insights for profile
    const spendingInsights = generateSpendingInsights(spendingAnalysis);
    
    // Update profile with new insights (not raw data)
    const updatedProfile = currentProfile + '\n\n' + spendingInsights;
    await profileManager.updateProfile(userId, updatedProfile);
    
    // Update profile timestamp only
    await prisma.userProfile.updateMany({
      where: { userId },
      data: {
        lastUpdated: new Date()
      }
    });
    
    console.log(`Enhanced profile for user ${userId} with spending insights`);
  } catch (error) {
    console.error('Error enhancing profile with enrichment data:', error);
    throw error;
  }
};

// Helper functions for analysis (these would be imported from the plaid.ts file)
const analyzePortfolio = (holdings: any[]) => {
  const portfolioValue = holdings.reduce((total, holding) => {
    return total + (holding.institution_value || 0);
  }, 0);

  const assetAllocation = holdings.reduce((allocation, holding) => {
    const assetType = holding.security?.type || 'Unknown';
    if (!allocation[assetType]) {
      allocation[assetType] = 0;
    }
    allocation[assetType] += (holding.institution_value as number) || 0;
    return allocation;
  }, {} as Record<string, number>);

  const allocationPercentages = Object.entries(assetAllocation).map(([type, value]) => ({
    type,
    value: value as number,
    percentage: portfolioValue > 0 ? ((value as number) / portfolioValue) * 100 : 0
  }));

  return {
    totalValue: portfolioValue,
    assetAllocation: allocationPercentages,
    holdingCount: holdings.length,
    securityCount: new Set(holdings.map(h => h.security_id)).size
  };
};

const analyzeInvestmentActivity = (transactions: any[]) => {
  const activityByType = transactions.reduce((activity, transaction) => {
    const type = transaction.type || 'Unknown';
    if (!activity[type]) {
      activity[type] = { count: 0, totalAmount: 0 };
    }
    activity[type].count++;
    activity[type].totalAmount += Math.abs(transaction.amount || 0);
    return activity;
  }, {} as Record<string, { count: number; totalAmount: number }>);

  const totalTransactions = transactions.length;
  const totalVolume = transactions.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

  return {
    totalTransactions,
    totalVolume,
    activityByType,
    averageTransactionSize: totalTransactions > 0 ? totalVolume / totalTransactions : 0
  };
};

const analyzeDebtObligations = (liabilities: any[]) => {
  const totalDebt = liabilities.reduce((total, liability) => {
    return total + (liability.last_statement_balance || 0);
  }, 0);

  const highInterestDebt = liabilities.reduce((total, liability) => {
    if ((liability.interest_rate || 0) > 15) {
      return total + (liability.last_statement_balance || 0);
    }
    return total;
  }, 0);

  const totalInterest = liabilities.reduce((total, liability) => {
    return total + ((liability.interest_rate || 0) * (liability.last_statement_balance || 0));
  }, 0);

  const averageInterestRate = totalDebt > 0 ? totalInterest / totalDebt : 0;

  const debtTypes = liabilities.reduce((types, liability) => {
    const type = liability.type || 'Unknown';
    if (!types[type]) {
      types[type] = 0;
    }
    types[type] += (liability.last_statement_balance || 0);
    return types;
  }, {} as Record<string, number>);

  return {
    totalDebt,
    highInterestDebt,
    averageInterestRate,
    debtTypes
  };
};

const analyzeDebtOptimization = (liabilities: any[]) => {
  // Sort by interest rate (highest first) for payoff recommendations
  const sortedLiabilities = [...liabilities].sort((a: any, b: any) => 
    (b.interest_rate || 0) - (a.interest_rate || 0)
  );

  const highestInterestDebt = sortedLiabilities[0]?.name || 'Unknown';
  const recommendedPayoffOrder = sortedLiabilities.map((l: any) => l.name);

  // Calculate estimated savings from paying off high-interest debt first
  const estimatedSavings = sortedLiabilities.reduce((savings: number, liability: any, index: number) => {
    if (index === 0) return savings; // Skip the highest interest debt
    const monthlyInterest = (liability.interest_rate || 0) / 12 / 100;
    const monthlyPayment = (liability.last_statement_balance || 0) * 0.02; // Assume 2% minimum payment
    const monthsToPayoff = (liability.last_statement_balance || 0) / monthlyPayment;
    return savings + (monthlyInterest * (liability.last_statement_balance || 0) * monthsToPayoff);
  }, 0);

  return {
    highestInterestDebt,
    recommendedPayoffOrder,
    estimatedSavings
  };
};

const analyzeSpendingPatterns = (enrichedTransactions: any[]) => {
  const totalSpending = enrichedTransactions.reduce((total, transaction) => {
    return total + Math.abs(transaction.amount || 0);
  }, 0);

  const spendingByCategory = enrichedTransactions.reduce((categories, transaction) => {
    const category = transaction.category || 'Unknown';
    if (!categories[category]) {
      categories[category] = 0;
    }
    categories[category] += Math.abs(transaction.amount || 0);
    return categories;
  }, {} as Record<string, number>);

  const averageTransactionSize = enrichedTransactions.length > 0 
    ? totalSpending / enrichedTransactions.length 
    : 0;

  const merchantInsights = enrichedTransactions.reduce((insights, transaction) => {
    const merchant = transaction.merchant_name || 'Unknown';
    if (!insights[merchant]) {
      insights[merchant] = {
        totalSpent: 0,
        transactionCount: 0,
        categories: new Set<string>()
      };
    }
    insights[merchant].totalSpent += Math.abs(transaction.amount || 0);
    insights[merchant].transactionCount += 1;
    if (transaction.category) {
      insights[merchant].categories.add(transaction.category);
    }
    return insights;
  }, {} as Record<string, any>);

  return {
    totalSpending,
    spendingByCategory,
    averageTransactionSize,
    merchantInsights
  };
};

// Helper functions for generating profile insights
const generateInvestmentInsights = (portfolio: any, activity: any): string => {
  const insights = [
    `Investment Portfolio Overview:`,
    `- Total Portfolio Value: $${portfolio.totalValue?.toLocaleString() || '0'}`,
    `- Number of Holdings: ${portfolio.holdingCount || 0}`,
    `- Number of Securities: ${portfolio.securityCount || 0}`,
    `- Asset Allocation: ${portfolio.assetAllocation?.map((a: any) => `${a.type}: ${a.percentage?.toFixed(1)}%`).join(', ') || 'N/A'}`,
    ``,
    `Investment Activity:`,
    `- Total Transactions: ${activity.totalTransactions || 0}`,
    `- Total Volume: $${activity.totalVolume?.toLocaleString() || '0'}`,
    `- Average Transaction Size: $${activity.averageTransactionSize?.toLocaleString() || '0'}`
  ];
  
  return insights.join('\n');
};

const generateDebtInsights = (debt: any, optimization: any): string => {
  const insights = [
    `Debt Management Overview:`,
    `- Total Debt: $${debt.totalDebt?.toLocaleString() || '0'}`,
    `- High Interest Debt (>15%): $${debt.highInterestDebt?.toLocaleString() || '0'}`,
    `- Average Interest Rate: ${debt.averageInterestRate?.toFixed(2) || '0'}%`,
    `- Debt Types: ${Object.entries(debt.debtTypes || {}).map(([type, amount]: [string, any]) => `${type}: $${amount?.toLocaleString()}`).join(', ') || 'N/A'}`,
    ``,
    `Optimization Recommendations:`,
    `- Highest Interest Debt: ${optimization.highestInterestDebt || 'N/A'}`,
    `- Recommended Payoff Order: ${optimization.recommendedPayoffOrder?.join(' → ') || 'N/A'}`,
    `- Estimated Savings: $${optimization.estimatedSavings?.toLocaleString() || '0'}`
  ];
  
  return insights.join('\n');
};

const generateSpendingInsights = (spending: any): string => {
  const insights = [
    `Spending Pattern Analysis:`,
    `- Total Spending: $${spending.totalSpending?.toLocaleString() || '0'}`,
    `- Average Transaction Size: $${spending.averageTransactionSize?.toLocaleString() || '0'}`,
    `- Top Spending Categories: ${Object.entries(spending.spendingByCategory || {})
      .sort((a: any, b: any) => (b[1] as number) - (a[1] as number))
      .slice(0, 5)
      .map(([category, amount]: [string, any]) => `${category}: $${amount?.toLocaleString()}`)
      .join(', ') || 'N/A'}`
  ];
  
  return insights.join('\n');
};
