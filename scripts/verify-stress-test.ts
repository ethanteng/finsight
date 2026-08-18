#!/usr/bin/env npx ts-node
/**
 * Quick verification that the stress test engine runs with the new historical data.
 * Uses mock holdings - no database or user required.
 */

import { generateRollingSequences } from '../src/retirement-analytics/engine/stress-tester';
import { simulateWithdrawals } from '../src/retirement-analytics/engine/withdrawal-simulator';
import { analyzeOutcomes } from '../src/retirement-analytics/engine/outcome-analyzer';
import { computeHistoricalWithdrawalRates } from '../src/retirement-analytics/engine/withdrawal-rate-solver';
import type { DataProviderFactory } from '../src/retirement-analytics/data/data-provider-factory';

async function main() {
  const withdrawalYears = 27;
  const totalValue = 1_000_000;
  const annualWithdrawal = 50_000;

  const mockDataProvider = {} as DataProviderFactory;

  console.log('Running stress test with historical data...');
  const { sequences, missingData } = await generateRollingSequences(
    withdrawalYears,
    mockDataProvider,
    50
  );

  console.log('Sequences:', sequences.length);
  console.log('Missing data:', missingData.length);

  const portfolioMapping = {
    usEquityWeight: 0.6,
    internationalEquityWeight: 0.2,
    nominalBondsWeight: 0.15,
    cashWeight: 0.05,
    mappingConfidence: 'high' as const,
    unmappedHoldings: [] as string[],
    mappingMethod: 'direct' as const,
  };

  const historicalRates = computeHistoricalWithdrawalRates(
    sequences,
    portfolioMapping,
    totalValue
  );
  console.log('Historical withdrawal rates:', historicalRates);

  const outcomes = sequences.map((seq) =>
    simulateWithdrawals(portfolioMapping, totalValue, seq, annualWithdrawal)
  );

  const stressTest = analyzeOutcomes(
    outcomes,
    sequences,
    sequences.length,
    historicalRates
  );

  console.log('Survival rate:', (stressTest.survivalRate * 100).toFixed(1) + '%');
  console.log('Depletion percentiles:', stressTest.depletionPercentiles);
  if (stressTest.worstSequences.byDepletion.length > 0) {
    console.log(
      'Worst by depletion:',
      stressTest.worstSequences.byDepletion.slice(0, 3)
    );
  }
  if (stressTest.worstSequences.byDrawdown.length > 0) {
    console.log(
      'Worst by drawdown:',
      stressTest.worstSequences.byDrawdown.slice(0, 3)
    );
  }

  console.log('Verification complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
