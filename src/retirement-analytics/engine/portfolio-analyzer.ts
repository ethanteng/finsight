// Portfolio Analyzer
// Phase 1: Portfolio Metrics & Mapping

import { Holding, Security } from '../../services/financial-data-service';
import { PortfolioCompositionMetrics, ResolvedHoldingExposure, SecurityMetadata } from '../types';
import { DataProviderFactory } from '../data/data-provider-factory';
import { mapPortfolioToAssetBasket, summarizeHoldingExposures } from './portfolio-mapper';

/**
 * Calculate portfolio composition metrics including allocations, concentration, and expense ratios
 * Uses FMP metadata when available for accurate expense ratios and asset classification
 */
export async function analyzePortfolio(
  holdings: Holding[],
  securities: Security[],
  dataProviderFactory?: DataProviderFactory,
  preFetchedMetadata?: Map<string, any>,
  resolvedHoldingExposures?: readonly ResolvedHoldingExposure[],
  asOfDate: string | number = new Date().toISOString().slice(0, 10),
): Promise<PortfolioCompositionMetrics> {
  if (holdings.length === 0) {
    return {
      equityAllocation: 0,
      fixedIncomeAllocation: 0,
      tipsAllocation: 0,
      tipsAllocationStatus: 'exact',
      cashAllocation: 0,
      internationalAllocation: 0,
      concentrationRisk: 0,
      expenseRatioWeighted: 0,
      expenseRatioCoverage: 0,
      countryAllocation: [],
      sectorAllocation: [],
      countryCoverage: 0,
      sectorCoverage: 0,
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
      tipsAllocation: 0,
      tipsAllocationStatus: 'exact',
      cashAllocation: 0,
      internationalAllocation: 0,
      concentrationRisk: 0,
      expenseRatioWeighted: 0,
      expenseRatioCoverage: 0,
      countryAllocation: [],
      sectorAllocation: [],
      countryCoverage: 0,
      sectorCoverage: 0,
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
      // Use batch fetch to avoid N+1 queries on security_metadata
      const batchResult = await dataProviderFactory.getSecurityMetadataBatch(Array.from(uniqueTickers));
      for (const [ticker, metadata] of batchResult) {
        tickerToMetadata.set(ticker, metadata);
      }
    }
  }

  // Allocation, simulation and confidence must all consume the same resolved
  // holdings. Standalone callers still get that contract by resolving here.
  const exposures = resolvedHoldingExposures ?? (await mapPortfolioToAssetBasket(
    holdings,
    securities,
    totalValue,
    dataProviderFactory,
    tickerToMetadata,
    asOfDate,
  )).holdingExposures;
  const resolvedMapping = summarizeHoldingExposures(exposures);

  let totalExpenseRatio = 0;
  let totalExpenseRatioWeight = 0;
  let countryCoverageValue = 0;
  let sectorCoverageValue = 0;
  const countryValues = new Map<string, number>();
  const sectorValues = new Map<string, number>();

  // Calculate allocations and expense ratios
  for (const holding of holdings) {
    const security = securityMap.get(holding.security_id);
    const holdingValue = holding.institution_value || 0;
    const weight = holdingValue / totalValue;

    const ticker = security?.ticker_symbol?.toUpperCase() || holding.ticker_symbol?.toUpperCase() || '';
    const fmpMetadata = (ticker ? tickerToMetadata.get(ticker) : null) as SecurityMetadata | null;

    // Prefer FMP metadata if available, fallback to security metadata
    const fundData = fmpMetadata?.fundData;
    if (fundData?.countryCoverage === 'available') {
      countryCoverageValue += holdingValue;
      addExposureValues(countryValues, fundData.countryAllocations, holdingValue);
    }
    if (fundData?.sectorCoverage === 'available') {
      sectorCoverageValue += holdingValue;
      addExposureValues(sectorValues, fundData.sectorAllocations, holdingValue);
    }

    // Expense ratio from FMP metadata (if available)
    const expenseRatio = fmpMetadata?.expenseRatio;
    if (expenseRatio !== undefined && expenseRatio >= 0) {
      totalExpenseRatio += expenseRatio * weight;
      totalExpenseRatioWeight += weight;
    } else if (fmpMetadata?.fundData?.instrumentType === 'equity') {
      // Direct securities have no fund-level expense ratio.
      totalExpenseRatioWeight += weight;
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
  // Express the known annual fee drag against the whole portfolio. Coverage is
  // separate so missing fund fees are not silently presented as certainty.
  const expenseRatioWeighted = totalExpenseRatio;

  // Guard against division by zero (defense-in-depth; totalValue === 0 already returns early above)
  return {
    equityAllocation: ((resolvedMapping.usEquityValue + resolvedMapping.internationalEquityValue) / totalValue) * 100,
    fixedIncomeAllocation: (
      (
        resolvedMapping.nominalBondsValue +
        resolvedMapping.tipsValue +
        resolvedMapping.unsupportedFixedIncomeValue
      ) / totalValue
    ) * 100,
    tipsAllocation: (resolvedMapping.tipsValue / totalValue) * 100,
    tipsAllocationStatus: resolvedMapping.tipsAllocationStatus ?? 'exact',
    cashAllocation: (resolvedMapping.cashValue / totalValue) * 100,
    internationalAllocation: (resolvedMapping.internationalEquityValue / totalValue) * 100,
    concentrationRisk,
    expenseRatioWeighted,
    expenseRatioCoverage: totalExpenseRatioWeight,
    countryAllocation: exposurePercentages(countryValues, totalValue),
    sectorAllocation: exposurePercentages(sectorValues, totalValue),
    countryCoverage: countryCoverageValue / totalValue,
    sectorCoverage: sectorCoverageValue / totalValue,
  };
}

function addExposureValues(
  target: Map<string, number>,
  exposures: Array<{ name: string; weight: number }>,
  holdingValue: number,
): void {
  for (const exposure of exposures) {
    if (!Number.isFinite(exposure.weight) || exposure.weight <= 0) continue;
    target.set(exposure.name, (target.get(exposure.name) ?? 0) + holdingValue * exposure.weight);
  }
}

function exposurePercentages(values: Map<string, number>, totalValue: number) {
  return [...values.entries()]
    .map(([name, value]) => ({ name, percentage: (value / totalValue) * 100 }))
    .filter(exposure => exposure.percentage >= 0.01)
    .sort((left, right) => right.percentage - left.percentage);
}
