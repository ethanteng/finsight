-- Store the user's IANA time zone so daily observations follow their calendar.
ALTER TABLE "users"
ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'UTC';

-- Separate the daily chart series from optional material-change observations.
ALTER TABLE "financial_summary_history"
ADD COLUMN "observationDate" TIMESTAMP(3),
ADD COLUMN "observationKind" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN "observationReason" TEXT,
ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN "dailyKey" TEXT;

-- Preserve every legacy row, but designate only the latest row per UTC day as
-- the canonical daily observation. Older same-day rows remain recoverable as
-- legacy observations and are omitted from the default chart query.
WITH ranked_history AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", DATE_TRUNC('day', "computedAt")
      ORDER BY "computedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS row_number
  FROM "financial_summary_history"
)
UPDATE "financial_summary_history" AS history
SET
  "observationDate" = DATE_TRUNC('day', history."computedAt"),
  "observationKind" = CASE WHEN ranked.row_number = 1 THEN 'daily' ELSE 'legacy' END,
  "observationReason" = CASE WHEN ranked.row_number = 1 THEN 'legacy-migration' ELSE NULL END,
  "dailyKey" = CASE
    WHEN ranked.row_number = 1
      THEN history."userId" || ':' || TO_CHAR(DATE_TRUNC('day', history."computedAt"), 'YYYY-MM-DD')
    ELSE NULL
  END
FROM ranked_history AS ranked
WHERE history."id" = ranked."id";

CREATE UNIQUE INDEX "financial_summary_history_dailyKey_key"
ON "financial_summary_history"("dailyKey");

CREATE INDEX "financial_summary_history_userId_observationKind_observationDate_idx"
ON "financial_summary_history"("userId", "observationKind", "observationDate");

ALTER TABLE "financial_summary_history"
ALTER COLUMN "observationKind" SET DEFAULT 'daily';
