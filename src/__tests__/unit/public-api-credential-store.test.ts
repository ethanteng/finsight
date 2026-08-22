import { DataEncryptionService } from '../../auth/encryption';

const findUnique = jest.fn();
const upsert = jest.fn();
const deleteMany = jest.fn();
const updateMany = jest.fn();

jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => ({
    publicApiCredential: { findUnique, upsert, deleteMany, updateMany },
  }),
}));

import {
  __setEncryptionServiceForTests,
  deleteSecret,
  getStatus,
  readSecret,
  recordFailure,
  storeSecret,
} from '../../services/public-api/credential-store';

// A real service, not a stub: the point of these tests is that what lands in the
// database is ciphertext, which a stubbed encryptor would not prove.
const KEY = Buffer.alloc(32, 7).toString('base64');
const encryption = new DataEncryptionService(KEY);

describe('Public API credential store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setEncryptionServiceForTests(encryption);
  });

  afterAll(() => __setEncryptionServiceForTests(null));

  // The stored value can trade the user's account. Plaintext at rest is the one
  // failure mode that must be impossible.
  it('never writes the secret in plaintext', async () => {
    await storeSecret('user-1', 'SECRET-VALUE');

    const written = JSON.stringify(upsert.mock.calls[0][0]);
    expect(written).not.toContain('SECRET-VALUE');
    expect(upsert.mock.calls[0][0].create.algorithm).toBe('aes-256-gcm');
  });

  it('round-trips the secret through encryption', async () => {
    await storeSecret('user-1', 'SECRET-VALUE');
    const stored = upsert.mock.calls[0][0].create;
    findUnique.mockResolvedValue({
      encryptedSecret: stored.encryptedSecret,
      iv: stored.iv,
      tag: stored.tag,
      keyVersion: stored.keyVersion,
      algorithm: stored.algorithm,
    });

    await expect(readSecret('user-1')).resolves.toBe('SECRET-VALUE');
  });

  // A replacement secret must not inherit the previous one's failure, or the UI
  // would report a working credential as broken.
  it('clears prior verification state when a new secret is supplied', async () => {
    await storeSecret('user-1', 'NEW-SECRET');

    expect(upsert.mock.calls[0][0].update).toMatchObject({ lastVerifiedAt: null, lastError: null });
  });

  it('reports no secret rather than throwing when none is stored', async () => {
    findUnique.mockResolvedValue(null);

    await expect(readSecret('user-1')).resolves.toBeNull();
  });

  // A rotated key or a corrupted row must not take down an ingestion pass that
  // has other sources to gather.
  it('reports no secret when the stored value cannot be decrypted', async () => {
    findUnique.mockResolvedValue({
      encryptedSecret: 'not-real-ciphertext',
      iv: 'AAAA', tag: 'BBBB', keyVersion: 1, algorithm: 'aes-256-gcm',
    });

    await expect(readSecret('user-1')).resolves.toBeNull();
  });

  it('reports status without decrypting anything', async () => {
    findUnique.mockResolvedValue({ lastVerifiedAt: new Date('2026-08-22'), lastError: null });

    await expect(getStatus('user-1')).resolves.toEqual({
      configured: true,
      lastVerifiedAt: new Date('2026-08-22'),
      lastError: null,
    });
    expect(findUnique.mock.calls[0][0].select).toEqual({ lastVerifiedAt: true, lastError: true });
  });

  it('records a failure message against the credential', async () => {
    await recordFailure('user-1', 'Public rejected the stored API secret.');

    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { lastError: 'Public rejected the stored API secret.' },
    });
  });

  it('reports whether a delete removed anything', async () => {
    deleteMany.mockResolvedValue({ count: 1 });
    await expect(deleteSecret('user-1')).resolves.toBe(true);

    deleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteSecret('user-1')).resolves.toBe(false);
  });

  it('refuses to store an empty secret', async () => {
    await expect(storeSecret('user-1', '   ')).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('accepts DATA_ENCRYPTION_KEY when ENCRYPTION_KEY is unset', async () => {
    __setEncryptionServiceForTests(null);
    const previousEncryption = process.env.ENCRYPTION_KEY;
    const previousData = process.env.DATA_ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    process.env.DATA_ENCRYPTION_KEY = KEY;

    try {
      await storeSecret('user-1', 'SECRET-FROM-DATA-KEY');
      const written = upsert.mock.calls[0][0].create;
      expect(written.encryptedSecret).toBeTruthy();
      expect(JSON.stringify(written)).not.toContain('SECRET-FROM-DATA-KEY');
    } finally {
      if (previousEncryption === undefined) delete process.env.ENCRYPTION_KEY;
      else process.env.ENCRYPTION_KEY = previousEncryption;
      if (previousData === undefined) delete process.env.DATA_ENCRYPTION_KEY;
      else process.env.DATA_ENCRYPTION_KEY = previousData;
      __setEncryptionServiceForTests(encryption);
    }
  });
});
