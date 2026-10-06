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

Ask Linc answers first, for every user: it gives the most useful answer the linked data, the user's own stated figures (from any of their messages in the decision) and named, disclosed assumptions support, and closes on what one specific link would change about that answer. Not linked is never zero: `snapshot.linkedData` records what is linked by kind, a total or cash-flow figure for an unlinked kind is unknown rather than a fact, and no calculator reads it as a balance. Where an input is missing and something real can stand in (the conventional retirement age, current spending from cash flow, the user's earlier figure), the application fills it and says so; the model still never estimates a number. The closing note is server-authored from the question's data needs and the planner's `personalDataQuestion` flag; the model does not write its own "link your accounts" line. See `docs/ANSWER_FIRST.md`.

A retirement question from an account with no holdings linked is still answered. Coast FIRE runs from the figures the user states, plus a market-history test of those savings on a disclosed preset mix, and a stated retirement plan runs the public retirement calculator's engine on a disclosed preset mix while the holdings-based projection cannot run (nothing linked, or nothing linked it can simulate), giving way to Coast FIRE when both are asked for. The answer closes on what linking would add to the answer just given, not on a refusal. This is what every calculator lead's first follow-up hits. See "Before anything is linked" in `docs/SCENARIO_MODELING.md`.

The public calculators compute every figure deterministically. Only `/retirement-calculator`'s published-rates mode, which has no personal run to save, still calls a model, and only to write the plain-language reading of that result. The reading's figures are checked against the engine's and a mismatch is logged, but the check does not gate: the page is free and unauthenticated, and a reading that states a number the engine did not produce is shown rather than withheld, because an empty panel was judged the worse outcome. The prompt is the only thing asking the model to stay inside the fact block. A reading is dropped only when the model returns nothing usable. It runs with no user, no snapshot and no conversation history. The grounding, the retry budget and the model call live in `src/services/calculator-interpretation.ts`. Everything a fact shows the model is a number the model may then write — labels and dates included — which is why published-rate labels carry no digits. See `docs/RETIREMENT_QUICKPLAN.md`.

