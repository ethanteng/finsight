-- CreateTable: financial_summary_snapshots
CREATE TABLE IF NOT EXISTS "financial_summary_snapshots" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "computedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "financialOverview" JSONB NOT NULL,
  "investmentPortfolio" JSONB NOT NULL,
  "accounts" JSONB,
  "holdings" JSONB,
  "securities" JSONB,
  "transactions" JSONB,
  "transactionsSummary" JSONB,
  "activities" JSONB,
  "meta" JSONB,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add foreign key to users(id)
ALTER TABLE "financial_summary_snapshots"
ADD CONSTRAINT "financial_summary_snapshots_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Trigger to update updatedAt on row modification
CREATE OR REPLACE FUNCTION set_updated_at_timestamp_financial_summary_snapshots()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_financial_summary_snapshots ON "financial_summary_snapshots";
CREATE TRIGGER set_updated_at_financial_summary_snapshots
BEFORE UPDATE ON "financial_summary_snapshots"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp_financial_summary_snapshots();

