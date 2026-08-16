-- Which line of questioning a turn belongs to.
ALTER TABLE "Conversation" ADD COLUMN "threadId" TEXT;

-- Each existing row becomes its own thread, keyed by its own id.
--
-- This is not a guess at past conversations — grouping by time gaps would invent
-- boundaries the user never declared, and the point of the column is that the
-- boundary is declared. Giving each row a real thread of one is what makes those
-- turns resumable: opening a pre-migration answer adopts a thread that actually
-- contains it, so the follow-up can see the turn the user just selected. Left
-- NULL they would resume into an empty thread.
UPDATE "Conversation" SET "threadId" = "id" WHERE "threadId" IS NULL;

CREATE INDEX "Conversation_userId_threadId_createdAt_idx"
  ON "Conversation"("userId", "threadId", "createdAt");
