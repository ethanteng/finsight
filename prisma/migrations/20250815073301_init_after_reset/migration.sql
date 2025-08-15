/*
  Warnings:

  - Added the required column `iv` to the `encrypted_profile_data` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tag` to the `encrypted_profile_data` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "encrypted_profile_data" ADD COLUMN     "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
ADD COLUMN     "iv" TEXT NOT NULL,
ADD COLUMN     "keyVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "tag" TEXT NOT NULL;
