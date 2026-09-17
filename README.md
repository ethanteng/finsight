# Ask Linc

Ask Linc (`finsight`) is a personal-finance decision tool that combines connected accounts, deterministic financial calculations, and language-model analysis. Users can inspect their finances, ask follow-up questions about a decision, and see the data and assumptions behind an answer.

**Repository snapshot: September 14, 2026.** This README describes the implementation on `main` at that date. Runtime credentials, provider entitlements, and admin settings determine which integrations and models a deployment uses.

## Why it exists

A retirement or home-purchase decision spans cash flow, investments, liabilities, household context, and current rates. Those inputs usually live in different accounts and spreadsheets. Ask Linc assembles them into a shared financial snapshot, runs supported calculations in application code, and uses models to explain the implications and identify missing information. The engineering focus is keeping observed facts, calculated results, and hypothetical assumptions distinguishable and inspectable.

## Product surface

- **Decisions (`/app`):** financial Q&A with decision threads, follow-ups, streamed answers, structured result cards, ratings, and **Show the Math** evidence. A financial overview and market-news view provide context alongside the conversation.
- **Finances (`/finances`):** net worth, cash, investments, debt, home value, account groups, historical charts, income/expense overrides, and data-freshness or coverage notices.
- **Accounts & context (`/profile`):** Plaid and SnapTrade connections, eligible direct Public.com connections, manual accounts, holdings and transactions, category corrections, home valuations, remembered personal details, and subscription management.
- **Public calculators:** `/retirement-calculator` runs the retirement engine with disclosed allocation presets and user inputs; `/coast-fire-calculator` computes a deterministic savings target in the browser. Optional result emails are calculated again on the server. These are separate from authenticated analysis of actual holdings.
- **Operations and content:** admin views for answer quality, model/tone settings, data gaps, registry-source drift, marketing analytics, and calculator reporting; marketing/use-case pages and a Ghost-backed blog.

Stripe checkout, webhooks, and the customer portal support subscription access. The current pricing path resolves one configured Stripe price through `STRIPE_PRICE_DEFAULT`; Starter/Standard/Premium still exist in data-access and compatibility code. See [pricing resolution](src/config/stripe-pricing.ts) and [authentication](src/auth/middleware.ts).

## System overview

The repository contains two npm projects: an Express API and a Next.js web app, sharing PostgreSQL-backed application state through the API.

```mermaid
flowchart TD
    P[Plaid / SnapTrade / Public.com / manual accounts / RentCast] --> I[Financial ingestion and normalization]
    I --> C[Deterministic calculations and source-quality checks]
    C --> DB[(PostgreSQL: canonical snapshots, history, conversations, caches)]
    DB --> UI[Next.js financial views]
    Q[Question and active decision transcript] --> PLAN[OpenAI context preflight]
    PLAN --> PACK[Selected snapshot data packs]
    DB --> PACK
    PACK --> AUDIT[Claude constrained pack and query audit]
    AUDIT --> E[Final context and deterministic scenario execution]
    EXT[Market providers and validated public search] --> E
    E --> LLM[Claude answer / OpenAI fallback]
    LLM --> V[Deterministic grounding / optional Gemini review]
    V --> A[Answer and persisted evidence manifest]
    A --> UI
    A --> DB
```

### Financial data and calculations

[Financial ingestion](src/services/financial-ingestion.ts) collects provider observations. [Source merging](src/services/financial-calculations.ts), [canonical snapshots](src/services/canonical-financial-snapshot.ts), and the [financial-truth domain](src/domain/financial-truth.ts) establish the values consumed by financial views and AI context. [FinancialRevisionService](src/services/financial-revision-service.ts) coordinates recomputation after account/data mutations and coalesces overlapping requests per user within a process.

Key rules implemented in this path:

