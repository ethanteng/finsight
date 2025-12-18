-- CreateTable: financial_summary_history
CREATE TABLE IF NOT EXISTS "financial_summary_history" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "computedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "netWorth" DOUBLE PRECISION NOT NULL,
  "totalCash" DOUBLE PRECISION NOT NULL,
  "totalInvestments" DOUBLE PRECISION NOT NULL,
  "totalDebt" DOUBLE PRECISION NOT NULL,
  "homeValue" DOUBLE PRECISION,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add foreign key to users(id)
ALTER TABLE "financial_summary_history"
ADD CONSTRAINT "financial_summary_history_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Create index on userId and computedAt for efficient queries
CREATE INDEX IF NOT EXISTS "financial_summary_history_userId_computedAt_idx" 
ON "financial_summary_history"("userId", "computedAt");
