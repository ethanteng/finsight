-- User-chosen transaction categories. Keyed by provider transaction id: the snapshot the
-- profile UI reads is rebuilt from provider payloads on every revision, so an override tied
-- to a Transaction row id would be dropped the next time the snapshot is recomputed.
CREATE TABLE "transaction_category_overrides" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "category" TEXT[],
    "originalCategory" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_category_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transaction_category_overrides_userId_transactionId_key"
    ON "transaction_category_overrides"("userId", "transactionId");

CREATE INDEX "transaction_category_overrides_userId_idx"
    ON "transaction_category_overrides"("userId");

ALTER TABLE "transaction_category_overrides"
    ADD CONSTRAINT "transaction_category_overrides_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
