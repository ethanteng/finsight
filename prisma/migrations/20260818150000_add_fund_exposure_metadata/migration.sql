ALTER TABLE "security_metadata"
ADD COLUMN "fundData" JSONB,
ADD COLUMN "metadataVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "asset_price_history"
ADD COLUMN "periodReturn" DOUBLE PRECISION;
