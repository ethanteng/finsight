-- CreateTable
CREATE TABLE "manual_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manual_accounts_userId_idx" ON "manual_accounts"("userId");

-- AddForeignKey
ALTER TABLE "manual_accounts" ADD CONSTRAINT "manual_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
