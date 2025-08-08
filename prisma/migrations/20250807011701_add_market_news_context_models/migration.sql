-- CreateTable
CREATE TABLE "market_news_context" (
    "id" TEXT NOT NULL,
    "contextText" TEXT NOT NULL,
    "rawData" JSONB,
    "lastUpdate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataSources" TEXT[],
    "keyEvents" TEXT[],
    "availableTiers" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "manualOverride" BOOLEAN NOT NULL DEFAULT false,
    "lastEditedBy" TEXT,

    CONSTRAINT "market_news_context_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_news_history" (
    "id" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "contextText" TEXT NOT NULL,
    "dataSources" TEXT[],
    "keyEvents" TEXT[],
    "changeType" TEXT NOT NULL,
    "changeReason" TEXT,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_news_history_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "market_news_history" ADD CONSTRAINT "market_news_history_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "market_news_context"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
