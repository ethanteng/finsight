// Portfolio Mapper
// Phase 1: Portfolio Metrics & Mapping

import { Holding, Security } from '../../services/financial-data-service';
import {
  HoldingExposureWeights,
  HoldingMappingMethod,
  PortfolioMapping,
  ResolvedHoldingExposure,
  SecurityMetadata,
} from '../types';
import { DataProviderFactory } from '../data/data-provider-factory';
import {
  hasBondNameSignal,
  hasCashNameSignal,
  hasEquityNameSignal,
  inferEquityGeography,
  isContainerAssetType,
  isDeclaredFixedIncomeType,
  isKnownBondTicker,
} from './asset-classification';
import { targetDateFundYear } from '../../services/target-date-fund';
import {
  lookupTargetDateFundAllocation,
  TargetDateFundAllocation,
} from '../../services/target-date-fund-registry';

const EMPTY_WEIGHTS: HoldingExposureWeights = {
  usEquity: 0,
  internationalEquity: 0,
  nominalBonds: 0,
  cash: 0,
};

interface HoldingResolutionDraft {
  weights: HoldingExposureWeights;
  method: HoldingMappingMethod;
  confidence: 'high' | 'medium' | 'low';
  targetYear?: number;
  targetAllocation?: TargetDateFundAllocation;
}

function weightTotal(weights: HoldingExposureWeights): number {
  return weights.usEquity + weights.internationalEquity + weights.nominalBonds + weights.cash;
}

function copyWeights(weights: HoldingExposureWeights): HoldingExposureWeights {
  return { ...weights };
}

function resolveHoldingExposure(
  holding: Holding,
  security: Security | undefined,
  fmpMetadata: SecurityMetadata | null,
  asOfDate: string | number,
): HoldingResolutionDraft {
  const ticker = security?.ticker_symbol?.toUpperCase() || holding.ticker_symbol?.toUpperCase() || '';
  const securityName = security?.name?.toLowerCase() || holding.security_name?.toLowerCase() || '';
  const geographicFocus = fmpMetadata?.geographicFocus?.toLowerCase() || '';
  const labels = [security?.name, holding.security_name, security?.ticker_symbol, holding.ticker_symbol];

  // Consider every declared type. A generic FMP wrapper value must not erase a
  // more specific fixed-income type supplied with the security or holding.
  const providerTypes = [fmpMetadata?.assetClass, security?.type, holding.security_type]
    .filter((type): type is string => typeof type === 'string' && type.trim().length > 0)
    .map(type => type.trim().toLowerCase());
  const declaredFixedIncome = providerTypes.some(isDeclaredFixedIncomeType);
  const targetYear = targetDateFundYear(...labels);

  if (targetYear !== null && !declaredFixedIncome) {
    const allocation = lookupTargetDateFundAllocation(labels, asOfDate);
    if (!allocation) {
      return {
        weights: copyWeights(EMPTY_WEIGHTS),
        method: 'unmapped',
        confidence: 'low',
        targetYear,
      };
    }
    return {
      weights: copyWeights(allocation.weights),
      method: 'fund-registry',
      confidence: allocation.exactAllocation ? 'high' : 'medium',
      targetYear,
      targetAllocation: allocation,
    };
  }

  const specificAssetType = providerTypes.find(type =>
    !isContainerAssetType(type) && !['unknown', 'unclassified', 'other'].includes(type)
  ) || '';

  if (specificAssetType.includes('cash') || specificAssetType.includes('money market')) {
    return { weights: { ...EMPTY_WEIGHTS, cash: 1 }, method: 'provider', confidence: 'high' };
  }
  if (specificAssetType.includes('bond') || specificAssetType.includes('fixed income')) {
    return { weights: { ...EMPTY_WEIGHTS, nominalBonds: 1 }, method: 'provider', confidence: 'high' };
  }
  if (specificAssetType.includes('equity') || specificAssetType.includes('stock')) {
    const countrySplit = getCountrySplit(fmpMetadata);
    if (countrySplit) {
      return {
        weights: { ...EMPTY_WEIGHTS, usEquity: countrySplit.us, internationalEquity: countrySplit.international },
        method: 'provider',
        confidence: 'high',
      };
    }
    if (geographicFocus === 'international' || geographicFocus === 'ex-us') {
      return { weights: { ...EMPTY_WEIGHTS, internationalEquity: 1 }, method: 'provider', confidence: 'high' };
    }
    if (geographicFocus === 'global' || geographicFocus === 'world') {
      return {
        weights: copyWeights(EMPTY_WEIGHTS),
        method: 'unmapped',
        confidence: 'low',
      };
    }
    if (geographicFocus === 'us') {
      return { weights: { ...EMPTY_WEIGHTS, usEquity: 1 }, method: 'provider', confidence: 'high' };
    }

    const inferredGeography = inferEquityGeography(securityName, ticker);
    if (inferredGeography === 'international') {
      return { weights: { ...EMPTY_WEIGHTS, internationalEquity: 1 }, method: 'name-inference', confidence: 'medium' };
    }
    if (inferredGeography === 'global') {
      return {
        weights: copyWeights(EMPTY_WEIGHTS),
        method: 'unmapped',
        confidence: 'low',
      };
    }
    // Preserve the existing directly-held-security default when the provider
    // names an equity exposure but supplies no country data.
    return { weights: { ...EMPTY_WEIGHTS, usEquity: 1 }, method: 'provider', confidence: 'medium' };
  }

  // No provider exposure: infer from the label, in specificity order.
  if (hasCashNameSignal(securityName)) {
    return { weights: { ...EMPTY_WEIGHTS, cash: 1 }, method: 'name-inference', confidence: 'medium' };
  }
  if (hasBondNameSignal(securityName) || isKnownBondTicker(ticker)) {
    return { weights: { ...EMPTY_WEIGHTS, nominalBonds: 1 }, method: 'name-inference', confidence: 'medium' };
  }
  if (hasEquityNameSignal(securityName) || /^[A-Z]{1,5}$/.test(ticker)) {
    const geography = inferEquityGeography(securityName, ticker);
    if (geography === 'international') {
      return { weights: { ...EMPTY_WEIGHTS, internationalEquity: 1 }, method: 'name-inference', confidence: 'medium' };
    }
    if (geography === 'us') {
      return { weights: { ...EMPTY_WEIGHTS, usEquity: 1 }, method: 'name-inference', confidence: 'medium' };
    }
    return { weights: copyWeights(EMPTY_WEIGHTS), method: 'unmapped', confidence: 'low' };
  }

  return { weights: copyWeights(EMPTY_WEIGHTS), method: 'unmapped', confidence: 'low' };
}

