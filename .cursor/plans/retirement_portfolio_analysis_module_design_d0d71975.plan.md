---
name: Retirement Portfolio Analysis Module Design
overview: Design a production-grade standalone analytics module for retirement portfolio analysis that evaluates portfolio risk relative to retirement timeline, withdrawal needs, and inflation using historical data and sequence-of-returns risk testing.
todos:
  - id: data-providers
    content: Implement Tiingo and FMP data providers with caching and fallback logic
    status: pending
  - id: data-model
    content: Create Prisma schema extensions for RetirementAnalysis, AssetPriceHistory, and SecurityMetadata tables
    status: pending
  - id: portfolio-analyzer
    content: Build core portfolio analyzer with allocation metrics and expense ratio calculations
    status: pending
  - id: portfolio-mapper
    content: Implement portfolio-to-asset-basket mapping (replaces single-index proxies)
    status: pending
  - id: outcome-analyzer
    content: Build historical outcome analyzer that computes percentiles and distributions
    status: pending
  - id: stress-tester
    content: Build rolling window stress testing engine with fixed horizon bucket support (10/20/30 years) and input snapping
    status: pending
  - id: withdrawal-simulator
    content: Implement withdrawal sustainability calculator using historical return sequences
    status: pending
  - id: characteristics-assessor
    content: Build characteristics assessor that determines portfolio traits from historical patterns with explicit tradeoff framing (upside + downside)
    status: pending
  - id: analysis-formatter
    content: Build formatter that structures analysis results for LLM consumption
    status: pending
  - id: uncertainty-quantifier
    content: Implement data quality scoring with proxiedValuePercentage calculation and confidence ceiling enforcement
    status: pending
  - id: llm-integration
    content: Integrate retirement analysis output into existing prompt-builder system
    status: pending
---

# Retirement Portfolio Analysis Module Design

## 1. Modular Architecture

### 1.1 Layer Separation

The module follows strict separation of concerns across three layers:

**Data Ingestion Layer** (`src/retirement-analytics/data/`)

- `data-provider-factory.ts` - Provider selection and abstraction
- `providers/polygon-provider.ts` - Price history, liquidity data
- `providers/tiingo-provider.ts` - Long-horizon adjusted prices (splits, dividends)
- `providers/fmp-provider.ts` - ETF metadata, expense ratios, fund classifications
- `providers/fred-provider.ts` - Inflation series (CPIAUCSL), treasury rates
- `data-normalizer.ts` - Normalizes provider responses to common schema
- `time-series-cache.ts` - Caches historical price data with TTL

**Analytics Engine Layer** (`src/retirement-analytics/engine/`)

- `portfolio-analyzer.ts` - Core portfolio metrics computation
- `portfolio-mapper.ts` - Maps holdings to asset basket (replaces single-index proxies)
- `outcome-analyzer.ts` - Historical outcome analysis (replaces risk-calculator)
- `stress-tester.ts` - Rolling window historical sequence testing
- `withdrawal-simulator.ts` - Sequence-of-returns simulation using asset basket
- `characteristics-assessor.ts` - Portfolio characteristics assessment based on historical patterns

**Interpretation Layer** (`src/retirement-analytics/interpretation/`)

- `analysis-formatter.ts` - Structures results for LLM consumption; enforces confidence ceiling rules and tradeoff requirements
- `explanation-builder.ts` - Generates explainable insights with explicit tradeoff framing
- `uncertainty-quantifier.ts` - Communicates data quality and confidence; calculates proxiedValuePercentage and enforces confidence ceilings

### 1.2 Module Boundaries

- **Standalone**: No direct database writes; reads from `FinancialSummarySnapshot`
- **Stateless**: Each analysis is independent; results cached but not persisted
- **Provider-agnostic**: Analytics layer never calls providers directly
- **LLM-agnostic**: Interpretation layer outputs structured JSON, not prompts

## 2. Minimum Viable Analytics Engine

### 2.1 Required User Inputs

```typescript
interface RetirementAnalysisInput {
  // Portfolio data (from FinancialSummarySnapshot)
  holdings: Holding[];
  securities: Security[];
  
  // User profile (required)
  currentAge: number;
  retirementAge: number; // or null if already retired
  lifeExpectancy: number; // default: 95 if not provided
  
  // Withdrawal assumptions (required)
  annualWithdrawalAmount: number; // in today's dollars
  withdrawalStartAge: number; // when withdrawals begin
  
  // Optional overrides
  inflationAssumption?: number; // override FRED data
  riskTolerance?: 'conservative' | 'moderate' | 'aggressive'; // user preference
}
```

**Validation Rules**:

- `retirementAge` must be > `currentAge` if not retired
- `annualWithdrawalAmount` must be > 0
- `lifeExpectancy` defaults to 95 if not provided
- Portfolio must have at least one holding with value > 0
- `withdrawalYears` (calculated as `lifeExpectancy - withdrawalStartAge`) will be snapped to nearest supported bucket (10, 20, or 30 years) for v1
- User will be informed when their horizon is rounded to nearest bucket

### 2.2 Required Asset Metadata

For each security in portfolio:

**From FMP (Financial Modeling Prep)**:

- `expenseRatio`: number (for ETFs/mutual funds)
- `fundCategory`: string (e.g., "Large Cap Blend", "Bond")
- `assetClass`: string (e.g., "Equity", "Fixed Income", "Cash")
- `geographicFocus`: string (e.g., "US", "International", "Global")

**From Polygon/Tiingo**:

- `tickerSymbol`: string (for price lookups)
- `securityType`: string (from existing Plaid/SnapTrade data)

**Derived**:

- `isETF`: boolean (determined from security type or fundCategory)
- `isBond`: boolean (from assetClass)
- `isInternational`: boolean (from geographicFocus)

### 2.3 Core Metrics to Compute

**Portfolio Composition Metrics**:

- `equityAllocation`: percentage (stocks + stock ETFs)
- `fixedIncomeAllocation`: percentage (bonds + bond ETFs)
- `cashAllocation`: percentage
- `internationalAllocation`: percentage (non-US holdings)
- `concentrationRisk`: Herfindahl-Hirschman Index (HHI) across top 10 holdings
- `expenseRatioWeighted`: weighted average expense ratio

**Timeline Metrics**:

- `yearsToRetirement`: number (or negative if retired)
- `withdrawalYears`: number (snapped to nearest supported bucket: 10, 20, or 30 years)
- `withdrawalYearsOriginal`: number (original user input before snapping)
- `withdrawalMonths`: number (withdrawalYears * 12, for simulation granularity)
- `timelineBucket`: '10' | '20' | '30' (supported horizon bucket used for analysis)

**Internal Heuristics** (not exposed to users):

- `_internalEquityRiskHeuristic`: number (internal only, used for sorting/comparison)
  - Used only for internal ranking of scenarios, never displayed
- `_internalSequenceRiskHeuristic`: number (internal only)
  - Used only for identifying worst-case sequences, never displayed

**Historical Performance Metrics**:

- `10YearReturn`: annualized return (from Tiingo)
- `10YearVolatility`: standard deviation of monthly returns
- `worstDrawdown`: maximum peak-to-trough decline (10-year window)
- `inflationAdjustedReturn`: real return (nominal - inflation)

**Withdrawal Sustainability Metrics**:

- `withdrawalRate`: annualWithdrawalAmount / portfolioValue (descriptive, not prescriptive)
- `yearsOfExpenses`: portfolioValue / annualWithdrawalAmount
- `historicalWithdrawalRates`: object with percentiles (10th, 25th, 50th, 75th, 90th) of sustainable withdrawal rates from historical analysis
- `withdrawalFailureRate`: percentage of historical sequences where portfolio depleted before withdrawal period ended
- `worstCaseDepletionYear`: year (relative to withdrawal start) when portfolio would deplete in worst historical sequence

### 2.4 "Too Conservative" vs "Too Risky" Determination

**Evidence-Based Assessment Framework**:

Assessment is derived from historical outcomes, not fixed thresholds. The system compares the user's portfolio allocation against historical sequences to identify patterns.

