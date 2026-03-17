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
totalDebt = Σ |balance| or balance  (for credit/loan/mortgage/auto/student)
          + Σ |balance|  (for overdraft: cash accounts with balance < 0)
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
allocationPercentages[type] = { type, value, percentage: (value / portfolioValue) * 100 }
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
  dateSpanMonths = (maxDate - minDate) in months  (earliest to latest income transaction)
  averageMonthlyIncome = totalIncome / dateSpanMonths
  ```
- **Note:** Uses **months in date span**, not months with transactions. E.g. Jan $5k, Feb $0, Mar $5k → 3 months → $3,333/mo (not $5k from 2 months).

### Expenses

- **Filter:** `transaction_type === 'expense'` OR `transaction_type === 'fee'`
- **Formula:**
  ```
  amount = Math.abs(transaction.amount)
  totalExpense = Σ amount  (for all expense transactions)
  dateSpanMonths = (maxDate - minDate) in months  (earliest to latest expense transaction)
  averageMonthlyExpense = totalExpense / dateSpanMonths
  ```

### Manual Override

If `override` is provided (not null/undefined), the analysis string uses that value directly:  
`Average Monthly Income/Expenses: $X.XX (Manual Override)`.

---

## 5. Canonical Snapshot (Ask Linc)

**Source:** `toCanonicalSnapshot()`  
**File:** `src/openai/canonical-snapshot.ts`

### Assets

```
cash = overview.totalCash ?? derivedCash  (derived: Σ Math.max(0, balance) for depository/checking/savings/cd/money market/prepaid)
brokerage = Σ Math.max(0, balance)  (subtype in [brokerage] or type=investment without retirement subtype)
retirement = overview.totalInvestments ?? derivedRetirement  (subtype includes 401k, ira, roth, pension, annuity, hsa, 529)
```

### Liabilities

```
mortgage = Σ |balance|  (subtype includes mortgage, home equity)
credit = Σ |balance|  (type=credit)
loan[subtype] = Σ |balance|  (type=loan or subtype in [student, personal, auto])
overdraft = Σ |balance|  (cash accounts with balance < 0) — consistent with FinancialSummaryService
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
equityAllocation = (equityValue / totalValue) * 100
fixedIncomeAllocation = (fixedIncomeValue / totalValue) * 100
cashAllocation = (cashValue / totalValue) * 100
internationalAllocation = (internationalValue / totalValue) * 100
concentrationRisk (HHI) = Σ (weight²)  for top 10 holdings, where weight = holdingValue / totalValue
expenseRatioWeighted = Σ(expenseRatio * weight) / Σ(weight)  for holdings with expense ratio
```

### Withdrawal Simulation (Phase 4)

**File:** `engine/withdrawal-simulator.ts`

```
Initial allocation:
  usEquity = initialPortfolioValue * usEquityWeight
  intlEquity = initialPortfolioValue * internationalEquityWeight
  bonds = initialPortfolioValue * nominalBondsWeight
  cash = initialPortfolioValue * cashWeight

Per month:
  usEquity *= 1 + usRet
  intlEquity *= 1 + intlRet
  bonds *= 1 + bondRet
  cash *= 1 + cashRet
  portfolioValue = usEquity + intlEquity + bonds + cash
  monthlyWithdrawal *= 1 + inflationRate
  portfolioValue -= monthlyWithdrawal

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

### Stress Test Results (Phase 5)

**File:** `engine/outcome-analyzer.ts`

```
survivalRate = count(outcomes.withdrawalSustainability) / outcomes.length
depletionPercentiles = percentile(depletionYears, [10, 25, 50, 75, 90])
  where percentile(p) = sortedValues[floor((p/100) * length)]
```

### Retirement Metrics (sent to LLM)

```
withdrawalRate = annualWithdrawalAmount / totalValue
yearsOfExpenses = totalValue / annualWithdrawalAmount
```

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
totalDebt = credit: Math.abs(balance); loan/mortgage/student/personal/auto/home equity: Math.max(0, balance)
totalInvestments = portfolio.totalValue
homeValue = valueMid ?? valueHigh ?? valueLow
netWorth = totalCash + totalInvestments + (homeValue ?? 0) - totalDebt
```

---

## 9. Expense Ratio Formatting (Prompt)

**Source:** `formatRetirementSecurityMetadata()`  
**File:** `src/openai/prompt-builder.ts`

```
expenseRatioDisplay = expenseRatio >= 0.01 ? expenseRatio : expenseRatio * 100
  (if value >= 0.01 assume already percentage; else convert decimal to %)
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
getPercentile(p) = sortedValues[Math.floor((p/100) * numericValues.length)]
  (clamped to last index)
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
| Financial overview | `src/services/financial-summary-service.ts` |
| Portfolio value & allocation | `src/services/financial-data-service.ts` |
| Income/expense analysis | `src/openai/context-service.ts` |
| Canonical snapshot | `src/openai/canonical-snapshot.ts` |
| Retirement portfolio metrics | `src/retirement-analytics/engine/portfolio-analyzer.ts` |
| Withdrawal simulation | `src/retirement-analytics/engine/withdrawal-simulator.ts` |
| Historical withdrawal rates | `src/retirement-analytics/engine/withdrawal-rate-solver.ts` |
| Stress test / percentiles | `src/retirement-analytics/engine/outcome-analyzer.ts` |
| Data quality | `src/retirement-analytics/interpretation/uncertainty-quantifier.ts` |
| Prompt building | `src/openai/prompt-builder.ts`, `src/openai/financial-reasoning-prompt.ts` |
| Gemini validation context | `src/openai/response-validator.ts` |
