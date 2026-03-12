# Determinism in Analytics and LLM Context

This document describes which parts of the Finsight system produce **deterministic** outputs (same inputs → same outputs) versus **non-deterministic** outputs. It covers retirement analytics, stress testing, and all data passed to LLMs (Claude, Gemini, OpenAI).

---

## Overview

Understanding determinism matters for:

- **Reproducibility** — Debugging, auditing, and regression testing
- **Consistency** — User experience when asking the same question twice
- **Compliance** — Financial advice traceability and audit trails

---

## Part 1: Retirement Analytics

### Methodology: Rolling Historical Windows (Not Monte Carlo)

The retirement analysis uses **rolling historical windows**, not Monte Carlo simulation. The design explicitly excludes Monte Carlo in v1:

> *"No Monte Carlo in v1 — Use rolling historical windows to avoid scenario selection bias."*

**How it works:**

1. **Rolling sequences** (`stress-tester.ts`) — Generates quarterly rolling windows (10/20/30 years) from historical returns of VTI, VXUS, AGG (or fallbacks). Each window is a fixed historical period (e.g., 1970-Q1 to 1980-Q1).
2. **Withdrawal simulation** (`withdrawal-simulator.ts`) — For each sequence, runs a deterministic month-by-month simulation: apply portfolio return, subtract withdrawal, track drawdowns and depletion.
3. **Outcome analysis** (`outcome-analyzer.ts`) — Computes survival rate, depletion percentiles, worst sequences, etc. from the simulation results.

### Retirement Analytics: Determinism


| Component                 | Deterministic? | Notes                                                                                                                                             |
| ------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Asset returns**         | ✅ Yes          | When not in test mode: historical data from Tiingo API (or cache). Same inputs → same returns. Deterministic.                                    |
| **Withdrawal simulation** | ✅ Yes          | Pure arithmetic; no randomness.                                                                                                                   |
| **Outcome analysis**      | ✅ Yes          | Percentiles, survival rates from fixed outcomes.                                                                                                  |
| **Inflation rates**       | ✅ Yes          | Historical CPIAUCSL from FRED; MoM rates computed deterministically. Fallback 0.0026/mo (≈3.2% YoY) when FRED unavailable. See `sliceInflationRates()` in `stress-tester.ts`. |
| **Tiingo mock data**      | ❌ No           | Only in test mode (`test_tiingo_key` or `GITHUB_ACTIONS`): uses `Math.random()` for returns. Outside test mode, Tiingo is deterministic.           |


**Impact:** Inflation affects `realReturn` (inflation-adjusted return) in `calculateRealReturn()`. With FRED CPI, inflation is now deterministic; `realReturn` is fully deterministic when using real asset and CPI data. **Outside test mode**, the full retirement analysis (asset returns from Tiingo, inflation from FRED) is deterministic.

---

## Part 2: LLM Context Data

The following data is passed to Claude (Ask Linc), OpenAI (fallback), and Gemini (validation). It is assembled by `gatherContextSnapshot()` in `context-service.ts`.

### Deterministic Components


| Component                                     | Source                                 | Notes                                                                                                |
| --------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Accounts**                                  | DB snapshot                            | From `SummaryCacheService.getLatestSnapshot()`.                                                      |
| **Transactions**                              | DB snapshot                            | Same snapshot source.                                                                                |
| **Income analysis**                           | `buildIncomeAnalysis()`                | Pure logic over transactions + overrides.                                                            |
| **Expense analysis**                          | `buildExpenseAnalysis()`               | Same pattern.                                                                                        |
| **Canonical snapshot**                        | `toCanonicalSnapshot()`                | Derived from snapshot via fixed transforms.                                                          |
| **Search context summary**                    | `generateSearchSummary()`              | String concatenation of search results; no LLM.                                                      |
| **Tier context**                              | `buildTierAwareContext()`              | Rule-based; no LLM.                                                                                  |
| **Retirement analysis (core)**                | Retirement engine                      | Survival rate, depletion percentiles, drawdowns, etc. Deterministic when using real historical data. |
| **Market context (when cached)**              | `MarketNewsManager.getMarketContext()` | Reads from DB; same row → same text.                                                                 |
| **Financial overview / investment portfolio** | Snapshot                               | From DB.                                                                                             |
| **Home value summary**                        | Snapshot / home value API              | From DB or external API.                                                                             |
| **Transaction categorization (cached)**       | DB                                     | When `aiCategory`/`transaction_type` already exists in snapshot, deterministic.                      |


