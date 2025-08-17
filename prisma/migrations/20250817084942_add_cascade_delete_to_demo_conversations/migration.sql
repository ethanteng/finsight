/*
  Warnings:

  - You are about to drop the column `subscriptionExpiresAt` on the `users` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "DemoConversation" DROP CONSTRAINT "DemoConversation_sessionId_fkey";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "subscriptionExpiresAt";

-- CreateTable
CREATE TABLE "encrypted_user_data" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedEmail" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "encrypted_user_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encrypted_password_reset_tokens" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "encrypted_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encrypted_email_verification_codes" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "encryptedCode" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "encrypted_email_verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "encrypted_user_data_userId_key" ON "encrypted_user_data"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "encrypted_password_reset_tokens_tokenId_key" ON "encrypted_password_reset_tokens"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "encrypted_email_verification_codes_codeId_key" ON "encrypted_email_verification_codes"("codeId");

-- AddForeignKey
ALTER TABLE "DemoConversation" ADD CONSTRAINT "DemoConversation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DemoSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encrypted_user_data" ADD CONSTRAINT "encrypted_user_data_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encrypted_password_reset_tokens" ADD CONSTRAINT "encrypted_password_reset_tokens_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "password_reset_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encrypted_email_verification_codes" ADD CONSTRAINT "encrypted_email_verification_codes_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "email_verification_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
