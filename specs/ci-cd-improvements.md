# 0) Goal state (what we’re building)

* **Migrations run in CI as a dedicated job**, with guardrails, before app deploys.
* **Render never runs migrations** (build/pre‑deploy/start are safe).
* **Tests use real migrations** (not `db push`) so issues surface earlier.
* **Automated checks** prevent accidental “migrate in build” regressions.

---

# 1) Lock down Render to “build‑only”

In Render (screenshot confirms you’re close), set:

* **Pre‑Deploy:** `npm run build:render`
* **Build:** `npm run build:render`
* **Start:** `npm run start`
* **Auto‑deploy:** Off

This matches your safety doc and keeps migrations out of Render entirely. &#x20;

---

# 2) Remove any migration calls from build scripts

You currently have two build scripts:

* `deploy-build.sh` already **skips** migrations—keep this.&#x20;
* `build.sh` still **runs** `npx prisma migrate deploy`—delete those lines (or delete this file if unused).&#x20;

**Edit (or remove) `build.sh`:**

```bash
# Before (bad)
npx prisma migrate deploy

# After (good)
# (no migration commands in any build script)
```

And keep `deploy-build.sh` as the only Render-invoked script.

---

# 3) Add a guard that fails CI if any build/predeploy script runs migrations

Create `scripts/check-no-migrate-in-build.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Fail the build if any build/pre-deploy script tries to run migrations
grep -RniE "prisma\s+migrate\s+deploy" \
  build.sh deploy-build.sh package.json scripts/ 2>/dev/null && {
  echo "❌ prisma migrate deploy found in a build/predeploy path."
  exit 1
} || echo "✅ No migrate calls in build/predeploy scripts."
```

In **GitHub Actions** (`ci-cd.yml`), add this step to your existing **build-verification** job right after “Install dependencies”:

```yaml
- name: Enforce no-migrate-in-build
  run: bash scripts/check-no-migrate-in-build.sh
```

Your `build-verification` job already exists; append this step.&#x20;

---

# 4) Make tests use migrations (not `db push`)

Today both **backend-tests** and **integration-tests** initialize the DB with `npx prisma db push --accept-data-loss`. Switch to a real migration cycle so migration errors surface in CI first. &#x20;

**Replace the “Setup test database” step in both jobs with:**

```yaml
- name: Setup test database
  run: |
    npx prisma generate
    npx prisma migrate reset --force
    npx prisma migrate deploy
  env:
    DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
```

(Keep the rest of each job unchanged.)

---

# 5) Add a guarded “migrate → then deploy” flow in CI

We’ll insert a new `migrate-prod` job that:

* Requires **manual approval** via the GitHub “production” environment.
* Adds **timeouts** so migrations can’t lock prod forever.
* **Diffs** against prod and **blocks destructive** SQL (DROP/PK/type changes).
* Runs **before** your existing `deploy` job.

### 5.1 Create a helper script: `scripts/migrate-with-guards.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1) Prepare
echo "🔎 Generating Prisma client"
npx prisma generate

# 2) Build migration SQL (diff prod vs migrations)
echo "🔎 Computing migration diff"
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-migrations ./prisma/migrations \
  --script > /tmp/migration.sql

echo "— Proposed migration diff —"
sed -n '1,200p' /tmp/migration.sql

# 3) Block obviously destructive changes (extend as needed)
if grep -Eiq 'DROP TABLE|DROP COLUMN|ALTER TYPE|ALTER TABLE .* DROP CONSTRAINT|PRIMARY KEY' /tmp/migration.sql; then
  echo "❌ Destructive change detected. Handle manually in a scheduled window."
  exit 2
fi

# 4) Safety: set conservative lock/statement timeouts for this session
echo "⏱️  Setting timeouts"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SET lock_timeout='30s'; SET statement_timeout='5min';"

# 5) Apply migrations
echo "🚀 Applying migrations"
npx prisma migrate deploy

echo "✅ Migrations applied successfully"
```

### 5.2 Wire it into `ci-cd.yml`

Add a new job and make `deploy` depend on it:

```yaml
jobs:
  migrate-prod:
    needs: [build-verification]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production   # requires manual approval in GitHub
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '18', cache: 'npm' }
      - run: npm ci --prefer-offline --no-audit
      - name: Apply migrations with guards
        run: bash scripts/migrate-with-guards.sh
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_PROD }}

  deploy:
    needs: [migrate-prod]
    # (keep your current deploy steps to Vercel + Render webhook)
```

Your current `deploy` job will remain as‑is; it will now wait for migrations to complete.&#x20;

> Tip: In GitHub, create an **Environment** named `production` and require reviewers to approve before this job runs.

---

# 6) (Optional but recommended) Add a quick logical backup before migrating

If you have object storage creds, insert this step **just before** “Apply migrations with guards”:

```yaml
- name: On-demand logical backup
  run: |
    export PGPASSWORD="${{ secrets.PG_PASSWORD }}"
    pg_dump "${{ secrets.DATABASE_URL_PROD }}" \
      --no-owner --format=custom --file=backup_$(date +%Y%m%dT%H%M%S).dump
    # TODO: upload to S3/GCS here
```

(If your DB has PITR, you can skip the dump and rely on PITR instead.)

---

# 7) Keep Render webhook deployment as-is

Your deploy job already triggers Vercel and Render via webhook/CLI fallback; that’s fine—**it now runs only after `migrate-prod`**. &#x20;

---

# 8) Make the pipeline fail fast on dangerous ops (manual path)

If the `scripts/migrate-with-guards.sh` grep finds destructive SQL, it exits with code `2`. CI will mark **migrate-prod** as failed—intentionally—so you’ll do a **manual, scheduled** sequence (backup → off‑peak → online schema change, e.g., `CREATE INDEX CONCURRENTLY`, batched backfills). Keep a simple runbook in the repo for this case.

---

# 9) Update docs/checklists to match the new flow

Your docs already emphasize “Render is build‑only” and manual migration control; add a small note that **prod migrations are automated via CI with approval + guards** (no change to the Render settings section). &#x20;

---

# 10) Rollout plan (low risk)

1. **Commit and push** steps 2–4 (remove migrate in build + CI guard + test DB via migrations) in one PR.
2. Confirm CI is green.
3. **Add the `migrate-prod` job** and GitHub `production` environment with approval.
4. Merge to `main`.
5. On the next change that includes a new migration, approve `migrate-prod` → watch logs → then deploy runs.

---

## Why this fixes your pain

* Render can’t touch the DB anymore (build‑only).&#x20;
* CI ensures schema is valid by applying **real** migrations in tests, catching issues pre‑prod.&#x20;
* Prod migrations are **automated with brakes** (diff, timeouts, approvals), then your existing deploy proceeds.
