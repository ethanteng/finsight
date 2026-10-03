-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "calculatorLeadToken" TEXT;

-- CreateIndex
-- Nulls are distinct, so every ordinary conversation is unaffected.
CREATE UNIQUE INDEX "Conversation_userId_calculatorLeadToken_key" ON "Conversation"("userId", "calculatorLeadToken");
