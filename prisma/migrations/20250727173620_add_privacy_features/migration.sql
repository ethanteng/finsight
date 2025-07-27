-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "anonymizedAnswer" TEXT,
ADD COLUMN     "anonymizedQuestion" TEXT;

-- CreateTable
CREATE TABLE "PrivacySettings" (
    "id" TEXT NOT NULL,
    "allowDataStorage" BOOLEAN NOT NULL DEFAULT true,
    "allowAITraining" BOOLEAN NOT NULL DEFAULT false,
    "anonymizeData" BOOLEAN NOT NULL DEFAULT true,
    "dataRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacySettings_pkey" PRIMARY KEY ("id")
);
