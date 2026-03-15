# Historical Withdrawal Rate Solver

This document describes the **historical withdrawal rate distribution** computed by the retirement analytics module—how it is derived, what the percentiles mean, and how it integrates with Ask Linc.

---

## Overview

Instead of heuristic estimates, the system computes **empirically grounded withdrawal rate percentiles** by running portfolio simulations against historical market sequences. The solver finds the withdrawal rate where a target fraction of sequences survive, producing a distribution (p10, p25, p50, p75, p90) that reflects real historical market conditions.

---

## Percentile Semantics

Percentile labels denote position in the **withdrawal rate distribution** (ascending order):

| Percentile | Meaning | Target Survival | Interpretation |
|------------|---------|-----------------|----------------|
| **p10** | 10th percentile | 90% of sequences survive | Conservative low rate—sustainable even in the worst 10% of historical environments |
| **p25** | 25th percentile | 75% survive | Rate sustainable in poor market environments |
| **p50** | 50th percentile (median) | 50% survive | Median historical sustainable withdrawal rate |
| **p75** | 75th percentile | 25% survive | Rate sustainable in strong markets |
| **p90** | 90th percentile | 10% survive | Aggressive high rate—only sustainable in the best 10% of historical environments |

**Key insight:** Higher survival target → lower withdrawal rate (conservative). Lower survival target → higher withdrawal rate (aggressive). The survival curve is monotonic: as withdrawal rate increases, fewer sequences survive.

---

## Algorithm

### Pipeline Position

The solver runs **before** user-scenario simulations, in `index.ts`:

```
generateRollingSequences
      ↓
computeHistoricalWithdrawalRates(sequences, portfolioMapping, totalValue)
      ↓
simulateWithdrawals (user scenario)
      ↓
analyzeOutcomes(outcomes, sequences, totalSequences, historicalWithdrawalRates)
```

`analyzeOutcomes` receives `historicalWithdrawalRates` as input; it does not compute them.

### Binary Search

For each percentile, the solver performs binary search over withdrawal rates in [2%, 8%]:

1. **Evaluate survival** at midpoint rate: run `simulateWithdrawals` for each sequence with `annualWithdrawal = rate × totalValue`.
2. **Compare** survival fraction to target. If `survivalFraction >= targetSurvival` → increase rate (`low = rate`); else decrease rate (`high = rate`).
3. **Converge** when `|high - low| < TOLERANCE` or `MAX_ITERATIONS` reached.

### Unreachable Targets

If the target survival is outside the achievable range:

- `targetSurvival > maxSurvival` (at MIN_WITHDRAWAL) → return `MIN_WITHDRAWAL`
- `targetSurvival < minSurvival` (at MAX_WITHDRAWAL) → return `MAX_WITHDRAWAL`

### Percentile Order

Percentiles are solved in order for better convergence (survival curve is monotonic):

1. p50 first
2. p25 and p75
3. p10 and p90

### Monotonicity

After solving, results are enforced to satisfy `p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90` to avoid floating-point inversions.

### Shared Cache

A `Map<number, number>` survival cache (key: `Math.round(rate * 100000)`) is shared across percentile searches to avoid duplicate simulations when binary searches overlap.

---

## Implementation

| File | Purpose |
|------|---------|
| `src/retirement-analytics/engine/withdrawal-rate-solver.ts` | `computeHistoricalWithdrawalRates`, `evaluateSurvival`, `findWithdrawalForSurvival` |
| `src/retirement-analytics/engine/withdrawal-simulator.ts` | `simulateWithdrawals` (used by solver) |
| `src/retirement-analytics/index.ts` | Orchestrates solver call before user scenario |

---

## Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `MIN_WITHDRAWAL` | 0.02 (2%) | Lower search bound |
| `MAX_WITHDRAWAL` | 0.08 (8%) | Upper search bound |
| `TOLERANCE` | 0.0001 | Convergence threshold |
| `MAX_ITERATIONS` | 15 | Binary search iteration cap |

---

## Retirement Horizon

Sequences are horizon-specific: `generateRollingSequences(withdrawalYears, ...)` produces sequences of length `withdrawalYears × 12` months. The solver uses these same sequences; no separate horizon parameter is needed.

---

## Related Documentation

- [Retirement Analytics Integration](../RETIREMENT_ANALYTICS_INTEGRATION.md) — How retirement analysis integrates with Ask Linc
- [Ask Linc LLM Financial Analysis](ASK_LINC_LLM_FINANCIAL_ANALYSIS.md) — How withdrawal percentiles are used in LLM context
