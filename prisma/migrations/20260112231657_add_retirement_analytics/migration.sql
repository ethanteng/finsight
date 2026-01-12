-- CreateTable
CREATE TABLE "retirement_analyses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "analysisInput" JSONB NOT NULL,
    "portfolioSnapshot" JSONB NOT NULL,
    "portfolioMetrics" JSONB NOT NULL,
    "characteristics" JSONB NOT NULL,
    "stressTestResults" JSONB NOT NULL,
    "historicalImplications" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataQualityScore" DOUBLE PRECISION NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retirement_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_price_history" (
    "id" TEXT NOT NULL,
    "tickerSymbol" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "adjustedClose" DOUBLE PRECISION,
    "volume" BIGINT NOT NULL,
    "provider" TEXT NOT NULL,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_metadata" (
    "id" TEXT NOT NULL,
    "tickerSymbol" TEXT NOT NULL,
    "securityName" TEXT NOT NULL,
    "assetClass" TEXT,
    "fundCategory" TEXT,
    "expenseRatio" DOUBLE PRECISION,
    "geographicFocus" TEXT,
    "isETF" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retirement_analyses_userId_computedAt_idx" ON "retirement_analyses"("userId", "computedAt");

-- CreateIndex
CREATE INDEX "asset_price_history_tickerSymbol_date_idx" ON "asset_price_history"("tickerSymbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "asset_price_history_tickerSymbol_date_provider_key" ON "asset_price_history"("tickerSymbol", "date", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "security_metadata_tickerSymbol_key" ON "security_metadata"("tickerSymbol");

-- AddForeignKey
ALTER TABLE "retirement_analyses" ADD CONSTRAINT "retirement_analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
