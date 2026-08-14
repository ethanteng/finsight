# Deterministic Calculations Sent to Claude, Gemini, and OpenAI

This document describes the **deterministic** (non-AI) mathematical calculations performed in the Finsight codebase that produce the data sent to Claude, Gemini, or OpenAI. The LLMs receive these pre-computed values as context; they do not perform these calculations themselves.

---

## 1. Overview: Data Flow to LLMs

| LLM | Use Case | Input Data Source |
|-----|----------|-------------------|
| **Claude** | Ask Linc financial analysis | `buildFinancialContextForPrompt()` + `buildFinancialReasoningPrompt()` |
| **Gemini** | Response validation (optional) | `buildSnapshotSummaryForValidation()` — subset of same snapshot |
| **OpenAI** | Legacy/demo Ask endpoint | `buildPromptPayload()` via `formatAccountSummary`, `formatTransactionSummary`, `formatInvestmentSummary` |

All three receive data derived from the same underlying deterministic calculations.

---

## 2. Financial Overview (Net Worth, Cash, Debt, Investments)

**Source:** `FinancialSummaryService.calculateFinancialOverview()`  
**File:** `src/services/financial-summary-service.ts`

### Formulas

```
totalCash = Σ Math.max(0, balance)  (for accounts: type=depository OR subtype in [checking, savings, money market, prepaid])
liabilityValue = Math.abs(balance)  (for all liabilities — APIs use inconsistent sign conventions)
totalDebt = Σ liabilityValue  (credit, loan, mortgage, auto, student, overdraft)
totalInvestments = investments.portfolio.totalValue  (from analyzePortfolio)
homeValue = valueMid ?? valueHigh ?? valueLow  (first non-null, > 0)
netWorth = totalCash + totalInvestments + (homeValue ?? 0) - totalDebt
```

**Note:** Cash uses `Math.max(0, balance)` for consistency across FinancialSummaryService, SummaryCacheService, and canonical snapshot. Overdraft (negative cash balance) is added to totalDebt to preserve net worth correctness.

### Account Classification Rules

- **Cash:** `type === 'depository'` OR `subtype` in `['checking','savings','money market','prepaid']`
- **Debt:** `type === 'credit'` OR `type === 'loan'` OR `subtype` in `['credit card','mortgage','auto','student']`
- **Investment accounts:** Excluded from cash/debt; value comes from holdings or manual account balance

### Duplicate Handling

Accounts are deduplicated by `plaidAccountId || persistentAccountId || account_id || id` before summing.

---

## 3. Investment Portfolio

**Source:** `FinancialDataService.analyzePortfolio()`  
**File:** `src/services/financial-data-service.ts`

### Portfolio Value

```
portfolioValue = Σ holding.institution_value  (for all holdings)
+ Σ Math.max(0, balance)  (for manual investment accounts: source='manual', type='investment', subtype in [401k, ira, roth, brokerage, hsa, 529, pension, annuity])
```

### Asset Allocation

```
assetAllocation[assetType] = Σ holding.institution_value  (grouped by security.type or holding.security_type)
percentage = portfolioValue > 0 ? (value / portfolioValue) * 100 : 0  (guard against NaN when portfolioValue = 0)
allocationPercentages[type] = { type, value, percentage }
```

### Holdings Gain/Loss (in prompt formatting)

**Source:** `prompt-builder.ts` — `formatInvestmentSummary`, `buildSystemPrompt`

```
gainLoss = currentValue - costBasis
gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0
```

---

## 4. Income and Expense Analysis

**Source:** `buildIncomeAnalysis()`, `buildExpenseAnalysis()`  
**File:** `src/openai/context-service.ts`

### Income

- **Filter:** `transaction_type === 'income'` AND `amount > 0`
- **Grouping:** By month `YYYY-MM`
- **Formula:**
  ```
  totalIncome = Σ amount  (for all income transactions)
  dateSpanMonths = (maxYear - minYear) * 12 + (maxMonth - minMonth) + 1  (calendar months, inclusive)
  averageMonthlyIncome = totalIncome / dateSpanMonths
  ```
