ALTER TABLE "Conversation" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'user';

-- PRs 256/257 wrote deterministic saved results without a source marker.
-- Recognize only the original generated question + answer signature, with no
-- user thread or calculation evidence. Never rewrite the question or answer.
UPDATE "Conversation" SET "origin" = 'calculator_retirement'
WHERE "threadId" IS NULL AND "showTheMathData" IS NULL
  AND "question" LIKE 'Can I retire at %? I am % now.%'
  AND "answer" LIKE 'Retiring at %'
  AND "answer" LIKE '%This came from the free retirement calculator, so the asset mix behind it is the % preset rather than anything you own — and taxes, fees and account types are not modeled at all. Connect your accounts and ask me this again to replace the preset with your actual holdings.';

UPDATE "Conversation" SET "origin" = 'calculator_coast_fire'
WHERE "threadId" IS NULL AND "showTheMathData" IS NULL
  AND "question" LIKE 'Have I reached Coast FIRE? I am % now and plan to retire at %'
  AND "answer" LIKE '%This came from the free Coast FIRE calculator, so it is a single straight line: % every year, with no taxes, fees, account types, healthcare, uneven markets, or income starting later than retirement modeled at all. Connect your accounts and ask me this again to run it against your actual holdings and a century of real market sequences.';
