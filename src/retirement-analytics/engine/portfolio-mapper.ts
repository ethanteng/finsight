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
  hasTipsNameSignal,
  inferEquityGeography,
  isContainerAssetType,
  isDeclaredFixedIncomeType,
  isKnownBondTicker,
  isKnownTipsTicker,
  selectDeclaredAssetType,
} from './asset-classification';
import {
  identifyTargetDateFundHolding,
  type TargetDateFundIdentity,
} from '../../services/target-date-fund';
import {
  lookupTargetDateAllocation,
  type TargetDateFundAllocation,
} from '../../services/target-date-fund-registry';

const EMPTY_WEIGHTS: HoldingExposureWeights = {
  usEquity: 0,
  internationalEquity: 0,
  nominalBonds: 0,
  tips: 0,
  cash: 0,
};

/** Product capitalization for series slugs shown in analysis assumptions. */
const TARGET_DATE_SERIES_DISPLAY_NAMES: Record<string, string> = {
  'lifepath-index': 'LifePath Index',
  lifepath: 'LifePath',
  'target-retirement': 'Target Retirement',
  'target-date': 'Target Date',
};

interface HoldingResolutionDraft {
  weights: HoldingExposureWeights;
  method: HoldingMappingMethod;
  confidence: 'high' | 'medium' | 'low';
  targetDateIdentity?: TargetDateFundIdentity;
  targetAllocation?: TargetDateFundAllocation;
}