- **Note:** Uses **calendar months** (min to max inclusive), not day difference. E.g. Jan 31 → Feb 1 = 2 months (avoids 1-day span → 0 months → ∞ average). Jan $5k, Feb $0, Mar $5k → 3 months → $3,333/mo.

### Expenses

- **Filter:** `transaction_type === 'expense'` OR `transaction_type === 'fee'`
- **Formula:**
  ```
  amount = Math.abs(transaction.amount)
  totalExpense = Σ amount  (for all expense transactions)
  dateSpanMonths = (maxYear - minYear) * 12 + (maxMonth - minMonth) + 1  (calendar months, inclusive)
  averageMonthlyExpense = totalExpense / dateSpanMonths
  ```

### Manual Override

If `override` is provided (not null/undefined), the analysis string uses that value directly:  
`Average Monthly Income/Expenses: $X.XX (Manual Override)`.

---

## 5. Canonical Snapshot (Ask Linc)

**Source:** `buildCanonicalSnapshotCore()`

**File:** `src/services/canonical-financial-snapshot.ts`

The canonical producer computes the financial overview, investment portfolio, source
observations, timestamps, and quality status once. The persisted summary, historical
snapshots, app UI, and Ask Linc prompt all consume those canonical values.

### Assets

```
cash = Σ Math.max(0, known cash-account balance)
investments = Σ known holding values + Σ Math.max(0, known manual investment balances)
home = finite home-value midpoint >= 0, otherwise null
totalAssets = cash + investments + (home ?? 0)
```

Only values already denominated in the reporting currency are included. Unknown and
unconverted values are excluded and recorded as unavailable source observations; they
are not converted to zero.

### Liabilities

```
debt = Σ Math.abs(known debt-account balance)
overdraft = Σ Math.abs(known negative cash-account balance)
totalDebt = debt + overdraft
netWorth = totalAssets - totalDebt
```

### Income / Expenses

**Uses structured numeric data** — never parses strings. Values come from `snapshot.averageMonthlyIncome` and `snapshot.averageMonthlyExpense`, populated by `buildIncomeAnalysis`/`buildExpenseAnalysis` in context-service.

```
income = (averageMonthlyIncome ?? 0) * 12
expenses = (averageMonthlyExpense ?? 0) * 12
```

### Age / Retirement Goal

- `age` = extracted from profile via `extractAgeFromProfile()`
- `retirement_goal_age` = from profile or default **65**

---

## 6. Retirement Portfolio Analysis

**Source:** `analyzeRetirementPortfolio()` and engine modules  
**Files:** `src/retirement-analytics/`

### Portfolio Metrics (Phase 1)

**File:** `engine/portfolio-analyzer.ts`

```
totalValue = Σ holding.institution_value
// Guard: totalValue > 0 to avoid NaN
equityAllocation = totalValue > 0 ? (equityValue / totalValue) * 100 : 0
fixedIncomeAllocation = totalValue > 0 ? (fixedIncomeValue / totalValue) * 100 : 0
cashAllocation = totalValue > 0 ? (cashValue / totalValue) * 100 : 0
internationalAllocation = totalValue > 0 ? (internationalValue / totalValue) * 100 : 0
concentrationRisk (HHI) = totalValue > 0 ? Σ (weight²) : 0  for top 10 holdings, weight = holdingValue / totalValue
expenseRatioWeighted = Σ(expenseRatio * weight) / Σ(weight)  for holdings with expense ratio
```

### Withdrawal Simulation (Phase 4)

**File:** `engine/withdrawal-simulator.ts`

**Withdrawal timing:** End-of-period. Each month: (1) apply returns, (2) subtract withdrawal. This differs from Trinity-style / Bengen 4% rule studies, which typically use beginning-of-period withdrawals (withdraw first, then earn returns). End-of-period is slightly more favorable; survival rates may be marginally higher than in Trinity-style literature.

