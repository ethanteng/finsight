-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "showTheMathData" JSONB;

-- AlterTable
ALTER TABLE "DemoConversation" ADD COLUMN     "showTheMathData" JSONB;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "tier" SET DEFAULT 'premium';
