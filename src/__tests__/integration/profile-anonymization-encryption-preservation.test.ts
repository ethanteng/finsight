import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ProfileManager } from '../../profile/manager';
import { PrismaClient } from '@prisma/client';

// Mock PrismaClient at the module level
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn()
}));

// Mock the ProfileManager dependencies
jest.mock('../../profile/encryption', () => ({
  ProfileEncryptionService: jest.fn().mockImplementation(() => ({
    encrypt: jest.fn().mockReturnValue({
      encryptedData: 'encrypted-data',
      iv: 'iv',
      tag: 'tag',
      keyVersion: 1
    }),
    decrypt: jest.fn().mockReturnValue('decrypted-profile-text'),
    validateKey: jest.fn().mockReturnValue(true)
  }))
}));

jest.mock('../../profile/extractor', () => ({
  ProfileExtractor: jest.fn().mockImplementation(() => ({
    extractAndUpdateProfile: jest.fn().mockResolvedValue('extracted-profile-text')
  }))
}));

jest.mock('../../profile/anonymizer', () => ({
  ProfileAnonymizer: jest.fn().mockImplementation(() => ({
    anonymizeProfile: jest.fn().mockReturnValue({
      anonymizedProfile: 'anonymized-profile-text',
      anonymizationMap: new Map()
    })
  }))
}));