```
Initial allocation:
  usEquity = initialPortfolioValue * usEquityWeight
  intlEquity = initialPortfolioValue * internationalEquityWeight
  bonds = initialPortfolioValue * nominalBondsWeight
  cash = initialPortfolioValue * cashWeight

Per month (end-of-period: returns first, then withdrawal):
  1. usEquity *= 1 + usRet; intlEquity *= 1 + intlRet; bonds *= 1 + bondRet; cash *= 1 + cashRet
  2. portfolioValue = usEquity + intlEquity + bonds + cash
  3. monthlyWithdrawal *= 1 + monthlyInflation  (inflationRates[] are monthly: CPI_t/CPI_(t-1) - 1, not annual)
  4. portfolioValue = max(0, portfolioValue - monthlyWithdrawal)  (clamp at zero; sequence marked depleted)

Between-rebalance months (proportional scaling after withdrawal):
  scale = portfolioValue / (portfolioValue + monthlyWithdrawal)
  usEquity *= scale; intlEquity *= scale; bonds *= scale; cash *= scale
  (Keeps sleeve sub-totals consistent with portfolio total between annual rebalances.)

Annual rebalance (every 12 months):
  usEquity = portfolioValue * usEquityWeight
  intlEquity = portfolioValue * internationalEquityWeight
  bonds = portfolioValue * nominalBondsWeight
  cash = portfolioValue * cashWeight
```

### Real Return (inflation-adjusted)

```
nominalReturn = (finalValue - initialValue) / initialValue
cumulativeInflation = Π(1 + inflationRates[i])
realReturn = (1 + nominalReturn) / cumulativeInflation - 1
years = (portfolioValues.length - 1) / 12  (portfolioValues includes initial value at index 0, so length - 1 = months simulated)
annualizedRealReturn = (1 + realReturn)^(1/years) - 1
```

### Historical Withdrawal Rate Distribution (Phase 3b)

**File:** `engine/withdrawal-rate-solver.ts`

Binary search over withdrawal rate (2%–8%) to find rates where:
- p10: 90% of sequences survive
- p25: 75% survive
- p50: 50% survive
- p75: 25% survive
- p90: 10% survive

**Note:** The 2%–8% solver range is intentionally bounded for typical retirement horizons, not mathematically derived. Safe withdrawal could fall below 2% in severe scenarios (e.g. long horizons, poor sequences); rates above 8% may be sustainable for very short retirements.

### Stress Test Results (Phase 5)

**File:** `engine/outcome-analyzer.ts`

```
survivalRate = count(outcomes.withdrawalSustainability) / outcomes.length
depletionPercentiles = percentile(depletionYears, [10, 25, 50, 75, 90])
  where percentile(p) uses linear interpolation: index = (p/100) * (n-1)
  then interpolate between sortedValues[floor(index)] and sortedValues[ceil(index)]
  (matches Excel PERCENTILE.INC / R type 6)
```

### Retirement Metrics (sent to LLM)

```
withdrawalRate = annualWithdrawalAmount / totalValue
yearsOfExpenses = totalValue / annualWithdrawalAmount
```

**Note on yearsOfExpenses:** Naive ratio only. Ignores market returns, inflation, and sequence-of-returns risk. Do NOT interpret as portfolio longevity. For feasibility, use stress test survival rate and depletion percentiles.

---

## 7. Data Quality (Retirement)

**Source:** `calculateDataQuality()`  
**File:** `src/retirement-analytics/interpretation/uncertainty-quantifier.ts`

```
completeness = holdingsWithMetadata / holdings.length
  (holding has metadata if security.type && holding.ticker_symbol)
proxiedValuePercentage = proxiedValue / totalValue
  (proxied = holdings in unmappedHoldings or mappingMethod === 'inferred')
metadataConfidence = completeness < 0.5 ? 'low' : completeness < 0.8 ? 'medium' : 'high'
```

