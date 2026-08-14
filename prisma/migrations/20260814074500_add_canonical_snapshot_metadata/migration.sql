-- Existing snapshots predate source-observation metadata. Their asOf/status
-- remain NULL rather than pretending the cache write time was a provider time.
ALTER TABLE "financial_summary_snapshots"
  ADD COLUMN "asOf" TIMESTAMP(3),
  ADD COLUMN "status" TEXT,
  ADD COLUMN "reportingCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "quality" JSONB,
  ADD COLUMN "sourceObservations" JSONB;

-- Historical rows keep their original computedAt, but legacy source time and
-- completeness are unknowable and therefore stay NULL.
ALTER TABLE "financial_summary_history"
  ADD COLUMN "asOf" TIMESTAMP(3),
  ADD COLUMN "status" TEXT,
  ADD COLUMN "reportingCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "totalAssets" DOUBLE PRECISION,
  ADD COLUMN "totalLiabilities" DOUBLE PRECISION;
