-- Runs of the public retirement calculator, for pattern analysis.
-- Unauthenticated visitors: no user relation, and nothing recorded beside the
-- figures that could identify who typed them.
CREATE TABLE "retirement_quickplan_runs" (
    "id" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "rejectedField" TEXT,
    "assumedFields" TEXT[],
    "missingFields" TEXT[],
    "currentAge" INTEGER,
    "retirementAge" INTEGER,
    "investableAssets" DOUBLE PRECISION,
    "annualSpending" DOUBLE PRECISION,
    "annualContributions" DOUBLE PRECISION,
    "socialSecurityAnnual" DOUBLE PRECISION,
    "socialSecurityStartAge" INTEGER,
    "allocation" TEXT,
    "survivalRate" DOUBLE PRECISION,
    "projectedPortfolioAtRetiremt" DOUBLE PRECISION,
    "firstYearWithdrawalRate" DOUBLE PRECISION,
    "sustainableRateP10" DOUBLE PRECISION,
    "sustainableRateP50" DOUBLE PRECISION,
    "sequencesTested" INTEGER,
    "durationMs" INTEGER,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retirement_quickplan_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "retirement_quickplan_runs_createdAt_idx"
    ON "retirement_quickplan_runs"("createdAt");

CREATE INDEX "retirement_quickplan_runs_outcome_createdAt_idx"
    ON "retirement_quickplan_runs"("outcome", "createdAt");