- Account identity includes the owner, source, connection, and provider account ID. Explicit supersession handles replaced connections and direct Public feeds; similar names or balances are insufficient identity.
- Investment totals reconcile account balances and deduplicated holdings without adding both. For a provider-held investment account, the greater of its balance and holdings value contributes to the total; unexplained balance value is reported as **Not itemized**.
- Cash-flow aggregation uses canonical transaction types and signed amounts. Pending activity, transfers, and investment trades are excluded from operating income/expenses; refunds reduce expenses. Unconverted currencies and unresolved transactions are reported and omitted from totals.
- Snapshots distinguish source observation time (`asOf`) from calculation time (`computedAt`) and retain `current`, `stale`, `partial`, or `unavailable` status. Recalculation does not make an old observation fresh. Unknown values remain unavailable rather than becoming zero.
- Financial history copies canonical values and observation times. Daily history follows the user's timezone; material balance-sheet changes can create separately identified observations.

### Deterministic calculations vs. model inference

| Application code owns | Models contribute |
| --- | --- |
| Balances, net worth, cash flow, allocation, coverage, and derived metrics | Selecting relevant context and interpreting the user's decision |
| Historical retirement simulations, withdrawal-rate solving, and registered what-if calculations | Extracting stated planning inputs and proposing typed scenario requests |
| Input bounds, formulas, units, provenance, freshness, and assumption disclosure | Explaining results, tradeoffs, missing information, and follow-up questions |
| Numeric grounding, retry/recovery rules, and evidence persistence | Drafting the structured answer and optional independent reasoning review |

The [scenario registry](src/scenarios/calculator-registry.ts) currently registers **retirement withdrawal planning** and **target-home affordability**. Retirement variants can change spending, contributions, retirement/withdrawal ages, horizon, and withdrawal policy. Home affordability computes purchase cash, mortgage payments, ownership costs, post-purchase cash flow, and reserve constraints. Missing taxes, insurance, or other necessary inputs produce qualified/incomplete results. Scenario assumptions and outputs remain answer-scoped; they do not overwrite the observed financial snapshot.

The historical `src/openai/` directory now handles multiple providers. [Model configuration](src/openai/model-config.ts) resolves admin overrides, supported environment overrides, then shipped defaults. Claude is the primary analysis provider; OpenAI runs context preflight, personal-context extraction, and answer fallback. The fallback reuses the prepared prompts. Gemini provides market-news synthesis and, when enabled and selected, a secondary reasoning review.

### Custom RAG, data packs, and validation

Retrieval-augmented generation (RAG) is implemented as application-owned data selection and public search. The current path uses typed packs, relational persistence, and provider caches; it has no vector-database dependency.

1. **Plan:** an OpenAI preflight reads the active decision transcript and proposes allowlisted packs, typed scenarios, and up to three standalone public-search queries.
2. **Audit:** the primary Claude model uses the constrained `request_data_packs` tool to accept or widen the selection and refine search/scenario plans. Application code validates IDs, dependencies, inputs, and access.
3. **Retrieve and calculate:** aggregate financial facts are always present. Optional packs cover account details, transactions, investments, monthly cash flow, personal context, home value, retirement analysis, market context, and search. The application loads the final projection and executes registered calculators.
4. **Ground:** canonical facts carry IDs, values, units, provenance, and applicable caveats. Local checks validate the fact pack and compare response numbers against it. Unsupported values can trigger wider retrieval and regeneration; persistently ungrounded passages are removed or replaced. Optional Gemini review evaluates reasoning separately.
5. **Inspect:** a conversation stores the structured answer and compact evidence manifest: facts, selected packs, search execution, scenario inputs/results, model calls, validation outcomes, and timings. Show the Math loads referenced supporting records on demand.

Public-search queries have length, purpose, freshness, and obvious-identifier checks. The raw user prompt is never substituted for a missing search plan. Brave results are URL-deduplicated and cached by query/freshness for 30 minutes; retrieval failure is recorded as unavailable evidence. Numeric grounding establishes consistency with supplied evidence, not the truth of every retrieved statement or model interpretation.

Remembered personal context is bounded to explicitly stated biographical fields such as age, location, household, and employment. Validated set/clear operations replace stale details; financial facts, goals, and scenario assumptions belong in canonical data or the active conversation.

