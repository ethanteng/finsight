import { jest } from '@jest/globals';
import { ProfileManager } from '../../profile/manager';

// Mock Prisma client for testing
const mockPrisma = {
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

  describe('Profile Creation and Retrieval', () => {
    it('should return empty string during temporary placeholder phase', async () => {
      const result = await profileManager.getOrCreateProfile('test-user-id');
      
      // During temporary placeholder phase, should return empty string
      expect(result).toBe('');
    });

    it('should handle getOrCreateProfile calls gracefully during placeholder phase', async () => {
      const result = await profileManager.getOrCreateProfile('non-existent-user');
      
      // Should return empty string during placeholder phase
      expect(result).toBe('');
    });
  });

  describe('Profile Updates', () => {
    it('should handle updateProfile calls gracefully during placeholder phase', async () => {
      // Should not throw during placeholder phase
      await expect(profileManager.updateProfile('test-user-id', 'new profile text')).resolves.not.toThrow();
    });

    it('should handle empty profile text updates during placeholder phase', async () => {
      // Should not throw during placeholder phase
      await expect(profileManager.updateProfile('test-user-id', '')).resolves.not.toThrow();
    });
  });

  describe('Profile Updates from Conversation', () => {
    it('should handle updateProfileFromConversation calls during placeholder phase', async () => {
      const conversation = {
        id: 'conv-1',
        question: 'What is my net worth?',
        answer: 'Based on your accounts...',
        createdAt: new Date()
      };

      // Should not throw during placeholder phase
      await expect(profileManager.updateProfileFromConversation('test-user-id', conversation)).resolves.not.toThrow();
    });
  });

  describe('Temporary Placeholder Behavior', () => {
    it('should log placeholder messages during temporary phase', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      
      await profileManager.getOrCreateProfile('test-user-id');
      
      expect(consoleSpy).toHaveBeenCalledWith('ProfileManager temporarily disabled - will be re-enabled after database migration');
      
      consoleSpy.mockRestore();
    });

    it('should handle all method calls without errors during placeholder phase', async () => {
      // All methods should work without throwing during placeholder phase
      await expect(profileManager.getOrCreateProfile('user1')).resolves.toBe('');
      await expect(profileManager.updateProfile('user1', 'text')).resolves.not.toThrow();
      await expect(profileManager.updateProfileFromConversation('user1', { id: 'conv1', question: 'test', answer: 'test', createdAt: new Date() })).resolves.not.toThrow();
    });
  });

  describe('Environment Variable Handling', () => {
    it('should not require encryption key during placeholder phase', () => {
      delete process.env.PROFILE_ENCRYPTION_KEY;
      
      // Should not throw during placeholder phase
      expect(() => new ProfileManager()).not.toThrow();
    });
  });

  describe('Placeholder Phase Documentation', () => {
    it('should indicate this is a temporary implementation', () => {
      // This test documents that we're in a temporary placeholder phase
      expect(profileManager).toBeInstanceOf(ProfileManager);
      expect(typeof profileManager.getOrCreateProfile).toBe('function');
      expect(typeof profileManager.updateProfile).toBe('function');
      expect(typeof profileManager.updateProfileFromConversation).toBe('function');
    });
  });
});
