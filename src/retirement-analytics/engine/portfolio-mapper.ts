// Portfolio Mapper
// Phase 1: Portfolio Metrics & Mapping

import { Holding, Security } from '../../services/financial-data-service';
import { PortfolioMapping, SecurityMetadata } from '../types';
import { DataProviderFactory } from '../data/data-provider-factory';
import {
  hasBondNameSignal,
  isGlobalEquity,
  isInternationalEquity,
  isKnownBondTicker,
} from './asset-classification';

/**
 * Map portfolio holdings to asset basket (US equity, international equity, bonds, cash)
 * Uses FMP metadata when available for accurate classification
 * Returns mapping with weights, confidence, and unmapped holdings
 */
export async function mapPortfolioToAssetBasket(
  holdings: Holding[],
  securities: Security[],
  totalValue: number,
  dataProviderFactory?: DataProviderFactory,
  preFetchedMetadata?: Map<string, any>
): Promise<PortfolioMapping> {
  const mapping: PortfolioMapping = {
    usEquityWeight: 0,
    internationalEquityWeight: 0,
    nominalBondsWeight: 0,
    cashWeight: 0,
    mappingConfidence: 'high',
    unmappedHoldings: [],
    mappingMethod: 'direct'
  };

  if (totalValue === 0 || holdings.length === 0) {
    return mapping;
  }

  const securityMap = new Map(securities.map(sec => [sec.security_id, sec]));
  let mappedValue = 0;
  let inferredCount = 0;
  let unmappedCount = 0;

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
      // Use batch fetch to avoid N+1 queries on security_metadata
      const batchResult = await dataProviderFactory.getSecurityMetadataBatch(Array.from(uniqueTickers));
      for (const [ticker, metadata] of batchResult) {
        tickerToMetadata.set(ticker, metadata);
      }
    }
  }

  for (const holding of holdings) {
    const security = securityMap.get(holding.security_id);
    const holdingValue = holding.institution_value || 0;
    
    if (holdingValue <= 0) continue;

    const weight = holdingValue / totalValue;
    let mapped = false;

    const ticker = security?.ticker_symbol?.toUpperCase() || holding.ticker_symbol?.toUpperCase() || '';
    const fmpMetadata = (ticker ? tickerToMetadata.get(ticker) : null) as SecurityMetadata | null;

    if (security || fmpMetadata) {
      // Prefer FMP metadata if available, fallback to security metadata
      const assetType = fmpMetadata?.assetClass?.toLowerCase() || 
                       security?.type?.toLowerCase() || '';
      const securityName = security?.name?.toLowerCase() || '';
      const geographicFocus = fmpMetadata?.geographicFocus?.toLowerCase() || '';

      // Map based on asset class (FMP metadata takes precedence)
      if (assetType.includes('equity') || assetType.includes('stock') ||
          (!assetType && (securityName.includes('equity') || securityName.includes('stock')))) {
        
        const countrySplit = getCountrySplit(fmpMetadata);
        if (countrySplit) {
          mapping.usEquityWeight += weight * countrySplit.us;
          mapping.internationalEquityWeight += weight * countrySplit.international;
          mappedValue += holdingValue;
          mapped = true;
        // Use FMP geographic focus if available, otherwise use heuristics
        } else if (isGlobalEquity(geographicFocus, securityName)) {
          // A global fund contains both US and non-US exposure. Use the same
          // explicit broad-market split used for otherwise unclassified equity.
          mapping.usEquityWeight += weight * 0.7;
          mapping.internationalEquityWeight += weight * 0.3;
          mappedValue += holdingValue;
          mapped = true;
        } else if (isInternationalEquity(geographicFocus, securityName, ticker)) {
          mapping.internationalEquityWeight += weight;
          mappedValue += holdingValue;
          mapped = true;
        } else if (geographicFocus === 'us' || !geographicFocus) {
          // Default to US equity
          mapping.usEquityWeight += weight;
          mappedValue += holdingValue;
          mapped = true;
        } else {
          // Global or unknown - split between US and international
          mapping.usEquityWeight += weight * 0.7;
          mapping.internationalEquityWeight += weight * 0.3;
          mappedValue += holdingValue;
          mapped = true;
        }
      } else if (assetType.includes('bond') || assetType.includes('fixed income') ||
                 (!assetType && (security?.type?.toLowerCase().includes('bond') || 
                                 security?.type?.toLowerCase().includes('fixed income')))) {
        mapping.nominalBondsWeight += weight;
        mappedValue += holdingValue;
        mapped = true;
      } else if (assetType.includes('cash') || assetType.includes('money market') ||
                 (!assetType && (security?.type?.toLowerCase().includes('cash') || 
                                 security?.type?.toLowerCase().includes('money market')))) {
        mapping.cashWeight += weight;
        mappedValue += holdingValue;
        mapped = true;
      }
    }

    // If not mapped by security metadata, try inference
    if (!mapped) {
      const securityName = security?.name?.toLowerCase() || holding.security_name?.toLowerCase() || '';
      const ticker = security?.ticker_symbol?.toUpperCase() || holding.ticker_symbol?.toUpperCase() || '';
      const holdingType = holding.security_type?.toLowerCase() || '';

      // Inference heuristics
      if (holdingType.includes('bond') || holdingType.includes('fixed income') ||
          hasBondNameSignal(securityName) || isKnownBondTicker(ticker)) {
        mapping.nominalBondsWeight += weight;
        mapping.mappingMethod = 'inferred';
        mapping.mappingConfidence = 'medium';
        inferredCount++;
        mappedValue += holdingValue;
        mapped = true;
      } else if (holdingType.includes('equity') || holdingType.includes('stock') ||
          securityName.includes('equity') || securityName.includes('stock') ||
          ticker.match(/^[A-Z]{1,5}$/)) { // Common stock ticker pattern
        // Infer equity - assume 70% US, 30% international (will be documented in assumptions)
        mapping.usEquityWeight += weight * 0.7;
        mapping.internationalEquityWeight += weight * 0.3;
        mapping.mappingMethod = 'inferred';
        mapping.mappingConfidence = 'medium';
        inferredCount++;
        mappedValue += holdingValue;
        mapped = true;
      }
    }

    // If still not mapped, add to unmapped
    if (!mapped) {
      const ticker = security?.ticker_symbol || holding.ticker_symbol || holding.security_id;
      mapping.unmappedHoldings.push(ticker);
      unmappedCount++;
    }
  }

  // Normalize weights to sum to 1.0
  const totalMappedWeight = mapping.usEquityWeight + mapping.internationalEquityWeight +
                            mapping.nominalBondsWeight + mapping.cashWeight;
  
  if (totalMappedWeight > 0) {
    mapping.usEquityWeight /= totalMappedWeight;
    mapping.internationalEquityWeight /= totalMappedWeight;
    mapping.nominalBondsWeight /= totalMappedWeight;
    mapping.cashWeight /= totalMappedWeight;
  }

  // Adjust confidence based on mapping quality
  if (unmappedCount > 0 || inferredCount > holdings.length * 0.3) {
    mapping.mappingConfidence = 'low';
  } else if (inferredCount > 0) {
    mapping.mappingConfidence = 'medium';
  }

  return mapping;
}