Implementation: [context packs](src/openai/context-packs.ts), [analysis pipeline](src/openai/analysis-pipeline.ts), [canonical facts](src/openai/canonical-facts.ts), [response grounding](src/openai/response-facts.ts), [evidence loading](src/openai/show-the-math-db-service.ts). Design references: [context planning](docs/CONTEXT_PLANNING.md) and [scenario modeling](docs/SCENARIO_MODELING.md).

## Integrations and datasets

### Connected financial and market data

| Integration | Implemented use |
| --- | --- |
| [Plaid](src/plaid.ts) | Account linking, balances, transaction sync/webhooks, investments, and liability terms where supported/consented. Connection-scoped refresh and reconnect handling. |
| [SnapTrade](src/snaptrade.ts) | Brokerage connections, balances, positions, and investment activity. |
| [Public.com direct API](src/services/public-api/client.ts) | Eligible users with linked Public accounts can supply an encrypted personal API secret. The client reads accounts, portfolios, and unrealized tax lots, including managed-yield accounts that the SnapTrade feed cannot serve. Position-derived valuations retain their limitations. |
| [RentCast](src/services/rentcast.ts) | Home-value estimates and ranges, with manual overrides and age-based refresh. |
| [FRED](src/data/providers/fred.ts) | CPI year-over-year inflation (`CPIAUCSL`, `pc1`), effective federal funds (`DFF`), mortgage rates (`MORTGAGE30US`), credit-card rates (`TERMCBCCALLNS`), unemployment (`UNRATE`), 10-year Treasuries (`DGS10`), and national 12-month CD rates (`NDR12MCD`). Observations carry dates and units. |
| [Massive](src/data/providers/massive.ts) (formerly Polygon.io) | Delayed SPY daily bars, Treasury yield-curve data, and inflation expectations for macro context. `POLYGON_API_KEY` remains an alias. |
| [Tiingo](src/data/providers/tiingo.ts) | Adjusted end-of-day price history, IEX quotes, and news; used for security enrichment and market context. |
| [Financial Modeling Prep](src/retirement-analytics/data/providers/fmp-provider.ts) | Security/fund metadata, expense ratios, country allocations, and sector weights, with coverage and inference provenance. |
| [U.S. Treasury Fiscal Data](src/retirement-analytics/data/providers/treasury-provider.ts) | Auction records identify individual Treasuries, including TIPS and floating-rate notes, using CUSIPs or unambiguous coupon/maturity matches. |
| [Brave Search](src/data/providers/search.ts) | Per-question public rates/rules/news lookup and evidence for scheduled market-news summaries. |

These feeds have different publication, delay, cache, and entitlement constraints. An integration in the repo does not imply complete institution/security coverage or uniformly live prices.

### Historical retirement data and fund registry

The simulation engine reads checked-in [monthly returns](data/historical_market_returns.csv); it does not fetch live market returns to run a historical sequence. [Dataset metadata](data/historical_market_returns.metadata.json) and the [source manifest](src/datasets/source-manifest.json) record vintages, observation ranges, retrieval dates, and SHA-256 hashes.

| Series | Source and checked-in coverage |
| --- | --- |
| U.S. equities and cash | Kenneth French broad-market total return (`Mkt-RF + RF`) and one-month Treasury-bill return; July 1926–June 2026 |
| International equities | Kenneth French EAFE-plus-Canada USD returns; January 1975–December 2025 |
| Nominal bonds and inflation | Shiller-derived synthetic 10-year U.S. government-bond total returns and monthly CPI changes; July 1926–June 2026 in the unified dataset |
| TIPS | Synthetic constant-maturity total returns derived from FRED `DFII10` real yields and CPI; February 2003–June 2026 |

The unified file has 1,200 monthly rows. The [current engine](src/retirement-analytics/engine/stress-tester.ts) defaults to a disclosed **proxy** policy: U.S. equity returns stand in outside the international series' coverage, and nominal-bond returns stand in before TIPS coverage. Those substituted months contain neither distinct international behavior nor TIPS inflation protection. A `truncate` policy restricts analysis to available active-series history; the engine still requires a complete requested horizon and its minimum historical window. Rolling monthly windows overlap: survival shares are historical outcomes, not independent probability estimates.

