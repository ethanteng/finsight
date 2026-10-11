-- CreateTable
CREATE TABLE "transaction_category_rules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "counterpartyKey" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "investment" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT NOT NULL,
    "category" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_category_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transaction_category_rules_userId_idx" ON "transaction_category_rules"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_category_rules_user_payee_key" ON "transaction_category_rules"("userId", "counterpartyKey", "direction", "investment");

-- AddForeignKey
ALTER TABLE "transaction_category_rules" ADD CONSTRAINT "transaction_category_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
