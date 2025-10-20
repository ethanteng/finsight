-- AlterTable
ALTER TABLE "AccessToken" ADD COLUMN     "institutionName" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastChecked" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT;
