-- Persist privacy-bounded acquisition metadata with calculator email leads so
-- later account and subscription outcomes can be joined to the campaign that
-- earned the lead. Existing rows remain valid and unattributed.
ALTER TABLE "coast_fire_leads"
  ADD COLUMN "landingPage" TEXT,
  ADD COLUMN "referrer" TEXT,
  ADD COLUMN "utmSource" TEXT,
  ADD COLUMN "utmMedium" TEXT,
  ADD COLUMN "utmCampaign" TEXT,
  ADD COLUMN "utmTerm" TEXT,
  ADD COLUMN "utmContent" TEXT,
  ADD COLUMN "gclid" TEXT,
  ADD COLUMN "gbraid" TEXT,
  ADD COLUMN "wbraid" TEXT,
  ADD COLUMN "gaClientId" TEXT,
  ADD COLUMN "gaSessionId" TEXT;

ALTER TABLE "retirement_leads"
  ADD COLUMN "landingPage" TEXT,
  ADD COLUMN "referrer" TEXT,
  ADD COLUMN "utmSource" TEXT,
  ADD COLUMN "utmMedium" TEXT,
  ADD COLUMN "utmCampaign" TEXT,
  ADD COLUMN "utmTerm" TEXT,
  ADD COLUMN "utmContent" TEXT,
  ADD COLUMN "gclid" TEXT,
  ADD COLUMN "gbraid" TEXT,
  ADD COLUMN "wbraid" TEXT,
  ADD COLUMN "gaClientId" TEXT,
  ADD COLUMN "gaSessionId" TEXT;