describe('Profile Anonymization with Encryption and Preservation', () => {
  let profileManager: ProfileManager;
  let mockPrisma: any;
  let mockUserProfileCreate: any;
  let mockUserProfileUpdate: any;
  let mockUserProfileFindUnique: any;
  let mockEncryptedProfileDataCreate: any;
  let mockEncryptedProfileDataUpdate: any;
  let mockUserFindUnique: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock Prisma client methods
    mockUserProfileCreate = jest.fn();
    mockUserProfileUpdate = jest.fn();
    mockUserProfileFindUnique = jest.fn();
    mockEncryptedProfileDataCreate = jest.fn();
    mockEncryptedProfileDataUpdate = jest.fn();
    mockUserFindUnique = jest.fn();
    
    // Mock PrismaClient constructor
    mockPrisma = {
      userProfile: {
        create: mockUserProfileCreate,
        update: mockUserProfileUpdate,
        findUnique: mockUserProfileFindUnique
      },
      encrypted_profile_data: {
        create: mockEncryptedProfileDataCreate,
        update: mockEncryptedProfileDataUpdate
      },
      user: {
        findUnique: mockUserFindUnique
      },
      $disconnect: jest.fn()
    };
    
    // Mock the PrismaClient constructor to return our mock
    (PrismaClient as jest.Mock).mockImplementation(() => mockPrisma);
    
    // Create ProfileManager instance
    profileManager = new ProfileManager('test-session');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Complete Profile Workflow', () => {
    test('should encrypt, decrypt, and anonymize profiles while preserving functionality', async () => {
      const testProfile = 'John Doe is a 35-year-old software engineer earning $100,000 annually. He lives in New York, NY.';
      
      // Mock user and profile existence
      (mockUserFindUnique as any).mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      (mockUserProfileFindUnique as any).mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1',
        profileText: '',
        encrypted_profile_data: null
      });
      
      // Mock encryption service
      const mockEncrypt = jest.fn().mockReturnValue({
        encryptedData: 'encrypted-data',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 1
      });
      
      // Use proper jest mocking with type assertion
      const encryptionService = profileManager['encryptionService'] as any;
      if (encryptionService && typeof encryptionService.encrypt === 'function') {
        jest.spyOn(encryptionService, 'encrypt').mockImplementation(mockEncrypt as any);
      }
      
      // Update profile (should encrypt)
      await profileManager.updateProfile('test-user', testProfile);
      
      // Verify encryption was used
      expect(mockEncrypt).toHaveBeenCalledWith(testProfile);
      expect(mockUserProfileCreate).toHaveBeenCalled();
      expect(mockEncryptedProfileDataCreate).toHaveBeenCalled();
      
      // Mock profile retrieval with encrypted data
      (mockUserProfileFindUnique as any).mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1',
        profileText: '',
        encrypted_profile_data: {
          encryptedData: 'encrypted-data',
          iv: 'iv',
          tag: 'tag'
        }
      });
      
      // Mock decryption service with proper typing
      const mockDecrypt = jest.fn().mockReturnValue(testProfile);
      if (encryptionService && typeof encryptionService.decrypt === 'function') {
        jest.spyOn(encryptionService, 'decrypt').mockImplementation(mockDecrypt as any);
      }
      
      // Get profile for AI (should decrypt and anonymize)
      const anonymizedProfile = await profileManager.getOrCreateProfile('test-user');
      
      // Get original profile for user display (should decrypt without anonymization)
      const originalProfile = await profileManager.getOriginalProfile('test-user');
      
      // Verify anonymization
      expect(anonymizedProfile).not.toContain('John Doe');
      expect(anonymizedProfile).not.toContain('$100,000');
      expect(anonymizedProfile).not.toContain('New York, NY');
      expect(anonymizedProfile).toContain('PERSON_');
      expect(anonymizedProfile).toContain('INCOME_');
      expect(anonymizedProfile).toContain('LOCATION_');
      
      // Verify original profile is preserved
      expect(originalProfile).toBe(testProfile);
      expect(originalProfile).toContain('John Doe');
      expect(originalProfile).toContain('$100,000');
      expect(originalProfile).toContain('New York, NY');
    });
  });

  describe('Profile Enhancement Workflow', () => {
    test('should preserve intelligent profile building', async () => {
      const conversation = {
        id: 'test',
        question: 'I am a 25-year-old teacher earning $45,000',
        answer: 'That is a typical salary for a teacher in your area.',
        createdAt: new Date()
      };
      
      // Mock user and profile existence
      (mockUserFindUnique as any).mockResolvedValue({ id: 'test-user', email: 'test@example.com' } as any);
      (mockUserProfileFindUnique as any).mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1',
        profileText: '',
        encrypted_profile_data: null
      } as any);
      
      // Mock encryption service with proper typing
      const mockEncrypt = jest.fn().mockReturnValue({
        encryptedData: 'encrypted-data',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 1
      });
      
      const encryptionService = profileManager['encryptionService'] as any;
      if (encryptionService && typeof encryptionService.encrypt === 'function') {
        jest.spyOn(encryptionService, 'encrypt').mockImplementation(mockEncrypt as any);
      }
      
      // Mock ProfileExtractor with proper typing
      const mockExtractAndUpdateProfile = jest.fn().mockReturnValue(
        Promise.resolve('I am a 25-year-old teacher earning $45,000 annually. I work in education.')
      );
      
      const profileExtractor = profileManager['profileExtractor'] as any;
      if (profileExtractor && typeof profileExtractor.extractAndUpdateProfile === 'function') {
        jest.spyOn(profileExtractor, 'extractAndUpdateProfile')
          .mockImplementation(mockExtractAndUpdateProfile as any);
      }
      
      // This should use ProfileExtractor intelligently
      await profileManager.updateProfileFromConversation('test-user', conversation as any);
      
      // Verify ProfileExtractor was called with type assertion
      expect(mockExtractAndUpdateProfile).toHaveBeenCalled();
      
      // Verify profile was updated and encrypted
      expect(mockEncrypt).toHaveBeenCalled();
      expect(mockUserProfileCreate).toHaveBeenCalled();
      expect(mockEncryptedProfileDataCreate).toHaveBeenCalled();
    });
  });

  describe('Profile Recovery Workflow', () => {
    test('should preserve profile recovery mechanisms', async () => {
      const backupProfile = 'I am a teacher earning $45,000';
      
      // Mock user and profile existence
      (mockUserFindUnique as any).mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      (mockUserProfileFindUnique as any).mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1',
        profileText: '',
        encrypted_profile_data: null
      });
      
      // Mock encryption service with proper typing
      const mockEncrypt = jest.fn().mockReturnValue({
        encryptedData: 'encrypted-data',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 1
      });
      
      const encryptionService = profileManager['encryptionService'] as any;
      if (encryptionService && typeof encryptionService.encrypt === 'function') {
        jest.spyOn(encryptionService, 'encrypt').mockImplementation(mockEncrypt as any);
      }
      
      // Attempt profile recovery
      await profileManager.recoverProfile('test-user', backupProfile);
      
      // Verify recovery was attempted
      expect(mockUserProfileCreate).toHaveBeenCalled();
      expect(mockEncryptedProfileDataCreate).toHaveBeenCalled();
      expect(mockEncrypt).toHaveBeenCalledWith(backupProfile);
    });
  });

  describe('Profile History Workflow', () => {
    test('should preserve profile history functionality', async () => {
      const testProfile = 'I am a software engineer';
      
      // Mock user and profile with encrypted data
      (mockUserFindUnique as any).mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      (mockUserProfileFindUnique as any).mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1',
        profileText: '',
        encrypted_profile_data: {
          encryptedData: 'encrypted-data',
          iv: 'iv',
          tag: 'tag'
        }
      });
      
      // Mock encryption service with proper typing
      const mockDecrypt = jest.fn().mockReturnValue(testProfile);
      const encryptionService = profileManager['encryptionService'] as any;
      if (encryptionService && typeof encryptionService.decrypt === 'function') {
        jest.spyOn(encryptionService, 'decrypt').mockImplementation(mockDecrypt as any);
      }
      
      // Get profile history
      const profileHistory = await profileManager.getProfileHistory('test-user');
      
      // Should return profile history
      expect(profileHistory).toEqual([testProfile]);
      expect(mockDecrypt).toHaveBeenCalled();
    });
  });

  describe('Session-Based Anonymization', () => {
    test('should maintain consistent anonymization within same session', async () => {
      const testProfile = 'I am Sarah Chen, earning $100,000 in Austin, TX';
      
      // Mock user and profile with encrypted data
      (mockUserFindUnique as any).mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      (mockUserProfileFindUnique as any).mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1',
        profileText: '',
        encrypted_profile_data: {
          encryptedData: 'encrypted-data',
          iv: 'iv',
          tag: 'tag'
        }
      });
      
      // Mock encryption service with proper typing
      const mockDecrypt = jest.fn().mockReturnValue(testProfile);
      const encryptionService = profileManager['encryptionService'] as any;
      if (encryptionService && typeof encryptionService.decrypt === 'function') {
        jest.spyOn(encryptionService, 'decrypt').mockImplementation(mockDecrypt as any);
      }
      
      // First AI request
      const aiProfile1 = await profileManager.getOrCreateProfile('test-user');
      
      // Second AI request (same session)
      const aiProfile2 = await profileManager.getOrCreateProfile('test-user');
      
      // Should produce identical anonymized results
      expect(aiProfile1).toBe(aiProfile2);
      
      // Should contain anonymization tokens
      expect(aiProfile1).toContain('PERSON_');
      expect(aiProfile1).toContain('INCOME_');
      expect(aiProfile1).toContain('LOCATION_');
      
      // Should not contain original data
      expect(aiProfile1).not.toContain('Sarah Chen');
      expect(aiProfile1).not.toContain('$100,000');
      expect(aiProfile1).not.toContain('Austin, TX');
    });
  });

  describe('Error Handling', () => {
    test('should handle decryption failures gracefully', async () => {
      // Mock user and profile with encrypted data
      (mockUserFindUnique as any).mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      (mockUserProfileFindUnique as any).mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1',
        profileText: 'fallback-profile',
        encrypted_profile_data: {
          encryptedData: 'encrypted-data',
          iv: 'iv',
          tag: 'tag'
        }
      });
      
      // Mock decryption failure with proper typing
      const mockDecrypt = jest.fn().mockImplementation(() => {
        throw new Error('Decryption failed');
      });
      const encryptionService = profileManager['encryptionService'] as any;
      if (encryptionService && typeof encryptionService.decrypt === 'function') {
        jest.spyOn(encryptionService, 'decrypt').mockImplementation(mockDecrypt as any);
      }
      
      // Should fallback to plain text profile
      const aiProfile = await profileManager.getOrCreateProfile('test-user');
      const originalProfile = await profileManager.getOriginalProfile('test-user');
      
      // Should use fallback profile
      expect(aiProfile).toBe('fallback-profile');
      expect(originalProfile).toBe('fallback-profile');
    });

    test('should handle missing profile gracefully', async () => {
      // Mock user but no profile
      (mockUserFindUnique as any).mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      (mockUserProfileFindUnique as any).mockResolvedValue(null);
      
      // Should create new profile
      const aiProfile = await profileManager.getOrCreateProfile('test-user');
      
      expect(aiProfile).toBe('');
      expect(mockUserProfileCreate).toHaveBeenCalled();
    });
  });

  describe('Data Flow Validation', () => {
    test('should maintain proper data flow: User → Encryption → Storage → Decryption → Anonymization → AI', async () => {
      const originalProfile = 'I am Jane Smith, earning $80,000 in Boston, MA';
      
      // Mock user and profile existence
      (mockUserFindUnique as any).mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      (mockUserProfileFindUnique as any).mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1',
        profileText: '',
        encrypted_profile_data: null
      });
      
      // Mock encryption service with proper typing
      const mockEncrypt = jest.fn().mockReturnValue({
        encryptedData: 'encrypted-data',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 1
      });
      const encryptionService = profileManager['encryptionService'] as any;
      if (encryptionService && typeof encryptionService.encrypt === 'function') {
        jest.spyOn(encryptionService, 'encrypt').mockImplementation(mockEncrypt as any);
      }
      
      // Step 1: User updates profile (triggers encryption)
      await profileManager.updateProfile('test-user', originalProfile);
      expect(mockEncrypt).toHaveBeenCalledWith(originalProfile);
      
      // Mock profile retrieval with encrypted data
      (mockUserProfileFindUnique as any).mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1',
        profileText: '',
        encrypted_profile_data: {
          encryptedData: 'encrypted-data',
          iv: 'iv',
          tag: 'tag'
        }
      });
      
      // Mock decryption service with proper typing
      const mockDecrypt = jest.fn().mockReturnValue(originalProfile);
      if (encryptionService && typeof encryptionService.decrypt === 'function') {
        jest.spyOn(encryptionService, 'decrypt').mockImplementation(mockDecrypt as any);
      }
      
      // Step 2: AI requests profile (triggers decryption + anonymization)
      const aiProfile = await profileManager.getOrCreateProfile('test-user');
      expect(mockDecrypt).toHaveBeenCalled();
      expect(aiProfile).not.toContain('Jane Smith');
      expect(aiProfile).not.toContain('$80,000');
      expect(aiProfile).not.toContain('Boston, MA');
      expect(aiProfile).toContain('PERSON_');
      expect(aiProfile).toContain('INCOME_');
      expect(aiProfile).toContain('LOCATION_');
      
      // Step 3: User requests profile (triggers decryption only, no anonymization)
      const userProfile = await profileManager.getOriginalProfile('test-user');
      expect(mockDecrypt).toHaveBeenCalled();
      expect(userProfile).toBe(originalProfile);
      expect(userProfile).toContain('Jane Smith');
      expect(userProfile).toContain('$80,000');
      expect(userProfile).toContain('Boston, MA');
    });
  });

  describe('Performance and Memory', () => {
    test('should handle large profiles efficiently', async () => {
      // Create a large profile
      const largeProfile = 'I am ' + 'A'.repeat(1000) + ', earning $' + '1'.repeat(1000) + ' in ' + 'B'.repeat(1000) + ', ' + 'C'.repeat(1000);
      
      // Mock user and profile existence
      (mockUserFindUnique as any).mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      (mockUserProfileFindUnique as any).mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1',
        profileText: '',
        encrypted_profile_data: null
      });
      
      // Mock encryption service with proper typing
      const mockEncrypt = jest.fn().mockReturnValue({
        encryptedData: 'encrypted-data',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 1
      });
      const encryptionService = profileManager['encryptionService'] as any;
      if (encryptionService && typeof encryptionService.encrypt === 'function') {
        jest.spyOn(encryptionService, 'encrypt').mockImplementation(mockEncrypt as any);
      }
      
      // Should handle large profile without errors
      await profileManager.updateProfile('test-user', largeProfile);
      expect(mockEncrypt).toHaveBeenCalledWith(largeProfile);
    });
  });
});
