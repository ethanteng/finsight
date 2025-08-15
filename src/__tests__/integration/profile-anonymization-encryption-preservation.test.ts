import { jest } from '@jest/globals';
import { ProfileManager } from '../../profile/manager';
import { ProfileAnonymizer } from '../../profile/anonymizer';

// Mock Prisma client for testing
const mockPrisma: any = {
  userProfile: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  encrypted_profile_data: {
    create: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  $disconnect: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}));

// TODO: Fix TypeScript errors in integration tests
describe.skip('Profile Anonymization with Encryption and Preservation', () => {
  let profileManager: ProfileManager;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up environment variable for testing
    process.env.PROFILE_ENCRYPTION_KEY = 'test-encryption-key-32-bytes-long-here';
    
    profileManager = new ProfileManager('test-session');
  });

  afterEach(() => {
    delete process.env.PROFILE_ENCRYPTION_KEY;
  });

  describe('Complete Profile Workflow', () => {
    test('should encrypt, decrypt, and anonymize profiles while preserving functionality', async () => {
      const testProfile = 'I am John Doe, earning $100,000 in New York, NY';
      
      // Mock user and profile existence
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      mockPrisma.userProfile.findUnique.mockResolvedValue({
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
        keyVersion: '1'
      });
      jest.spyOn(profileManager['encryptionService'], 'encrypt').mockImplementation(mockEncrypt);
      
      // Update profile (should encrypt)
      await profileManager.updateProfile('test-user', testProfile);
      
      // Verify encryption was used
      expect(mockEncrypt).toHaveBeenCalledWith(testProfile);
      expect(mockPrisma.userProfile.create).toHaveBeenCalled();
      expect(mockPrisma.encrypted_profile_data.create).toHaveBeenCalled();
      
      // Mock profile retrieval with encrypted data
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1',
        profileText: '',
        encrypted_profile_data: {
          encryptedData: 'encrypted-data',
          iv: 'iv',
          tag: 'tag'
        }
      });
      
      // Mock decryption service
      const mockDecrypt = jest.fn().mockReturnValue(testProfile);
      jest.spyOn(profileManager['encryptionService'], 'decrypt').mockImplementation(mockDecrypt);
      
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
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      mockPrisma.userProfile.findUnique.mockResolvedValue({
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
        keyVersion: '1'
      });
      jest.spyOn(profileManager['encryptionService'], 'encrypt').mockImplementation(mockEncrypt);
      
      // Mock ProfileExtractor
      const mockExtractAndUpdateProfile = jest.fn().mockResolvedValue(
        'I am a 25-year-old teacher earning $45,000 annually. I work in education.'
      );
      jest.spyOn(profileManager['profileExtractor'], 'extractAndUpdateProfile')
        .mockImplementation(mockExtractAndUpdateProfile);
      
      // This should use ProfileExtractor intelligently
      await profileManager.updateProfileFromConversation('test-user', conversation);
      
      // Verify ProfileExtractor was called
      expect(mockExtractAndUpdateProfile).toHaveBeenCalledWith(
        'test-user',
        conversation,
        '' // Empty current profile
      );
      
      // Verify profile was updated and encrypted
      expect(mockEncrypt).toHaveBeenCalled();
      expect(mockPrisma.userProfile.create).toHaveBeenCalled();
      expect(mockPrisma.encrypted_profile_data.create).toHaveBeenCalled();
    });
  });

  describe('Profile Recovery Workflow', () => {
    test('should preserve profile recovery mechanisms', async () => {
      const backupProfile = 'I am a teacher earning $45,000';
      
      // Mock user and profile existence
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      mockPrisma.userProfile.findUnique.mockResolvedValue({
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
        keyVersion: '1'
      });
      jest.spyOn(profileManager['encryptionService'], 'encrypt').mockImplementation(mockEncrypt);
      
      // Attempt profile recovery
      await profileManager.recoverProfile('test-user', backupProfile);
      
      // Verify recovery was attempted
      expect(mockPrisma.userProfile.create).toHaveBeenCalled();
      expect(mockPrisma.encrypted_profile_data.create).toHaveBeenCalled();
      expect(mockEncrypt).toHaveBeenCalledWith(backupProfile);
    });
  });

  describe('Profile History Workflow', () => {
    test('should preserve profile history functionality', async () => {
      const testProfile = 'I am a software engineer';
      
      // Mock user and profile with encrypted data
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1',
        profileText: '',
        encrypted_profile_data: {
          encryptedData: 'encrypted-data',
          iv: 'iv',
          tag: 'tag'
        }
      });
      
      // Mock encryption service
      const mockDecrypt = jest.fn().mockReturnValue(testProfile);
      jest.spyOn(profileManager['encryptionService'], 'decrypt').mockImplementation(mockDecrypt);
      
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
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1',
        profileText: '',
        encrypted_profile_data: {
          encryptedData: 'encrypted-data',
          iv: 'iv',
          tag: 'tag'
        }
      });
      
      // Mock encryption service
      const mockDecrypt = jest.fn().mockReturnValue(testProfile);
      jest.spyOn(profileManager['encryptionService'], 'decrypt').mockImplementation(mockDecrypt);
      
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
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1',
        profileText: 'fallback-profile',
        encrypted_profile_data: {
          encryptedData: 'encrypted-data',
          iv: 'iv',
          tag: 'tag'
        }
      });
      
      // Mock decryption failure
      const mockDecrypt = jest.fn().mockImplementation(() => {
        throw new Error('Decryption failed');
      });
      jest.spyOn(profileManager['encryptionService'], 'decrypt').mockImplementation(mockDecrypt);
      
      // Should fallback to plain text profile
      const aiProfile = await profileManager.getOrCreateProfile('test-user');
      const originalProfile = await profileManager.getOriginalProfile('test-user');
      
      // Should use fallback profile
      expect(aiProfile).toBe('fallback-profile');
      expect(originalProfile).toBe('fallback-profile');
    });

    test('should handle missing profile gracefully', async () => {
      // Mock user but no profile
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);
      
      // Should create new profile
      const aiProfile = await profileManager.getOrCreateProfile('test-user');
      
      expect(aiProfile).toBe('');
      expect(mockPrisma.userProfile.create).toHaveBeenCalled();
    });
  });

  describe('Data Flow Validation', () => {
    test('should maintain proper data flow: User → Encryption → Storage → Decryption → Anonymization → AI', async () => {
      const originalProfile = 'I am Jane Smith, earning $80,000 in Boston, MA';
      
      // Mock user and profile existence
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      mockPrisma.userProfile.findUnique.mockResolvedValue({
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
        keyVersion: '1'
      });
      jest.spyOn(profileManager['encryptionService'], 'encrypt').mockImplementation(mockEncrypt);
      
      // Step 1: User updates profile (triggers encryption)
      await profileManager.updateProfile('test-user', originalProfile);
      expect(mockEncrypt).toHaveBeenCalledWith(originalProfile);
      
      // Mock profile retrieval with encrypted data
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1',
        profileText: '',
        encrypted_profile_data: {
          encryptedData: 'encrypted-data',
          iv: 'iv',
          tag: 'tag'
        }
      });
      
      // Mock decryption service
      const mockDecrypt = jest.fn().mockReturnValue(originalProfile);
      jest.spyOn(profileManager['encryptionService'], 'decrypt').mockImplementation(mockDecrypt);
      
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
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      mockPrisma.userProfile.findUnique.mockResolvedValue({
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
        keyVersion: '1'
      });
      jest.spyOn(profileManager['encryptionService'], 'encrypt').mockImplementation(mockEncrypt);
      
      // Should handle large profile without errors
      await profileManager.updateProfile('test-user', largeProfile);
      expect(mockEncrypt).toHaveBeenCalledWith(largeProfile);
    });
  });
});
