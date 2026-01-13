// Portfolio Analyzer
// Phase 1: Portfolio Metrics & Mapping

import { Holding, Security } from '../../services/financial-data-service';
import { PortfolioCompositionMetrics } from '../types';
import { DataProviderFactory } from '../data/data-provider-factory';

/**
 * Calculate portfolio composition metrics including allocations, concentration, and expense ratios
 * Uses FMP metadata when available for accurate expense ratios and asset classification
 */
export async function analyzePortfolio(
  holdings: Holding[],
  securities: Security[],
  dataProviderFactory?: DataProviderFactory
): Promise<PortfolioCompositionMetrics> {
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

  // Fetch FMP metadata for all unique tickers in parallel (if dataProviderFactory is available)
  // Reuse the same metadata map to avoid duplicate API calls
  const tickerToMetadata = new Map<string, any>();
  if (dataProviderFactory) {
    const uniqueTickers = new Set<string>();
    for (const holding of holdings) {
      const security = securityMap.get(holding.security_id);
      const ticker = security?.ticker_symbol?.toUpperCase() || holding.ticker_symbol?.toUpperCase();
      if (ticker && ticker.length > 0 && ticker.length <= 10) {
        uniqueTickers.add(ticker);
      }
    }

    if (uniqueTickers.size > 0) {
      // Fetch metadata for all tickers in parallel
      const metadataPromises = Array.from(uniqueTickers).map(async (ticker) => {
        try {
          const metadata = await dataProviderFactory.getSecurityMetadata(ticker);
          return { ticker, metadata };
        } catch (error) {
          console.warn(`⚠️ Failed to fetch FMP metadata for ${ticker}:`, error);
          return { ticker, metadata: null };
        }
      });

      const metadataResults = await Promise.all(metadataPromises);
      for (const { ticker, metadata } of metadataResults) {
        if (metadata) {
          tickerToMetadata.set(ticker, metadata);
        }
      }
    }
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

    const ticker = security?.ticker_symbol?.toUpperCase() || holding.ticker_symbol?.toUpperCase() || '';
    const fmpMetadata = ticker ? tickerToMetadata.get(ticker) : null;

    // Prefer FMP metadata if available, fallback to security metadata
    const assetType = fmpMetadata?.assetClass?.toLowerCase() || 
                     security?.type?.toLowerCase() || 
                     holding.security_type?.toLowerCase() || '';
    const securityName = security?.name?.toLowerCase() || holding.security_name?.toLowerCase() || '';
    const geographicFocus = fmpMetadata?.geographicFocus?.toLowerCase() || '';
    
    // Classify as equity, fixed income, or cash (FMP metadata takes precedence)
    if (assetType.includes('equity') || assetType.includes('stock') || 
        (!assetType && (securityName.includes('equity') || securityName.includes('stock')))) {
      equityValue += holdingValue;
      
      // Check if international (use FMP geographic focus if available)
      if (geographicFocus === 'international' || geographicFocus === 'global' ||
          securityName.includes('international') || securityName.includes('ex-us') || 
          (securityName.includes('global') && !securityName.includes('us'))) {
        internationalValue += holdingValue;
      }
    } else if (assetType.includes('bond') || assetType.includes('fixed income') ||
               (!assetType && (securityName.includes('bond') || securityName.includes('fixed income')))) {
      fixedIncomeValue += holdingValue;
    } else if (assetType.includes('cash') || assetType.includes('money market') ||
               (!assetType && (securityName.includes('cash') || securityName.includes('money market')))) {
      cashValue += holdingValue;
    } else {
      // Default classification based on common patterns
      // If unknown, assume equity
      equityValue += holdingValue;
    }

    // Expense ratio from FMP metadata (if available)
    const expenseRatio = fmpMetadata?.expenseRatio || 0;
    if (expenseRatio > 0) {
      totalExpenseRatio += expenseRatio * weight;
      totalExpenseRatioWeight += weight;
    } else if (fmpMetadata && fmpMetadata.isETF && !expenseRatio) {
      // ETF without expense ratio - might be missing from FMP, but we know it's an ETF
      // Could add a default assumption here if needed
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
