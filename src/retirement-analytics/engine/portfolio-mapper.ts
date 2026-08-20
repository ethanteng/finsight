// Portfolio Mapper
// Phase 1: Portfolio Metrics & Mapping

import { Holding, Security } from '../../services/financial-data-service';
import { PortfolioMapping, SecurityMetadata } from '../types';
import { DataProviderFactory } from '../data/data-provider-factory';
import {
  hasBondNameSignal,
  hasCashNameSignal,
  hasEquityNameSignal,
  inferEquityGeography,
  isContainerAssetType,
  isGlobalEquity,
  isInternationalEquity,
  isKnownBondTicker,
} from './asset-classification';
import { resolveTargetDateFund } from '../../services/target-date-fund';

/**
 * Equity inside a target-date fund is global, so it is split the same way the
 * mapper splits any equity it cannot place by geography.
 */
const TARGET_DATE_US_EQUITY_SHARE = 0.7;

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
  preFetchedMetadata?: Map<string, any>,
  /**
   * Year the glidepath is evaluated against. Passed rather than read from the
   * clock so a snapshot, a test, and a replay resolve the same split.
   */
  asOfYear: number = new Date().getFullYear()
): Promise<PortfolioMapping> {
  const mapping: PortfolioMapping = {
    usEquityWeight: 0,
    internationalEquityWeight: 0,
    nominalBondsWeight: 0,
    cashWeight: 0,
    mappingConfidence: 'high',
    unmappedHoldings: [],
    mappingMethod: 'direct',
    targetDateFunds: [],
    unclassifiedEquityCount: 0
  };

  if (totalValue === 0 || holdings.length === 0) {
    return mapping;
  }

  const securityMap = new Map(securities.map(sec => [sec.security_id, sec]));
  let mappedValue = 0;
  let inferredCount = 0;
  let unclassifiedEquityCount = 0;
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

    // Before anything else. A target-date fund is a declared blend, and its own
    // label states the target year -- better evidence than a provider type that
    // says "Mutual Fund", and far better than the ticker-shaped-like-a-stock
    // heuristic further down, which was modeling a de-risking 2040 fund as 100%
    // equity purely because its ticker is four letters.
    const targetDate = resolveTargetDateFund(
      [security?.name, holding.security_name, security?.ticker_symbol, holding.ticker_symbol],
      asOfYear
    );
    if (targetDate) {
      mapping.usEquityWeight += weight * targetDate.equityShare * TARGET_DATE_US_EQUITY_SHARE;
      mapping.internationalEquityWeight +=
        weight * targetDate.equityShare * (1 - TARGET_DATE_US_EQUITY_SHARE);
      mapping.nominalBondsWeight += weight * targetDate.bondShare;
      mapping.targetDateFunds.push({
        label: security?.name || holding.security_name || ticker || 'Target-date fund',
        targetYear: targetDate.targetYear,
        equityShare: targetDate.equityShare,
      });
      // The glidepath is an approximation of a curve we do not hold, so this is
      // inference, not provider metadata -- and it must be stated as such.
      mapping.mappingMethod = 'inferred';
      mapping.mappingConfidence = 'medium';
      inferredCount++;
      mappedValue += holdingValue;
      continue;
    }

    const fmpMetadata = (ticker ? tickerToMetadata.get(ticker) : null) as SecurityMetadata | null;

    if (security || fmpMetadata) {
      // Prefer FMP metadata if available, fallback to security metadata
      const providerAssetClass = fmpMetadata?.assetClass?.toLowerCase() ||
                       security?.type?.toLowerCase() || '';
      // A container type names the wrapper, not the exposure, so it is treated
      // as no class at all and the name decides -- here, where the provider's
      // country split and geographic focus are still in reach.
      const assetType = isContainerAssetType(providerAssetClass) ? '' : providerAssetClass;
      const securityName = security?.name?.toLowerCase() || holding.security_name?.toLowerCase() || '';
      const geographicFocus = fmpMetadata?.geographicFocus?.toLowerCase() || '';

      // Cash before bonds before equity, matching the inference order below: a
      // Treasury money market must not be caught by the "treasury" bond signal,
      // and a bond fund must not be caught by an index-family word.
      if (assetType.includes('cash') || assetType.includes('money market') ||
          (!assetType && hasCashNameSignal(securityName))) {
        mapping.cashWeight += weight;
        mappedValue += holdingValue;
        mapped = true;
      } else if (assetType.includes('bond') || assetType.includes('fixed income') ||
          (!assetType && hasBondNameSignal(securityName))) {
        mapping.nominalBondsWeight += weight;
        mappedValue += holdingValue;
        mapped = true;
      } else if (assetType.includes('equity') || assetType.includes('stock') ||
          (!assetType && hasEquityNameSignal(securityName))) {
        
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
        } else if (geographicFocus === 'us') {
          mapping.usEquityWeight += weight;
          mappedValue += holdingValue;
          mapped = true;
        } else {
          // No provider geography. Read it from the name first.
          const inferredGeography = inferEquityGeography(securityName, ticker);
          if (inferredGeography === 'international') {
            mapping.internationalEquityWeight += weight;
          } else if (inferredGeography === 'us') {
            mapping.usEquityWeight += weight;
          } else if (assetType) {
            // The provider named a specific asset class, so this is a security
            // rather than a fund inferred from its name -- a directly held
            // stock, which stays domestic by default as it always has. Widening
            // this to 70/30 would have split single US names like "Wells Fargo
            // & Co." across two continents.
            mapping.usEquityWeight += weight;
          } else {
            // Equity recognized only from a fund's name, with nothing saying
            // where it invests. A fund genuinely could be either, so it takes
            // the documented historical-average split.
            mapping.usEquityWeight += weight * 0.7;
            mapping.internationalEquityWeight += weight * 0.3;
            unclassifiedEquityCount++;
          }
          mappedValue += holdingValue;
          mapped = true;
        }
      }
    }

    // If not mapped by security metadata, try inference
    if (!mapped) {
      const securityName = security?.name?.toLowerCase() || holding.security_name?.toLowerCase() || '';
      const ticker = security?.ticker_symbol?.toUpperCase() || holding.ticker_symbol?.toUpperCase() || '';
      const holdingType = holding.security_type?.toLowerCase() || '';

      // Inference heuristics, most specific evidence first.
      //
      // Cash precedes bonds so a Treasury money-market fund is not caught by
      // the "treasury" bond signal, and both precede equity so a bond or cash
      // fund is never swept up by the ticker-shaped-like-a-stock fallback --
      // which had been classifying a government cash reserve as stocks purely
      // because its ticker is five letters.
      if (hasCashNameSignal(securityName)) {
        mapping.cashWeight += weight;
        mapping.mappingMethod = 'inferred';
        mapping.mappingConfidence = 'medium';
        inferredCount++;
        mappedValue += holdingValue;
        mapped = true;
      } else if (holdingType.includes('bond') || holdingType.includes('fixed income') ||
          hasBondNameSignal(securityName) || isKnownBondTicker(ticker)) {
        mapping.nominalBondsWeight += weight;
        mapping.mappingMethod = 'inferred';
        mapping.mappingConfidence = 'medium';
        inferredCount++;
        mappedValue += holdingValue;
        mapped = true;
      } else if (holdingType.includes('equity') || holdingType.includes('stock') ||
          // Employer-plan and institutional share classes state their mandate
          // in the name and nowhere else: "Large Cap Growth Fund", "S&P 500
          // Indx SL Sr Fd Cl X". Without this they fell out of the basket
          // entirely, and their value was then spread across whatever the rest
          // of the portfolio happened to hold.
          hasEquityNameSignal(securityName) ||
          ticker.match(/^[A-Z]{1,5}$/)) { // Common stock ticker pattern
        // Place it by geography when the name says, rather than defaulting a
        // fund called "International Equity Fund" to 70% US.
        const geography = inferEquityGeography(securityName, ticker);
        if (geography === 'international') {
          mapping.internationalEquityWeight += weight;
        } else if (geography === 'us') {
          mapping.usEquityWeight += weight;
        } else {
          // 'global', and names that carry no geography at all, take the
          // documented historical-average split. Only this branch is
          // "unclassified equity", and only it may claim that assumption.
          mapping.usEquityWeight += weight * 0.7;
          mapping.internationalEquityWeight += weight * 0.3;
          unclassifiedEquityCount++;
        }
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

  mapping.unclassifiedEquityCount = unclassifiedEquityCount;

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

  // Gated on the split actually being used, not on inference having happened at
  // all. A portfolio whose only inference was a recognized target-date fund has
  // no unclassified equity, and claiming otherwise gave it a caveat describing
  // a split it never received.
  if (mapping.unclassifiedEquityCount > 0) {
    assumptions.push('Unclassified equity holdings split 70% US / 30% international based on historical averages');
  }

  if (mapping.targetDateFunds.length > 0) {
    // Name the funds and their splits. A reader who disagrees with the
    // glidepath can then see exactly which holdings it moved and by how much.
    const described = mapping.targetDateFunds
      .map(fund => `${fund.label} (${fund.targetYear}, ${Math.round(fund.equityShare * 100)}% equity)`)
      .join('; ');
    assumptions.push(
      `Target-date funds modeled on an approximate industry glidepath rather than each fund's own published curve: ${described}`
    );
  }

  if (mapping.unmappedHoldings.length > 0) {
    assumptions.push(`${mapping.unmappedHoldings.length} holdings could not be mapped to asset classes and were excluded from analysis`);
  }

  if (mapping.usEquityWeight > 0 || mapping.internationalEquityWeight > 0) {
    assumptions.push('US equity exposure uses the Kenneth French broad US market total-return history (Mkt-RF plus RF)');
  }

  if (mapping.internationalEquityWeight > 0) {
    assumptions.push('International equity exposure uses the Kenneth French EAFE-plus-Canada market return in US dollars; emerging markets are not modeled separately');
  }

  if (mapping.nominalBondsWeight > 0) {
    assumptions.push('Bond exposure uses the Shiller synthetic 10-year US government-bond total-return history');
  }

  if (mapping.cashWeight > 0) {
    assumptions.push('Cash holdings use the Kenneth French one-month US Treasury-bill return (RF)');
  }

  return assumptions;
}
