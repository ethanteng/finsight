-- DropForeignKey
ALTER TABLE "financial_summary_snapshots" DROP CONSTRAINT "financial_summary_snapshots_userId_fkey";

-- AlterTable
ALTER TABLE "financial_summary_snapshots" ALTER COLUMN "computedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "financial_summary_snapshots" ADD CONSTRAINT "financial_summary_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