function getCountrySplit(metadata: SecurityMetadata | null): { us: number; international: number } | null {
  if (metadata?.fundData?.countryCoverage !== 'available') return null;
  const allocations = metadata.fundData.countryAllocations;
  const total = allocations.reduce((sum, allocation) => sum + allocation.weight, 0);
  if (total <= 0) return null;
  const us = allocations
    .filter(allocation => ['united states', 'us', 'usa'].includes(allocation.name.trim().toLowerCase()))
    .reduce((sum, allocation) => sum + allocation.weight, 0) / total;
  return { us, international: Math.max(0, Math.min(1, 1 - us)) };
}

/**
 * Calculate mapping confidence based on how well holdings map to asset basket
 */
export function calculateMappingConfidence(
  mapping: PortfolioMapping,
  holdings: Holding[],
  securities: Security[]
): 'high' | 'medium' | 'low' {
  return mapping.mappingConfidence;
}

/**
 * Calculate percentage of portfolio value mapped via proxies/inference
 */
export function calculateProxiedValuePercentage(
  mapping: PortfolioMapping,
  holdings: Holding[],
  totalValue: number
): number {
  if (totalValue === 0) return 0;

  // Count holdings that were inferred or unmapped
  let proxiedValue = 0;
  
  for (const holding of holdings) {
    const holdingValue = holding.institution_value || 0;
    const ticker = holding.ticker_symbol || holding.security_id;
    
    // If unmapped or inferred, count as proxied
    if (mapping.unmappedHoldings.includes(ticker) || mapping.mappingMethod === 'inferred') {
      proxiedValue += holdingValue;
    }
  }

  return proxiedValue / totalValue;
}

/**
 * Populate assumptions array with explicit proxy decisions
 */
export function populateAssumptions(
  mapping: PortfolioMapping,
  holdings: Holding[],
  securities: Security[]
): string[] {
  const assumptions: string[] = [];

  if (mapping.mappingMethod === 'inferred') {
    assumptions.push('Unclassified equity holdings split 70% US / 30% international based on historical averages');
  }

  if (mapping.unmappedHoldings.length > 0) {
    assumptions.push(`${mapping.unmappedHoldings.length} holdings could not be mapped to asset classes and were excluded from analysis`);
  }

  if (mapping.usEquityWeight > 0 || mapping.internationalEquityWeight > 0) {
    assumptions.push('US equity exposure uses the Shiller US equity total-return history');
  }

  if (mapping.internationalEquityWeight > 0) {
    assumptions.push('International equity currently uses the same US equity return history, so international diversification effects are not modeled');
  }

  if (mapping.nominalBondsWeight > 0) {
    assumptions.push('Bond exposure uses the Shiller historical bond-return series');
  }

  if (mapping.cashWeight > 0) {
    assumptions.push('Cash holdings assumed to earn treasury bill rate');
  }

  return assumptions;
}
