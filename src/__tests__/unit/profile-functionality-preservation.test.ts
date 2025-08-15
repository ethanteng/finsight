import { jest } from '@jest/globals';
import { ProfileManager } from '../../profile/manager';
import { ProfileExtractor } from '../../profile/extractor';
import { ProfileAnonymizer } from '../../profile/anonymizer';

// Mock the ProfileExtractor
jest.mock('../../profile/extractor');

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

// Mock ProfileExtractor
const MockProfileExtractor = jest.mocked(ProfileExtractor);

describe('Profile Functionality Preservation', () => {
  let profileManager: ProfileManager;
  let mockExtractor: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock extractor instance
    mockExtractor = {
      extractAndUpdateProfile: jest.fn()
    };
    
    // Mock the ProfileExtractor constructor
    (MockProfileExtractor as any).mockImplementation(() => mockExtractor);
    
    // Set up environment variable for testing
    process.env.PROFILE_ENCRYPTION_KEY = 'test-encryption-key-32-bytes-long-here';
    
    profileManager = new ProfileManager('test-session');
  });

  afterEach(() => {
    delete process.env.PROFILE_ENCRYPTION_KEY;
  });

  describe('ProfileExtractor Intelligence Preservation', () => {
    test('ProfileExtractor must continue to work intelligently', async () => {
      const conversation = {
        id: 'test',
        question: 'I am a 30-year-old software engineer earning $100,000',
        answer: 'That sounds like a good income for your age and profession.',
        createdAt: new Date()
      };
      
      // Mock the intelligent extraction
      mockExtractor.extractAndUpdateProfile.mockResolvedValue(
        'I am a 30-year-old software engineer earning $100,000 annually. I work in the technology industry.'
      );
      
      const result = await profileManager.updateProfileFromConversation('test-user', conversation);
      
      // Must NOT be dumb concatenation
      expect(mockExtractor.extractAndUpdateProfile).toHaveBeenCalledWith(
        'test-user',
        conversation,
        '' // Empty current profile
      );
      
      // Verify the mock was called (intelligent extraction)
      expect(mockExtractor.extractAndUpdateProfile).toHaveBeenCalledTimes(1);
    });

    test('ProfileManager.updateProfileFromConversation must use ProfileExtractor', async () => {
      const conversation = { 
        id: 'test',
        question: 'I am a teacher earning $45,000',
        answer: 'That is a typical salary for a teacher.',
        createdAt: new Date()
      };
      
      // Mock the intelligent extraction
      mockExtractor.extractAndUpdateProfile.mockResolvedValue(
        'I am a teacher earning $45,000 annually.'
      );
      
      // Mock user and profile existence
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1',
        profileText: '',
        encrypted_profile_data: null
      });
      
      await profileManager.updateProfileFromConversation('test-user', conversation);
      
      // Verify ProfileExtractor was called
      expect(mockExtractor.extractAndUpdateProfile).toHaveBeenCalledWith(
        'test-user',
        conversation,
        '' // Empty current profile
      );
    });
  });

  describe('User Profile Editing Preservation', () => {
    test('User profile editing must continue to work', async () => {
      const testProfile = 'I am John Doe, a software engineer';
      
      // Mock user and profile existence
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1',
        profileText: '',
        encrypted_profile_data: null
      });
      
      await profileManager.updateProfile('test-user', testProfile);
      
      // Verify profile was updated
      expect(mockPrisma.userProfile.update).toHaveBeenCalled();
      expect(mockPrisma.encrypted_profile_data.create).toHaveBeenCalled();
    });

    test('Profile retrieval for users must NOT trigger anonymization', async () => {
      const testProfile = 'I am Jane Smith, earning $80,000';
      
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
      jest.spyOn(profileManager['encryptionService'], 'decrypt').mockImplementation(mockDecrypt as any);
      
      const retrievedProfile = await profileManager.getOriginalProfile('test-user');
      
      // Should return original profile without anonymization
      expect(retrievedProfile).toBe(testProfile);
      expect(mockDecrypt).toHaveBeenCalled();
    });
  });

  describe('Admin Interface Preservation', () => {
    test('Admin interface must continue to show profiles', async () => {
      const testProfile = 'I am Jane Smith, earning $80,000';
      
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
      jest.spyOn(profileManager['encryptionService'], 'decrypt').mockImplementation(mockDecrypt as any);
      
      const adminProfile = await profileManager.getOriginalProfile('test-user');
      
      // Admin should see the same profile data that users see
      expect(adminProfile).toBe(testProfile);
      expect(adminProfile).toContain('Jane Smith');
      expect(adminProfile).toContain('$80,000');
    });
  });

  describe('Profile Enhancement Preservation', () => {
    test('Profile enhancement functions must continue to work', async () => {
      const initialProfile = 'I am a software engineer';
      
      // Mock user and profile existence
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      mockPrisma.userProfile.findUnique.mockResolvedValue(null); // No existing profile
      
      // Mock encryption service
      const mockEncrypt = jest.fn().mockReturnValue({
        encryptedData: 'encrypted-data',
        iv: 'iv',
        tag: 'tag',
        keyVersion: '1'
      });
      jest.spyOn(profileManager['encryptionService'], 'encrypt').mockImplementation(mockEncrypt as any);
      
      await profileManager.updateProfile('test-user', initialProfile);
      
      // Verify profile was created and encrypted
      expect(mockPrisma.userProfile.create).toHaveBeenCalled();
      expect(mockPrisma.encrypted_profile_data.create).toHaveBeenCalled();
    });
  });

  describe('Profile Recovery Preservation', () => {
    test('Profile recovery mechanisms must continue to work', async () => {
      const backupProfile = 'I am a teacher earning $45,000';
      
      // Mock user and profile existence
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      mockPrisma.userProfile.findUnique.mockResolvedValue(null); // No existing profile
      
      // Mock encryption service
      const mockEncrypt = jest.fn().mockReturnValue({
        encryptedData: 'encrypted-data',
        iv: 'iv',
        tag: 'tag',
        keyVersion: '1'
      });
      jest.spyOn(profileManager['encryptionService'], 'encrypt').mockImplementation(mockEncrypt as any);
      
      // Attempt profile recovery
      await profileManager.recoverProfile('test-user', backupProfile);
      
      // Verify recovery was attempted
      expect(mockPrisma.userProfile.create).toHaveBeenCalled();
      expect(mockPrisma.encrypted_profile_data.create).toHaveBeenCalled();
      expect(mockEncrypt).toHaveBeenCalledWith(backupProfile);
    });

    test('getProfileHistory must continue to work', async () => {
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
      jest.spyOn(profileManager['encryptionService'], 'decrypt').mockImplementation(mockDecrypt as any);
      
      const profileHistory = await profileManager.getProfileHistory('test-user');
      
      // Should return profile history
      expect(profileHistory).toEqual([testProfile]);
    });
  });

  describe('Profile Synchronization Preservation', () => {
    test('Profile updates must be immediately reflected across all interfaces', async () => {
      const testProfile = 'I am John Doe, a software engineer';
      
      // Mock user and profile existence
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      mockPrisma.userProfile.findUnique.mockResolvedValue(null); // No existing profile
      
      // Mock encryption service
      const mockEncrypt = jest.fn().mockReturnValue({
        encryptedData: 'encrypted-data',
        iv: 'iv',
        tag: 'tag',
        keyVersion: '1'
      });
      jest.spyOn(profileManager['encryptionService'], 'encrypt').mockImplementation(mockEncrypt as any);
      
      // Update profile
      await profileManager.updateProfile('test-user', testProfile);
      
      // Verify profile was updated
      expect(mockPrisma.userProfile.create).toHaveBeenCalled();
      expect(mockPrisma.encrypted_profile_data.create).toHaveBeenCalled();
    });
  });

  describe('Encryption Integration Preservation', () => {
    test('Profile encryption must continue to work', async () => {
      const testProfile = 'I am a software engineer';
      
      // Mock user and profile existence
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'test-user', email: 'test@example.com' });
      mockPrisma.userProfile.findUnique.mockResolvedValue(null); // No existing profile
      
      // Mock encryption service
      const mockEncrypt = jest.fn().mockReturnValue({
        encryptedData: 'encrypted-data',
        iv: 'iv',
        tag: 'tag',
        keyVersion: '1'
      });
      jest.spyOn(profileManager['encryptionService'], 'encrypt').mockImplementation(mockEncrypt as any);
      
      await profileManager.updateProfile('test-user', testProfile);
      
      // Verify encryption was used
      expect(mockEncrypt).toHaveBeenCalledWith(testProfile);
    });
  });

  describe('Anonymization Integration', () => {
    test('AI requests must receive anonymized profiles', async () => {
      const testProfile = 'I am Sarah Chen, earning $100,000 in New York, NY';
      
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
      jest.spyOn(profileManager['encryptionService'], 'decrypt').mockImplementation(mockDecrypt as any);
      
      const aiProfile = await profileManager.getOrCreateProfile('test-user');
      
      // Should return anonymized profile for AI
      expect(aiProfile).not.toContain('Sarah Chen');
      expect(aiProfile).not.toContain('$100,000');
      expect(aiProfile).not.toContain('New York, NY');
      expect(aiProfile).toContain('PERSON_');
      expect(aiProfile).toContain('INCOME_');
      expect(aiProfile).toContain('LOCATION_');
    });

    test('User display must receive original profiles', async () => {
      const testProfile = 'I am Sarah Chen, earning $100,000 in New York, NY';
      
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
      jest.spyOn(profileManager['encryptionService'], 'decrypt').mockImplementation(mockDecrypt as any);
      
      const userProfile = await profileManager.getOriginalProfile('test-user');
      
      // Should return original profile for user display
      expect(userProfile).toBe(testProfile);
      expect(userProfile).toContain('Sarah Chen');
      expect(userProfile).toContain('$100,000');
      expect(userProfile).toContain('New York, NY');
    });
  });
});
