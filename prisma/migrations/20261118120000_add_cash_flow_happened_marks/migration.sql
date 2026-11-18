-- CreateTable
CREATE TABLE "cash_flow_happened_marks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_flow_happened_marks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_flow_happened_marks_userId_idx" ON "cash_flow_happened_marks"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "cash_flow_happened_marks_userId_source_sourceId_date_key" ON "cash_flow_happened_marks"("userId", "source", "sourceId", "date");

-- AddForeignKey
ALTER TABLE "cash_flow_happened_marks" ADD CONSTRAINT "cash_flow_happened_marks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