---

## 8. Summary Cache Service (Alternative Path)

**Source:** `SummaryCacheService.computeFinancialOverview()`  
**File:** `src/services/summary-cache-service.ts`

Uses the same logic as `FinancialSummaryService` for consistency:

```
totalCash = Σ Math.max(0, balance)  (depository, checking, savings, cd, money market, prepaid; exclude investment)
totalDebt = Σ Math.abs(balance)  (credit, loan, mortgage, overdraft — liabilityValue = Math.abs for all)
totalInvestments = portfolio.totalValue
homeValue = valueMid ?? valueHigh ?? valueLow
netWorth = totalCash + totalInvestments + (homeValue ?? 0) - totalDebt
```

---

## 9. Expense Ratio Formatting (Prompt)

**Source:** `formatRetirementSecurityMetadata()`  
**File:** `src/openai/prompt-builder.ts`

```
// Most financial datasets store as decimals (0.0075 = 0.75%). Heuristic (data-model dependent):
expenseRatioDisplay = value < 1 ? value * 100 : value
  (if value < 1 → decimal format → multiply by 100; else → already percent)
// Handles 0.065 = 6.5% (decimal). Edge case: 0.65 could mean 0.65% or 65% — depends on source.
```

---

## 10. Transaction Summary Formatting

**Source:** `formatTransactionSummary()`  
**File:** `src/openai/prompt-builder.ts`

```
amountDisplay = amount >= 0 ? `$${amount.toFixed(2)}` : `-$${Math.abs(amount).toFixed(2)}`
```

---

## 11. Percentile Calculation (Outcome Analyzer)

**Source:** `calculatePercentiles()`  
**File:** `src/retirement-analytics/engine/outcome-analyzer.ts`

```
index = (p/100) * (n-1); interpolate between sortedValues[floor(index)] and sortedValues[ceil(index)]
(matches Excel PERCENTILE.INC / R type 6)
```

---

## 12. What the LLMs Do vs. What Is Pre-Computed

| Pre-computed (deterministic) | LLM responsibility |
|-----------------------------|--------------------|
| Net worth, cash, debt, investments | Interpret and explain |
| Income/expense averages | Compare to goals, suggest changes |
| Portfolio allocation, gain/loss | Discuss risk, rebalancing |
| Retirement survival rate, depletion percentiles | Explain feasibility, tradeoffs |
| Withdrawal rate, years of expenses | Relate to user’s situation |

The LLMs are instructed to **use the provided values as authoritative** and not recalculate from raw holdings or accounts. The prompt states: *"These are the AUTHORITATIVE financial values. Use these exact values... Do NOT recalculate from holdings, accounts, or retirement portfolio snapshots."*

---

## 13. File Reference

| Calculation | Primary File |
|-------------|---------------|
| Financial overview | `src/services/canonical-financial-snapshot.ts` |
| Portfolio value & allocation | `src/services/canonical-financial-snapshot.ts` |
| Unified source-data aggregation | `src/services/financial-data-service.ts` |
| Income/expense analysis | `src/openai/context-service.ts` |
| Canonical snapshot and quality | `src/services/canonical-financial-snapshot.ts`, `src/domain/financial-truth.ts` |
| Retirement portfolio metrics | `src/retirement-analytics/engine/portfolio-analyzer.ts` |
| Withdrawal simulation | `src/retirement-analytics/engine/withdrawal-simulator.ts` |
| Historical withdrawal rates | `src/retirement-analytics/engine/withdrawal-rate-solver.ts` |
| Stress test / percentiles | `src/retirement-analytics/engine/outcome-analyzer.ts` |
| Data quality | `src/retirement-analytics/interpretation/uncertainty-quantifier.ts` |
| Prompt building | `src/openai/prompt-builder.ts`, `src/openai/financial-reasoning-prompt.ts` |
| Gemini validation context | `src/openai/response-validator.ts` |