```typescript
function assessPortfolioCharacteristics(
  portfolio: Portfolio,
  stressTestResults: StressTestResult,
  historicalMetrics: HistoricalMetrics
): PortfolioAssessment {
  // Analyze historical outcomes for this allocation pattern
  const outcomes = analyzeHistoricalOutcomes(portfolio, stressTestResults);
  
  // Determine characteristics based on observed behavior
  const characteristics: PortfolioCharacteristics = {
    growthPotential: assessGrowthPotential(outcomes, historicalMetrics),
    drawdownResistance: assessDrawdownResistance(outcomes),
    withdrawalFragility: assessWithdrawalFragility(outcomes, stressTestResults),
    inflationProtection: assessInflationProtection(outcomes, historicalMetrics)
  };
  
  // Generate descriptive assessment (not prescriptive)
  return generateAssessment(characteristics, portfolio, stressTestResults);
}
```

**Assessment Criteria** (based on historical evidence):

**Comparison Cohort Definition**:

All tercile-based assessments are evaluated relative to portfolios with:
- The same horizon bucket (10 / 20 / 30 years)
- Similar equity allocation (±10 percentage points)
- The same withdrawal methodology (fixed real-dollar withdrawals)

No assessment is made relative to an absolute benchmark or "ideal" portfolio.

**Equity Allocation as Primary Cohort Axis**:

Equity allocation is used as the primary cohorting dimension due to its dominant historical influence on outcome variability. All comparative assessments (terciles, percentiles, failure rates) are calculated relative to portfolios with similar equity allocations within the same horizon bucket.

**Growth-Constrained Assessment**:
- Portfolio fails to outpace inflation in upper tercile or more of historical sequences relative to portfolios with similar equity allocations and horizon
- Real (inflation-adjusted) returns in lower tercile relative to portfolios with similar equity allocations and horizon
- Withdrawal sustainability achieved but portfolio value declines in real terms in majority of sequences
- Time-to-recovery after drawdowns in upper tercile relative to portfolios with similar equity allocations and horizon

**Sequence-Sensitive Assessment**:
- Failure rate in upper tercile relative to portfolios with similar equity allocations and horizon
- Worst-case depletion occurs before withdrawal period ends
- Maximum drawdown in upper tercile relative to portfolios with similar equity allocations and horizon
- Recovery time in upper tercile relative to portfolios with similar equity allocations and horizon

**Balanced Assessment**:
- Withdrawal sustainability achieved in majority of historical sequences
- Real returns positive in majority of periods
- Drawdowns moderate relative to horizon
- Tradeoff: does not maximize long-term growth or minimize short-term drawdowns

**Tradeoff Requirements**:

Every portfolio characterization must explicitly state:
- One upside: what the allocation pattern historically provided (e.g., "strong growth potential", "high drawdown resistance")
- One downside: what the allocation pattern historically lacked or risked (e.g., "sequence-sensitive", "limited inflation protection")

No characteristic label may stand alone without both upside and downside tradeoffs stated.

**Language Guidelines**:

- Use descriptive phrases: "historically fragile given withdrawal timing" instead of "too risky"
- Use comparative language: "growth-constrained but drawdown-resistant" instead of "too conservative"
- Avoid categorical judgments: "return-efficient but sequence-sensitive" instead of "too risky"
- Frame in terms of historical patterns, not normative rules

## 3. Data Provider Specifications

### 3.1 Provider-to-Use Mapping

**Polygon.io** (`src/data/providers/polygon.ts` - extend existing):

- **Use**: Recent price history (last 2 years), liquidity metrics, current prices
- **Why**: Already integrated, premium tier access, reliable recent data
- **Endpoints**: `getStocksAggregates()` for daily bars
- **Caching**: 1 hour TTL for recent data

**Tiingo** (`src/retirement-analytics/data/providers/tiingo-provider.ts` - new):

- **Use**: Long-horizon historical prices (10+ years), dividend-adjusted returns
- **Why**: Better for historical analysis, handles splits/dividends automatically
- **Endpoints**: `/tiingo/daily/{ticker}/prices` with `startDate` parameter
- **Caching**: 24 hour TTL (historical data changes infrequently)
- **Fallback**: If Tiingo unavailable, use Polygon with manual adjustment calculations

**Financial Modeling Prep** (`src/retirement-analytics/data/providers/fmp-provider.ts` - new):

- **Use**: ETF/fund metadata (expense ratios, asset class, category)
- **Why**: Comprehensive fund classification, expense ratio data
- **Endpoints**: `/api/v3/etf-list`, `/api/v3/profile/{symbol}`
- **Caching**: 7 day TTL (metadata changes rarely)
- **Fallback**: If FMP unavailable, infer from security name/type (lower confidence)

**FRED** (`src/data/providers/fred.ts` - extend existing):

- **Use**: Inflation data (CPIAUCSL), treasury rates (DGS10, DGS30)
- **Why**: Already integrated, authoritative source for macro data
- **Endpoints**: Existing `getDataPoint()` method
- **Caching**: 24 hour TTL

**Alpha Vantage** (`src/data/providers/alpha-vantage.ts` - existing):

- **Use**: Backup price data if Polygon fails
- **Why**: Already integrated, fallback only
- **Endpoints**: Existing `getDataPoint()` method

**Brave Search** (`src/data/providers/search.ts` - existing):

- **Use**: External validation of fund classifications (for LLM grounding)
- **Why**: Already integrated, helps verify metadata accuracy
- **Not used in analytics**: Only for LLM explanation layer

### 3.2 Provider Selection Logic

```typescript
class DataProviderFactory {
  async getPriceHistory(ticker: string, startDate: Date, endDate: Date): Promise<PriceHistory> {
    // Try Tiingo first (best for long history)
    if (endDate < new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)) {
      return await this.tiingoProvider.getPriceHistory(ticker, startDate, endDate);
    }
    
    // For recent data, use Polygon (already cached)
    return await this.polygonProvider.getPriceHistory(ticker, startDate, endDate);
  }
  
  async getSecurityMetadata(ticker: string): Promise<SecurityMetadata> {
    // Try FMP first (best metadata)
    try {
      return await this.fmpProvider.getSecurityMetadata(ticker);
    } catch (error) {
      // Fallback: infer from existing security data
      return this.inferMetadata(ticker);
    }
  }
}
```

## 4. Timeline-Aware Stress Testing

### 4.1 Rolling Historical Window Approach

**No Monte Carlo in v1** - Use rolling historical windows to avoid scenario selection bias:

```typescript
interface HistoricalSequence {
  startDate: Date;
  endDate: Date;
  sequenceId: string; // e.g., "1970-01_to_1985-01"
  assetBasketReturns: {
    usEquity: number[]; // monthly returns
    internationalEquity: number[]; // monthly returns
    nominalBonds: number[]; // monthly returns
    cash: number[]; // monthly returns (near-zero)
  };
  inflationRates: number[]; // monthly inflation
  portfolioOutcome: PortfolioOutcome; // computed after simulation
}

interface PortfolioOutcome {
  withdrawalSustainability: boolean;
  yearsUntilDepletion: number | null;
  finalValue: number; // inflation-adjusted
  maximumDrawdown: number; // peak-to-trough decline
  timeToRecovery: number | null; // months until recovery from worst drawdown
  realReturn: number; // inflation-adjusted annualized return
}
```

**Rolling Window Methodology**:

Instead of testing named crises, use rolling windows of fixed duration:

```typescript
async function generateRollingSequences(
  withdrawalYears: number,
  minHistoryYears: number = 50
): Promise<HistoricalSequence[]> {
  // Snap to supported horizon buckets (v1 limitation)
  const SUPPORTED_BUCKETS = [10, 20, 30];
  const snappedYears = SUPPORTED_BUCKETS.reduce((prev, curr) => 
    Math.abs(curr - withdrawalYears) < Math.abs(prev - withdrawalYears) ? curr : prev
  );
  
  const sequences: HistoricalSequence[] = [];
  const windowMonths = snappedYears * 12;
  const startYear = new Date().getFullYear() - minHistoryYears;
  const endYear = new Date().getFullYear();
  
  // Generate rolling windows: each month as a potential start date
  for (let year = startYear; year <= endYear - snappedYears; year++) {
    for (let month = 0; month < 12; month++) {
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year + snappedYears, month, 1);
      
      // Skip if end date exceeds available data
      if (endDate > new Date()) continue;
      
      sequences.push({
        startDate,
        endDate,
        sequenceId: `${year}-${month + 1}_to_${year + snappedYears}-${month + 1}`,
        assetBasketReturns: await fetchAssetBasketReturns(startDate, endDate),
        inflationRates: await fetchInflationRates(startDate, endDate)
      });
    }
  }
  
  return sequences;
}
```