### Non-Deterministic Components


| Component                              | Source                                            | Why Non-Deterministic                                                                                            |
| -------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **User profile**                       | `loadUserProfile()` → `PlaidProfileEnhancer`      | Uses **OpenAI (gpt-4o)** to integrate Plaid insights into the profile. Runs on each context gather.              |
| **Market context (when generated)**    | `MarketNewsSynthesizer.synthesizeMarketContext()` | Uses **Gemini** to synthesize raw market data into text. Non-deterministic at generation time (temperature 0.3). |
| **Transaction categorization (fresh)** | `TransactionCategorizationService`                | Uses **OpenAI** when categorizing new transactions. Deterministic when using cached/DB values.                   |
| **Search results**                     | Brave/external search API                         | Index changes over time; same query can return different results.                                                |


---

## Part 3: Pipeline-Specific Behavior

### Ask Linc (Claude + Optional Gemini Validation)

- **Inputs:** `canonicalSnapshot`, `userProfile`, `marketSummary`, `ragKnowledge`, `conversationHistory`
- **Non-deterministic:** `userProfile` (when PlaidProfileEnhancer runs), `marketSummary` (when freshly synthesized)
- **Deterministic:** `canonicalSnapshot`, `ragKnowledge` (for same search results), `conversationHistory`

### OpenAI Fallback (Prompt Builder Path)

- Uses the same `FinancialContextSnapshot` from `gatherContextSnapshot()`
- Same determinism characteristics as above

### Gemini (Validation)

- Receives a compact snapshot summary built from the same snapshot
- Determinism matches the snapshot components above

---

## Part 4: Key Code References


| Component                 | File                                                      | Function/Class                 |
| ------------------------- | --------------------------------------------------------- | ------------------------------ |
| Retirement analysis entry | `src/retirement-analytics/index.ts`                       | `analyzeRetirementPortfolio()` |
| Rolling sequences         | `src/retirement-analytics/engine/stress-tester.ts`        | `generateRollingSequences()`   |
| Inflation (FRED CPI)      | `src/retirement-analytics/engine/stress-tester.ts`        | `sliceInflationRates()`        |
| CPI fetch                 | `src/data/providers/fred.ts`                             | `getCPIObservations()`         |
| Withdrawal simulation     | `src/retirement-analytics/engine/withdrawal-simulator.ts` | `simulateWithdrawals()`        |
| Context assembly          | `src/openai/context-service.ts`                           | `gatherContextSnapshot()`      |
| Profile enhancement       | `src/profile/plaid-enhancer.ts`                           | `integrateInsightsWithAI()`    |
| Market synthesis          | `src/market-news/synthesizer.ts`                          | `synthesizeMarketContext()`    |
| Search summary            | `src/data/orchestrator.ts`                                | `generateSearchSummary()`      |


---

## Part 5: Recommendations

1. **Profile enhancement:** Consider caching enhanced profiles or running enhancement asynchronously to reduce non-determinism on each request.
2. **Market context:** Cached market context from DB is deterministic; ensure refresh jobs run on a schedule rather than on-demand during user requests when consistency matters.
3. **Transaction categorization:** Once categorized and persisted, transactions are deterministic. Ensure categorization runs before snapshot computation for stable income/expense analysis.

---

## Related Documentation

- [Ask Linc LLM Financial Analysis](./ASK_LINC_LLM_FINANCIAL_ANALYSIS.md) — Pipeline architecture
- [Retirement Analytics Setup](../../RETIREMENT_ANALYTICS_SETUP.md) — Retirement module configuration
- [GPT Prompt Construction](./GPT_PROMPT_CONSTRUCTION.md) — Prompt structure

