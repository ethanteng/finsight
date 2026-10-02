-- CreateTable
CREATE TABLE "cash_flow_forecast_adjustments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "flow" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_flow_forecast_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_flow_forecast_adjustments_userId_idx" ON "cash_flow_forecast_adjustments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "cash_flow_forecast_adjustments_userId_kind_flow_key_key" ON "cash_flow_forecast_adjustments"("userId", "kind", "flow", "key");

-- AddForeignKey
ALTER TABLE "cash_flow_forecast_adjustments" ADD CONSTRAINT "cash_flow_forecast_adjustments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