**Sequence Selection for Analysis**:

Select sequences based on outcome characteristics, not named events:

```typescript
async function runStressTest(
  portfolio: Portfolio,
  withdrawalAmount: number,
  withdrawalYears: number
): Promise<StressTestResult> {
  // Generate all rolling sequences
  const allSequences = await generateRollingSequences(withdrawalYears);
  
  // Map portfolio to asset basket
  const portfolioMapping = mapPortfolioToAssetBasket(portfolio);
  
  // Simulate each sequence
  const outcomes = allSequences.map(sequence => 
    simulateWithdrawals(portfolioMapping, portfolio.totalValue, sequence, withdrawalAmount)
  );
  
  // Identify worst sequences by different criteria
  const worstByDepletion = findWorstSequences(outcomes, 'yearsUntilDepletion');
  const worstByDrawdown = findWorstSequences(outcomes, 'maximumDrawdown');
  const worstByRecovery = findWorstSequences(outcomes, 'timeToRecovery');
  
  // Calculate percentiles
  const survivalRate = outcomes.filter(o => o.withdrawalSustainability).length / outcomes.length;
  const depletionPercentiles = calculatePercentiles(outcomes.map(o => o.yearsUntilDepletion));
  
  return {
    totalSequences: outcomes.length,
    survivalRate,
    depletionPercentiles: {
      p10: depletionPercentiles[10],
      p25: depletionPercentiles[25],
      p50: depletionPercentiles[50],
      p75: depletionPercentiles[75],
      p90: depletionPercentiles[90]
    },
    worstSequences: {
      byDepletion: worstByDepletion.slice(0, 5),
      byDrawdown: worstByDrawdown.slice(0, 5),
      byRecovery: worstByRecovery.slice(0, 5)
    },
    historicalWithdrawalRates: calculateSustainableWithdrawalRates(outcomes, portfolio.totalValue)
  };
}
```

**Named Crises Usage**:

Named historical periods (2008, 2000, etc.) may be referenced in the explanation layer only:
- Used to provide context when explaining worst-case sequences
- Not used as the primary test set
- Only mentioned if they appear in the worst sequences by outcome metrics

### 4.2 Portfolio-to-Asset-Basket Mapping

**Avoid Single-Index Proxies**:

Do not equate user's portfolio to SPY/AGG. Instead, map holdings to a small asset basket:

```typescript
interface AssetBasket {
  usEquity: string; // e.g., "VTI" or "SPY" as proxy
  internationalEquity: string; // e.g., "VXUS" or "EFA" as proxy
  nominalBonds: string; // e.g., "AGG" or "BND" as proxy
  cash: string; // "CASHX" or use treasury bill rate
}

interface PortfolioMapping {
  usEquityWeight: number; // 0-1
  internationalEquityWeight: number; // 0-1
  nominalBondsWeight: number; // 0-1
  cashWeight: number; // 0-1
  mappingConfidence: 'high' | 'medium' | 'low'; // based on how well holdings map
  unmappedHoldings: string[]; // tickers that couldn't be mapped
  mappingMethod: 'direct' | 'inferred' | 'proxy'; // how mapping was determined
}

function mapPortfolioToAssetBasket(
  portfolio: Portfolio,
  holdings: Holding[],
  securities: Security[]
): PortfolioMapping {
  const mapping: PortfolioMapping = {
    usEquityWeight: 0,
    internationalEquityWeight: 0,
    nominalBondsWeight: 0,
    cashWeight: 0,
    mappingConfidence: 'high',
    unmappedHoldings: [],
    mappingMethod: 'direct'
  };
  
  let mappedValue = 0;
  const totalValue = portfolio.totalValue;
  
  for (const holding of holdings) {
    const security = securities.find(s => s.security_id === holding.security_id);
    const holdingValue = holding.institution_value || 0;
    const weight = holdingValue / totalValue;
    
    // Map based on security metadata
    if (security) {
      const assetClass = getAssetClass(security);
      const geographicFocus = getGeographicFocus(security);
      
      if (assetClass === 'Equity') {
        if (geographicFocus === 'US' || geographicFocus === 'Global') {
          mapping.usEquityWeight += weight;
          mappedValue += holdingValue;
        } else if (geographicFocus === 'International') {
          mapping.internationalEquityWeight += weight;
          mappedValue += holdingValue;
        } else {
          // Infer from ticker or default to US
          mapping.usEquityWeight += weight * 0.7; // assume 70% US
          mapping.internationalEquityWeight += weight * 0.3;
          mapping.mappingConfidence = 'medium';
          mapping.mappingMethod = 'inferred';
          // Note: This assumption will be recorded in DataQualityReport.assumptions
        }
      } else if (assetClass === 'Fixed Income') {
        mapping.nominalBondsWeight += weight;
        mappedValue += holdingValue;
      } else if (assetClass === 'Cash') {
        mapping.cashWeight += weight;
        mappedValue += holdingValue;
      } else {
        mapping.unmappedHoldings.push(security.name || holding.security_id);
        mapping.mappingConfidence = 'low';
      }
    } else {
      mapping.unmappedHoldings.push(holding.security_id);
      mapping.mappingConfidence = 'low';
    }
  }
  
  // Normalize weights to sum to 1
  const totalMappedWeight = mapping.usEquityWeight + mapping.internationalEquityWeight + 
                            mapping.nominalBondsWeight + mapping.cashWeight;
  if (totalMappedWeight > 0) {
    mapping.usEquityWeight /= totalMappedWeight;
    mapping.internationalEquityWeight /= totalMappedWeight;
    mapping.nominalBondsWeight /= totalMappedWeight;
    mapping.cashWeight /= totalMappedWeight;
  }
  
  return mapping;
}
```

**Sequence-of-Returns Simulation**:

```typescript
function simulateWithdrawals(
  portfolioMapping: PortfolioMapping,
  initialPortfolioValue: number,
  sequence: HistoricalSequence,
  annualWithdrawal: number
): PortfolioOutcome {
  let portfolioValue = initialPortfolioValue;
  const monthlyWithdrawal = annualWithdrawal / 12;
  const months = sequence.assetBasketReturns.usEquity.length;
  
  const portfolioValues: number[] = [portfolioValue];
  let peakValue = portfolioValue;
  let maxDrawdown = 0;
  let drawdownStartMonth: number | null = null;
  let recoveryMonth: number | null = null;
  
  for (let month = 0; month < months; month++) {
    // Calculate portfolio return from asset basket
    const usEquityReturn = sequence.assetBasketReturns.usEquity[month];
    const intlEquityReturn = sequence.assetBasketReturns.internationalEquity[month];
    const bondReturn = sequence.assetBasketReturns.nominalBonds[month];
    const cashReturn = sequence.assetBasketReturns.cash[month];
    
    const portfolioReturn = 
      (portfolioMapping.usEquityWeight * usEquityReturn) +
      (portfolioMapping.internationalEquityWeight * intlEquityReturn) +
      (portfolioMapping.nominalBondsWeight * bondReturn) +
      (portfolioMapping.cashWeight * cashReturn);
    
    // Apply return and withdrawal
    portfolioValue = portfolioValue * (1 + portfolioReturn) - monthlyWithdrawal;
    portfolioValues.push(portfolioValue);
    
    // Track drawdowns
    if (portfolioValue > peakValue) {
      peakValue = portfolioValue;
      if (drawdownStartMonth !== null && recoveryMonth === null) {
        recoveryMonth = month;
      }
    } else {
      const drawdown = (peakValue - portfolioValue) / peakValue;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        if (drawdownStartMonth === null) {
          drawdownStartMonth = month;
        }
      }
    }
    
    // Check for depletion
    if (portfolioValue <= 0) {
      return {
        withdrawalSustainability: false,
        yearsUntilDepletion: month / 12,
        finalValue: 0,
        maximumDrawdown: maxDrawdown,
        timeToRecovery: recoveryMonth ? recoveryMonth - (drawdownStartMonth || 0) : null,
        realReturn: calculateRealReturn(portfolioValues, sequence.inflationRates)
      };
    }
  }
  
  return {
    withdrawalSustainability: true,
    yearsUntilDepletion: null,
    finalValue: portfolioValue,
    maximumDrawdown: maxDrawdown,
    timeToRecovery: recoveryMonth ? recoveryMonth - (drawdownStartMonth || 0) : null,
    realReturn: calculateRealReturn(portfolioValues, sequence.inflationRates)
  };
}
```

