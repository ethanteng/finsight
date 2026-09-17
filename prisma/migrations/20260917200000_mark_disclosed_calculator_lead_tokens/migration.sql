-- A calculator lead token handed straight back to the browser that asked for
-- the email, rather than only mailed to the address it names.
--
-- Skipping the emailed verification code rests on the token having reached
-- only that inbox. A token the page was given proves nothing about who owns
-- the address, so registration reads this column and withholds the skip.
-- Existing rows were only ever emailed, so NULL is the correct backfill.
ALTER TABLE "retirement_leads" ADD COLUMN "tokenDisclosedAt" TIMESTAMP(3);
ALTER TABLE "coast_fire_leads" ADD COLUMN "tokenDisclosedAt" TIMESTAMP(3);
