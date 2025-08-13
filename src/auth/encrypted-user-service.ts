import { PrismaClient } from '@prisma/client';
import { DataEncryptionService, EncryptedData } from './encryption';

export class EncryptedUserService {
  private encryptionService: DataEncryptionService;

  constructor(encryptionKey: string) {
    this.encryptionService = new DataEncryptionService(encryptionKey);
  }

  /**
   * Create a new user with encrypted email
   */
  async createUser(
    prisma: PrismaClient,
    email: string,
    passwordHash: string,
    tier: string = 'starter'
  ) {
    // Encrypt the email address
    const encryptedEmail = this.encryptionService.encrypt(email);

    // Create user and encrypted data in a transaction
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email, // Keep plain text for now, will be encrypted in separate table
          passwordHash,
          tier,
          isActive: true,
          emailVerified: false
        }
      });

      // Create encrypted email data
      await tx.encryptedUserData.create({
        data: {
          userId: user.id,
          encryptedEmail: encryptedEmail.encryptedValue,
          iv: encryptedEmail.iv,
          tag: encryptedEmail.tag,
          keyVersion: encryptedEmail.keyVersion,
          algorithm: 'aes-256-gcm'
        }
      });

      return user;
    });
  }

  /**
   * Get user by encrypted email
   */
  async getUserByEmail(prisma: PrismaClient, email: string) {
    // Find user by plain text email (for backward compatibility)
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        encryptedUserData: true
      }
    });

    if (!user) return null;

    // Verify the encrypted email matches
    if (user.encryptedUserData) {
      try {
        const decryptedEmail = this.encryptionService.decrypt({
          encryptedValue: user.encryptedUserData.encryptedEmail,
          iv: user.encryptedUserData.iv,
          tag: user.encryptedUserData.tag,
          keyVersion: user.encryptedUserData.keyVersion,
          algorithm: user.encryptedUserData.algorithm
        });

        if (decryptedEmail !== email) {
          console.warn('Email decryption mismatch for user:', user.id);
          return null;
        }
      } catch (error) {
        console.error('Failed to decrypt email for user:', user.id, error);
        return null;
      }
    }

    return user;
  }

  /**
   * Create encrypted password reset token
   */
  async createPasswordResetToken(
    prisma: PrismaClient,
    userId: string,
    expiresAt: Date
  ) {
    const token = this.generateSecureToken();
    const encryptedToken = this.encryptionService.encrypt(token);

    return await prisma.$transaction(async (tx) => {
      const resetToken = await tx.passwordResetToken.create({
        data: {
          token: token, // Keep plain text for now, will be encrypted in separate table
          userId,
          expiresAt,
          used: false
        }
      });

      // Create encrypted token data
      await tx.encryptedPasswordResetToken.create({
        data: {
          tokenId: resetToken.id,
          encryptedToken: encryptedToken.encryptedValue,
          iv: encryptedToken.iv,
          tag: encryptedToken.tag,
          keyVersion: encryptedToken.keyVersion,
          algorithm: 'aes-256-gcm'
        }
      });

      return resetToken;
    });
  }

  /**
   * Verify and use password reset token
   */
  async verifyPasswordResetToken(
    prisma: PrismaClient,
    token: string,
    userId: string
  ) {
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        token,
        userId,
        used: false,
        expiresAt: { gt: new Date() }
      },
      include: {
        encryptedData: true
      }
    });

    if (!resetToken || !resetToken.encryptedData) {
      return null;
    }

    // Verify the encrypted token matches
    try {
      const decryptedToken = this.encryptionService.decrypt({
        encryptedValue: resetToken.encryptedData.encryptedToken,
        iv: resetToken.encryptedData.iv,
        tag: resetToken.encryptedData.tag,
        keyVersion: resetToken.encryptedData.keyVersion,
        algorithm: resetToken.encryptedData.algorithm
      });

      if (decryptedToken !== token) {
        console.warn('Token decryption mismatch for reset token:', resetToken.id);
        return null;
      }
    } catch (error) {
      console.error('Failed to decrypt reset token:', resetToken.id, error);
      return null;
    }

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true }
    });

    return resetToken;
  }

  /**
   * Create encrypted email verification code
   */
  async createEmailVerificationCode(
    prisma: PrismaClient,
    userId: string,
    expiresAt: Date
  ) {
    const code = this.generateVerificationCode();
    const encryptedCode = this.encryptionService.encrypt(code);

    return await prisma.$transaction(async (tx) => {
      const verificationCode = await tx.emailVerificationCode.create({
        data: {
          code: code, // Keep plain text for now, will be encrypted in separate table
          userId,
          expiresAt,
          used: false
        }
      });

      // Create encrypted code data
      await tx.encryptedEmailVerificationCode.create({
        data: {
          codeId: verificationCode.id,
          encryptedCode: encryptedCode.encryptedValue,
          iv: encryptedCode.iv,
          tag: encryptedCode.tag,
          keyVersion: encryptedCode.keyVersion,
          algorithm: 'aes-256-gcm'
        }
      });

      return verificationCode;
    });
  }

  /**
   * Verify email verification code
   */
  async verifyEmailCode(
    prisma: PrismaClient,
    code: string,
    userId: string
  ) {
    const verificationCode = await prisma.emailVerificationCode.findFirst({
      where: {
        code,
        userId,
        used: false,
        expiresAt: { gt: new Date() }
      },
      include: {
        encryptedData: true
      }
    });

    if (!verificationCode || !verificationCode.encryptedData) {
      return null;
    }

    // Verify the encrypted code matches
    try {
      const decryptedCode = this.encryptionService.decrypt({
        encryptedValue: verificationCode.encryptedData.encryptedCode,
        iv: verificationCode.encryptedData.iv,
        tag: verificationCode.encryptedData.tag,
        keyVersion: verificationCode.encryptedData.keyVersion,
        algorithm: verificationCode.encryptedData.algorithm
      });

      if (decryptedCode !== code) {
        console.warn('Code decryption mismatch for verification code:', verificationCode.id);
        return null;
      }
    } catch (error) {
      console.error('Failed to decrypt verification code:', verificationCode.id, error);
      return null;
    }

    // Mark code as used
    await prisma.emailVerificationCode.update({
      where: { id: verificationCode.id },
      data: { used: true }
    });

    return verificationCode;
  }

  /**
   * Generate a secure random token
   */
  private generateSecureToken(): string {
    return require('crypto').randomBytes(32).toString('hex');
  }

  /**
   * Generate a 6-digit verification code
   */
  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Check if encryption is properly configured
   */
  static validateEncryptionKey(key: string): boolean {
    return DataEncryptionService.validateKey(key);
  }
}