function weightTotal(weights: HoldingExposureWeights): number {
  return weights.usEquity + weights.internationalEquity + weights.nominalBonds + weights.tips + weights.cash;
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
  const targetDateIdentity = identifyTargetDateFundHolding(labels, providerTypes);

  if (targetDateIdentity) {
    const allocation = lookupTargetDateAllocation(targetDateIdentity, asOfDate);
    if (!allocation) {
      return {
        weights: copyWeights(EMPTY_WEIGHTS),
        method: 'name-inference',
        confidence: 'low',
        targetDateIdentity,
      };
    }
    return {
      weights: copyWeights(allocation.weights),
      method: 'fund-registry',
      confidence: allocation.exactAllocation ? 'high' : 'medium',
      targetDateIdentity,
      targetAllocation: allocation,
    };
  }

  const selectedAssetType = selectDeclaredAssetType(providerTypes).toLowerCase();
  const specificAssetType = !isContainerAssetType(selectedAssetType) &&
    !['unknown', 'unclassified', 'other'].includes(selectedAssetType)
    ? selectedAssetType
    : '';

  if (specificAssetType.includes('cash') || specificAssetType.includes('money market')) {
    return { weights: { ...EMPTY_WEIGHTS, cash: 1 }, method: 'provider', confidence: 'high' };
  }
  if (
    isDeclaredFixedIncomeType(specificAssetType) &&
    (hasTipsNameSignal(specificAssetType) || hasTipsNameSignal(securityName) || isKnownTipsTicker(ticker))
  ) {
    return { weights: { ...EMPTY_WEIGHTS, tips: 1 }, method: 'provider', confidence: 'high' };
  }
  if (isDeclaredFixedIncomeType(specificAssetType)) {
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
        method: 'provider',
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
        method: 'name-inference',
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
  if (hasTipsNameSignal(securityName) || isKnownTipsTicker(ticker)) {
    return { weights: { ...EMPTY_WEIGHTS, tips: 1 }, method: 'name-inference', confidence: 'medium' };
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
    return { weights: copyWeights(EMPTY_WEIGHTS), method: 'name-inference', confidence: 'low' };
  }

  return { weights: copyWeights(EMPTY_WEIGHTS), method: 'name-inference', confidence: 'low' };
}

/**
 * Project every portfolio aggregate from the auditable per-holding results.
 * Callers must not independently rebuild weights, confidence, provenance, or
 * coverage: this is the one reduction used by simulations and reporting.
 */
export function summarizeHoldingExposures(
  exposures: readonly ResolvedHoldingExposure[],
): PortfolioMapping {
  const holdingExposures = exposures.map(exposure => ({
    ...exposure,
    weights: exposure.weights ? copyWeights(exposure.weights) : undefined,
    targetDateIdentity: exposure.targetDateIdentity
      ? { ...exposure.targetDateIdentity }
      : undefined,
  }));
  const totalValue = holdingExposures.reduce((sum, exposure) => sum + exposure.value, 0);
  let mappedValue = 0;
  let proxiedValue = 0;
  let usEquityValue = 0;
  let internationalEquityValue = 0;
  let nominalBondsValue = 0;
  let cashValue = 0;
  const unmappedHoldings: string[] = [];
  const partiallyMappedHoldings: string[] = [];

  for (const exposure of holdingExposures) {
    const weights = exposure.status === 'mapped' ? exposure.weights : undefined;
    const mappedFraction = weights
      ? Math.max(0, Math.min(1, weightTotal(weights)))
      : 0;
    const exposureMappedValue = exposure.value * mappedFraction;
    const exposureUnmappedValue = exposure.value - exposureMappedValue;

    mappedValue += exposureMappedValue;
    if (weights) {
      usEquityValue += exposure.value * weights.usEquity;
      internationalEquityValue += exposure.value * weights.internationalEquity;
      // Until a dedicated TIPS history is added, preserve the resolved TIPS
      // sleeve and deliberately feed it through the nominal government-bond
      // return series. Assumptions and confidence disclose this proxy.
      nominalBondsValue += exposure.value * (weights.nominalBonds + weights.tips);
      cashValue += exposure.value * weights.cash;
    }

    if (
      exposure.method === 'name-inference' ||
      (exposure.method === 'fund-registry' && exposure.exactAllocation === false)
    ) {
      proxiedValue += Math.abs(exposureMappedValue);
    } else if (weights && weights.tips > 0) {
      proxiedValue += Math.abs(exposure.value * weights.tips);
    }
    if (exposureUnmappedValue > 0.005) {
      if (exposureMappedValue > 0.005) partiallyMappedHoldings.push(exposure.label);
      else unmappedHoldings.push(exposure.label);
    }
  }

  if (holdingExposures.some(exposure => exposure.value < 0) && mappedValue <= 0) {
    throw new Error('Negative holdings leave no positive modeled value for retirement analysis');
  }

  const unmappedValue = Math.max(0, totalValue - mappedValue);
  const valueCoverage = totalValue > 0 ? mappedValue / totalValue : 1;
  const proxiedValuePercentage = totalValue > 0 ? proxiedValue / totalValue : 0;
  const materialExposures = holdingExposures.filter(exposure => Math.abs(exposure.value) > 0.005);
  // Only successfully mapped name-inference results describe how the modeled
  // portfolio was built. Unmapped holdings still use method `name-inference`
  // (the classifier path that failed), but they must not relabel a mostly
  // provider-mapped book as "inferred".
  const hasInference = materialExposures.some(
    exposure => exposure.status === 'mapped' && exposure.method === 'name-inference',
  );
  const hasRegistry = materialExposures.some(exposure => exposure.method === 'fund-registry');
  const hasStaleRegistry = materialExposures.some(exposure => exposure.staleAllocation === true);
  const hasTipsProxy = materialExposures.some(exposure => (exposure.weights?.tips ?? 0) > 0);
  const hasLowConfidence = materialExposures.some(exposure => exposure.confidence === 'low');
  const hasMediumConfidence = materialExposures.some(exposure => exposure.confidence === 'medium');
  const lowConfidenceValue = materialExposures
    .filter(exposure => exposure.confidence === 'low')
    .reduce((sum, exposure) => sum + Math.abs(exposure.value), 0);
  const lowConfidenceShare = totalValue > 0 ? lowConfidenceValue / totalValue : 0;
  let mappingConfidence: PortfolioMapping['mappingConfidence'] = 'high';
  if (valueCoverage < 0.95 || hasStaleRegistry || lowConfidenceShare >= 0.05) {
    mappingConfidence = 'low';
  } else if (
    valueCoverage < 1 || hasInference || hasRegistry || hasTipsProxy ||
    hasLowConfidence || hasMediumConfidence
  ) {
    mappingConfidence = 'medium';
  }

  const targetDateFunds = holdingExposures.flatMap(exposure => {
    if (
      exposure.status !== 'mapped' ||
      exposure.method !== 'fund-registry' ||
      !exposure.weights ||
      !exposure.targetDateIdentity?.series ||
      exposure.allocationAsOf === undefined ||
      exposure.allocationAgeDays === undefined ||
      exposure.staleAllocation === undefined ||
      exposure.sourceUrl === undefined ||
      exposure.sourceProvider === undefined ||
      exposure.sourceContext === undefined ||
      exposure.exactAllocation === undefined
    ) {
      return [];
    }
    return [{
      label: exposure.label,
      provider: exposure.sourceProvider,
      series: exposure.targetDateIdentity.series,
      vintage: exposure.targetDateIdentity.vintage,
      equityShare: exposure.weights.usEquity + exposure.weights.internationalEquity,
      allocationAsOf: exposure.allocationAsOf,
      allocationAgeDays: exposure.allocationAgeDays,
      staleAllocation: exposure.staleAllocation,
      sourceUrl: exposure.sourceUrl,
      sourceContext: exposure.sourceContext,
      exactAllocation: exposure.exactAllocation,
    }];
  });

  return {
    usEquityWeight: mappedValue > 0 ? usEquityValue / mappedValue : 0,
    internationalEquityWeight: mappedValue > 0 ? internationalEquityValue / mappedValue : 0,
    nominalBondsWeight: mappedValue > 0 ? nominalBondsValue / mappedValue : 0,
    cashWeight: mappedValue > 0 ? cashValue / mappedValue : 0,
    totalValue,
    mappedValue,
    unmappedValue,
    valueCoverage,
    proxiedValue,
    proxiedValuePercentage,
    holdingExposures,
    mappingConfidence,
    unmappedHoldings,
    partiallyMappedHoldings,
    mappingMethod: hasInference ? 'inferred' : hasRegistry ? 'proxy' : 'direct',
    targetDateFunds,
  };
}

/** Rehydrate current aggregates while accepting legacy mappings with no records. */
export function mappingFromResolvedExposures(mapping: PortfolioMapping): PortfolioMapping {
  return mapping.holdingExposures.length > 0
    ? summarizeHoldingExposures(mapping.holdingExposures)
    : mapping;
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
  if (holdings.length === 0) {
    return summarizeHoldingExposures([]);
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

  const holdingExposures: ResolvedHoldingExposure[] = [];
  for (const [holdingIndex, holding] of holdings.entries()) {
    const security = securityMap.get(holding.security_id);
    const holdingValue = Number.isFinite(holding.institution_value) ? holding.institution_value! : 0;

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
    const resolution: ResolvedHoldingExposure = {
      holdingId: holding.id || `${holding.security_id}:${holdingIndex}`,
      label,
      value: holdingValue,
      status: mappedFraction > 0 ? 'mapped' : 'unmapped',
      weights: mappedFraction > 0 ? copyWeights(draft.weights) : undefined,
      method: draft.method,
      confidence: draft.confidence,
      allocationAsOf: draft.targetAllocation?.allocationAsOf,
      allocationAgeDays: draft.targetAllocation?.allocationAgeDays,
      staleAllocation: draft.targetAllocation?.staleAllocation,
      sourceUrl: draft.targetAllocation?.sourceUrl,
      sourceProvider: draft.targetAllocation?.identity.provider,
      sourceContext: draft.targetAllocation?.sourceContext,
      exactAllocation: draft.targetAllocation?.exactAllocation,
      targetDateIdentity: draft.targetDateIdentity
        ? { ...draft.targetDateIdentity }
        : undefined,
    };
    holdingExposures.push(resolution);
  }

  return summarizeHoldingExposures(holdingExposures);
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
  return mappingFromResolvedExposures(mapping).mappingConfidence;
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
  return mappingFromResolvedExposures(mapping).proxiedValue / totalValue;
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
  const resolvedMapping = mappingFromResolvedExposures(mapping);

  const negativeExposures = resolvedMapping.holdingExposures.filter(exposure => exposure.value < 0);
  if (negativeExposures.length > 0) {
    const grossNegativeValue = negativeExposures.reduce((sum, exposure) => sum + Math.abs(exposure.value), 0);
    assumptions.push(
      `$${Math.round(grossNegativeValue).toLocaleString('en-US')} across ` +
      `${negativeExposures.length} negative-valued position${negativeExposures.length === 1 ? '' : 's'} ` +
      'is modeled as signed exposure and reduces the net simulation basis',
    );
  }

  if (resolvedMapping.targetDateFunds.length > 0) {
    // State provenance once per provider publication, then list the vintages
    // that use it without putting holding labels into unrelated LLM context.
    const sourceGroups = new Map<string, {
      provider: string;
      series: string;
      allocationAsOf: string;
      allocationAgeDays: number;
      staleAllocation: boolean;
      sourceContext: string;
      exactAllocation: boolean;
      vintages: Map<string, { count: number; vintage: number; equityShare: number }>;
    }>();
    for (const fund of resolvedMapping.targetDateFunds) {
      const sourceKey = [
        fund.provider,
        fund.series,
        fund.allocationAsOf,
        fund.sourceContext,
        fund.exactAllocation,
      ].join(':');
      let sourceGroup = sourceGroups.get(sourceKey);
      if (!sourceGroup) {
        sourceGroup = {
          provider: fund.provider,
          series: fund.series,
          allocationAsOf: fund.allocationAsOf,
          allocationAgeDays: fund.allocationAgeDays,
          staleAllocation: fund.staleAllocation,
          sourceContext: fund.sourceContext,
          exactAllocation: fund.exactAllocation,
          vintages: new Map(),
        };
        sourceGroups.set(sourceKey, sourceGroup);
      }
      const vintageKey = `${fund.vintage}:${fund.equityShare}`;
      const vintage = sourceGroup.vintages.get(vintageKey);
      if (vintage) vintage.count += 1;
      else sourceGroup.vintages.set(vintageKey, {
        count: 1,
        vintage: fund.vintage,
        equityShare: fund.equityShare,
      });
    }
    const described = Array.from(sourceGroups.values())
      .sort((left, right) =>
        left.allocationAsOf.localeCompare(right.allocationAsOf) ||
        left.provider.localeCompare(right.provider)
      )
      .map(({
        provider,
        series,
        allocationAsOf,
        allocationAgeDays,
        staleAllocation,
        sourceContext,
        exactAllocation,
        vintages,
      }) => {
        const providerName = provider === 'state-street'
          ? 'State Street'
          : provider === 'blackrock' ? 'BlackRock' : provider;
        const seriesName = TARGET_DATE_SERIES_DISPLAY_NAMES[series] ?? series
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        const vintageDescription = Array.from(vintages.values())
          .sort((left, right) => left.vintage - right.vintage)
          .map(({ count, vintage, equityShare }) =>
            `${count} targeting ${vintage} at ${Math.round(equityShare * 100)}% equity`
          )
          .join(', ');
        return (
          `${providerName} ${seriesName} ` +
          `(${exactAllocation ? 'same share class' : 'public share-class proxy'}; ` +
          `${sourceContext}; as of ${allocationAsOf}` +
          `${staleAllocation ? `; stale by ${Math.floor(allocationAgeDays / 30)} months` : ''}): ` +
          vintageDescription
        );
      })
      .join('; ');
    assumptions.push(
      `Target-date funds use versioned published holdings rather than an industry glidepath: ${described}`
    );
  }

  if (resolvedMapping.unmappedValue > 0.005) {
    const materiallyExcluded = resolvedMapping.holdingExposures.filter(exposure => {
      const mappedFraction = exposure.status === 'mapped' && exposure.weights
        ? Math.max(0, Math.min(1, weightTotal(exposure.weights)))
        : 0;
      return exposure.value * (1 - mappedFraction) > 0.005;
    });
    const fullyUnmodeledCount = resolvedMapping.holdingExposures.length > 0
      ? materiallyExcluded.filter(exposure => exposure.status === 'unmapped').length
      : resolvedMapping.unmappedHoldings.length;
    const partiallyModeledCount = resolvedMapping.holdingExposures.length > 0
      ? materiallyExcluded.length - fullyUnmodeledCount
      : resolvedMapping.partiallyMappedHoldings.length;
    const countDescription = [
      fullyUnmodeledCount > 0
        ? `${fullyUnmodeledCount} holding${fullyUnmodeledCount === 1 ? '' : 's'} ` +
          `${fullyUnmodeledCount === 1 ? 'was' : 'were'} fully unmodeled`
        : '',
      partiallyModeledCount > 0
        ? `${partiallyModeledCount} holding${partiallyModeledCount === 1 ? '' : 's'} ` +
          `${partiallyModeledCount === 1 ? 'was' : 'were'} partially modeled`
        : '',
    ].filter(Boolean).join(' and ');
    assumptions.push(
      `$${Math.round(resolvedMapping.unmappedValue).toLocaleString('en-US')} was excluded from analysis: ` +
      countDescription
    );
  }

  if (resolvedMapping.usEquityWeight !== 0 || resolvedMapping.internationalEquityWeight !== 0) {
    assumptions.push('US equity exposure uses the Kenneth French broad US market total-return history (Mkt-RF plus RF)');
  }

  if (resolvedMapping.internationalEquityWeight !== 0) {
    assumptions.push('International equity exposure uses the Kenneth French EAFE-plus-Canada market return in US dollars; emerging markets are not modeled separately');
  }

  const tipsValue = resolvedMapping.holdingExposures.reduce(
    (sum, exposure) => sum + Math.abs(exposure.value * (exposure.weights?.tips ?? 0)),
    0,
  );
  const nonTipsBondValue = resolvedMapping.holdingExposures.reduce(
    (sum, exposure) => sum + Math.abs(exposure.value * (exposure.weights?.nominalBonds ?? 0)),
    0,
  );
  // Keep the generic bond series note for true nominal-bond sleeves only. Pure
  // TIPS portfolios are covered by the dedicated proxy disclosure below.
  if (nonTipsBondValue > 0.005) {
    assumptions.push('Bond exposure uses the Shiller synthetic 10-year US government-bond total-return history');
  }

  if (tipsValue > 0.005) {
    assumptions.push(
      `$${Math.round(tipsValue).toLocaleString('en-US')} of TIPS exposure uses the nominal ` +
      '10-year US government-bond history because the engine has no dedicated TIPS return series; ' +
      'this understates the portfolio\'s inflation protection, especially for CPI-linked withdrawals'
    );
  }

  if (resolvedMapping.cashWeight !== 0) {
    assumptions.push('Cash holdings use the Kenneth French one-month US Treasury-bill return (RF)');
  }

  return assumptions;
}
