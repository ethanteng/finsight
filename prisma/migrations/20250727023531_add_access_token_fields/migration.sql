-- AlterTable
ALTER TABLE "AccessToken" ADD COLUMN     "itemId" TEXT,
ADD COLUMN     "lastRefreshed" TIMESTAMP(3);
