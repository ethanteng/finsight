import { EncryptedUserService } from '../../auth/encrypted-user-service';
import { DataEncryptionService } from '../../auth/encryption';
import { PrismaClient } from '@prisma/client';

// Mock Prisma client
const mockPrisma = {
  $transaction: jest.fn(),
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn()
  },
  encryptedUserData: {
    create: jest.fn(),
    findMany: jest.fn()
  },
  passwordResetToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn()
  },
  encryptedPasswordResetToken: {
    create: jest.fn()
  },
  emailVerificationCode: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn()
  },
  encryptedEmailVerificationCode: {
    create: jest.fn()
  }
} as any;

describe('EncryptedUserService', () => {
  let service: EncryptedUserService;
  // Use a proper 32-character key for testing
  const testKey = 'dGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcy1sb24=';

  beforeEach(() => {
    service = new EncryptedUserService(testKey);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service with valid encryption key', () => {
      expect(service).toBeInstanceOf(EncryptedUserService);
    });

    it('should validate encryption key format', () => {
      expect(EncryptedUserService.validateEncryptionKey(testKey)).toBe(true);
      expect(EncryptedUserService.validateEncryptionKey('short')).toBe(false);
    });
  });

  describe('createUser', () => {
    it('should create user with encrypted email', async () => {
      const email = 'test@example.com';
      const passwordHash = 'hashed-password';
      const tier = 'starter';

      const mockUser = {
        id: 'user-123',
        email,
        passwordHash,
        tier,
        isActive: true,
        emailVerified: false
      };

      const mockEncryptedData = {
        id: 'encrypted-123',
        userId: mockUser.id,
        encryptedEmail: 'encrypted-email-data',
        iv: 'iv-data',
        tag: 'tag-data',
        keyVersion: 1,
        algorithm: 'aes-256-gcm'
      };

      mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
        mockPrisma.user.create.mockResolvedValue(mockUser);
        mockPrisma.encryptedUserData.create.mockResolvedValue(mockEncryptedData);
        return await callback(mockPrisma);
      });

      const result = await service.createUser(mockPrisma as any, email, passwordHash, tier);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email,
          passwordHash,
          tier,
          isActive: true,
          emailVerified: false
        }
      });
      expect(mockPrisma.encryptedUserData.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUser.id,
          algorithm: 'aes-256-gcm',
          keyVersion: 1
        })
      });
      expect(result).toEqual(mockUser);
    });

    it('should use default tier when not provided', async () => {
      const email = 'test@example.com';
      const passwordHash = 'hashed-password';

      const mockUser = {
        id: 'user-123',
        email,
        passwordHash,
        tier: 'starter',
        isActive: true,
        emailVerified: false
      };

      mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
        mockPrisma.user.create.mockResolvedValue(mockUser);
        mockPrisma.encryptedUserData.create.mockResolvedValue({});
        return await callback(mockPrisma);
      });

      await service.createUser(mockPrisma as any, email, passwordHash);

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tier: 'starter'
        })
      });
    });
  });

  describe('getUserByEmail', () => {
    it('should return user when email matches encrypted data', async () => {
      const email = 'test@example.com';
      const mockUser = {
        id: 'user-123',
        email,
        encryptedUserData: {
          encryptedEmail: 'encrypted-email',
          iv: 'iv-data',
          tag: 'tag-data',
          keyVersion: 1
        }
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getUserByEmail(mockPrisma as any, email);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email },
        include: { encryptedUserData: true }
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getUserByEmail(mockPrisma as any, 'nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('should return null when encrypted data verification fails', async () => {
      const email = 'test@example.com';
      const mockUser = {
        id: 'user-123',
        email,
        encryptedUserData: {
          encryptedEmail: 'encrypted-email',
          iv: 'iv-data',
          tag: 'tag-data',
          keyVersion: 1
        }
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      // Mock the encryption service to simulate decryption failure
      jest.spyOn(service as any, 'encryptionService').mockReturnValue({
        decrypt: jest.fn().mockImplementation(() => {
          throw new Error('Decryption failed');
        })
      });

      const result = await service.getUserByEmail(mockPrisma as any, email);

      expect(result).toBeNull();
    });
  });

  describe('createPasswordResetToken', () => {
    it('should create encrypted password reset token', async () => {
      const userId = 'user-123';
      const expiresAt = new Date('2025-12-31');

      const mockToken = {
        id: 'token-123',
        token: 'generated-token',
        userId,
        expiresAt,
        used: false
      };

      const mockEncryptedData = {
        id: 'encrypted-token-123',
        tokenId: mockToken.id,
        encryptedToken: 'encrypted-token-data',
        iv: 'iv-data',
        tag: 'tag-data',
        keyVersion: 1,
        algorithm: 'aes-256-gcm'
      };

      mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
        mockPrisma.passwordResetToken.create.mockResolvedValue(mockToken);
        mockPrisma.encryptedPasswordResetToken.create.mockResolvedValue(mockEncryptedData);
        return await callback(mockPrisma);
      });

      const result = await service.createPasswordResetToken(mockPrisma as any, userId, expiresAt);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          expiresAt,
          used: false
        })
      });
      expect(mockPrisma.encryptedPasswordResetToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tokenId: mockToken.id,
          algorithm: 'aes-256-gcm',
          keyVersion: 1
        })
      });
      expect(result).toEqual(mockToken);
    });
  });

  describe('verifyPasswordResetToken', () => {
    it('should verify and mark token as used when valid', async () => {
      const token = 'valid-token';
      const userId = 'user-123';

      const mockResetToken = {
        id: 'token-123',
        token,
        userId,
        expiresAt: new Date('2025-12-31'),
        used: false,
        encryptedData: {
          encryptedToken: 'encrypted-token-data',
          iv: 'iv-data',
          tag: 'tag-data',
          keyVersion: 1
        }
      };

      mockPrisma.passwordResetToken.findFirst.mockResolvedValue(mockResetToken);
      mockPrisma.passwordResetToken.update.mockResolvedValue(mockResetToken);

      const result = await service.verifyPasswordResetToken(mockPrisma as any, token, userId);

      expect(mockPrisma.passwordResetToken.findFirst).toHaveBeenCalledWith({
        where: {
          token,
          userId,
          used: false,
          expiresAt: { gt: expect.any(Date) }
        },
        include: { encryptedData: true }
      });
      expect(mockPrisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: mockResetToken.id },
        data: { used: true }
      });
      expect(result).toEqual(mockResetToken);
    });

    it('should return null when token not found', async () => {
      mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null);

      const result = await service.verifyPasswordResetToken(mockPrisma as any, 'invalid-token', 'user-123');

      expect(result).toBeNull();
    });

    it('should return null when token is expired', async () => {
      const mockResetToken = {
        id: 'token-123',
        token: 'expired-token',
        userId: 'user-123',
        expiresAt: new Date('2020-01-01'), // Past date
        used: false,
        encryptedData: {
          encryptedToken: 'encrypted-token-data',
          iv: 'iv-data',
          tag: 'tag-data',
          keyVersion: 1
        }
      };

      mockPrisma.passwordResetToken.findFirst.mockResolvedValue(mockResetToken);

      const result = await service.verifyPasswordResetToken(mockPrisma as any, 'expired-token', 'user-123');

      expect(result).toBeNull();
    });
  });

  describe('createEmailVerificationCode', () => {
    it('should create encrypted email verification code', async () => {
      const userId = 'user-123';
      const expiresAt = new Date('2025-12-31');

      const mockCode = {
        id: 'code-123',
        code: '123456',
        userId,
        expiresAt,
        used: false
      };

      const mockEncryptedData = {
        id: 'encrypted-code-123',
        codeId: mockCode.id,
        encryptedCode: 'encrypted-code-data',
        iv: 'iv-data',
        tag: 'tag-data',
        keyVersion: 1,
        algorithm: 'aes-256-gcm'
      };

      mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
        mockPrisma.emailVerificationCode.create.mockResolvedValue(mockCode);
        mockPrisma.encryptedEmailVerificationCode.create.mockResolvedValue(mockEncryptedData);
        return await callback(mockPrisma);
      });

      const result = await service.createEmailVerificationCode(mockPrisma as any, userId, expiresAt);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.emailVerificationCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          expiresAt,
          used: false
        })
      });
      expect(mockPrisma.encryptedEmailVerificationCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          codeId: mockCode.id,
          algorithm: 'aes-256-gcm',
          keyVersion: 1
        })
      });
      expect(result).toEqual(mockCode);
    });
  });

  describe('verifyEmailCode', () => {
    it('should verify and mark code as used when valid', async () => {
      const code = '123456';
      const userId = 'user-123';

      const mockVerificationCode = {
        id: 'code-123',
        code,
        userId,
        expiresAt: new Date('2025-12-31'),
        used: false,
        encryptedData: {
          encryptedCode: 'encrypted-code-data',
          iv: 'iv-data',
          tag: 'tag-data',
          keyVersion: 1
        }
      };

      mockPrisma.emailVerificationCode.findFirst.mockResolvedValue(mockVerificationCode);
      mockPrisma.emailVerificationCode.update.mockResolvedValue(mockVerificationCode);

      const result = await service.verifyEmailCode(mockPrisma as any, code, userId);

      expect(mockPrisma.emailVerificationCode.findFirst).toHaveBeenCalledWith({
        where: {
          code,
          userId,
          used: false,
          expiresAt: { gt: expect.any(Date) }
        },
        include: { encryptedData: true }
      });
      expect(mockPrisma.emailVerificationCode.update).toHaveBeenCalledWith({
        where: { id: mockVerificationCode.id },
        data: { used: true }
      });
      expect(result).toEqual(mockVerificationCode);
    });

    it('should return null when code not found', async () => {
      mockPrisma.emailVerificationCode.findFirst.mockResolvedValue(null);

      const result = await service.verifyEmailCode(mockPrisma as any, 'invalid-code', 'user-123');

      expect(result).toBeNull();
    });

    it('should return null when code is already used', async () => {
      const mockVerificationCode = {
        id: 'code-123',
        code: '123456',
        userId: 'user-123',
        expiresAt: new Date('2025-12-31'),
        used: true, // Already used
        encryptedData: {
          encryptedCode: 'encrypted-code-data',
          iv: 'iv-data',
          tag: 'tag-data',
          keyVersion: 1
        }
      };

      mockPrisma.emailVerificationCode.findFirst.mockResolvedValue(mockVerificationCode);

      const result = await service.verifyEmailCode(mockPrisma as any, '123456', 'user-123');

      expect(result).toBeNull();
    });
  });

  describe('token generation', () => {
    it('should generate secure tokens', () => {
      const token1 = (service as any).generateSecureToken();
      const token2 = (service as any).generateSecureToken();

      expect(token1).toMatch(/^[a-f0-9]{64}$/); // 32 bytes = 64 hex chars
      expect(token2).toMatch(/^[a-f0-9]{64}$/);
      expect(token1).not.toBe(token2);
    });

    it('should generate verification codes', () => {
      const code1 = (service as any).generateVerificationCode();
      const code2 = (service as any).generateVerificationCode();

      expect(code1).toMatch(/^\d{6}$/);
      expect(code2).toMatch(/^\d{6}$/);
      expect(parseInt(code1)).toBeGreaterThanOrEqual(100000);
      expect(parseInt(code1)).toBeLessThanOrEqual(999999);
    });
  });
});