**Data Quality Reporting**:

Proxy usage must be explicit:

```typescript
interface DataQualityReport {
  completeness: number; // 0-1
  priceHistoryCoverage: number; // 0-1
  metadataConfidence: 'high' | 'medium' | 'low';
  portfolioMappingConfidence: 'high' | 'medium' | 'low';
  proxyUsage: {
    usEquityProxy: string; // e.g., "VTI"
    internationalEquityProxy: string; // e.g., "VXUS"
    bondsProxy: string; // e.g., "AGG"
    unmappedHoldings: string[];
    mappingMethod: string;
  };
  missingData: string[];
}
```

**Interpretation**:

- Assessment based on distribution of outcomes across all rolling sequences
- No single "worst case" - report percentiles (p10, p25, p50, p75, p90)
- Failure rate and survival rate derived from full distribution
- Characteristics determined by pattern analysis, not single thresholds

## 5. Data Model

### 5.1 Database Schema Extensions

**New Tables** (add to `prisma/schema.prisma`):

```prisma
model RetirementAnalysis {
  id                    String   @id @default(cuid())
  userId                String
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Input snapshot (denormalized for reproducibility)
  analysisInput         Json     // Full RetirementAnalysisInput
  portfolioSnapshot     Json     // Holdings + securities at analysis time
  
  // Computed metrics
  portfolioMetrics      Json     // Core metrics (equityAllocation, etc.)
  characteristics       Json     // Portfolio characteristics and tradeoffs (not risk levels)
  stressTestResults     Json     // Historical scenario results
  historicalImplications Json     // Pattern-based observations, not prescriptive recommendations
  
  // Metadata
  computedAt            DateTime @default(now())
  dataQualityScore      Float    // 0-1 confidence in data completeness
  expiresAt             DateTime // When analysis becomes stale
  
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  
  @@index([userId, computedAt])
  @@map("retirement_analyses")
}

model AssetPriceHistory {
  id            String   @id @default(cuid())
  tickerSymbol   String
  date           DateTime
  open           Float
  high           Float
  low            Float
  close          Float
  adjustedClose  Float?   // Dividend/split adjusted (from Tiingo)
  volume         BigInt
  provider       String   // 'polygon', 'tiingo', 'alpha_vantage'
  cachedAt       DateTime @default(now())
  
  @@unique([tickerSymbol, date, provider])
  @@index([tickerSymbol, date])
  @@map("asset_price_history")
}

model SecurityMetadata {
  id                String   @id @default(cuid())
  tickerSymbol      String   @unique
  securityName      String
  assetClass        String?  // 'Equity', 'Fixed Income', 'Cash'
  fundCategory      String?  // 'Large Cap Blend', etc.
  expenseRatio      Float?
  geographicFocus   String?  // 'US', 'International', 'Global'
  isETF             Boolean  @default(false)
  provider          String   // 'fmp', 'inferred'
  lastUpdated       DateTime @default(now())
  
  @@map("security_metadata")
}
```

**User Model Extension**:

```prisma
model User {
  // ... existing fields ...
  retirementAnalyses RetirementAnalysis[]
}
```

### 5.2 In-Memory Data Structures

```typescript
interface PortfolioSnapshot {
  holdings: Holding[];
  securities: Security[];
  totalValue: number;
  computedAt: Date;
}

interface PriceTimeSeries {
  ticker: string;
  dates: Date[];
  prices: number[];
  returns: number[]; // monthly returns
  provider: 'polygon' | 'tiingo' | 'alpha_vantage';
}

interface StressTestResult {
  scenarios: StressTestScenario[];
  worstCase: StressTestScenario | null;
  survivalRate: number; // 0-1
  averageYearsUntilDepletion: number | null;
}
```

## 6. LLM Boundaries

### 6.1 What LLM Can Reason About

**Allowed**:

- Interpreting portfolio characteristics in plain language using descriptive terms
- Explaining historical patterns observed in the analysis (e.g., "historically fragile given withdrawal timing")
- Describing historical patterns that may inform allocation decisions (e.g., "portfolios with higher international diversification historically showed different drawdown patterns")
- Explaining sequence-of-returns risk concepts using historical examples
- Describing tradeoffs between growth potential and drawdown resistance
- Referencing named historical periods only when they appear in worst-case sequences

**Strictly Forbidden**:

- Fabricating specific fund recommendations
- Making predictions about future returns
- Suggesting specific tickers to buy/sell
- Providing tax advice
- Recommending specific withdrawal strategies beyond general principles

### 6.2 Uncertainty Communication

**Data Quality Indicators** (must be included in LLM context):

```typescript
interface DataQualityReport {
  completeness: number; // 0-1 (percentage of holdings with full metadata)
  priceHistoryCoverage: number; // 0-1 (percentage with 10+ years of data)
  metadataConfidence: 'high' | 'medium' | 'low'; // based on provider source
  portfolioMappingConfidence: 'high' | 'medium' | 'low';
  proxiedValuePercentage: number; // 0-1 (percentage of portfolio value mapped via proxies/inference)
  proxyUsage: {
    usEquityProxy: string; // e.g., "VTI"
    internationalEquityProxy: string; // e.g., "VXUS"
    bondsProxy: string; // e.g., "AGG"
    unmappedHoldings: string[];
    mappingMethod: string;
  };
  assumptions: string[]; // Explicit assumptions made during mapping/analysis
  // Examples:
  // "Unclassified equity holdings split 70% US / 30% international based on historical averages"
  // "Bond exposure modeled using nominal bond index proxy"
  // "Cash holdings assumed to earn treasury bill rate"
  missingData: string[]; // list of tickers with incomplete data
}

function calculateConfidenceCeiling(dataQuality: DataQualityReport): 'high' | 'medium' | 'low' {
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
```

**LLM Instructions** (in prompt):

```
IMPORTANT: When discussing portfolio analysis:
1. If dataQualityReport.completeness < 0.8, state: "Analysis based on partial data. Some holdings may have incomplete information."
2. If dataQualityReport.metadataConfidence === 'low', state: "Some security classifications were inferred and may be inaccurate."
3. If dataQualityReport.portfolioMappingConfidence === 'low' or 'medium', state: "Portfolio mapped to historical asset classes using proxies. Some holdings may not perfectly match historical indices."
4. If dataQualityReport.assumptions.length > 0, explicitly state: "Analysis assumptions: [list assumptions from dataQualityReport.assumptions]"
5. Never claim certainty about future performance. Always use phrases like "based on historical patterns" or "historical data suggests" or "historical central tendency shows."
6. Use descriptive language from summary.characteristics. Avoid categorical terms like "too risky" or "too conservative."
7. Frame observations in terms of historical ranges and percentiles, not single numbers. Use "median historical outcome" or "typical result across sequences" instead of "expected returns" or "average returns."
8. If survival rate is in lower tercile relative to portfolios with similar equity allocations and horizon, describe as "historically fragile given withdrawal timing" rather than "too risky."
9. Never reference the "4% rule" or present any withdrawal rate as normative or safe.
10. When discussing worst sequences, only mention named historical periods if they appear in stressTestResults.notablePeriods.
11. Always emphasize that past performance does not predict future results.
12. Every portfolio characterization must include both an upside and a downside tradeoff. Never present a characteristic without its corresponding tradeoff.
13. If withdrawalYearsOriginal !== withdrawalYears, state: "Analysis uses [X]-year horizon bucket for computational efficiency. Your actual horizon of [Y] years was rounded to the nearest supported period."
14. Use "historically wide buffer" or "historically high survivability" instead of "margin of safety" or "exceptional sustainability."
```

### 6.3 Output Format for LLM

