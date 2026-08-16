-- Which line of questioning a turn belongs to.
--
-- Existing rows stay NULL and are each treated as their own thread: back-filling
-- a guess (say, grouping by time gaps) would invent conversations the user never
-- declared, and the whole point of the column is that the boundary is declared.
ALTER TABLE "Conversation" ADD COLUMN "threadId" TEXT;

CREATE INDEX "Conversation_userId_threadId_createdAt_idx"
  ON "Conversation"("userId", "threadId", "createdAt");
