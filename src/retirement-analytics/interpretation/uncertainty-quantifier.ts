// Uncertainty Quantifier
// Phase 6: Formatter & Confidence Enforcement

import { DataQualityReport, ConfidenceLevel, PortfolioMapping } from '../types';
import { Holding, Security } from '../../services/financial-data-service';
import {
  describeUnmodeledInvestmentValue,
  type UnmodeledInvestmentValue,
} from '../../services/investment-coverage';

/**
 * Calculate data quality metrics
 */
export function calculateDataQuality(
  holdings: Holding[],
  securities: Security[],
  portfolioMapping: PortfolioMapping,
  priceHistoryCoverage: number,
  assumptions: string[],
  stressTestMissingData: string[] = [],
  unmodeledInvestments?: UnmodeledInvestmentValue | null
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

  const missingData = [...portfolioMapping.unmappedHoldings, ...stressTestMissingData];

  // With nothing excluded, the modeled portfolio is the whole portfolio and
  // coverage is complete. Reporting 0 here would read as "nothing modeled".
  const modeledValue = unmodeledInvestments?.modeledValue ?? totalValue;
  const unmodeledValue = unmodeledInvestments?.unmodeledValue ?? 0;
  const valueCoverage = unmodeledInvestments?.valueCoverage ?? 1;

  return {
    completeness,
    priceHistoryCoverage,
    modeledValue,
    unmodeledValue,
    valueCoverage,
    unmodeledReasons: (unmodeledInvestments?.reasons ?? []).map(reason => ({
      label: reason.label,
      amount: reason.amount,
      kind: reason.kind,
    })),
    metadataConfidence,
    portfolioMappingConfidence: portfolioMapping.mappingConfidence,
    proxiedValuePercentage,
    proxyUsage: {
      usEquityProxy: 'Kenneth French broad US market total-return history',
      internationalEquityProxy: 'Kenneth French EAFE-plus-Canada market return history',
      bondsProxy: 'Shiller synthetic 10-year US government-bond total-return history',
      unmappedHoldings: portfolioMapping.unmappedHoldings,
      mappingMethod: portfolioMapping.mappingMethod
    },
    assumptions,
    missingData
  };
}

/**
 * Calculate confidence ceiling - explicit mechanical rules
 * Confidence cannot be "high" if:
 * - portfolioMappingConfidence !== 'high'
 * - priceHistoryCoverage < 0.8
 * - proxiedValuePercentage >= 0.4
 * - valueCoverage < 0.95
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
  // A projection that does not model every invested dollar cannot be highly
  // confident about what the portfolio supports, however well the dollars it
  // did receive are described. Five percent of a retirement portfolio moves a
  // withdrawal rate and a survival share by more than a rounding note.
  if (dataQuality.valueCoverage < 0.95) {
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

  // First, ahead of the standing disclaimers. This one is specific to this
  // portfolio and changes how every number below should be read, so it must
  // not sit seventh in a list a reader skims.
  const unmodeledNote = describeUnmodeledInvestmentValue({
    totalInvestments: dataQuality.modeledValue + dataQuality.unmodeledValue,
    modeledValue: dataQuality.modeledValue,
    unmodeledValue: dataQuality.unmodeledValue,
    valueCoverage: dataQuality.valueCoverage,
    reasons: (dataQuality.unmodeledReasons || []).map(reason => ({
      accountId: '',
      label: reason.label,
      amount: reason.amount,
      kind: reason.kind === 'no-holdings' ? 'no-holdings' : 'partial-holdings',
    })),
  });
  if (unmodeledNote) disclaimers.push(unmodeledNote);

  disclaimers.push('Past performance does not predict future results. Historical analysis shows what happened in the past but cannot guarantee future outcomes.');
  disclaimers.push('Monthly rolling historical windows overlap; their survival share is descriptive and is not an estimate based on independent observations.');
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
    /international equity|us equity|bonds/i.test(m)
  );
  if (stressTestMissing.length > 0) {
    disclaimers.push(`Analysis uses proxy or partial historical data. ${stressTestMissing.join('; ')}. Results may be less accurate.`);
  }

  if (timelineBucketNote) {
    disclaimers.push(timelineBucketNote);
  }

  return disclaimers;
}
