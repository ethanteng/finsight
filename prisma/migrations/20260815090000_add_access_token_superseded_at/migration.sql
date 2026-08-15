-- Permanent marker for connections replaced by a re-link.
-- isActive/lastError cannot carry this: /profile/tokens revalidates every token and resets both
-- on a successful Plaid call, which resurrects superseded connections and their duplicate accounts.
ALTER TABLE "AccessToken" ADD COLUMN "supersededAt" TIMESTAMP(3);

CREATE INDEX "AccessToken_userId_supersededAt_idx" ON "AccessToken"("userId", "supersededAt");

-- Backfill connections already superseded by the cleanup script, which marked them via lastError.
UPDATE "AccessToken"
SET "supersededAt" = COALESCE("updatedAt", NOW())
WHERE "lastError" = 'SUPERSEDED_BY_RELINK' AND "isActive" = false;
