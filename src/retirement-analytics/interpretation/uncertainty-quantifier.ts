// Uncertainty Quantifier
// Phase 6: Formatter & Confidence Enforcement

import { DataQualityReport, ConfidenceLevel, PortfolioMapping } from '../types';
import { Holding, Security } from '../../services/financial-data-service';

/**
 * Calculate data quality metrics
 */
export function calculateDataQuality(
  holdings: Holding[],
  securities: Security[],
  portfolioMapping: PortfolioMapping,
  priceHistoryCoverage: number,
  assumptions: string[],
  stressTestMissingData: string[] = []
): DataQualityReport {
  // Calculate completeness (percentage of holdings with full metadata)
  const securityMap = new Map(securities.map(s => [s.security_id, s]));
  let holdingsWithMetadata = 0;
  
  for (const holding of holdings) {
    const security = securityMap.get(holding.security_id);
    if (security && security.type && holding.ticker_symbol) {
      holdingsWithMetadata++;
    }
  }
  
  const completeness = holdings.length > 0 ? holdingsWithMetadata / holdings.length : 1.0;

  // Determine metadata confidence
  let metadataConfidence: 'high' | 'medium' | 'low' = 'high';
  if (completeness < 0.5) {
    metadataConfidence = 'low';
  } else if (completeness < 0.8) {
    metadataConfidence = 'medium';
  }

  // Calculate proxied value percentage
  const totalValue = holdings.reduce((sum, h) => sum + (h.institution_value || 0), 0);
  let proxiedValue = 0;
  
  for (const holding of holdings) {
    const ticker = holding.ticker_symbol || holding.security_id;
    if (portfolioMapping.unmappedHoldings.includes(ticker) || 
        portfolioMapping.mappingMethod === 'inferred') {
      proxiedValue += holding.institution_value || 0;
    }
  }
  
  const proxiedValuePercentage = totalValue > 0 ? proxiedValue / totalValue : 0;

  return {
    completeness,
    priceHistoryCoverage,
    metadataConfidence,
    portfolioMappingConfidence: portfolioMapping.mappingConfidence,
    proxiedValuePercentage,
    proxyUsage: {
      usEquityProxy: 'VTI',
      internationalEquityProxy: 'VXUS',
      bondsProxy: 'AGG',
      unmappedHoldings: portfolioMapping.unmappedHoldings,
      mappingMethod: portfolioMapping.mappingMethod
    },
    assumptions,
    missingData: [...portfolioMapping.unmappedHoldings, ...stressTestMissingData]
  };
}

/**
 * Calculate confidence ceiling - explicit mechanical rules
 * Confidence cannot be "high" if:
 * - portfolioMappingConfidence !== 'high'
 * - priceHistoryCoverage < 0.8
 * - proxiedValuePercentage >= 0.4
 */
export function calculateConfidenceCeiling(
  dataQuality: DataQualityReport
): ConfidenceLevel {
  // Explicit mechanical rules: confidence cannot be "high" if:
  if (dataQuality.portfolioMappingConfidence !== 'high') {
    return 'medium';
  }
  if (dataQuality.priceHistoryCoverage < 0.8) {
    return 'medium';
  }
  if (dataQuality.proxiedValuePercentage >= 0.4) {
    return 'medium';
  }
  // If all conditions met, allow high confidence
  return 'high';
}

/**
 * Generate disclaimers array
 */
export function generateDisclaimers(
  dataQuality: DataQualityReport,
  timelineBucketNote?: string
): string[] {
  const disclaimers: string[] = [];

  disclaimers.push('Past performance does not predict future results. Historical analysis shows what happened in the past but cannot guarantee future outcomes.');
  disclaimers.push('Analysis assumes fixed real-dollar withdrawals. Adaptive withdrawal strategies may improve outcomes.');
  disclaimers.push('Portfolio mapped to broad market indices for historical simulation. Your actual holdings may behave differently.');
  disclaimers.push('Analysis does not account for taxes, fees, or transaction costs.');
  disclaimers.push('This analysis is for informational purposes only and does not constitute financial advice.');

  if (dataQuality.completeness < 0.8) {
    disclaimers.push(`Analysis based on partial data (${Math.round(dataQuality.completeness * 100)}% completeness). Some holdings may have incomplete information.`);
  }

  if (dataQuality.metadataConfidence === 'low') {
    disclaimers.push('Some security classifications were inferred and may be inaccurate.');
  }

  if (dataQuality.portfolioMappingConfidence === 'low' || dataQuality.portfolioMappingConfidence === 'medium') {
    disclaimers.push('Portfolio mapped to historical asset classes using proxies. Some holdings may not perfectly match historical indices.');
  }

  if (dataQuality.assumptions.length > 0) {
    disclaimers.push(`Analysis assumptions: ${dataQuality.assumptions.join('; ')}`);
  }

  // Add disclaimers for missing stress test data
  const stressTestMissing = dataQuality.missingData.filter(m => 
    m.includes('International Equity') || m.includes('US Equity') || m.includes('Bonds')
  );
  if (stressTestMissing.length > 0) {
    disclaimers.push(`⚠️ Analysis uses partial historical data. ${stressTestMissing.join('; ')}. ` +
      `Missing asset classes use zero returns (conservative assumption). Results may be less accurate.`);
  }

  if (timelineBucketNote) {
    disclaimers.push(timelineBucketNote);
  }

  return disclaimers;
}
