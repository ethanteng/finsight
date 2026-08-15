# Ask Linc measurement and correctness gates

The app has one production analysis route: `POST /ask/display-real`. Claude is
the primary provider and OpenAI reuses the same prepared context pack on
fallback. Provider selection no longer changes snapshot loading, prompting, or
validation behavior.

## Runtime targets

The admin-only `GET /ai/performance` endpoint reports up to 500 process-local
observations. Metrics reset on deployment and contain no question, user,
account, or response text.

| Metric | Target |
| --- | ---: |
| Context gathering p95 | <= 1,500 ms |
| Prompt building p95 | <= 100 ms |
| First answer token p95 | <= 4,000 ms |
| Total response p95 | <= 15,000 ms |
| Deterministic grounding rate | 100% |

The endpoint also reports model and validation latency, request success rate,
fallback rate, and retry rate. These targets are initial operational budgets;
an unmeasured target is reported as `null`, not as passing. Adjust targets only
after collecting a representative production window. First-token latency is
reported only for genuinely streamed Claude responses; buffered responses and
the non-streaming fallback do not claim a first-token measurement.

### Capturing a deployed baseline

Do not use local timings as a production baseline. After deploying a release:

1. Let normal production traffic collect at least 100 observations for the
   core request stages. Streamed first-token latency has its own 100-sample gate
   because buffered and fallback responses cannot supply that measurement.
2. Fetch the admin-only `GET /ai/performance` endpoint. Confirm
   `baselineCandidate.ready` is `true` and save the `observationWindow`, core
   stage p50/p95 values, and quality rates with the release notes. Record the
   first-token baseline only when `baselineCandidate.timeToFirstTokenReady` is
   also `true`.
3. Cross-check the same window in Sentry before changing a target. The endpoint
   is process-local and intentionally resets on each deployment; Sentry is the
   durable source for comparisons across releases and instances.
4. Use the captured values as the prior-release baseline for the next change.
   Keep the published targets as budgets unless representative production data
   supports revising them.

`baselineCandidate` reports the remaining samples per stage and never labels an
undersized core window ready. First-token readiness remains independently
visible. A restart or deployment starts a new candidate window.

## Correctness evaluation

Run `npm run eval:llm`. The deterministic evaluation gate executes controlled
snapshots and model responses through the production analysis pipeline and
requires 100% across:

- numerical accuracy and provenance;
- contextual follow-up routing;
- stale snapshot traceability;
- missing-data non-invention;
- retirement accumulation-phase facts and input handling without
  financial-rule defaults;
- rejection and grounded retry of a model-invented amount.

The scenarios exercise intent routing, question-specific prompt construction,
structured parsing, canonicalization, local arithmetic validation, retries, and
evidence manifests without spending tokens or depending on provider
availability. The authenticated end-to-end audit in
`scripts/audit-canonical-facts-e2e.ts` remains the live-provider smoke test.
