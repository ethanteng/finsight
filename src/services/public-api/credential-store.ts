import { DataEncryptionService } from '../../auth/encryption';
import { getPrismaClient } from '../../prisma-client';

/**
 * Storage for a user's Public.com personal API secret.
 *
 * The secret is a full-power Public credential -- the same API can place and
 * cancel orders -- so it is encrypted at rest with the same AES-256-GCM service
 * used for user PII, and there is deliberately no function here that returns it
 * to a caller outside the ingestion path. Nothing decrypts it for display.
 */

let encryptionService: DataEncryptionService | null = null;

function getEncryptionService(): DataEncryptionService {
  if (encryptionService) return encryptionService;
  // Prefer ENCRYPTION_KEY when set; fall back to DATA_ENCRYPTION_KEY, the env
  // name already used by DataEncryptionService / EncryptedUserService docs, so
  // a deploy that already holds PII encryption does not need a second secret
  // just to store a Public API credential.
  const key = process.env.ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY;
  if (!key) {
    // Failing closed matters more here than anywhere else in the codebase: a
    // fallback that stored the secret in plaintext would put a tradeable
    // credential in the database.
    throw new Error(
      'ENCRYPTION_KEY (or DATA_ENCRYPTION_KEY) is not configured; refusing to handle a Public API secret',
    );
  }
  encryptionService = new DataEncryptionService(key);
  return encryptionService;
}

/** Test seam. */
export function __setEncryptionServiceForTests(service: DataEncryptionService | null): void {
  encryptionService = service;
}

export interface PublicCredentialStatus {
  configured: boolean;
  lastVerifiedAt: Date | null;
  lastError: string | null;
}

export async function storeSecret(userId: string, secret: string): Promise<void> {
  const trimmed = secret.trim();
  if (!trimmed) throw new Error('A Public API secret is required');

  const encrypted = getEncryptionService().encrypt(trimmed);
  const prisma = getPrismaClient();
  const data = {
    encryptedSecret: encrypted.encryptedValue,
    iv: encrypted.iv,
    tag: encrypted.tag,
    keyVersion: encrypted.keyVersion,
    algorithm: encrypted.algorithm,
    // A newly supplied secret has not been used yet. Clearing both fields stops a
    // previous secret's failure from being reported against this one.
    lastVerifiedAt: null,
    lastError: null,
  };
  await prisma.publicApiCredential.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}

/**
 * The decrypted secret, or null when the user has none.
 *
 * Only the ingestion path may call this. It returns a value that can trade the
 * user's account, so it must never reach a response body, a log line, or a
 * snapshot field.
 */
export async function readSecret(userId: string): Promise<string | null> {
  const prisma = getPrismaClient();
  const record = await prisma.publicApiCredential.findUnique({ where: { userId } });
  if (!record) return null;
  try {
    return getEncryptionService().decrypt({
      encryptedValue: record.encryptedSecret,
      iv: record.iv,
      tag: record.tag,
      keyVersion: record.keyVersion,
      algorithm: record.algorithm,
    });
  } catch {
    // A key rotation or a corrupted row. Report it as absent rather than throwing
    // into an ingestion pass that has other sources to gather.
    console.error(`Public API: could not decrypt the stored secret for user ${userId}`);
    return null;
  }
}

/** Whether a credential exists, without decrypting it. */
export async function getStatus(userId: string): Promise<PublicCredentialStatus> {
  const prisma = getPrismaClient();
  const record = await prisma.publicApiCredential.findUnique({
    where: { userId },
    select: { lastVerifiedAt: true, lastError: true },
  });
  return {
    configured: Boolean(record),
    lastVerifiedAt: record?.lastVerifiedAt ?? null,
    lastError: record?.lastError ?? null,
  };
}

export async function recordSuccess(userId: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.publicApiCredential.updateMany({
    where: { userId },
    data: { lastVerifiedAt: new Date(), lastError: null },
  });
}

/**
 * Record a failure against the credential.
 *
 * `message` must be one of our own strings. The provider's message can carry the
 * request URL and, on the token call, the secret itself.
 */
export async function recordFailure(userId: string, message: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.publicApiCredential.updateMany({ where: { userId }, data: { lastError: message } });
}

export async function deleteSecret(userId: string): Promise<boolean> {
  const prisma = getPrismaClient();
  const { count } = await prisma.publicApiCredential.deleteMany({ where: { userId } });
  return count > 0;
}
