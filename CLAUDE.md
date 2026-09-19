# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run dev              # Start both backend (port 3000) and frontend (port 3001)
npm run dev:backend      # Backend only
npm run dev:frontend     # Frontend only (next dev -p 3001)
npm run dev:sandbox      # Dev with Plaid sandbox data
npm run dev:production   # Dev with production data
```

### Build
```bash
npm run build            # Standard build
npm run build:backend    # Backend TypeScript + Prisma generation
npm run build:render     # Production build for Render deployment
```

### Test
```bash
npm test                         # All tests
npm run test:unit                # Unit tests only
npm run test:integration         # Integration tests
npm run test:security            # Security tests
npm run test:coverage            # Coverage report
npm run test:like-cicd           # Full CI/CD test suite
npm run test:enhanced-market-context  # Market context tests
npm run eval:llm                 # Deterministic Ask Linc quality evaluation
```

Run a single test file:
```bash
npx jest path/to/test.test.ts
npx jest --testNamePattern="test name"
```

### Lint & Type Check
```bash
npm run test:lint        # Check linting
npm run lint:fix         # Fix linting issues
npm run type-check       # TypeScript type check (no emit)
```

### Database
```bash
npx prisma migrate dev           # Run migrations in development
npx prisma generate              # Regenerate Prisma client
npx prisma studio                # Open Prisma Studio UI
```

## Architecture

**Ask Linc** is an AI-powered personal financial analysis platform. The backend is Express.js/TypeScript (port 3000) and the frontend is Next.js 15 with App Router (port 3001). PostgreSQL is the database, accessed via Prisma ORM.

### Backend (`/src/`)

The main entry point is `src/index.ts`; user-facing Ask routes are isolated in `src/routes/ask.ts`. Key subdirectories:

- **`auth/`** — JWT auth, middleware (`optionalAuth`, `requireAuth`, `adminAuth`), encrypted user service, Resend email, SnapTrade auth, manual accounts
- **`data/`** — Data orchestration (`orchestrator.ts`), caching, persistence, and external data providers: FRED economic indicators (`providers/fred.ts`), Brave Search API for RAG (`providers/search.ts`), Massive macro data (`providers/massive.ts`), and Tiingo Power quotes/news/adjusted prices (`providers/tiingo.ts`)
- **`openai/`** — Canonical AI pipeline: semantic context planning, primary-model data-pack tools, canonical facts, structured prompting, provider fallback, deterministic grounding, and lazy evidence
- **`services/`** — Business logic split into financial ingestion, calculations, snapshot/source persistence, profile/market services, billing, and integrations
- **`profile/`** — Bounded personal-context extraction, merging, home metadata, and encryption
- **`security/`** — AI rate limiting, prompt validation, output validation, security logging
- **`routes/`** — Ask, AI diagnostics, performance, and Stripe routes
- **`retirement-analytics/`** — Retirement planning calculations
- **`market-news/`** — Financial news aggregation

Key standalone files in `src/`:
- `plaid.ts` (139KB) — Plaid banking API integration (all Plaid routes)
- `snaptrade.ts` (25KB) — SnapTrade investment API

### Frontend (`/frontend/src/`)

Next.js App Router structure:
- **`app/`** — Pages and layouts. Protected area under `/app/*` (dashboard and finances). Marketing pages are at the root level (blog, features, FAQ, etc.)
- **`components/finances/`** — Financial overview, charts, analysis UI
- **`components/transactions/`** — Transaction display and filtering
- **`components/ui/`** — Reusable UI primitives (built on Radix UI + Tailwind)

### Data Flow

```
Plaid/SnapTrade → financial-ingestion.ts → financial-calculations.ts
                                      → financial-snapshot-persistence.ts
                                      → openai/context-planner.ts (semantic packs + search-query preflight)
                                      → openai/context-service.ts (local context; web search deferred)
                                      → Claude request_data_packs + query audit
                                      → validated Brave retrieval (only when selected)
                                      → deterministic scenario runner (when requested)
                                      → financial-reasoning-prompt.ts
                                      → Claude/OpenAI fallback
                                      → deterministic response validation → user
```

`contextPlanner` refers to the two-pass subsystem documented in `docs/CONTEXT_PLANNING.md`: the OpenAI `contextPlanner` model slot proposes the initial packs and standalone public search queries, and the configured Primary analysis model may widen the packs or refine the query plan through a constrained tool before retrieval and answer generation. Data-pack or search routing must not be rebuilt from question keywords or regular expressions, and the raw user prompt must not be used as a search-query fallback.

Supported what-if calculations run in application-owned scenario calculators after context planning. Models may identify a typed scenario request, but they do not compute outcomes. See `docs/SCENARIO_MODELING.md`.

Both public calculator pages draw the same line. `/retirement-calculator` and `/coast-fire-calculator` compute every figure deterministically and call a model only to write the plain-language reading of that result. The reading's figures are checked against the engine's and a mismatch is logged, but the check does not gate: these pages are free and unauthenticated, and a reading that states a number the engine did not produce is shown rather than withheld, because an empty panel was judged the worse outcome. The prompt is the only thing asking the model to stay inside the fact block. A reading is dropped only when the model returns nothing usable. Both run with no user, no snapshot and no conversation history. The grounding, the retry budget and the model call are shared in `src/services/calculator-interpretation.ts`; each page supplies only its own facts and prompt. Everything a fact shows the model is a number the model may then write — labels and dates included — which is why published-rate labels carry no digits. See `docs/RETIREMENT_QUICKPLAN.md` and `docs/COAST_FIRE_EMAIL_CAPTURE.md`.

Coast FIRE's reading has one rule the quick plan's does not need: reaching the number is a fact about one straight-line projection, never permission to stop contributing, and the formula produces no probability to report.

A visitor can save a run from either calculator to a new account. Asking for it sends the results email, whose link goes to signup with their address prefilled, and takes the visitor straight there as well rather than making them wait on their inbox; on registration the run is written as the account's first decision from the stored lead rather than a fresh run. The lead's address must match the registering one — a token is the only key to a lead, and a lead holds someone's retirement figures.

Only the emailed route skips the emailed verification code, and the difference is the point. Following a link sent to an address proves what the code proves. A token handed back to the page that asked for the email proves nothing — whoever typed the address received it, theirs or not — so the server stamps `tokenDisclosedAt` on a lead before returning its token and withholds the skip from it. That lead still seeds the first decision; it just does not verify the address. The decision is made server-side from the row, before the account exists, so no client can declare itself verified, and every other registration verifies by code. A signup that skips the code also skips the sign-in form: `/auth/register` returns a usable session, and `/app` re-verifies the token and the subscription on mount. Every other signup still verifies by code, then enters `/app` on that same registration session rather than signing in again. Both calculators mint tokens from the same space, so `resolveCalculatorLead` tries each leads table in turn rather than asking the client which calculator it came from.

### Remembered personal context

“What Linc remembers about you” is a bounded, field-level memory of user-stated biographical details such as age, location, household, and employment. It is encrypted at rest. Financial facts, goals, risk tolerance, and scenario assumptions belong to canonical data or active conversation context and must not be added to this memory. The extractor emits validated set/clear operations; it never appends free-form summaries.

### Marketing list membership

Three paths put an address in MailerLite, and they are not interchangeable.
`mailerlite-sync` re-posts the entire user table into `MAILER_LITE_GROUP_ID`
nightly. The two calculator `email-results` endpoints subscribe a visitor who
asked for results by email, into that calculator's group. Registration
subscribes a no-card signup immediately into `MAILER_LITE_TRIAL_GROUP_ID`,
plus the calculator's group when the signup continued from one — a resolved
lead token names the calculator, and a click-through from the page declares it
in `signupOrigin`, which the server allowlists and a resolved lead outranks.
Paid checkouts are left to the nightly sync. Every one of these runs after the
response and cannot fail or delay the request it follows.

Registration deliberately does not wait for the verification code. The address
joins the list before anyone proves they own it — the same set of addresses the
nightly sync has always sent, just sooner — and the verification mail's security
note is written to match rather than promising otherwise. Gating this on
`/auth/verify-email` was considered and declined.

### Tier System

Starter / Standard / Premium tiers control feature access. Tier checks are embedded throughout routes and services (not a centralized middleware). Stripe handles subscriptions.

An admin-created account — no Stripe subscription, `subscriptionStatus` `inactive` — reads as full access with no end to it. The admin panel can put an end date on one by converting it to a real Stripe trial (`/admin/user-trial`), because nothing here expires an account on a date: the only live gate blocks `canceled`, and Stripe is what produces that status when a trial with no payment method runs out. See `docs/admin/ADMIN_TRIALS.md`.

### Multi-AI Support

The platform supports OpenAI (GPT-4), Anthropic (Claude), and Google (Gemini) with intelligent model selection. The `openai/` directory name is historical — it handles all AI providers.

### External Integrations

| Service | Purpose |
|---|---|
| Plaid | Bank account/transaction data |
| SnapTrade | Investment portfolio data |
| FRED | Economic indicators and published rate benchmarks |
| Massive (formerly Polygon.io) | Delayed SPY daily movement, Treasury yield curve, and inflation expectations |
| Financial Modeling Prep Starter | Fund metadata and normalized expense, country, and sector exposure data |
| Tiingo Power | Adjusted price history, batched IEX quotes, and market news |
| RentCast | Home valuation |
| Brave Search | RAG for real-time financial info |
| Stripe | Subscription billing |
| MailerLite | Email marketing (subscribe on no-card signup; daily sync at 3 AM EST) |
| Resend | Transactional email |
| Sentry | Error tracking (frontend + backend) |

### Deployment

- **Frontend**: Vercel
- **Backend**: Render (use `build:render` script)
- **Database**: PostgreSQL on Render
- **CI/CD**: GitHub Actions (`.github/workflows/ci-cd.yml`)