/**
 * Map portfolio holdings to asset basket (US equity, international equity, bonds, cash)
 * Uses FMP metadata when available for accurate classification
 * Returns mapping with weights, confidence, and unmapped holdings
 */
export async function mapPortfolioToAssetBasket(
  holdings: Holding[],
  securities: Security[],
  _totalValue: number,
  dataProviderFactory?: DataProviderFactory,
  preFetchedMetadata?: Map<string, any>,
  /**
   * Snapshot date used to select the newest allocation that was already
   * published. Numeric years remain accepted for legacy direct callers and
   * are interpreted as year-end by the registry.
   */
  asOfDate: string | number = new Date().toISOString().slice(0, 10)
): Promise<PortfolioMapping> {
  const portfolioValue = holdings.reduce(
    (sum, holding) => sum + (Number.isFinite(holding.institution_value) ? holding.institution_value! : 0),
    0,
  );
  const mapping: PortfolioMapping = {
    usEquityWeight: 0,
    internationalEquityWeight: 0,
    nominalBondsWeight: 0,
    cashWeight: 0,
    totalValue: portfolioValue,
    mappedValue: 0,
    unmappedValue: portfolioValue,
    valueCoverage: portfolioValue > 0 ? 0 : 1,
    proxiedValue: 0,
    proxiedValuePercentage: 0,
    holdingExposures: [],
    mappingConfidence: 'high',
    unmappedHoldings: [],
    partiallyMappedHoldings: [],
    mappingMethod: 'direct',
    targetDateFunds: [],
  };

  if (holdings.length === 0) {
    return mapping;
  }
  if (portfolioValue <= 0) {
    throw new Error('Retirement analysis requires a positive net value after negative holdings');
  }

  const securityMap = new Map(securities.map(sec => [sec.security_id, sec]));
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
    const holdingValue = Number.isFinite(holding.institution_value) ? holding.institution_value! : 0;
    
    if (holdingValue === 0) continue;

    const ticker = security?.ticker_symbol?.toUpperCase() || holding.ticker_symbol?.toUpperCase() || '';
    const fmpMetadata = (ticker ? tickerToMetadata.get(ticker) : null) as SecurityMetadata | null;
    const draft = resolveHoldingExposure(holding, security, fmpMetadata, asOfDate);
    const mappedFraction = Math.max(0, Math.min(1, weightTotal(draft.weights)));
    const label = security?.name || holding.security_name || ticker || holding.security_id;
    if (holdingValue < 0 && mappedFraction < 0.999999) {
      throw new Error(
        `Negative holding "${label}" has no complete supported asset-class mapping; ` +
        'retirement analysis stopped rather than discarding its liability or guessing its return',
      );
    }
    const holdingMappedValue = holdingValue * mappedFraction;
    const holdingUnmappedValue = holdingValue - holdingMappedValue;
    const resolution: ResolvedHoldingExposure = {
      holdingId: holding.id || holding.security_id,
      label,
      value: holdingValue,
      mappedValue: holdingMappedValue,
      unmappedValue: holdingUnmappedValue,
      weights: copyWeights(draft.weights),
      method: draft.method,
      confidence: draft.confidence,
      allocationAsOf: draft.targetAllocation?.allocationAsOf,
      allocationAgeDays: draft.targetAllocation?.allocationAgeDays,
      staleAllocation: draft.targetAllocation?.staleAllocation,
      sourceUrl: draft.targetAllocation?.sourceUrl,
      sourceContext: draft.targetAllocation?.sourceContext,
      exactAllocation: draft.targetAllocation?.exactAllocation,
      targetYear: draft.targetYear,
    };
    mapping.holdingExposures.push(resolution);

    mapping.usEquityWeight += holdingValue * draft.weights.usEquity;
    mapping.internationalEquityWeight += holdingValue * draft.weights.internationalEquity;
    mapping.nominalBondsWeight += holdingValue * draft.weights.nominalBonds;
    mapping.cashWeight += holdingValue * draft.weights.cash;
    mapping.mappedValue += holdingMappedValue;

    if (draft.method === 'name-inference' ||
        (draft.method === 'fund-registry' && draft.targetAllocation?.exactAllocation === false)) {
      mapping.proxiedValue += Math.abs(holdingMappedValue);
    }
    if (holdingUnmappedValue > 0.005) {
      if (holdingMappedValue > 0.005) mapping.partiallyMappedHoldings.push(label);
      else mapping.unmappedHoldings.push(label);
    }

    if (draft.targetAllocation && draft.targetYear !== undefined) {
      mapping.targetDateFunds.push({
        label,
        targetYear: draft.targetYear,
        equityShare: draft.weights.usEquity + draft.weights.internationalEquity,
        allocationAsOf: draft.targetAllocation.allocationAsOf,
        allocationAgeDays: draft.targetAllocation.allocationAgeDays,
        staleAllocation: draft.targetAllocation.staleAllocation,
        sourceUrl: draft.targetAllocation.sourceUrl,
        sourceContext: draft.targetAllocation.sourceContext,
        exactAllocation: draft.targetAllocation.exactAllocation,
      });
    }
  }

  // Convert dollar exposures to weights of the dollars actually modeled. The
  // simulation uses the same mappedValue, so excluded dollars are never
  // silently spread across these weights.
  if (mapping.mappedValue > 0) {
    mapping.usEquityWeight /= mapping.mappedValue;
    mapping.internationalEquityWeight /= mapping.mappedValue;
    mapping.nominalBondsWeight /= mapping.mappedValue;
    mapping.cashWeight /= mapping.mappedValue;
  }

  if (mapping.holdingExposures.some(exposure => exposure.value < 0) && mapping.mappedValue <= 0) {
    throw new Error('Negative holdings leave no positive modeled value for retirement analysis');
  }

  mapping.unmappedValue = Math.max(0, mapping.totalValue - mapping.mappedValue);
  mapping.valueCoverage = mapping.totalValue > 0 ? mapping.mappedValue / mapping.totalValue : 1;
  mapping.proxiedValuePercentage = mapping.totalValue > 0 ? mapping.proxiedValue / mapping.totalValue : 0;
  const hasInference = mapping.holdingExposures.some(exposure => exposure.method === 'name-inference');
  const hasRegistry = mapping.holdingExposures.some(exposure => exposure.method === 'fund-registry');
  const hasStaleRegistry = mapping.targetDateFunds.some(fund => fund.staleAllocation);
  if (mapping.valueCoverage < 0.95 || hasStaleRegistry) {
    mapping.mappingConfidence = 'low';
  } else if (mapping.valueCoverage < 1 || hasInference || hasRegistry) {
    mapping.mappingConfidence = 'medium';
  }
  mapping.mappingMethod = hasInference ? 'inferred' : hasRegistry ? 'proxy' : 'direct';

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
  _holdings: Holding[],
  totalValue: number
): number {
  if (totalValue === 0) return 0;
  return mapping.proxiedValue / totalValue;
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

  const negativeExposures = mapping.holdingExposures.filter(exposure => exposure.value < 0);
  if (negativeExposures.length > 0) {
    const grossNegativeValue = negativeExposures.reduce((sum, exposure) => sum + Math.abs(exposure.value), 0);
    assumptions.push(
      `$${Math.round(grossNegativeValue).toLocaleString('en-US')} across ` +
      `${negativeExposures.length} negative-valued position${negativeExposures.length === 1 ? '' : 's'} ` +
      'is modeled as signed exposure and reduces the net simulation basis',
    );
  }

  if (mapping.targetDateFunds.length > 0) {
    // Group identical sourced allocations without putting holding labels into
    // the analysis context for questions that did not ask for investment detail.
    const groups = new Map<string, {
      count: number;
      targetYear: number;
      equityShare: number;
      allocationAsOf: string;
      allocationAgeDays: number;
      staleAllocation: boolean;
      sourceContext: string;
      exactAllocation: boolean;
    }>();
    for (const fund of mapping.targetDateFunds) {
      const key = [
        fund.targetYear,
        fund.equityShare,
        fund.allocationAsOf,
        fund.sourceContext,
        fund.exactAllocation,
      ].join(':');
      const existing = groups.get(key);
      if (existing) existing.count += 1;
      else groups.set(key, {
        count: 1,
        targetYear: fund.targetYear,
        equityShare: fund.equityShare,
        allocationAsOf: fund.allocationAsOf,
        allocationAgeDays: fund.allocationAgeDays,
        staleAllocation: fund.staleAllocation,
        sourceContext: fund.sourceContext,
        exactAllocation: fund.exactAllocation,
      });
    }
    const described = Array.from(groups.values())
      .sort((left, right) => left.targetYear - right.targetYear)
      .map(({
        count,
        targetYear,
        equityShare,
        allocationAsOf,
        allocationAgeDays,
        staleAllocation,
        sourceContext,
        exactAllocation,
      }) =>
        `${count} targeting ${targetYear} at ${Math.round(equityShare * 100)}% equity ` +
        `(${exactAllocation ? 'same share class' : 'public share-class proxy'}, ` +
        `${sourceContext}, as of ${allocationAsOf}` +
        `${staleAllocation ? `; stale by ${Math.floor(allocationAgeDays / 30)} months` : ''})`)
      .join('; ');
    assumptions.push(
      `Target-date funds use versioned published holdings rather than an industry glidepath: ${described}`
    );
  }

  if (mapping.unmappedValue > 0.005) {
    assumptions.push(
      `$${Math.round(mapping.unmappedValue).toLocaleString('en-US')} across ` +
      `${mapping.unmappedHoldings.length + mapping.partiallyMappedHoldings.length} ` +
      `holding${mapping.unmappedHoldings.length + mapping.partiallyMappedHoldings.length === 1 ? '' : 's'} ` +
      'could not be represented by supported asset classes and was excluded from analysis'
    );
  }

  if (mapping.usEquityWeight !== 0 || mapping.internationalEquityWeight !== 0) {
    assumptions.push('US equity exposure uses the Kenneth French broad US market total-return history (Mkt-RF plus RF)');
  }

  if (mapping.internationalEquityWeight !== 0) {
    assumptions.push('International equity exposure uses the Kenneth French EAFE-plus-Canada market return in US dollars; emerging markets are not modeled separately');
  }

  if (mapping.nominalBondsWeight !== 0) {
    assumptions.push('Bond exposure uses the Shiller synthetic 10-year US government-bond total-return history');
  }

  if (mapping.cashWeight !== 0) {
    assumptions.push('Cash holdings use the Kenneth French one-month US Treasury-bill return (RF)');
  }

  return assumptions;
}
