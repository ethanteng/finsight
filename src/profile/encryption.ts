import * as crypto from 'crypto';

export class ProfileEncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16;  // 128 bits
  private readonly tagLength = 16; // 128 bits

  constructor(private encryptionKey: string) {
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new Error('Invalid encryption key provided. Key must be at least 32 bytes long.');
    }
  }

  encrypt(plaintext: string): {
    encryptedData: string;
    iv: string;
    tag: string;
    keyVersion: number;
  } {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      
      // Convert base64 key to buffer, or use raw string if not base64
      let keyBuffer: Buffer;
      try {
        keyBuffer = Buffer.from(this.encryptionKey, 'base64');
        if (keyBuffer.length !== this.keyLength) {
          throw new Error(`Key length mismatch: expected ${this.keyLength} bytes, got ${keyBuffer.length}`);
        }
      } catch (error) {
        // If base64 decoding fails, use the raw string (for testing)
        if (this.encryptionKey.length >= this.keyLength) {
          keyBuffer = Buffer.from(this.encryptionKey.slice(0, this.keyLength));
        } else {
          throw new Error(`Invalid key format: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      const cipher = crypto.createCipheriv(this.algorithm, keyBuffer, iv);
      cipher.setAAD(Buffer.from('user-profile', 'utf8'));
      
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      const tag = cipher.getAuthTag();
      
      return {
        encryptedData: encrypted,
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        keyVersion: 1
      };
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error(`Failed to encrypt profile data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  decrypt(encryptedData: string, iv: string, tag: string): string {
    try {
      // Convert base64 key to buffer, or use raw string if not base64
      let keyBuffer: Buffer;
      try {
        keyBuffer = Buffer.from(this.encryptionKey, 'base64');
        if (keyBuffer.length !== this.keyLength) {
          throw new Error(`Key length mismatch: expected ${this.keyLength} bytes, got ${keyBuffer.length}`);
        }
      } catch (error) {
        // If base64 decoding fails, use the raw string (for testing)
        if (this.encryptionKey.length >= this.keyLength) {
          keyBuffer = Buffer.from(this.encryptionKey.slice(0, this.keyLength));
        } else {
          throw new Error(`Invalid key format: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      const decipher = crypto.createDecipheriv(this.algorithm, keyBuffer, Buffer.from(iv, 'base64'));
      decipher.setAAD(Buffer.from('user-profile', 'utf8'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      
      let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error(`Failed to decrypt profile data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  rotateKey(oldKey: string, newKey: string, encryptedData: string, iv: string, tag: string): {
    encryptedData: string;
    iv: string;
    tag: string;
    keyVersion: number;
  } {
    try {
      // Decrypt with old key
      const oldDecryptionService = new ProfileEncryptionService(oldKey);
      const plaintext = oldDecryptionService.decrypt(encryptedData, iv, tag);
      
      // Encrypt with new key
      return this.encrypt(plaintext);
    } catch (error) {
      console.error('Key rotation failed:', error);
      throw new Error(`Failed to rotate encryption key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Utility method to validate encryption key format
  static validateKey(key: string): boolean {
    return typeof key === 'string' && key.length >= 32;
  }

  // Utility method to generate a secure encryption key
  static generateKey(): string {
    return crypto.randomBytes(32).toString('base64');
  }
}
