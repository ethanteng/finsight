-- Public.com personal API secret, held encrypted.
--
-- SnapTrade cannot complete an initial holdings sync for Public's managed-yield
-- products (TREASURY, HIGH_YIELD, BOND_ACCOUNT); they return HTTP 425 indefinitely.
-- Reading Public directly is a stopgap until that is resolved upstream.
CREATE TABLE "public_api_credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "lastVerifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_api_credentials_pkey" PRIMARY KEY ("id")
);

-- One credential per user; re-supplying a secret replaces the existing row.
CREATE UNIQUE INDEX "public_api_credentials_userId_key" ON "public_api_credentials"("userId");

-- Cascade so deleting a user destroys the credential with them. This is the only
-- copy of the secret we hold, and it must not outlive the account.
ALTER TABLE "public_api_credentials"
    ADD CONSTRAINT "public_api_credentials_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
