# Retirement analytics integration

Retirement analytics is an optional semantic context pack in the production Ask Linc pipeline.

## Selection and inputs

The preflight `contextPlanner` reads the complete active decision rather than looking for retirement keywords. It can select `retirement_analysis` from implied intent, follow-up answers, pronouns, or a changed scenario. That pack deterministically depends on investment details, user profile, and market context. The primary Claude model can add it through `request_data_packs` if the preflight omitted it.

In the same structured pass, the planner extracts only retirement values the user actually stated: current age, retirement age, annual retirement spending, withdrawal start age, and life expectancy. It reads short replies in the context of the assistant question they answer and records the user's wording as the source. It does not estimate typical values. A deterministic parser remains only as a fallback if semantic extraction is unavailable; it does not decide whether the data pack is loaded.

## Context assembly

`src/openai/context-service.ts`:

1. loads the user's persisted holdings and profile selected by the pack dependencies;
2. resolves planner-extracted inputs with eligible persisted profile values;
3. reports missing or confirmation-required inputs instead of inventing them;
4. reuses a recent analysis only when both the portfolio fingerprint and all resolved inputs match;
5. otherwise runs and persists the deterministic retirement analysis;
6. supplies metrics, stress-test results, assumptions, input sources, and evidence IDs to canonical prompting and Show the Math.

The default life-expectancy assumption is 95 when the user does not provide one, and the answer states the analysis assumptions. Stored annual spending is not silently carried into a new scenario; it requires an explicit confirmation where applicable.

## Scenario comparison

Once a matching retirement baseline exists, Ask Linc can deterministically compare historical CPI-linked, flat nominal, and fixed annual-growth withdrawal policies. Scenario intent is selected semantically by the same two-pass planning subsystem; the LLMs choose a typed policy plan but never calculate the result. The application runs each requested variant, promotes its metrics into the canonical fact pack with scenario provenance, validates the final answer against those facts, and appends an explicit assumption disclosure.

See [Deterministic scenario modeling](SCENARIO_MODELING.md) for policy mechanics, evidence, and current limitations.

## Relevant files

| File | Responsibility |
| --- | --- |
| `src/openai/context-packs.ts` | Retirement pack definition and dependencies |
| `src/openai/context-planner.ts` | Semantic pack selection and input extraction |
| `src/openai/context-service.ts` | Input resolution, cache matching, and analysis retrieval |
| `src/openai/retirement-inputs.ts` | Deterministic precedence and missing-input rules |
| `src/openai/retirement-input-extraction.ts` | Types and deterministic validation for planner-extracted inputs |
| `src/retirement-analytics/retirement-question-parser.ts` | Deterministic extraction fallback only |
| `src/retirement-analytics/` | Offline analysis and stress-test engine |
| `src/scenarios/retirement-scenario.ts` | Retirement what-if policy planning and deterministic execution |

See [Semantic context planning](CONTEXT_PLANNING.md) for the full two-pass data-pack architecture.
