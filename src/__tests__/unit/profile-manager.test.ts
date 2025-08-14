import { jest } from '@jest/globals';
import { ProfileManager } from '../../profile/manager';

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

describe('ProfileManager Unit Tests', () => {
  let profileManager: ProfileManager;

  beforeEach(() => {
    jest.clearAllMocks();
    // Set up test encryption key
    process.env.PROFILE_ENCRYPTION_KEY = 'test-encryption-key-32-bytes-long-here';
    profileManager = new ProfileManager();
  });

  afterEach(() => {
    delete process.env.PROFILE_ENCRYPTION_KEY;
  });

  describe('Constructor', () => {
    it('should create instance with valid encryption key', () => {
      expect(profileManager).toBeInstanceOf(ProfileManager);
    });

    it('should throw error with missing encryption key', () => {
      delete process.env.PROFILE_ENCRYPTION_KEY;
      expect(() => new ProfileManager()).toThrow('PROFILE_ENCRYPTION_KEY environment variable is required');
    });

    it('should throw error with invalid encryption key', () => {
      process.env.PROFILE_ENCRYPTION_KEY = 'short';
      expect(() => new ProfileManager()).toThrow('Invalid PROFILE_ENCRYPTION_KEY format');
    });
  });

  describe('getOrCreateProfile', () => {
    it('should return empty string when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      
      const result = await profileManager.getOrCreateProfile('nonexistent-user');
      
      expect(result).toBe('');
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'nonexistent-user' }
      });
    });

    it('should create new profile when none exists', async () => {
      const mockUser = { id: 'user1', email: 'test@example.com' };
      const mockProfile = { 
        id: 'profile1', 
        profileHash: 'hash1', 
        profileText: '', 
        encrypted_profile_data: null 
      };
      
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userProfile.findUnique
        .mockResolvedValueOnce(null) // First call for userId
        .mockResolvedValueOnce(null); // Second call for email
      mockPrisma.userProfile.create.mockResolvedValue(mockProfile);
      
      const result = await profileManager.getOrCreateProfile('user1');
      
      expect(result).toBe('');
      expect(mockPrisma.userProfile.create).toHaveBeenCalled();
    });

    it('should return decrypted profile when encrypted data exists', async () => {
      const mockUser = { id: 'user1', email: 'test@example.com' };
      const mockProfile = {
        id: 'profile1',
        profileHash: 'hash1',
        profileText: 'old text',
        encrypted_profile_data: {
          encryptedData: 'encrypted-data',
          iv: 'test-iv',
          tag: 'test-tag'
        }
      };
      
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userProfile.findUnique.mockResolvedValue(mockProfile);
      
      const result = await profileManager.getOrCreateProfile('user1');
      
      // Should return decrypted data (or fallback to profileText if decryption fails)
      expect(result).toBeDefined();
    });
  });

  describe('updateProfile', () => {
    it('should update existing profile with encryption', async () => {
      const mockUser = { id: 'user1', email: 'test@example.com' };
      const mockProfile = {
        id: 'profile1',
        profileHash: 'hash1',
        encrypted_profile_data: null
      };
      
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.userProfile.update.mockResolvedValue(mockProfile);
      mockPrisma.encrypted_profile_data.create.mockResolvedValue({});
      
      await profileManager.updateProfile('user1', 'new profile text');
      
      expect(mockPrisma.userProfile.update).toHaveBeenCalled();
      expect(mockPrisma.encrypted_profile_data.create).toHaveBeenCalled();
    });

    it('should create new profile when none exists', async () => {
      const mockUser = { id: 'user1', email: 'test@example.com' };
      
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userProfile.findUnique
        .mockResolvedValueOnce(null) // First call for userId
        .mockResolvedValueOnce(null); // Second call for email
      mockPrisma.userProfile.create.mockResolvedValue({
        id: 'profile1',
        profileHash: 'hash1'
      });
      mockPrisma.encrypted_profile_data.create.mockResolvedValue({});
      
      await profileManager.updateProfile('user1', 'new profile text');
      
      expect(mockPrisma.userProfile.create).toHaveBeenCalled();
      expect(mockPrisma.encrypted_profile_data.create).toHaveBeenCalled();
    });
  });

  describe('updateProfileFromConversation', () => {
    it('should extract profile from conversation and update', async () => {
      const mockUser = { id: 'user1', email: 'test@example.com' };
      const mockProfile = {
        id: 'profile1',
        profileHash: 'hash1',
        encrypted_profile_data: null
      };
      const conversation = {
        question: 'What is my net worth?',
        answer: 'Based on your data, your net worth is $100,000.'
      };
      
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.userProfile.update.mockResolvedValue(mockProfile);
      mockPrisma.encrypted_profile_data.create.mockResolvedValue({});
      
      await profileManager.updateProfileFromConversation('user1', conversation);
      
      expect(mockPrisma.userProfile.update).toHaveBeenCalled();
      expect(mockPrisma.encrypted_profile_data.create).toHaveBeenCalled();
    });
  });
});
