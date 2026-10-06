-- CreateTable
CREATE TABLE "target_date_registry_publications" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "vintage" INTEGER NOT NULL,
    "allocationAsOf" TEXT NOT NULL,
    "availableFrom" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceContext" TEXT NOT NULL,
    "exactAllocation" BOOLEAN NOT NULL,
    "tipsAllocationStatus" TEXT NOT NULL,
    "weights" JSONB NOT NULL,
    "sourceFingerprint" JSONB NOT NULL,
    "fingerprintValue" TEXT NOT NULL,
    "derivation" TEXT[],
    "appliedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "target_date_registry_publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "target_date_registry_publications_provider_series_vintage_idx" ON "target_date_registry_publications"("provider", "series", "vintage");

-- CreateIndex
CREATE UNIQUE INDEX "target_date_registry_publications_provider_series_vintage_f_key" ON "target_date_registry_publications"("provider", "series", "vintage", "fingerprintValue");
