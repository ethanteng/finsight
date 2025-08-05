import { jest } from '@jest/globals';
import { ProfileManager } from '../../profile/manager';
import { ProfileExtractor } from '../../profile/extractor';

// Mock dependencies
jest.mock('../../profile/extractor');
jest.mock('../../prisma-client', () => ({
  getPrismaClient: jest.fn()
}));

const MockProfileExtractor = ProfileExtractor as jest.MockedClass<typeof ProfileExtractor>;

describe('ProfileManager Unit Tests', () => {
  let profileManager: ProfileManager;
  let mockExtractor: any;
  let mockPrisma: any;
  let mockGetPrismaClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock instances
    mockExtractor = {
      extractAndUpdateProfile: jest.fn()
    };
    
    mockPrisma = {
      user: {
        findUnique: jest.fn()
      },
      userProfile: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        create: jest.fn()
      }
    };
    
    // Mock the constructors/functions
    (MockProfileExtractor as any).mockImplementation(() => mockExtractor);
    
    // Import and mock getPrismaClient
    const { getPrismaClient } = require('../../prisma-client');
    mockGetPrismaClient = getPrismaClient;
    mockGetPrismaClient.mockReturnValue(mockPrisma);
    
    profileManager = new ProfileManager();
  });

  describe('Profile Creation and Retrieval', () => {
    it('should create a new profile when none exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'test-user-id',
        email: 'test@example.com'
      });
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);
      mockPrisma.userProfile.create.mockResolvedValue({
        id: 'profile-1',
        userId: 'test-user-id',
        email: 'test@example.com',
        profileHash: 'profile_test-user-id_1754380566596',
        profileText: '',
        isActive: true,
        conversationCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const result = await profileManager.getOrCreateProfile('test-user-id');

      expect(result).toBe('');
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-user-id' }
      });
      expect(mockPrisma.userProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'test-user-id' }
      });
      expect(mockPrisma.userProfile.create).toHaveBeenCalledWith({
        data: {
          userId: 'test-user-id',
          email: 'test@example.com',
          profileHash: expect.stringMatching(/^profile_test-user-id_\d+$/),
          profileText: '',
          isActive: true,
          conversationCount: 0
        }
      });
    });

    it('should retrieve existing profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'test-user-id',
        email: 'test@example.com'
      });
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        userId: 'test-user-id',
        email: 'test@example.com',
        profileHash: 'profile_test-user-id_1234567890',
        profileText: 'An existing user profile',
        isActive: true,
        conversationCount: 5,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const result = await profileManager.getOrCreateProfile('test-user-id');

      expect(result).toBe('An existing user profile');
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-user-id' }
      });
      expect(mockPrisma.userProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'test-user-id' }
      });
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        profileManager.getOrCreateProfile('test-user-id')
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('Profile Updates', () => {
    it('should update profile with new information', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'test-user-id',
        email: 'test@example.com'
      });
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        userId: 'test-user-id',
        email: 'test@example.com',
        profileHash: 'profile_test-user-id_1234567890',
        profileText: 'Existing profile',
        isActive: true,
        conversationCount: 3,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      mockPrisma.userProfile.update.mockResolvedValue({
        id: 'profile-1',
        userId: 'test-user-id',
        profileText: 'Updated profile with new information',
        updatedAt: new Date()
      });

      await profileManager.updateProfile('test-user-id', 'Updated profile with new information');

      expect(mockPrisma.userProfile.update).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        data: { 
          profileText: 'Updated profile with new information',
          lastUpdated: expect.any(Date)
        }
      });
    });

    it('should handle update errors gracefully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'test-user-id',
        email: 'test@example.com'
      });
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        userId: 'test-user-id',
        email: 'test@example.com',
        profileHash: 'profile_test-user-id_1234567890',
        profileText: 'Existing profile',
        isActive: true,
        conversationCount: 3,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      mockPrisma.userProfile.update.mockRejectedValue(new Error('Update failed'));

      await expect(
        profileManager.updateProfile('test-user-id', 'Updated profile')
      ).rejects.toThrow('Update failed');
    });
  });

  describe('Profile Updates from Conversation', () => {
    it('should update profile from conversation using extractor', async () => {
      const conversation = {
        id: 'conv-1',
        question: 'I am a 30-year-old software engineer',
        answer: 'Based on your profile...',
        createdAt: new Date()
      };

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'test-user-id',
        email: 'test@example.com'
      });
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        userId: 'test-user-id',
        email: 'test@example.com',
        profileHash: 'profile_test-user-id_1234567890',
        profileText: 'Existing profile',
        isActive: true,
        conversationCount: 3,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      mockExtractor.extractAndUpdateProfile.mockResolvedValue('A 30-year-old software engineer');
      mockPrisma.userProfile.update.mockResolvedValue({
        id: 'profile-1',
        userId: 'test-user-id',
        profileText: 'A 30-year-old software engineer',
        updatedAt: new Date()
      });

      await profileManager.updateProfileFromConversation(
        'test-user-id',
        conversation
      );

      expect(mockExtractor.extractAndUpdateProfile).toHaveBeenCalledWith(
        'test-user-id',
        conversation,
        'Existing profile'
      );
      expect(mockPrisma.userProfile.update).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        data: { 
          profileText: 'A 30-year-old software engineer',
          lastUpdated: expect.any(Date)
        }
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle user not found gracefully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await profileManager.getOrCreateProfile('non-existent-user');

      expect(result).toBe('');
      expect(mockPrisma.userProfile.create).not.toHaveBeenCalled();
    });

    it('should handle profile update when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await profileManager.updateProfile('non-existent-user', 'New profile text');

      expect(mockPrisma.userProfile.update).not.toHaveBeenCalled();
      expect(mockPrisma.userProfile.create).not.toHaveBeenCalled();
    });

    it('should handle concurrent profile updates', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'test-user-id',
        email: 'test@example.com'
      });
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        userId: 'test-user-id',
        email: 'test@example.com',
        profileHash: 'profile_test-user-id_1234567890',
        profileText: 'Existing profile',
        isActive: true,
        conversationCount: 3,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      mockPrisma.userProfile.update.mockResolvedValue({
        id: 'profile-1',
        userId: 'test-user-id',
        profileText: 'Updated profile',
        updatedAt: new Date()
      });

      const promises = [
        profileManager.updateProfile('test-user-id', 'Update 1'),
        profileManager.updateProfile('test-user-id', 'Update 2'),
        profileManager.updateProfile('test-user-id', 'Update 3')
      ];

      await Promise.all(promises);

      expect(mockPrisma.userProfile.update).toHaveBeenCalledTimes(3);
    });
  });
}); 