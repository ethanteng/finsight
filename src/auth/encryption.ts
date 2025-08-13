import crypto from 'crypto';

export interface EncryptedData {
  encryptedValue: string;
  iv: string;
  tag: string;
  keyVersion: number;
  algorithm: string;
}

export class DataEncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16;  // 128 bits
  private readonly tagLength = 16; // 128 bits

  constructor(private encryptionKey: string) {
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new Error('Invalid encryption key provided - must be at least 32 bytes');
    }
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(plaintext: string): EncryptedData {
    if (!plaintext || plaintext.trim() === '') {
      throw new Error('Cannot encrypt empty or null data');
    }

    const iv = crypto.randomBytes(this.ivLength);
    const key = Buffer.from(this.encryptionKey, 'base64');
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    
    // Set additional authenticated data for extra security
    cipher.setAAD(Buffer.from('finsight-sensitive-data', 'utf8'));
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const tag = cipher.getAuthTag();
    
    return {
      encryptedValue: encrypted,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      keyVersion: 1,
      algorithm: this.algorithm
    };
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData: EncryptedData): string {
    try {
      const key = Buffer.from(this.encryptionKey, 'base64');
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      
      // Set additional authenticated data
      decipher.setAAD(Buffer.from('finsight-sensitive-data', 'utf8'));
      
      // Set the authentication tag
      decipher.setAuthTag(Buffer.from(encryptedData.tag, 'base64'));
      
      let decrypted = decipher.update(encryptedData.encryptedValue, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if data is encrypted
   */
  isEncrypted(data: string): boolean {
    try {
      // Try to parse as base64 and check if it looks like encrypted data
      const decoded = Buffer.from(data, 'base64');
      // Encrypted data should be longer than the original data due to padding and encoding
      // A reasonable minimum length for encrypted data would be at least 16 bytes
      return decoded.length >= 16;
    } catch {
      return false;
    }
  }

  /**
   * Generate a secure encryption key
   */
  static generateKey(): string {
    return crypto.randomBytes(32).toString('base64');
  }

  /**
   * Validate encryption key format
   */
  static validateKey(key: string): boolean {
    try {
      const decoded = Buffer.from(key, 'base64');
      return decoded.length === 32;
    } catch {
      return false;
    }
  }
}
