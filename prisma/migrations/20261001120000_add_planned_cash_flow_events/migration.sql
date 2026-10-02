-- CreateTable
CREATE TABLE "planned_cash_flow_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "startDate" DATE NOT NULL,
    "recurrence" TEXT NOT NULL DEFAULT 'once',
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planned_cash_flow_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "planned_cash_flow_events_userId_idx" ON "planned_cash_flow_events"("userId");

-- AddForeignKey
ALTER TABLE "planned_cash_flow_events" ADD CONSTRAINT "planned_cash_flow_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

