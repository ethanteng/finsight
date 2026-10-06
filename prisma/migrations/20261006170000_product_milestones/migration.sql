CREATE TABLE "user_acquisitions" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "source" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "flowVersion" TEXT NOT NULL DEFAULT 'calculator_in_app_v1',
  "landingPage" TEXT,
  "referrer" TEXT,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "utmTerm" TEXT,
  "utmContent" TEXT,
  "gclid" TEXT,
  "gbraid" TEXT,
  "wbraid" TEXT,
  "gaClientId" TEXT,
  "gaSessionId" TEXT,
  CONSTRAINT "user_acquisitions_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "user_acquisitions_source_utmCampaign_idx" ON "user_acquisitions"("source", "utmCampaign");

CREATE TABLE "product_milestones" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "definitionVersion" INTEGER NOT NULL DEFAULT 1,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT,
  "conversationId" TEXT,
  "adDispatchAttemptedAt" TIMESTAMP(3),
  CONSTRAINT "product_milestones_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "product_milestones_userId_kind_definitionVersion_key"
  ON "product_milestones"("userId", "kind", "definitionVersion");
CREATE INDEX "product_milestones_kind_occurredAt_idx" ON "product_milestones"("kind", "occurredAt");
