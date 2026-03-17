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
  dataProviderFactory?: DataProviderFactory,
  preFetchedMetadata?: Map<string, any>
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

  // Use pre-fetched metadata if provided, otherwise fetch (for backward compatibility)
  const tickerToMetadata = preFetchedMetadata || new Map<string, any>();
  
  if (!preFetchedMetadata && dataProviderFactory) {
    // Fallback: fetch if not provided (for backward compatibility or standalone usage)
    const uniqueTickers = new Set<string>();
    for (const holding of holdings) {
      const security = securityMap.get(holding.security_id);
      const ticker = security?.ticker_symbol?.toUpperCase() || holding.ticker_symbol?.toUpperCase();
      if (ticker && ticker.length > 0 && ticker.length <= 10) {
        uniqueTickers.add(ticker);
      }
    }

    if (uniqueTickers.size > 0) {
      console.log(`📊 FMP: Fetching metadata for ${uniqueTickers.size} unique tickers (fallback mode)`);
      
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
               (securityName.includes('bond') || securityName.includes('fixed income'))) {
      fixedIncomeValue += holdingValue;
    } else if (assetType.includes('cash') || assetType.includes('money market') ||
               (!assetType && (securityName.includes('cash') || securityName.includes('money market')))) {
      cashValue += holdingValue;
    } else {
      // Default classification: when assetType is generic (e.g. "etf", "mutual fund")
      // or unknown, check security name for bond hints before assuming equity.
      // Fixes misclassification where bond ETFs defaulted to equity (e.g. 91.9% vs actual ~30%).
      if (securityName.includes('bond') || securityName.includes('fixed income') ||
          securityName.includes('treasury') || securityName.includes('tips') ||
          securityName.includes('aggregate') || securityName.includes('corporate bond')) {
        fixedIncomeValue += holdingValue;
      } else {
        equityValue += holdingValue;
      }
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
  // Guard: totalValue > 0 to avoid NaN (defense-in-depth; totalValue === 0 returns early above)
  const sortedHoldings = [...holdings]
    .sort((a, b) => (b.institution_value || 0) - (a.institution_value || 0))
    .slice(0, 10);
  
  const concentrationRisk = totalValue > 0
    ? sortedHoldings.reduce((hhi, holding) => {
        const weight = (holding.institution_value || 0) / totalValue;
        return hhi + (weight * weight);
      }, 0)
    : 0;

  // Calculate weighted expense ratio
  const expenseRatioWeighted = totalExpenseRatioWeight > 0 
    ? totalExpenseRatio / totalExpenseRatioWeight 
    : 0;

  // Guard against division by zero (defense-in-depth; totalValue === 0 already returns early above)
  return {
    equityAllocation: totalValue > 0 ? (equityValue / totalValue) * 100 : 0,
    fixedIncomeAllocation: totalValue > 0 ? (fixedIncomeValue / totalValue) * 100 : 0,
    cashAllocation: totalValue > 0 ? (cashValue / totalValue) * 100 : 0,
    internationalAllocation: totalValue > 0 ? (internationalValue / totalValue) * 100 : 0,
    concentrationRisk,
    expenseRatioWeighted
  };
}