```typescript
interface RetirementAnalysisOutput {
  summary: {
    characteristics: {
      growthPotential: 'high' | 'moderate' | 'low';
      drawdownResistance: 'high' | 'moderate' | 'low';
      withdrawalFragility: 'high' | 'moderate' | 'low';
      inflationProtection: 'high' | 'moderate' | 'low';
    };
    tradeoffs: {
      upside: string; // What this allocation historically provided
      downside: string; // What this allocation historically lacked or risked
    };
    primaryObservation: string; // Descriptive, not prescriptive (e.g., "historically fragile given withdrawal timing")
    confidence: 'high' | 'medium' | 'low'; // Must respect confidence ceiling rules
    timelineBucket: '10' | '20' | '30';
    timelineBucketNote: string; // Explanation if original input was snapped
  };
  
  metrics: {
    equityAllocation: number;
    withdrawalRate: number; // Descriptive only
    yearsOfExpenses: number;
    historicalWithdrawalRates: {
      p10: number;
      p25: number;
      p50: number;
      p75: number;
      p90: number;
    };
  };
  
  stressTest: {
    totalSequences: number;
    survivalRate: number; // 0-1
    depletionPercentiles: {
      p10: number | null;
      p25: number | null;
      p50: number | null;
      p75: number | null;
      p90: number | null;
    };
    worstSequences: {
      byDepletion: Array<{ sequenceId: string; yearsUntilDepletion: number }>;
      byDrawdown: Array<{ sequenceId: string; maximumDrawdown: number }>;
      byRecovery: Array<{ sequenceId: string; timeToRecovery: number }>;
    };
    // Named crises only if they appear in worst sequences
    notablePeriods?: Array<{
      period: string; // e.g., "2008 Financial Crisis"
      rank: number; // rank among worst sequences
      metric: 'depletion' | 'drawdown' | 'recovery';
    }>;
  };
  
  historicalImplications: Array<{
    category: 'allocation' | 'diversification' | 'expenses' | 'withdrawal';
    observation: string; // Pattern-based observation, conditional on historical data
    historicalContext: string; // Historical pattern that supports the observation
  }>;
  
  dataQuality: DataQualityReport;
  
  disclaimers: string[]; // Pre-formatted disclaimer text
}
```

## 7. Known Risks and Edge Cases

### 7.1 Data Availability Risks

**Risk**: Missing price history for older/illiquid securities

- **Mitigation**: Map to asset basket proxy based on security metadata. If metadata unavailable, use broad market proxy (e.g., VTI for US equity) but mark mapping confidence as "low"
- **Fallback**: Mark analysis as "partial data", reduce confidence score, and explicitly note proxy usage in data quality report

**Risk**: ETF metadata missing from FMP

- **Mitigation**: Infer from ticker symbol patterns (e.g., "VTI" → US equity ETF)
- **Fallback**: Use generic "Unknown" asset class, flag in data quality report

**Risk**: Provider API failures

- **Mitigation**: Multi-provider fallback chain (Tiingo → Polygon → Alpha Vantage)
- **Fallback**: Return cached data with "stale" warning

### 7.2 Calculation Edge Cases

**Edge Case**: Portfolio with 100% cash

- **Handling**: Historical analysis will show negative real returns in most sequences. Characterize as "growth-constrained" with high inflation risk.
- **Observation**: "Historical analysis shows cash holdings typically failed to outpace inflation in the majority of sequences. Portfolios with equity exposure historically showed higher real returns."

**Edge Case**: Portfolio with 100% single stock

- **Handling**: Flag extreme concentration (HHI = 1.0). Map to closest asset class proxy, but mark mapping confidence as "low" and note high concentration risk.
- **Observation**: "Portfolio shows extreme concentration. Historical analysis may not accurately reflect single-stock volatility, as analysis uses broad market proxies. Diversified portfolios historically showed lower volatility."

**Edge Case**: Withdrawal rate > 10%

- **Handling**: Historical analysis will show very high failure rates across sequences. Characterize as "historically unsustainable" based on failure rate.
- **Observation**: "Historical analysis shows withdrawal rates above 10% failed in the vast majority of historical sequences. Lower withdrawal rates historically showed higher sustainability rates."

**Edge Case**: Negative years to retirement (already retired)

- **Handling**: Focus analysis on withdrawal phase sequences. Use full withdrawal period for rolling window analysis.
- **Adjustment**: Assessment based on withdrawal sustainability patterns, not accumulation phase considerations

### 7.3 User Input Edge Cases

**Edge Case**: Missing retirement age

- **Handling**: Prompt user or use default (65)
- **Fallback**: If cannot determine, skip timeline-relative analysis, provide general guidance

**Edge Case**: Withdrawal amount > portfolio value

- **Handling**: Flag as "insufficient funds"
- **Recommendation**: "Portfolio cannot support requested withdrawal amount."

**Edge Case**: Life expectancy < withdrawal start age

- **Handling**: Use default (95) or prompt user
- **Validation**: Reject if life expectancy < current age

### 7.4 Performance Risks

**Risk**: Fetching 10+ years of history for 50+ holdings

- **Mitigation**: 
  - Batch requests with rate limiting
  - Cache aggressively (24h TTL for historical data)
  - Use background jobs for initial data population
- **Timeout**: 30 second timeout per analysis, return partial results if exceeded

**Risk**: Stress test calculations for long withdrawal periods

- **Mitigation**: 
  - Constrain v1 to fixed horizon buckets (10, 20, 30 years) to ensure consistent sequence counts
  - Snap user inputs to nearest supported bucket
  - Use monthly aggregation (not daily) for computational efficiency
  - Cache scenario results by portfolio hash and sequence ID
  - Explicitly inform users when their horizon is rounded to nearest bucket
  - For periods exceeding available data, use longest available sequences and note limitation

### 7.5 Regulatory/Compliance Risks

**Risk**: Appearing to provide licensed financial advice

- **Mitigation**: 
  - All outputs include disclaimer: "This analysis is for informational purposes only and does not constitute financial advice."
  - No specific fund or allocation recommendations
  - Focus on general principles and historical patterns
- **LLM Prompt**: "Never suggest specific securities. Only discuss general allocation principles."

**Risk**: Misleading users with incomplete data

- **Mitigation**: 
  - Always include data quality score
  - Flag missing data prominently
  - Reduce confidence for partial analyses
- **User Communication**: "Analysis based on [X]% of portfolio data. Some holdings may be excluded."

## 8. Implementation Phases

**Note**: This section provides a high-level overview. For detailed execution plan with acceptance criteria, stopping points, and testable deliverables, see **Section 12: Execution Plan & Delivery Milestones**.

### High-Level Phase Overview

**Phase 0-1**: Scaffolding, portfolio metrics, and asset basket mapping  
**Phase 2**: Historical data provider integrations  
**Phase 3**: Rolling window sequence generation  
**Phase 4**: Withdrawal simulation  
**Phase 5**: Outcome and characteristics analysis  
**Phase 6**: Formatter and confidence enforcement  
**Phase 7**: LLM integration  
**Phase 8**: Performance optimization (optional)

See Section 12 for detailed scope, acceptance criteria, and stopping points for each phase.

## 9. File Structure

```
src/retirement-analytics/
├── data/
│   ├── data-provider-factory.ts
│   ├── data-normalizer.ts
│   ├── time-series-cache.ts
│   └── providers/
│       ├── tiingo-provider.ts
│       └── fmp-provider.ts
├── engine/
│   ├── portfolio-analyzer.ts
│   ├── portfolio-mapper.ts
│   ├── outcome-analyzer.ts
│   ├── stress-tester.ts
│   ├── withdrawal-simulator.ts
│   └── characteristics-assessor.ts
├── interpretation/
│   ├── analysis-formatter.ts
│   ├── explanation-builder.ts
│   └── uncertainty-quantifier.ts
├── types.ts
└── index.ts (main entry point)
```

## 10. Integration Points

**Reads From**:

- `FinancialSummarySnapshot` (via `FinancialDataService`)
- Existing provider infrastructure (`src/data/providers/`)

**Writes To**:

- `RetirementAnalysis` table (analysis results cache)
- `AssetPriceHistory` table (historical data cache)
- `SecurityMetadata` table (metadata cache)

**LLM Integration**:

- Extends `src/openai/prompt-builder.ts` to include retirement analysis section
- Uses existing `FinancialContextSnapshot` structure
- Outputs structured JSON for LLM consumption

## 12. Execution Plan & Delivery Milestones

### 12.1 Build Principles

**Execution Philosophy**:

* **Analytics before interpretation**: Build deterministic calculations first. LLM integration comes last.
* **Ship partial correctness early**: A working 10-year bucket with 50% data coverage beats a perfect design that never ships.
* **Avoid speculative completeness**: Do not rebuild Morningstar. Use proxies, document assumptions, move on.
* **Testable output at every phase**: Each phase must produce JSON that can be validated independently. No prose until Phase 7.

**Stopping Criteria**:

