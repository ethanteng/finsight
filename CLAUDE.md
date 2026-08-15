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
npm run test:dual-data           # Privacy/tokenization system tests
npm run test:enhanced-market-context  # Market context tests
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

The main entry point is `src/index.ts` (~4,200 lines) — a monolithic Express server containing most route definitions. Key subdirectories:

- **`auth/`** — JWT auth, middleware (`optionalAuth`, `requireAuth`, `adminAuth`), encrypted user service, Resend email, SnapTrade auth, manual accounts
- **`data/`** — Data orchestration (`orchestrator.ts`), caching, persistence, and external data providers: FRED economic indicators (`providers/fred.ts`), Alpha Vantage market data, Brave Search API for RAG (`providers/search.ts`)
- **`openai/`** — AI pipeline: `context-service.ts` manages conversation context, `prompt-builder.ts` (76KB) constructs prompts, `analysis-pipeline.ts` runs Claude-based analysis, `claude-client.ts` wraps the Anthropic SDK
- **`services/`** — Business logic: `financial-data-service.ts` (116KB, core financial calculations), `anonymization-service.ts` / `deanonymization-service.ts` (privacy tokenization), `stripe.ts`, `mailerlite-sync.ts`, `rentcast.ts`
- **`profile/`** — User profile orchestration, anonymization, enrichment, encryption
- **`security/`** — AI rate limiting, prompt validation, output validation, security logging
- **`routes/`** — Additional route modules: `ai.ts`, `stripe.ts`
- **`retirement-analytics/`** — Retirement planning calculations
- **`market-news/`** — Financial news aggregation

Key standalone files in `src/`:
- `plaid.ts` (139KB) — Plaid banking API integration (all Plaid routes)
- `snaptrade.ts` (25KB) — SnapTrade investment API
- `privacy.ts` (28KB) — Core privacy/tokenization logic

### Frontend (`/frontend/src/`)

Next.js App Router structure:
- **`app/`** — Pages and layouts. Protected area under `/app/*` (dashboard and finances). Marketing pages are at the root level (blog, features, FAQ, etc.)
- **`components/finances/`** — Financial overview, charts, analysis UI
- **`components/transactions/`** — Transaction display and filtering
- **`components/ui/`** — Reusable UI primitives (built on Radix UI + Tailwind)

### Data Flow

```
Plaid/SnapTrade → data/orchestrator.ts → services/financial-data-service.ts
                                       → openai/context-service.ts
                                         → openai/prompt-builder.ts
                                         → Claude/GPT → response-validator.ts → user
```

### Privacy (Dual-Data System)

A core architectural concern: real user data is **tokenized** before being sent to AI models. `privacy.ts` and `services/anonymization-service.ts` replace real names/values with tokens; `services/deanonymization-service.ts` reverses this for display. This tokenization is pervasive — any AI-facing code goes through anonymization.

### Tier System

Starter / Standard / Premium tiers control feature access. Tier checks are embedded throughout routes and services (not a centralized middleware). Stripe handles subscriptions.

### Multi-AI Support

The platform supports OpenAI (GPT-4), Anthropic (Claude), and Google (Gemini) with intelligent model selection. The `openai/` directory name is historical — it handles all AI providers.

### External Integrations

| Service | Purpose |
|---|---|
| Plaid | Bank account/transaction data |
| SnapTrade | Investment portfolio data |
| FRED | Economic indicators |
| Alpha Vantage | Market data |
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
