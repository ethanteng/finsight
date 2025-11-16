-- AlterTable
ALTER TABLE "AccessToken" ADD COLUMN     "lastTransactionSync" TIMESTAMP(3),
ADD COLUMN     "transactionSyncCursor" TEXT;
