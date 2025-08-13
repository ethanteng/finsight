import { DataEncryptionService, EncryptedData } from '../../auth/encryption';

describe('DataEncryptionService', () => {
  let encryptionService: DataEncryptionService;
  // Use a proper 32-character key for testing
  const testKey = 'dGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcy1sb24=';

  beforeEach(() => {
    encryptionService = new DataEncryptionService(testKey);
  });

  describe('constructor', () => {
    it('should create service with valid key', () => {
      expect(encryptionService).toBeInstanceOf(DataEncryptionService);
    });

    it('should throw error with invalid key length', () => {
      expect(() => new DataEncryptionService('short')).toThrow('Invalid encryption key provided');
    });

    it('should throw error with empty key', () => {
      expect(() => new DataEncryptionService('')).toThrow('Invalid encryption key provided');
    });

    it('should throw error with null key', () => {
      expect(() => new DataEncryptionService(null as any)).toThrow('Invalid encryption key provided');
    });
  });

  describe('encrypt', () => {
    it('should encrypt plain text successfully', () => {
      const plaintext = 'test@example.com';
      const result = encryptionService.encrypt(plaintext);

      expect(result).toHaveProperty('encryptedValue');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('tag');
      expect(result).toHaveProperty('keyVersion');
      expect(result.keyVersion).toBe(1);
      expect(result.algorithm).toBe('aes-256-gcm');
    });

    it('should generate different IVs for same input', () => {
      const plaintext = 'test@example.com';
      const result1 = encryptionService.encrypt(plaintext);
      const result2 = encryptionService.encrypt(plaintext);

      expect(result1.iv).not.toBe(result2.iv);
      expect(result1.encryptedValue).not.toBe(result2.encryptedValue);
    });

    it('should throw error with empty string', () => {
      expect(() => encryptionService.encrypt('')).toThrow('Cannot encrypt empty or null data');
    });

    it('should throw error with whitespace only', () => {
      expect(() => encryptionService.encrypt('   ')).toThrow('Cannot encrypt empty or null data');
    });

    it('should throw error with null input', () => {
      expect(() => encryptionService.encrypt(null as any)).toThrow('Cannot encrypt empty or null data');
    });

    it('should encrypt various data types', () => {
      const testCases = [
        'simple@email.com',
        'complex.email+tag@domain.co.uk',
        'very.long.email.address.with.many.parts@very.long.domain.name.com',
        'email-with-dashes@domain-name.com',
        'email_with_underscores@domain_name.com'
      ];

      testCases.forEach(email => {
        const result = encryptionService.encrypt(email);
        expect(result.encryptedValue).toBeDefined();
        expect(result.iv).toBeDefined();
        expect(result.tag).toBeDefined();
      });
    });
  });

  describe('decrypt', () => {
    it('should decrypt encrypted data successfully', () => {
      const plaintext = 'test@example.com';
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt various data types', () => {
      const testCases = [
        'simple@email.com',
        'complex.email+tag@domain.co.uk',
        'very.long.email.address.with.many.parts@very.long.domain.name.com',
        'email-with-dashes@domain-name.com',
        'email_with_underscores@domain_name.com'
      ];

      testCases.forEach(email => {
        const encrypted = encryptionService.encrypt(email);
        const decrypted = encryptionService.decrypt(encrypted);
        expect(decrypted).toBe(email);
      });
    });

    it('should throw error with invalid encrypted data', () => {
      const invalidData: EncryptedData = {
        encryptedValue: 'invalid-base64',
        iv: 'invalid-iv',
        tag: 'invalid-tag',
        keyVersion: 1,
        algorithm: 'aes-256-gcm'
      };

      expect(() => encryptionService.decrypt(invalidData)).toThrow('Decryption failed');
    });

    it('should throw error with corrupted tag', () => {
      const plaintext = 'test@example.com';
      const encrypted = encryptionService.encrypt(plaintext);
      
      const corruptedData: EncryptedData = {
        ...encrypted,
        tag: 'corrupted-tag'
      };

      expect(() => encryptionService.decrypt(corruptedData)).toThrow('Decryption failed');
    });

    it('should throw error with corrupted IV', () => {
      const plaintext = 'test@example.com';
      const encrypted = encryptionService.encrypt(plaintext);
      
      const corruptedData: EncryptedData = {
        ...encrypted,
        iv: 'corrupted-iv'
      };

      expect(() => encryptionService.decrypt(corruptedData)).toThrow('Decryption failed');
    });
  });

  describe('isEncrypted', () => {
    it('should return false for plain text', () => {
      expect(encryptionService.isEncrypted('test@example.com')).toBe(false);
      expect(encryptionService.isEncrypted('')).toBe(false);
      expect(encryptionService.isEncrypted('not-encrypted')).toBe(false);
    });

    it('should return true for encrypted data', () => {
      const plaintext = 'test-data';
      const encrypted = encryptionService.encrypt(plaintext);
      
      expect(encryptionService.isEncrypted(encrypted.encryptedValue)).toBe(true);
    });

    it('should handle invalid base64 gracefully', () => {
      expect(encryptionService.isEncrypted('invalid-base64!@#')).toBe(false);
    });
  });

  describe('static methods', () => {
    describe('generateKey', () => {
      it('should generate valid encryption key', () => {
        const key = DataEncryptionService.generateKey();
        expect(DataEncryptionService.validateKey(key)).toBe(true);
      });

      it('should generate different keys each time', () => {
        const key1 = DataEncryptionService.generateKey();
        const key2 = DataEncryptionService.generateKey();
        expect(key1).not.toBe(key2);
      });
    });

    describe('validateKey', () => {
      it('should validate correct key format', () => {
        const validKey = 'dGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcy1sb24=';
        expect(DataEncryptionService.validateKey(validKey)).toBe(true);
      });

      it('should reject invalid key format', () => {
        expect(DataEncryptionService.validateKey('short')).toBe(false);
        expect(DataEncryptionService.validateKey('')).toBe(false);
        expect(DataEncryptionService.validateKey('invalid-base64!@#')).toBe(false);
      });
    });
  });

  describe('round-trip encryption', () => {
    it('should handle multiple encrypt/decrypt cycles', () => {
      const originalText = 'test@example.com';
      let currentText = originalText;

      for (let i = 0; i < 5; i++) {
        const encrypted = encryptionService.encrypt(currentText);
        const decrypted = encryptionService.decrypt(encrypted);
        expect(decrypted).toBe(currentText);
        currentText = decrypted;
      }
    });

    it('should maintain data integrity across cycles', () => {
      const testData = [
        'user1@example.com',
        'user2@example.com',
        'admin@company.co.uk',
        'support+help@domain.org'
      ];

      testData.forEach(data => {
        const encrypted = encryptionService.encrypt(data);
        const decrypted = encryptionService.decrypt(encrypted);
        expect(decrypted).toBe(data);
      });
    });
  });

  describe('security properties', () => {
    it('should use different IVs for same input', () => {
      const plaintext = 'test@example.com';
      const results = [];
      
      for (let i = 0; i < 10; i++) {
        results.push(encryptionService.encrypt(plaintext));
      }

      const ivs = results.map(r => r.iv);
      const uniqueIvs = new Set(ivs);
      
      expect(uniqueIvs.size).toBe(10);
    });

    it('should produce different encrypted values for same input', () => {
      const plaintext = 'test@example.com';
      const results = [];
      
      for (let i = 0; i < 10; i++) {
        results.push(encryptionService.encrypt(plaintext));
      }

      const encryptedValues = results.map(r => r.encryptedValue);
      const uniqueValues = new Set(encryptedValues);
      
      expect(uniqueValues.size).toBe(10);
    });

    it('should use consistent algorithm and key version', () => {
      const plaintext = 'test@example.com';
      const result = encryptionService.encrypt(plaintext);
      
      expect(result.algorithm).toBe('aes-256-gcm');
      expect(result.keyVersion).toBe(1);
    });
  });
});