Stop and move to the next phase when:
- Current phase produces deterministic, testable output
- Core functionality works for at least one test case
- Edge cases are documented, not solved
- Performance is "good enough" (not optimized)

### 12.2 Phased Implementation

#### Phase 0 – Scaffolding & Contracts

**Goal**: Lock interfaces and module boundaries. Establish contracts without implementation.

**Scope**:
- Define all TypeScript interfaces from sections 2.3, 5.2, 6.3
- Create empty module files with exports
- Write type-only tests that verify interfaces compile
- Document data flow between layers

**Do NOT build yet**:
- No provider integrations
- No Prisma migrations
- No LLM prompts
- No calculations

**Acceptance Criteria**:
- All interfaces compile without errors
- Module boundaries are explicit (import/export statements)
- Type tests pass (interfaces are assignable where expected)
- Data flow diagram matches code structure

**Deliverable**: Type-safe skeleton with zero runtime logic.

---

#### Phase 1 – Portfolio Metrics & Mapping

**Goal**: Compute deterministic portfolio composition and map to asset basket.

**Scope**:
- Calculate equity/fixed income/cash allocations from holdings
- Compute expense ratios, concentration (HHI)
- Map holdings to asset basket (US equity, international equity, bonds, cash)
- Calculate mapping confidence and proxied value percentage
- Populate `assumptions` array with explicit proxy decisions

**Do NOT build yet**:
- No historical price fetching
- No time series data
- No simulations
- No outcome analysis

**Acceptance Criteria**:
- Given holdings + securities, produces `PortfolioMapping` with weights summing to 1.0
- Mapping confidence calculated correctly (high/medium/low)
- `proxiedValuePercentage` calculated accurately
- `assumptions` array populated with proxy decisions
- Handles edge cases: 100% cash, unmapped holdings, missing metadata

**Deliverable**: `portfolio-mapper.ts` that takes holdings and returns mapping + confidence.

**Test Input**: Sample holdings from `FinancialSummarySnapshot` JSON.

---

#### Phase 2 – Historical Data Plumbing

**Goal**: Fetch and cache historical price data. Build provider integrations.

**Scope**:
- Implement Tiingo provider (long-horizon adjusted prices)
- Implement FMP provider (ETF metadata, expense ratios)
- Extend existing FRED provider usage (inflation data)
- Build time-series cache with TTL
- Normalize provider responses to common schema
- Fetch monthly adjusted returns for asset basket proxies (VTI, VXUS, AGG)

**Do NOT build yet**:
- No rolling window generation
- No sequence simulation
- No withdrawal calculations
- No outcome analysis

**Acceptance Criteria**:
- Can fetch 10+ years of monthly data for VTI, VXUS, AGG
- Cache prevents duplicate API calls within TTL
- Provider failures gracefully degrade (fallback chain)
- Data normalized to common `PriceTimeSeries` format
- Inflation data (CPIAUCSL) fetched and cached

**Deliverable**: `data-provider-factory.ts` + provider implementations that return cached time series.

**Test Input**: Hardcoded ticker symbols. Verify cache hits on second call.

---

#### Phase 3 – Rolling Window Engine

**Goal**: Generate rolling historical sequences for fixed horizon buckets.

**Scope**:
- Implement horizon bucket snapping (10/20/30 years)
- Generate rolling sequences (monthly start dates)
- Create deterministic sequence IDs
- Fetch asset basket returns for each sequence window
- Store sequences with metadata (start date, end date, sequence ID)

**Do NOT build yet**:
- No withdrawal simulation
- No portfolio outcome calculation
- No depletion analysis
- No interpretation

**Acceptance Criteria**:
- Given horizon bucket (e.g., 20 years), generates all valid rolling sequences
- Sequence IDs are deterministic and reproducible
- Each sequence contains monthly returns for asset basket
- Handles data gaps gracefully (skips sequences with insufficient data)
- Sequence count matches expected (e.g., ~300 sequences for 20-year bucket with 50 years of data)

**Deliverable**: `stress-tester.ts` that generates `HistoricalSequence[]` for a given horizon bucket.

**Test Input**: Horizon bucket = 20 years. Verify sequence count and IDs are deterministic.

---

#### Phase 4 – Withdrawal Simulation

**Goal**: Simulate fixed real-dollar withdrawals across historical sequences.

**Scope**:
- Implement `simulateWithdrawals()` function
- Calculate portfolio value month-by-month
- Track depletion (portfolio value <= 0)
- Calculate maximum drawdown
- Calculate time to recovery
- Calculate real (inflation-adjusted) returns

**Do NOT build yet**:
- No outcome aggregation
- No characteristic assessment
- No interpretation
- No LLM integration

**Acceptance Criteria**:
- Given portfolio mapping + sequence + withdrawal amount, produces `PortfolioOutcome`
- Correctly calculates depletion year when portfolio exhausts
- Maximum drawdown calculated accurately (peak-to-trough)
- Real returns account for inflation
- Handles edge cases: very high withdrawal rates, very low equity allocation

**Deliverable**: `withdrawal-simulator.ts` that simulates withdrawals and returns outcomes.

**Test Input**: 90% equity, 4% withdrawal, 30-year sequence. Verify depletion occurs in worst sequences.

---

#### Phase 5 – Outcome & Characteristics Analysis

**Goal**: Convert raw simulation outcomes into descriptive characteristics.

**Scope**:
- Aggregate outcomes across all sequences
- Calculate percentiles (p10, p25, p50, p75, p90) for depletion, drawdowns, recovery
- Calculate survival rate
- Determine characteristics (growth potential, drawdown resistance, withdrawal fragility, inflation protection)
- Generate explicit tradeoffs (upside + downside)
- Compare to cohorts (similar equity allocation, same horizon bucket)

**Do NOT build yet**:
- No LLM formatting
- No prose generation
- No recommendations
- No user-facing explanations

**Acceptance Criteria**:
- Given array of `PortfolioOutcome[]`, produces `StressTestResult` with percentiles
- Characteristics calculated relative to comparison cohort (not absolute)
- Tradeoffs explicitly include both upside and downside
- Tercile assessments explicitly reference comparison cohort
- No normative language ("too risky", "safe", "optimal")

**Deliverable**: `outcome-analyzer.ts` + `characteristics-assessor.ts` that produce structured characteristics.

**Test Input**: Array of outcomes from Phase 4. Verify percentiles and characteristics are cohort-relative.

---

#### Phase 6 – Formatter & Confidence Enforcement

**Goal**: Structure results for LLM consumption. Enforce confidence ceilings.

**Scope**:
- Build `analysis-formatter.ts` that produces `RetirementAnalysisOutput`
- Implement `calculateConfidenceCeiling()` function
- Enforce confidence rules (cannot be "high" if mapping confidence != "high", etc.)
- Calculate data quality metrics (completeness, price history coverage, proxied value percentage)
- Populate `assumptions` array in data quality report
- Generate disclaimers array

**Do NOT build yet**:
- No LLM prompt construction
- No natural language generation
- No user-facing prose

**Acceptance Criteria**:
- Given analysis results, produces valid `RetirementAnalysisOutput` JSON
- Confidence ceiling enforced mechanically (not tone-based)
- Data quality report includes all required fields
- Assumptions array populated with proxy decisions
- Output validates against TypeScript interface

**Deliverable**: `analysis-formatter.ts` + `uncertainty-quantifier.ts` that produce LLM-ready JSON.

**Test Input**: Results from Phase 5. Verify JSON structure and confidence enforcement.

---

#### Phase 7 – LLM Integration

**Goal**: LLM explains structured results. No calculations, no reasoning.

**Scope**:
- Extend `src/openai/prompt-builder.ts` to include retirement analysis section
- Pass structured JSON to LLM with explicit instructions
- LLM generates user-facing explanations from structured data
- Enforce LLM boundaries (no calculations, no recommendations, no predictions)

**Do NOT build yet**:
- No new analytics
- No new calculations
- No new data providers

**Acceptance Criteria**:
- LLM receives structured JSON with all required fields
- LLM instructions enforce descriptive-only language
- Explanations reference historical patterns, not predictions
- Tradeoffs are explained (upside + downside)
- Assumptions are explicitly stated
- No normative financial advice generated

**Deliverable**: Integration with existing prompt-builder that produces compliant explanations.

**Test Input**: Structured JSON from Phase 6. Verify LLM output is descriptive, not prescriptive.

---

