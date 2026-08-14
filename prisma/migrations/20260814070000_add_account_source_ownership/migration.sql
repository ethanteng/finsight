-- Link each Plaid account to the specific connection that owns it. The column
-- remains nullable during rollout because legacy users with multiple Items
-- cannot be backfilled safely without asking Plaid for each Item's account IDs.
ALTER TABLE "Account" ADD COLUMN "accessTokenId" TEXT;

-- Preserve provider and canonical cash-flow amounts separately. Existing rows
-- can only be backfilled on a best-effort basis because the legacy amount field
-- was populated through more than one normalization path.
ALTER TABLE "Transaction" ADD COLUMN "sourceAmount" DOUBLE PRECISION;
ALTER TABLE "Transaction" ADD COLUMN "cashFlowAmount" DOUBLE PRECISION;

UPDATE "Transaction"
SET "sourceAmount" = "amount"
WHERE "sourceAmount" IS NULL;

UPDATE "Transaction"
SET "cashFlowAmount" = CASE
  WHEN LOWER(COALESCE("aiCategory", '')) IN ('income', 'refund', 'transfer_in', 'deposit', 'sell')
    THEN ABS("amount")
  WHEN LOWER(COALESCE("aiCategory", '')) IN ('expense', 'fee', 'transfer_out', 'withdrawal', 'buy')
    THEN -ABS("amount")
  ELSE NULL
END
WHERE "cashFlowAmount" IS NULL;

-- A legacy account can be assigned automatically only when its owner has one
-- connection. Multi-connection accounts stay NULL until the next provider sync.
UPDATE "Account" AS account
SET "accessTokenId" = single_connection.id
FROM (
  SELECT MIN(id) AS id, "userId"
  FROM "AccessToken"
  WHERE "userId" IS NOT NULL
  GROUP BY "userId"
  HAVING COUNT(*) = 1
) AS single_connection
WHERE account."userId" = single_connection."userId"
  AND account."plaidAccountId" NOT LIKE 'snaptrade-%'
  AND account."plaidAccountId" NOT LIKE 'manual-%';

CREATE INDEX "Account_accessTokenId_idx" ON "Account"("accessTokenId");
CREATE INDEX "Account_userId_accessTokenId_idx" ON "Account"("userId", "accessTokenId");

ALTER TABLE "Account"
ADD CONSTRAINT "Account_accessTokenId_fkey"
FOREIGN KEY ("accessTokenId") REFERENCES "AccessToken"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
