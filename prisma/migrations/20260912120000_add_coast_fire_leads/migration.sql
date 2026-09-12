-- CreateTable
CREATE TABLE "coast_fire_leads" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "currentAge" INTEGER NOT NULL,
    "retirementAge" INTEGER NOT NULL,
    "currentSavings" DOUBLE PRECISION NOT NULL,
    "annualRetirementSpending" DOUBLE PRECISION NOT NULL,
    "annualRetirementIncome" DOUBLE PRECISION NOT NULL,
    "realReturnRate" DOUBLE PRECISION NOT NULL,
    "withdrawalRate" DOUBLE PRECISION NOT NULL,
    "coastFireNumber" DOUBLE PRECISION NOT NULL,
    "retirementTarget" DOUBLE PRECISION NOT NULL,
    "projectedSavingsAtRetirement" DOUBLE PRECISION NOT NULL,
    "hasReachedCoastFire" BOOLEAN NOT NULL,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "mailerliteSynced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coast_fire_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coast_fire_leads_token_key" ON "coast_fire_leads"("token");

-- CreateIndex
CREATE INDEX "coast_fire_leads_createdAt_idx" ON "coast_fire_leads"("createdAt");

-- CreateIndex
CREATE INDEX "coast_fire_leads_email_idx" ON "coast_fire_leads"("email");
