import { jest } from '@jest/globals';
import { ProfileEncryptionService } from '../../profile/encryption';

describe('ProfileEncryptionService', () => {
  const validKey = 'test-key-32-bytes-long-here-123456789';
  const shortKey = 'short-key';
  
  describe('Constructor', () => {
    it('should create instance with valid key', () => {
      const service = new ProfileEncryptionService(validKey);
      expect(service).toBeInstanceOf(ProfileEncryptionService);
    });

    it('should throw error with missing key', () => {
      expect(() => new ProfileEncryptionService('')).toThrow('Invalid encryption key provided. Key must be at least 32 bytes long.');
    });

    it('should throw error with short key', () => {
      expect(() => new ProfileEncryptionService(shortKey)).toThrow('Invalid encryption key provided. Key must be at least 32 bytes long.');
    });

    it('should throw error with null key', () => {
      expect(() => new ProfileEncryptionService(null as any)).toThrow('Invalid encryption key provided. Key must be at least 32 bytes long.');
    });
  });

  describe('Static Methods', () => {
    it('should validate correct key format', () => {
      expect(ProfileEncryptionService.validateKey(validKey)).toBe(true);
    });

    it('should reject invalid key format', () => {
      expect(ProfileEncryptionService.validateKey(shortKey)).toBe(false);
      expect(ProfileEncryptionService.validateKey('')).toBe(false);
      expect(ProfileEncryptionService.validateKey(null as any)).toBe(false);
    });

    it('should generate valid key', () => {
      const generatedKey = ProfileEncryptionService.generateKey();
      expect(ProfileEncryptionService.validateKey(generatedKey)).toBe(true);
      expect(generatedKey.length).toBeGreaterThan(0);
    });
  });

  describe('Encryption and Decryption', () => {
    let service: ProfileEncryptionService;

    beforeEach(() => {
      service = new ProfileEncryptionService(validKey);
    });

    it('should encrypt and decrypt profile data correctly', () => {
      const originalText = 'Test profile data with sensitive information';
      
      const encrypted = service.encrypt(originalText);
      expect(encrypted).toHaveProperty('encryptedData');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('tag');
      expect(encrypted).toHaveProperty('keyVersion');
      expect(encrypted.keyVersion).toBe(1);
      
      const decrypted = service.decrypt(encrypted.encryptedData, encrypted.iv, encrypted.tag);
      expect(decrypted).toBe(originalText);
    });

    it('should handle empty string', () => {
      const originalText = '';
      
      const encrypted = service.encrypt(originalText);
      const decrypted = service.decrypt(encrypted.encryptedData, encrypted.iv, encrypted.tag);
      
      expect(decrypted).toBe(originalText);
    });

    it('should handle long text', () => {
      const originalText = 'A'.repeat(1000);
      
      const encrypted = service.encrypt(originalText);
      const decrypted = service.decrypt(encrypted.encryptedData, encrypted.iv, encrypted.tag);
      
      expect(decrypted).toBe(originalText);
    });

    it('should handle special characters', () => {
      const originalText = 'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?`~';
      
      const encrypted = service.encrypt(originalText);
      const decrypted = service.decrypt(encrypted.encryptedData, encrypted.iv, encrypted.tag);
      
      expect(decrypted).toBe(originalText);
    });

    it('should handle unicode characters', () => {
      const originalText = 'Unicode: 🚀💰📊🎯🔒';
      
      const encrypted = service.encrypt(originalText);
      const decrypted = service.decrypt(encrypted.encryptedData, encrypted.iv, encrypted.tag);
      
      expect(decrypted).toBe(originalText);
    });

    it('should generate unique IVs for each encryption', () => {
      const text = 'Test text';
      
      const encrypted1 = service.encrypt(text);
      const encrypted2 = service.encrypt(text);
      
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.encryptedData).not.toBe(encrypted2.encryptedData);
      expect(encrypted1.tag).not.toBe(encrypted2.tag);
    });

    it('should decrypt data encrypted with same key', () => {
      const text = 'Test text';
      
      const encrypted = service.encrypt(text);
      const decrypted = service.decrypt(encrypted.encryptedData, encrypted.iv, encrypted.tag);
      
      expect(decrypted).toBe(text);
    });
  });

  describe('Key Rotation', () => {
    it('should rotate key correctly', () => {
      const oldKey = 'old-key-32-bytes-long-here-123456';
      const newKey = 'new-key-32-bytes-long-here-789012';
      
      const oldService = new ProfileEncryptionService(oldKey);
      const newService = new ProfileEncryptionService(newKey);
      
      const originalText = 'Test profile data for key rotation';
      const oldEncrypted = oldService.encrypt(originalText);
      
      const rotated = newService.rotateKey(
        oldKey, 
        newKey, 
        oldEncrypted.encryptedData, 
        oldEncrypted.iv, 
        oldEncrypted.tag
      );
      
      const decrypted = newService.decrypt(rotated.encryptedData, rotated.iv, rotated.tag);
      expect(decrypted).toBe(originalText);
    });

    it('should fail key rotation with wrong old key', () => {
      const oldKey = 'old-key-32-bytes-long-here-123456';
      const newKey = 'new-key-32-bytes-long-here-789012';
      const wrongOldKey = 'wrong-key-32-bytes-long-here-123';
      
      const newService = new ProfileEncryptionService(newKey);
      const oldService = new ProfileEncryptionService(oldKey);
      
      const originalText = 'Test profile data';
      const oldEncrypted = oldService.encrypt(originalText);
      
      expect(() => {
        newService.rotateKey(
          wrongOldKey, 
          newKey, 
          oldEncrypted.encryptedData, 
          oldEncrypted.iv, 
          oldEncrypted.tag
        );
      }).toThrow('Failed to rotate encryption key');
    });
  });

  describe('Error Handling', () => {
    let service: ProfileEncryptionService;

    beforeEach(() => {
      service = new ProfileEncryptionService(validKey);
    });

    it('should handle decryption with wrong IV', () => {
      const text = 'Test text';
      const encrypted = service.encrypt(text);
      
      // Use wrong IV
      const wrongIv = 'wrong-iv-base64-string-here';
      
      expect(() => {
        service.decrypt(encrypted.encryptedData, wrongIv, encrypted.tag);
      }).toThrow('Failed to decrypt profile data');
    });

    it('should handle decryption with wrong tag', () => {
      const text = 'Test text';
      const encrypted = service.encrypt(text);
      
      // Use wrong tag
      const wrongTag = 'wrong-tag-base64-string-here';
      
      expect(() => {
        service.decrypt(encrypted.encryptedData, encrypted.iv, wrongTag);
      }).toThrow('Failed to decrypt profile data');
    });

    it('should handle decryption with wrong encrypted data', () => {
      const text = 'Test text';
      const encrypted = service.encrypt(text);
      
      // Use wrong encrypted data
      const wrongData = 'wrong-encrypted-data';
      
      expect(() => {
        service.decrypt(wrongData, encrypted.iv, encrypted.tag);
      }).toThrow('Failed to decrypt profile data');
    });
  });

  describe('Performance', () => {
    let service: ProfileEncryptionService;

    beforeEach(() => {
      service = new ProfileEncryptionService(validKey);
    });

    it('should encrypt/decrypt within reasonable time', () => {
      const text = 'Test profile data for performance testing';
      
      const startTime = Date.now();
      const encrypted = service.encrypt(text);
      const encryptionTime = Date.now() - startTime;
      
      const decryptStartTime = Date.now();
      const decrypted = service.decrypt(encrypted.encryptedData, encrypted.iv, encrypted.tag);
      const decryptionTime = Date.now() - decryptStartTime;
      
      expect(encryptionTime).toBeLessThan(100); // Should complete in <100ms
      expect(decryptionTime).toBeLessThan(100); // Should complete in <100ms
      expect(decrypted).toBe(text);
    });
  });
});