#### Phase 8 – Performance & Guardrails (Optional)

**Goal**: Optimize performance and add production guardrails.

**Scope**:
- Optimize caching (reduce API calls)
- Add rate limiting for providers
- Implement timeout handling
- Add monitoring/logging
- Performance testing with realistic portfolio sizes

**Do NOT build yet**:
- No new features
- No new analytics
- No architectural changes

**Acceptance Criteria**:
- Analysis completes within timeout (30 seconds)
- Cache hit rate > 80% for repeated analyses
- Graceful degradation when providers fail
- Logging captures data quality issues

**Deliverable**: Production-ready performance and reliability.

**When to skip**: If Phase 7 produces acceptable performance, skip Phase 8 for v1.

---

### 12.3 v1 Explicit Scope Boundaries

**v1 intentionally excludes**:

* **Monte Carlo simulation**: Historical sequences only. No probabilistic modeling.
* **Tax modeling**: Tax-advantaged vs taxable accounts not differentiated. Tax drag not modeled.
* **Adaptive withdrawals**: Fixed real-dollar withdrawals only. No dynamic adjustment strategies.
* **Security-specific risk modeling**: Individual stock volatility not modeled. Uses broad market proxies.
* **30+ year horizons if insufficient data**: If historical data < 30 years, use longest available. Document limitation.
* **Specific fund or ticker recommendations**: No suggestions to buy/sell specific securities.

**Why these exclusions**:

* **Execution focus**: Each exclusion represents significant complexity. v1 prioritizes shipping working analytics over completeness.
* **Explainability**: Historical sequences are explainable ("this happened in 2008"). Monte Carlo requires distribution assumptions that are harder to defend.
* **Regulatory risk**: Specific recommendations create compliance exposure. Descriptive analysis only.
* **Data availability**: Long horizons require long data histories. Use what's available, document gaps.

**v1 includes**:

* Rolling historical window analysis (10/20/30 year buckets)
* Fixed real-dollar withdrawal simulation
* Cohort-relative characteristic assessment
* Explicit tradeoff framing
* Confidence ceilings based on data quality
* Structured JSON output for LLM consumption

---

### 12.4 Definition of Done Checklist

The module is "done enough" to ship when:

- [ ] **Deterministic JSON output**: Same inputs produce same outputs (within floating-point precision)
- [ ] **Confidence capped by data quality**: Confidence ceiling rules enforced in code, not interpretation
- [ ] **Partial data explicitly disclosed**: Data quality report includes completeness, coverage, assumptions
- [ ] **Worst-case results are percentile-based**: No single "worst case" scenario. Report p10/p25/p50/p75/p90
- [ ] **No normative financial advice**: Output is descriptive only. No "safe", "optimal", "recommended" language
- [ ] **Cohort-relative assessments**: All tercile/percentile comparisons explicitly reference comparison cohort
- [ ] **Tradeoffs required**: Every portfolio characterization includes both upside and downside
- [ ] **Proxy assumptions documented**: `assumptions` array populated with all proxy decisions
- [ ] **Edge cases handled**: 100% cash, 100% single stock, extreme withdrawal rates produce valid output
- [ ] **Testable at each phase**: Each phase produces JSON that can be validated independently

**Ship criteria**: All checklist items complete OR explicit limitations documented for incomplete items.

---

### 12.5 Phase Dependencies

**Critical path**:
- Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7

**Can parallelize**:
- Phase 2 provider implementations (Tiingo, FMP) can be built independently
- Phase 5 outcome analysis and characteristics assessment can be built in parallel

**Blocking dependencies**:
- Phase 4 requires Phase 3 (need sequences before simulating withdrawals)
- Phase 5 requires Phase 4 (need outcomes before analyzing characteristics)
- Phase 6 requires Phase 5 (need characteristics before formatting)
- Phase 7 requires Phase 6 (need formatted JSON before LLM integration)

**Do not skip phases**: Each phase validates the previous phase's output. Skipping phases creates integration risk.

---

### 12.6 Testing Strategy

**Unit tests** (each phase):
- Phase 1: Test mapping with known holdings → verify weights sum to 1.0
- Phase 2: Test provider caching → verify cache hits on second call
- Phase 3: Test sequence generation → verify deterministic IDs and count
- Phase 4: Test withdrawal simulation → verify depletion in worst sequences
- Phase 5: Test outcome aggregation → verify percentiles calculated correctly
- Phase 6: Test confidence enforcement → verify ceiling rules applied
- Phase 7: Test LLM output → verify descriptive-only language

**Integration tests** (end-to-end):
- Given `FinancialSummarySnapshot`, produces valid `RetirementAnalysisOutput`
- Verify data quality affects confidence
- Verify assumptions are populated
- Verify tradeoffs include both upside and downside

**Edge case tests**:
- 100% cash portfolio
- 100% single stock portfolio
- Withdrawal rate > 10%
- Missing historical data
- Provider API failures

**Performance tests**:
- Analysis completes within 30 seconds
- Cache reduces API calls by > 80%
- Handles portfolios with 50+ holdings

---

### 12.7 When to Stop and Ship

**Stop Phase 0** when: Interfaces compile and module boundaries are clear.

**Stop Phase 1** when: Can map a test portfolio to asset basket with confidence score.

**Stop Phase 2** when: Can fetch and cache 10 years of monthly data for VTI/VXUS/AGG.

**Stop Phase 3** when: Can generate 300+ rolling sequences for 20-year bucket.

**Stop Phase 4** when: Can simulate withdrawals and detect depletion in worst sequences.

**Stop Phase 5** when: Can calculate percentiles and characteristics relative to cohorts.

**Stop Phase 6** when: Can produce valid JSON with confidence ceilings enforced.

**Stop Phase 7** when: LLM produces compliant explanations from structured JSON.

**Ship v1** when: Phases 0-7 complete OR explicit limitations documented for incomplete phases.

**Do not wait for**:
- Perfect data coverage (50% is fine if documented)
- All edge cases solved (document limitations)
- Optimal performance (good enough is fine)
- Elegant code (working code ships)

## 13. Example User-Facing Explanations

### Example 1: 90% Equity, 4% Withdrawal Rate, 30-Year Horizon

**Portfolio Characteristics:**
- Growth Potential: High
- Drawdown Resistance: Low
- Withdrawal Fragility: Moderate
- Inflation Protection: High

**Analysis:**

Your portfolio's 90% equity allocation has historically delivered strong growth potential, with median inflation-adjusted returns of 5.2% annually across historical sequences. However, this allocation is sequence-sensitive given your 30-year withdrawal horizon.

Historical analysis across 420 rolling 30-year periods shows your portfolio would have sustained withdrawals in 78% of sequences. In the worst 10% of historical periods, portfolio depletion occurred between years 18 and 24 of withdrawals. The median outcome shows portfolio value growing in real terms, with final values ranging from 1.2x to 3.8x the starting amount (10th to 90th percentile).

Maximum drawdowns in challenging periods reached 45-52% of portfolio value, with recovery times of 4-7 years. The most difficult sequences typically occurred when significant market declines happened early in the withdrawal period, before portfolio growth could offset withdrawals.

Your 4% withdrawal rate falls within the historical range of sustainable rates for this allocation. Analysis shows that 4% withdrawals were sustainable in approximately 78% of 30-year historical sequences, with sustainable withdrawal rates ranging from 2.8% (10th percentile) to 5.1% (90th percentile) for similar equity-heavy portfolios.

**Key Observations:**
- **Upside**: Portfolio is return-efficient with strong inflation protection and growth potential
- **Downside**: Sequence-sensitive and historically fragile in upper tercile relative to portfolios with similar equity allocations and horizon, particularly when market declines occur early
- Historical patterns suggest portfolios with withdrawal flexibility (ability to reduce withdrawals during downturns) showed higher sustainability rates

**Data Quality:** Analysis based on mapping your holdings to broad market indices (US equity, international equity, bonds). Portfolio mapped with high confidence. Historical data covers 50+ years of monthly returns.

---

### Example 2: 40% Equity, 3% Withdrawal Rate, 25-Year Horizon

**Portfolio Characteristics:**
- Growth Potential: Moderate
- Drawdown Resistance: High
- Withdrawal Fragility: Low
- Inflation Protection: Moderate

**Analysis:**

Your portfolio's 40% equity allocation has historically balanced growth potential with drawdown resistance. Across 420 rolling 25-year historical sequences, this allocation pattern sustained withdrawals in 94% of periods.

