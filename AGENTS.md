# AGENTS.md

General development commands (dev/build/test/lint, DB, architecture) are documented in `CLAUDE.md` and `README.md`. Refer to those first.

## Cursor Cloud specific instructions

This project is **Ask Linc** (`finsight`): an Express/TypeScript backend (port **3000**) plus a Next.js frontend (port **3001**), backed by PostgreSQL via Prisma. Dependencies (`npm install` at root and in `frontend/`, plus `npx prisma generate`) are refreshed automatically by the startup update script — do not re-run those unless something is broken.

### Starting services (not handled by the update script)

- **PostgreSQL is installed natively (apt) but is NOT auto-started on boot.** Start it each session before running the backend:
  ```bash
  sudo pg_ctlcluster 16 main start
  ```
  It listens on `localhost:5432` with `postgres` / `postgres` and database `finsight` (connection string already in `.env.local`). Note this differs from `docker-compose.yml` (which expects port 5433) — there is no Docker in this environment, so the native cluster on 5432 is used instead and `scripts/start-db.sh` will not work here.
- If the `finsight` DB is empty or was reset, apply the schema with `npx prisma db push` (no migration history needed for local dev).
- Run both apps with `npm run dev` (concurrently runs backend + frontend), or individually via `npm run dev:backend` / `npm run dev:frontend`.

### Environment variables (gotchas)

- The backend loads **`.env.local` at the repo root** (via `dotenv` in `src/index.ts`) when `NODE_ENV !== production` — **not `.env`**, despite the README. The frontend loads `frontend/.env.local`. Both files already exist in this VM (they are git-ignored) with local dev values.
- **`OPENAI_API_KEY` must be a non-empty string or the backend will not even boot** — `src/profile/extractor.ts` constructs the OpenAI client at module-load time and the SDK throws on a missing key. `.env.local` contains a placeholder so the server starts and all non-AI flows work. To exercise the AI chat (`/ask`) end-to-end you must replace it with a real OpenAI key (and optionally `ANTHROPIC_API_KEY` / `GOOGLE_AI_API_KEY` for the Claude pipeline and market-news synthesis).
- `ENABLE_USER_AUTH=true` is set locally so register/login flows are active. All third-party integrations (Plaid, SnapTrade, Stripe, market-data APIs, email) are optional and only fail lazily when their specific feature is invoked.

### Verifying the environment

- Health check: `curl http://localhost:3000/health` should return `{"status":"OK",...}`.
- A no-secrets end-to-end smoke test that exercises the core auth + DB + encryption path: register (`POST http://localhost:3000/auth/register`) then log in via the UI at `http://localhost:3001/login`, which redirects to the authenticated dashboard at `/app`. The `users` table (Prisma model is mapped to lowercase table names) will contain the new account.
