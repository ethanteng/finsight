-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "aiCategory" TEXT,
ADD COLUMN     "aiCategoryReason" TEXT,
ADD COLUMN     "categoryComparedAt" TIMESTAMP(3),
ADD COLUMN     "enriched_data" JSONB;

-- CreateTable
CREATE TABLE "snaptrade_activities" (
    "id" TEXT NOT NULL,
    "snapTradeUserId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "accountId" TEXT,
    "amount" DOUBLE PRECISION,
    "currency" TEXT,
    "description" TEXT,
    "fee" DOUBLE PRECISION,
    "fxRate" DOUBLE PRECISION,
    "institution" TEXT,
    "price" DOUBLE PRECISION,
    "settlementDate" TIMESTAMP(3),
    "symbol" TEXT,
    "tradeDate" TIMESTAMP(3),
    "type" TEXT,
    "units" DOUBLE PRECISION,
    "rawData" JSONB,
    "aiCategory" TEXT,
    "aiCategoryReason" TEXT,
    "categoryComparedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "snaptrade_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "snaptrade_activities_activityId_key" ON "snaptrade_activities"("activityId");

-- AddForeignKey
ALTER TABLE "snaptrade_activities" ADD CONSTRAINT "snaptrade_activities_snapTradeUserId_fkey" FOREIGN KEY ("snapTradeUserId") REFERENCES "snaptrade_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
