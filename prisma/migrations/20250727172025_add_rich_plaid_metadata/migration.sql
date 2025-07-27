-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "limit" DOUBLE PRECISION,
ADD COLUMN     "persistentAccountId" TEXT,
ADD COLUMN     "verificationStatus" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "authorizedDate" TIMESTAMP(3),
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "checkNumber" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "merchantName" TEXT,
ADD COLUMN     "originalDescription" TEXT,
ADD COLUMN     "paymentChannel" TEXT,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "pendingTransactionId" TEXT;
