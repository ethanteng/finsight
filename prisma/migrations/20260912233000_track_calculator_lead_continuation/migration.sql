-- Persist the first successful emailed-results CTA continuation. Existing
-- leads remain unknown rather than being backfilled from an analytics source.
ALTER TABLE "coast_fire_leads" ADD COLUMN "continuedAt" TIMESTAMP(3);
ALTER TABLE "retirement_leads" ADD COLUMN "continuedAt" TIMESTAMP(3);

CREATE INDEX "coast_fire_leads_continuedAt_idx" ON "coast_fire_leads"("continuedAt");
CREATE INDEX "retirement_leads_continuedAt_idx" ON "retirement_leads"("continuedAt");
