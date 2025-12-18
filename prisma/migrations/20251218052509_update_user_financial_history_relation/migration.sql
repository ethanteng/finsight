-- DropForeignKey
ALTER TABLE "financial_summary_history" DROP CONSTRAINT "financial_summary_history_userId_fkey";

-- AlterTable
ALTER TABLE "financial_summary_history" ALTER COLUMN "computedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "financial_summary_history" ADD CONSTRAINT "financial_summary_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