Historical analysis shows median inflation-adjusted returns of 2.8% annually, with median final portfolio values ranging from 0.9x to 1.8x starting value (10th to 90th percentile). While growth is more constrained than higher-equity allocations, the portfolio demonstrated resilience during market downturns, with maximum drawdowns typically limited to 20-28% and recovery times of 2-4 years.

Your 3% withdrawal rate falls in the lower range relative to historical patterns. Analysis indicates that 3% withdrawals were sustainable in 94% of 25-year sequences for similar allocations. Historical sustainable withdrawal rates for this allocation pattern ranged from 2.4% (10th percentile) to 4.2% (90th percentile), indicating your withdrawal rate falls below the median historical sustainable rate for similar portfolios.

The portfolio's balanced allocation has historically provided moderate inflation protection, with real returns positive in approximately 85% of historical periods. However, in high-inflation environments (such as the 1970s), the portfolio's real value declined modestly before recovering.

**Key Observations:**
- **Upside**: Drawdown-resistant allocation pattern with high withdrawal sustainability across historical sequences
- **Downside**: Growth-constrained with moderate inflation protection and some vulnerability to sustained high-inflation periods
- Withdrawal rate falls below median historical sustainable rate for similar portfolios

**Data Quality:** Analysis based on mapping your holdings to broad market indices. Portfolio mapped with high confidence. Historical data covers 50+ years of monthly returns.

---

### Example 3: 20% Equity, 2% Withdrawal Rate, Already Retired

**Portfolio Characteristics:**
- Growth Potential: Low
- Drawdown Resistance: Very High
- Withdrawal Fragility: Very Low
- Inflation Protection: Low

**Analysis:**

Your portfolio's 20% equity allocation prioritizes capital preservation and drawdown resistance. Historical analysis across rolling withdrawal periods shows this allocation sustained withdrawals in 98% of sequences, with maximum drawdowns typically limited to 10-15% and rapid recovery times of 1-2 years.

However, the low equity allocation constrains growth potential. Historical analysis shows median inflation-adjusted returns of 1.2% annually, with median final portfolio values declining to 0.7x to 1.1x starting value (10th to 90th percentile) over typical withdrawal periods. In approximately 60% of historical sequences, the portfolio's real value declined over the withdrawal period, though withdrawals remained sustainable.

Your 2% withdrawal rate falls in the lower range relative to historical patterns. Analysis indicates that 2% withdrawals were sustainable in 98% of historical sequences for similar allocations. Historical sustainable withdrawal rates for this allocation pattern ranged from 1.8% (10th percentile) to 3.1% (90th percentile), indicating your withdrawal rate falls below the median historical sustainable rate for similar portfolios.

The portfolio's low equity allocation provides limited inflation protection. In high-inflation historical periods, the portfolio's purchasing power declined significantly, though withdrawals remained technically sustainable. Real returns were negative in approximately 40% of historical sequences.

**Key Observations:**
- **Upside**: Very high drawdown resistance with historically high survivability across sequences
- **Downside**: Growth-constrained allocation with limited inflation protection; portfolio value likely to decline in real terms over time, though withdrawals remain sustainable
- Historical patterns show portfolios with slightly higher equity allocations (within similar allocation ranges) historically showed improved long-term purchasing power while maintaining high sustainability rates

**Data Quality:** Analysis based on mapping your holdings to broad market indices. Portfolio mapped with high confidence. Historical data covers 50+ years of monthly returns.

---

**Important Disclaimers:**

- Past performance does not predict future results. Historical analysis shows what happened in the past but cannot guarantee future outcomes.
- Analysis assumes fixed real-dollar withdrawals. Adaptive withdrawal strategies may improve outcomes.
- Portfolio mapped to broad market indices for historical simulation. Your actual holdings may behave differently.
- Analysis does not account for taxes, fees, or transaction costs.
- This analysis is for informational purposes only and does not constitute financial advice.

## 11. Tradeoffs and Limitations

### 11.1 Rolling Window vs Named Scenarios Tradeoff

**Tradeoff**: Rolling windows provide comprehensive coverage but may dilute impact of extreme events.

**Limitation**: Very rare events (e.g., 1929 crash) may be averaged out across many sequences. However, this is intentional - we prioritize systematic analysis over cherry-picked worst cases.

**Mitigation**: Worst sequences by outcome metrics (depletion, drawdown, recovery) are explicitly identified and can include named periods if they rank highly.

### 11.2 Asset Basket Mapping Precision

**Tradeoff**: Mapping individual holdings to broad asset classes loses security-specific characteristics.

**Limitation**: A portfolio of 100% tech stocks mapped to "US Equity" will be simulated using broad market returns, missing sector-specific volatility. This is acceptable for retirement analysis which focuses on systematic risk, not idiosyncratic risk.

**Mitigation**: Mapping confidence scores and unmapped holdings are reported. High-concentration portfolios are flagged.

### 11.3 Historical Data Availability

**Tradeoff**: Longer withdrawal periods require more historical data, which may not be available.

**Limitation**: For 30-year withdrawal periods, we need 30+ years of historical data. International equity and bond data may be limited before 1990s.

**Mitigation**: Use longest available sequences. Note data limitations in quality report. For periods exceeding available data, use available sequences and extrapolate cautiously (with low confidence).

### 11.4 Inflation Assumptions

**Tradeoff**: Historical inflation may not predict future inflation regimes.

**Limitation**: Analysis assumes future inflation patterns similar to historical. Unprecedented inflation scenarios (e.g., hyperinflation) are not captured.

**Mitigation**: Use actual historical inflation rates from FRED. Report inflation-adjusted outcomes prominently. Note that past patterns may not repeat.

### 11.5 Withdrawal Rate Assumptions

**Tradeoff**: Fixed withdrawal amounts don't account for adaptive strategies.

**Limitation**: Analysis assumes constant real-dollar withdrawals. Users may reduce withdrawals during downturns, which would improve outcomes.

**Mitigation**: Report outcomes as "fixed withdrawal" scenarios. Note that adaptive strategies may improve sustainability but are not modeled.

### 11.6 No Tax Considerations

**Tradeoff**: Tax efficiency is excluded to keep v1 focused on allocation and sequence risk.

**Limitation**: Tax-advantaged vs taxable accounts are not differentiated. Tax drag on returns is not modeled.

**Mitigation**: Explicitly note this limitation. Tax optimization can be added in future phases.

### 11.7 No Monte Carlo Simulation

**Tradeoff**: Using only historical sequences avoids model assumptions but limits scenario coverage.

**Limitation**: Historical sequences represent one possible path. Future may include sequences not seen historically.

**Mitigation**: This is intentional for v1. Historical sequences provide explainable, defensible analysis. Monte Carlo can be added later if needed, but would require distribution assumptions.

### 11.8 Proxy Usage Transparency

**Tradeoff**: Using proxies (VTI, VXUS, AGG) for portfolio simulation introduces approximation error.

**Limitation**: User's actual holdings may behave differently than proxies, especially for:
- Individual stocks vs broad indices
- Active funds vs passive indices
- Sector-specific ETFs vs total market

**Mitigation**: Explicitly report proxy usage in data quality report. Calculate proxiedValuePercentage (percentage of portfolio value mapped via proxies/inference). Lower mapping confidence for holdings that don't map cleanly. Flag high-concentration portfolios. Enforce confidence ceiling rules in formatter.

### 11.9 Performance vs Comprehensiveness

**Tradeoff**: Comprehensive rolling window analysis requires significant computation.

**Limitation**: Analyzing 50+ years of monthly data across hundreds of rolling windows for multiple asset classes is computationally intensive.

**Mitigation**: 
- Cache results aggressively
- Use monthly (not daily) granularity
- Limit initial implementation to 10-year windows, expand later
- Background job processing for non-real-time analysis

### 11.10 User Input Dependencies

**Tradeoff**: Analysis quality depends on user-provided inputs (retirement age, withdrawal amount).

**Limitation**: Incorrect inputs (e.g., unrealistic withdrawal rates, wrong retirement age) produce misleading results.

**Mitigation**: 
- Validate inputs (withdrawal rate > 0, retirement age > current age, etc.)
- Flag unrealistic inputs (e.g., withdrawal rate > 10%)
- Provide guidance on input assumptions
- Allow users to adjust inputs and re-run analysis