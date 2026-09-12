-- CreateTable
CREATE TABLE "retirement_leads" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "currentAge" INTEGER NOT NULL,
    "retirementAge" INTEGER NOT NULL,
    "investableAssets" DOUBLE PRECISION NOT NULL,
    "annualSpending" DOUBLE PRECISION NOT NULL,
    "annualContributions" DOUBLE PRECISION NOT NULL,
    "socialSecurityAnnual" DOUBLE PRECISION NOT NULL,
    "socialSecurityStartAge" INTEGER NOT NULL,
    "lifeExpectancy" INTEGER NOT NULL,
    "allocation" TEXT NOT NULL,
    "survivalRate" DOUBLE PRECISION NOT NULL,
    "sequencesTested" INTEGER NOT NULL,
    "sequencesSurvived" INTEGER NOT NULL,
    "projectedPortfolioAtRetirement" DOUBLE PRECISION NOT NULL,
    "firstYearWithdrawalRate" DOUBLE PRECISION NOT NULL,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "mailerliteSynced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retirement_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retirement_leads_token_key" ON "retirement_leads"("token");

-- CreateIndex
CREATE INDEX "retirement_leads_createdAt_idx" ON "retirement_leads"("createdAt");

-- CreateIndex
CREATE INDEX "retirement_leads_email_idx" ON "retirement_leads"("email");
