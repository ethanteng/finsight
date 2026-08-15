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

## Correctness evaluation

Run `npm run eval:llm`. The deterministic evaluation gate requires 100% across:

- numerical accuracy and provenance;
- contextual follow-up routing;
- stale snapshot traceability;
- missing-data non-invention;
- retirement input handling without financial-rule defaults.

This offline gate validates the contracts around model output without spending
tokens or depending on provider availability. The authenticated end-to-end
audit in `scripts/audit-canonical-facts-e2e.ts` remains the live-provider smoke
test.
