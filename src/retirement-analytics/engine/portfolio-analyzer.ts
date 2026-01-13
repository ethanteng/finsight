// Portfolio Analyzer
// Phase 1: Portfolio Metrics & Mapping

import { Holding, Security } from '../../services/financial-data-service';
import { PortfolioCompositionMetrics } from '../types';

/**
 * Calculate portfolio composition metrics including allocations, concentration, and expense ratios
 */
export function analyzePortfolio(
  holdings: Holding[],
  securities: Security[]
): PortfolioCompositionMetrics {
  if (holdings.length === 0) {
    return {
      equityAllocation: 0,
      fixedIncomeAllocation: 0,
      cashAllocation: 0,
      internationalAllocation: 0,
      concentrationRisk: 0,
      expenseRatioWeighted: 0
    };
  }

  const securityMap = new Map(securities.map(sec => [sec.security_id, sec]));
  
  // Calculate total portfolio value
  const totalValue = holdings.reduce((sum, holding) => {
    return sum + (holding.institution_value || 0);
  }, 0);

  if (totalValue === 0) {
    return {
      equityAllocation: 0,
      fixedIncomeAllocation: 0,
      cashAllocation: 0,
      internationalAllocation: 0,
      concentrationRisk: 0,
      expenseRatioWeighted: 0
    };
  }

  // Initialize allocation counters
  let equityValue = 0;
  let fixedIncomeValue = 0;
  let cashValue = 0;
  let internationalValue = 0;
  let totalExpenseRatio = 0;
  let totalExpenseRatioWeight = 0;

  // Calculate allocations and expense ratios
  for (const holding of holdings) {
    const security = securityMap.get(holding.security_id);
    const holdingValue = holding.institution_value || 0;
    const weight = holdingValue / totalValue;

    // Determine asset class from security metadata or holding
    const assetType = security?.type?.toLowerCase() || holding.security_type?.toLowerCase() || '';
    const securityName = security?.name?.toLowerCase() || holding.security_name?.toLowerCase() || '';
    
    // Classify as equity, fixed income, or cash
    if (assetType.includes('equity') || assetType.includes('stock') || 
        securityName.includes('equity') || securityName.includes('stock')) {
      equityValue += holdingValue;
      
      // Check if international (simple heuristic - can be enhanced with metadata)
      if (securityName.includes('international') || securityName.includes('ex-us') || 
          securityName.includes('global') && !securityName.includes('us')) {
        internationalValue += holdingValue;
      }
    } else if (assetType.includes('bond') || assetType.includes('fixed income') ||
               securityName.includes('bond') || securityName.includes('fixed income')) {
      fixedIncomeValue += holdingValue;
    } else if (assetType.includes('cash') || assetType.includes('money market') ||
               securityName.includes('cash') || securityName.includes('money market')) {
      cashValue += holdingValue;
    } else {
      // Default classification based on common patterns
      // If unknown, assume equity for now (can be refined with FMP metadata in Phase 2)
      equityValue += holdingValue;
    }

    // Expense ratio (will be enhanced with FMP metadata in Phase 2)
    // For now, assume 0 if not available
    const expenseRatio = 0; // TODO: Get from FMP metadata in Phase 2
    if (expenseRatio > 0) {
      totalExpenseRatio += expenseRatio * weight;
      totalExpenseRatioWeight += weight;
    }
  }

  // Calculate concentration risk (HHI) across top 10 holdings
  const sortedHoldings = [...holdings]
    .sort((a, b) => (b.institution_value || 0) - (a.institution_value || 0))
    .slice(0, 10);
  
  const concentrationRisk = sortedHoldings.reduce((hhi, holding) => {
    const weight = (holding.institution_value || 0) / totalValue;
    return hhi + (weight * weight);
  }, 0);

  // Calculate weighted expense ratio
  const expenseRatioWeighted = totalExpenseRatioWeight > 0 
    ? totalExpenseRatio / totalExpenseRatioWeight 
    : 0;

  return {
    equityAllocation: (equityValue / totalValue) * 100,
    fixedIncomeAllocation: (fixedIncomeValue / totalValue) * 100,
    cashAllocation: (cashValue / totalValue) * 100,
    internationalAllocation: (internationalValue / totalValue) * 100,
    concentrationRisk,
    expenseRatioWeighted
  };
}
