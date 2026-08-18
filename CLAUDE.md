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
- **`profile/`** — User profile orchestration, enrichment, and encryption
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

### Profile protection

User profiles are encrypted at rest. The removed tokenization/de-tokenization stack is not part of the current analysis path; context selection limits model input to what each question requires.

### Tier System

Starter / Standard / Premium tiers control feature access. Tier checks are embedded throughout routes and services (not a centralized middleware). Stripe handles subscriptions.

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
| MailerLite | Email marketing (daily sync at 3 AM EST) |
| Resend | Transactional email |
| Sentry | Error tracking (frontend + backend) |

### Deployment

- **Frontend**: Vercel
- **Backend**: Render (use `build:render` script)
- **Database**: PostgreSQL on Render
- **CI/CD**: GitHub Actions (`.github/workflows/ci-cd.yml`)