Neither calculator shows its answer on the page. The goal is for visitors to experience the value inside Ask Linc, not in a calculator outside it. A run renders a locked card and an email form; submitting it stores the lead, sends a "result ready" email that states no figures, and takes the visitor straight to signup with their address prefilled, where a password is all that stands between them and the run as their account's first decision. The signup page states no result either. The page never shows a run's result, whatever happens next (the retirement page's published-rates mode has no run to save and is shown). A lead that does not store is a 503 and the visitor retries; nothing is emailed. An address that already has an account cannot register again: it gets the same figure-free email, linked through `/<calculator>/continue?to=sign-in` (the handover cookie is scoped to `/login` there), and the page sends it to `/login?source=<calculator>`; either way `POST /auth/calculator-lead` attaches the run to the account after sign-in and `/app` opens on it. No email states the answer. A visitor already signed in as that address is attached the same way and taken straight to `/app`. Attaching is idempotent per account and lead token — `Conversation.calculatorLeadToken` carries a unique index with `userId`, which seeding at registration also writes — and needs the lead's address to match the account's. A failed account lookup counts as a new address: signup's 409 recovers a real account to sign-in with the run. This is a nudge, not a control: the figures reach the browser either way. See "The answer opens in Ask Linc" in `docs/COAST_FIRE_EMAIL_CAPTURE.md`.

On registration the run is written as the account's first decision from the stored lead rather than a fresh run. The lead's address must match the registering one — a token is the only key to a lead, and a lead holds someone's retirement figures.

Any resolved calculator lead skips the verification code when the signup page sends `acceptsFirstDecisionHandoff` (an older page that cannot open `/app` on it still gets a code), and `/auth/register` reports `firstDecisionPending` so the client opens `/app` instead of `/verify-email`. That is a choice about friction, not proof, and `emailVerified` records the difference. Following a link sent to an address proves what the code proves, so the emailed route is stored as verified. A token handed back to the page that asked for the email proves nothing — whoever typed the address received it, theirs or not — so the server stamps `tokenDisclosedAt` on a lead before returning its token, and a signup with a stamped lead is stored unverified. Nothing server-side gates on `emailVerified`, and the verify page has always offered "Skip for now", so the code never guarded the workspace; the owner of an address can reclaim an account by resetting its password. The decision is made server-side from the row, before the account exists, so no client can skip the code or declare itself verified, and every other registration verifies by code. A signup that skips the code also skips the sign-in form: `/auth/register` returns a usable session, and `/app` re-verifies the token and the subscription on mount. Every other signup still verifies by code, then enters `/app` on that same registration session rather than signing in again. Both calculators mint tokens from the same space, so `resolveCalculatorLead` tries each leads table in turn rather than asking the client which calculator it came from.

### Remembered personal context

“What Linc remembers about you” is a bounded, field-level memory of user-stated biographical details such as age, location, household, and employment. It is encrypted at rest. Financial facts, goals, risk tolerance, and scenario assumptions belong to canonical data or active conversation context and must not be added to this memory. The extractor emits validated set/clear operations; it never appends free-form summaries.

### Cash flow (beta)

`/cash-flow` shows cash in (canonical income) and cash out (canonical spending) across cash accounts and credit cards, with a forecast from `src/cash-flow/`: recurring streams found in the user's history, a typical daily rate for everything else, and the user's planned events. Card purchases count when made; card payments and transfers are neither, so card payoff lives in the cash-position view (`src/cash-flow/position.ts`) and the card model (`src/cash-flow/cards.ts`), which projects each card's balance and interest at the usual pace and under the user's payoff plans. The cash position can be read for any set of cash accounts. Every flow lands in one account: a recurring stream in the one it was seen in (a payee seen in two accounts at once, like a split paycheck, is a stream in each), planned income and expenses in the one the user chose, a card's payments in the account that has paid it, and anything without an account in the primary account where pay lands. So the accounts always add up to the whole. Where a card's interest is projected, its historical interest charges are taken out of what the savings forecast learns, so interest is counted once. The `cash_flow_forecast` data pack runs the same engine and publishes every figure an answer could quote as a fact — projections carry `forecast` provenance and a caveat — because the model may not add or net facts. Months before the connected history begins are unknown, not zero. The user can move items in and out of what the forecast counts (`src/cash-flow/adjustments.ts`): a payee left out, a one-off counted, a stopped item kept, a transfer left out. These change only what the forecast learns from, never the history; something that is not really income or spending is a category change instead, which corrects history everywhere. The month the forecast expects before planned events (`expectedMonthly`, exactly the override on an overridden side) is the app's expected monthly income and expenses: the Finances page shows it, and every Ask Linc question carries it as facts beside the observed averages, so forward-looking answers and the home-affordability calculator plan with it. The cash flow page splits that expected month's spending by category (`expectedSpendingByCategory`, the report's `usualSpending`), adding up to it; a spending override has no breakdown, since it says how much but not on what. Those averages count only months the history covers in full; the month the history starts partway through and the month in progress never enter one. See `docs/CASH_FLOW_FORECAST.md`.

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

Registration writes that same shape, then (before the 201, when `STRIPE_SECRET_KEY` is set) runs the exact grant "Convert to trial" does with its 30-day default, so a no-card signup is Trialing by the time the client gets its token; a failure is caught and leaves the account indistinguishable from an admin-created one. `upgradeAction` in `getUserSubscriptionStatus` is the one place that decides what the signed-in header's "Upgrade your account" CTA does — neither header re-derives the rule from a status string, and both fail closed, including on a value the build does not recognise. It is not the inverse of `upgradeRequired`, which means access is already denied and paying is the way back in.

Two accounts have full access without paying for it, and they need different things:

- `checkout` — the no-card signup shape above. No Stripe customer, no subscription to duplicate, so Checkout is the whole story.
- `billing_portal` — a trial that collects no card, which is what `/admin/user-trial` grants. Its access genuinely stops at `trial_end`, so it needs the prompt most, but Checkout is the wrong answer: a second Checkout on the same customer mints a second subscription beside the first rather than converting it, and the card it saves also defeats the `missing_payment_method: cancel` that was meant to end the trial, so Stripe bills both. `create-checkout-session` refuses such an account outright (409 `ALREADY_SUBSCRIBED`). Adding a payment method to the subscription that already exists converts it in place, keeps the granted end date, and bills once.

Whether a trial has a card cannot be answered locally, and the Stripe metadata does not answer it either — `autoSyncSubscriptionTier` rewrites `source: 'admin_trial'` to `'web_checkout'` on the first webhook. So `subscriptionHasPaymentMethod` asks Stripe, for trialing subscriptions only, reading the same four fields Stripe resolves for `missing_payment_method`: the subscription's `default_payment_method`, then its legacy `default_source`, then the customer's `invoice_settings.default_payment_method`, then the customer's `default_source`. An unreachable Stripe means no CTA: prompting someone who already pays is worse than missing someone who does not. A trial that already has a card (or a legacy source Stripe will still charge) is converting on its own and is offered nothing, as is an account that is already paying. Operator emails in `ADMIN_EMAILS` are excluded from both paths; a comped account belonging to someone else cannot be, because nothing in the database marks it.

Both destinations are forwarding pages opened in a new tab — `/subscribe` for checkout, `/billing` for the portal. Neither kind of Stripe session has a durable URL, and minting one before opening a tab is what popup blockers stop, so a plain link to a page that mints on mount is the only form that is both reliable and works from the session: `/subscribe` sends the stored token so the server fills `customerEmail` itself, and `/billing` sends it so the server resolves the Stripe customer itself. Neither trusts anything the client says about identity, and both refuse to forward to a host that is not the Stripe one they expect.

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
