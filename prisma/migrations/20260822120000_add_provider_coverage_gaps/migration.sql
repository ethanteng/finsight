-- Symbols a market-data provider does not cover, so unsupported holdings are
-- not re-requested on every user request.
CREATE TABLE "provider_coverage_gaps" (
    "id" TEXT NOT NULL,
    "tickerSymbol" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observations" INTEGER NOT NULL DEFAULT 1,
    "recheckAfter" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_coverage_gaps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_coverage_gaps_tickerSymbol_provider_key"
    ON "provider_coverage_gaps"("tickerSymbol", "provider");

CREATE INDEX "provider_coverage_gaps_provider_recheckAfter_idx"
    ON "provider_coverage_gaps"("provider", "recheckAfter");
