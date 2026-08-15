-- Remove the retired public demo and its separately persisted data.
ALTER TABLE "feedback"
  DROP CONSTRAINT IF EXISTS "feedback_demoConversationId_fkey";

ALTER TABLE "feedback"
  DROP COLUMN IF EXISTS "demoConversationId";

DROP TABLE IF EXISTS "DemoConversation";
DROP TABLE IF EXISTS "DemoSession";