[Portfolio mapping](src/retirement-analytics/engine/portfolio-mapper.ts) records supported exposures, inference/proxy provenance, modeled and unmodeled value, and coverage. Credit, international bonds, real assets, and unresolved exposures can remain outside simulation. Missing itemized holdings are not assigned invented returns.

The dated [target-date fund registry](src/services/target-date-fund-registry.ts) supplies reviewed allocations for specific State Street Target Retirement vintages, BlackRock LifePath Index 2040, and UC Pathway 2040. Entries distinguish allocation dates from verified availability dates, identify exact versus proxy share classes, and retain source fingerprints and unsupported residuals. Recognition of a fund name alone does not authorize an allocation.

```bash
npm run build:market-dataset     # Rebuild from checked-in source snapshots
npm run refresh:market-datasets # Download/validate sources, update manifests, rebuild
```

Dataset refresh changes versioned analytical inputs; review the generated diff. Older design documents describe earlier TIPS/short-series policies; the engine linked above defines current behavior.

## Stack, operations, and delivery

- **Backend:** Node.js/TypeScript, Express 5, Prisma 6, PostgreSQL; JWT authentication and bcrypt password hashing. CI uses Node 20 and PostgreSQL 16.
- **Web:** Next.js 15.5.12 App Router, React 19.1.2, TypeScript, Tailwind CSS 3, Radix primitives, Recharts/Chart.js, and Markdown rendering.
- **Persistence:** Prisma models cover connections, accounts, transactions, canonical snapshots/history, conversations/evidence, retirement analyses, market/security caches, subscriptions, and calculator leads. Profile context and direct Public credentials use AES-256-GCM; selected financial context is sent to the configured AI providers.
- **Supporting services:** Stripe billing; Resend transactional/result emails; MailerLite subscriber/lead sync; Ghost blog content. GA4 browser and Measurement Protocol events plus GA4 BigQuery reporting adapters support marketing analysis. These paths require their own configuration.
- **Scheduled work:** the web process schedules market-news refresh every four hours, reusing one evidence batch across tiers, and MailerLite sync at 03:00 America/New_York. [The external financial-refresh script](scripts/refresh-transactions.js) handles transaction, home-value, and snapshot refresh with a database lease and recorded job status; its Render schedule is configured outside this repo.
- **Observability:** Sentry backend/frontend instrumentation, provider and LLM latency/failure metrics, privacy scrubbing, answer-quality reports, and `/health` plus `/health/cron`. `/health` reports process health; it is not a database-readiness assertion. See [backend instrumentation](src/instrument.ts) and [observability modules](src/observability).
- **Deployment:** GitHub Actions targets Vercel for `frontend/` and Render for the API. [The main workflow](.github/workflows/ci-cd.yml) runs lint/type checks, backend coverage, PostgreSQL-backed integration and security suites, frontend tests/build, and retirement-example verification. Dependency audit reports currently use a non-blocking vulnerability threshold. Production migration is a separate guarded job using the `production` environment, followed by frontend deployment and a Render deploy-hook request. [Vercel's direct Git deployments are disabled](frontend/vercel.json).
- **Other workflows:** [marketing-only fast deploy](.github/workflows/fast-deploy.yml) checks the changed-file allowlist; [weekly registry drift](.github/workflows/registry-drift.yml) checks reviewed fund sources; content workflows handle [Soro-to-Ghost sync](.github/workflows/sync-soro-blog.yml) and [social drafts](.github/workflows/social-posts.yml).

Build scripts generate Prisma and compile code; production schema changes belong to the guarded migration path, not application builds. Hosting secrets, environment approval rules, and actual service health require deployment-side verification.

## Local development

### 1. Install and start PostgreSQL

Use Node 20 to match CI, npm, and PostgreSQL 16 (native or Docker Compose).

```bash
git clone https://github.com/ethanteng/finsight.git
cd finsight
npm ci
npm ci --prefix frontend
docker compose up -d db
```

The checked-in Compose service exposes PostgreSQL on **localhost:5433**. Its first-run initialization creates `finsight` with local credentials `postgres` / `postgres`. Adjust the URL if using an existing/native database.

### 2. Configure the applications

Create **`.env.local` at the repository root**. [Backend initialization](src/instrument.ts) loads this file outside production; production uses injected environment variables.

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/finsight"
PORT="3000"
FRONTEND_URL="http://localhost:3001"
JWT_SECRET="replace-with-a-random-local-secret"
PROFILE_ENCRYPTION_KEY="replace-with-base64-encoded-32-random-bytes"
ENABLE_USER_AUTH="true"
ENABLE_TIER_ENFORCEMENT="true"
PLAID_MODE="sandbox"
SNAPTRADE_MODE="sandbox"
OPENAI_API_KEY="local-placeholder"
```

Generate an encryption key with `openssl rand -base64 32` and a separate JWT secret with `openssl rand -hex 32`. Keep those values stable for the local database. The OpenAI client is constructed during module loading, so a nonempty placeholder is needed even for non-AI development; it cannot perform real inference. Full Ask Linc analysis needs real OpenAI and Anthropic keys, plus credentials for the external evidence you exercise.

Create **`frontend/.env.local`**:

```dotenv
NEXT_PUBLIC_API_URL="http://localhost:3000"
```

Add backend credentials only for the features you need:

| Feature | Configuration |
| --- | --- |
| Analysis/planning | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`; optional `OPENAI_FALLBACK_MODEL`, `ASK_LINC_MAX_OUTPUT_TOKENS` |
| Gemini | `GOOGLE_AI_API_KEY` or `GEMINI_API_KEY`; optional `GEMINI_MARKET_SYNTHESIS_MODEL`. Secondary review additionally uses `ENABLE_RESPONSE_VALIDATION=true` and optional `GEMINI_VALIDATION_MODEL`. |
| Plaid | `PLAID_CLIENT_ID`, `PLAID_SECRET`; optional `PLAID_WEBHOOK_URL`. Production mode supports `PLAID_CLIENT_ID_PROD`, `PLAID_SECRET_PROD`, `PLAID_ENV_PROD`. |
| SnapTrade | `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`; production mode supports their `_PROD` variants and `SNAPTRADE_ENV_PROD`. |
| Direct Public connection | `ENCRYPTION_KEY` or `DATA_ENCRYPTION_KEY` containing a base64-encoded 32-byte key; the user's Public secret is entered through the eligible profile UI. |
| Market data/home values | `FRED_API_KEY`, `MASSIVE_API_KEY` (or `POLYGON_API_KEY`), `TIINGO_API_KEY`, `FMP_API_KEY`, `RENTCAST_API_KEY` |
| Search | `SEARCH_API_KEY`, `SEARCH_PROVIDER=brave`; `BRAVE_MIN_REQUEST_INTERVAL_MS` controls provider pacing. The Google alternative uses `GOOGLE_SEARCH_ENGINE_ID`. |
| Billing | Stripe **test-mode** `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_DEFAULT` |
| Email/subscriber sync | `RESEND_API_KEY`, `ADMIN_EMAILS`, `MAILER_LITE_API_KEY`, `MAILER_LITE_GROUP_ID`; `EMAIL_ASSET_BASE_URL` for publicly reachable email images |
| Monitoring/analytics | Backend `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`; optional `GA4_MEASUREMENT_ID`, `GA4_API_SECRET` for server-side conversion reporting |

Optional frontend configuration includes `GHOST_URL` / `GHOST_CONTENT_KEY`, `NEXT_PUBLIC_GA_ID`, and `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`. Sentry source-map upload uses build-only `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN`. Provider secrets belong on the server, never in `NEXT_PUBLIC_*` variables.

### 3. Initialize the local schema and run

Prisma CLI does not automatically load the backend's `.env.local`; export the **local** database URL in the shell used for schema commands.

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/finsight"
npx prisma generate
npx prisma db push
npm run dev
```

`db push` initializes a disposable local schema; use reviewed migrations for deployment. `npm run dev` starts **both** servers: API at `http://localhost:3000`, web at `http://localhost:3001`. To run them separately, use `npm run dev:backend` and `npm run dev:frontend`.

Check `http://localhost:3000/health`, then use the registration/login flow. Connected accounts, AI answers, result emails, and checkout each need the relevant service configuration; an unconfigured local session is not a complete product smoke test.

### API entry points

The authenticated analysis route is [defined here](src/routes/ask.ts):

```http
POST /ask/display-real
Authorization: Bearer <token>
Content-Type: application/json

{"question":"What changes if I retire two years later?","threadId":"my-decision-id"}
```

Use the same `threadId` for follow-ups and a new ID for a new decision. Add `Accept: text/event-stream` for progress and answer deltas; the final `result` event contains the validated answer. Financial reads are mounted under `/api/finances`, account management under `/api/accounts` and `/api/manual-accounts`, and authentication under `/auth`.

## Verification

Run suites according to their scope; `npm test` uses the root Jest configuration (unit/performance selection), not every integration/security suite. Before backend tests, point **both `DATABASE_URL` and `TEST_DATABASE_URL` at a separate disposable test database** and use the test environment from [the CI workflow](.github/workflows/ci-cd.yml). Even the unit-test setup clears database tables.

```bash
npm run type-check
npm run test:unit
npm run test:integration:ci
npm run test:security:all
npm test --prefix frontend -- --ci
OPENAI_API_KEY=local-placeholder npm run eval:llm
npm run build:backend
npm run build --prefix frontend
```

`eval:llm` exercises deterministic grounding/recovery with supplied snapshots and model-output fixtures, not live-model quality; its imports still need a nonempty OpenAI key. `test:gpt-smoke` is a separate real-OpenAI check requiring a working key. See [test guidance](docs/TESTING.md), [test environment notes](docs/TESTING_ENVIRONMENT_VARIABLES.md), and the executable CI workflow for suite wiring.

## Repository map and extension points

```text
frontend/                 Next.js app, components, browser utilities, frontend tests
src/index.ts              Express entry point, route mounting, scheduled web-process jobs
src/auth/, src/routes/    Authentication, financial APIs, analysis, billing, calculators
src/domain/               Financial meanings, arithmetic contracts, time semantics
src/services/             Ingestion, revisions, persistence, integrations, business logic
src/openai/               Multi-provider planning, data packs, prompts, grounding, evidence
src/scenarios/            Registered deterministic what-if calculators
src/retirement-analytics/ Historical engine, holdings mapping, security data providers
src/data/, src/market-news/ Market retrieval, caching, scheduled context synthesis
src/profile/              Bounded personal memory and encryption
src/observability/        Provider/LLM metrics and Sentry privacy controls
src/marketing-analytics/  Funnel/traffic analysis and reporting adapters
src/__tests__/            Backend test suites
specs/                    Implemented and proposed feature specifications
src/evals/                Deterministic answer-quality fixtures
src/datasets/, data/      Source snapshots, generated historical returns, provenance
prisma/                   Database schema and migrations
scripts/                  Dataset, build, refresh, verification, and operations utilities
.github/workflows/        CI, deployment, registry checks, and content workflows
docs/                     Design, setup, operations, and feature references
```

New scenario domains belong in the calculator registry with validated inputs, deterministic execution, canonical facts, and evidence disclosure. [Scenario modeling](docs/SCENARIO_MODELING.md#next-registered-calculators) records candidate next domains—career/income changes, debt payoff, allocation/downturn scenarios, and savings goals. They are documented extension plans, not additional registered calculators or release commitments.

## License

This project is proprietary software. All rights reserved. This software and its documentation are owned by the project maintainer and may not be reproduced, distributed, or used without explicit permission.
