// TEMPORARILY COMMENTED OUT - Integration tests require test database setup
// Will be re-enabled after CI/CD test database is configured
/*
import { jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { ProfileManager } from '../../profile/manager';
import { ProfileEncryptionService } from '../../profile/encryption';

// Mock the environment variable for testing
const originalEnv = process.env;

describe('Profile Encryption Integration Tests', () => {
  let prisma: PrismaClient;
  let profileManager: ProfileManager;
  let testUserId: string;
  let testUserEmail: string;

  beforeAll(async () => {
    // Set up test environment variables
    process.env.PROFILE_ENCRYPTION_KEY = 'test-encryption-key-32-bytes-long-here';
    
    // Initialize Prisma client
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test'
        }
      }
    });
    
    // Clean up any existing test data
    await prisma.encrypted_profile_data.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.user.deleteMany();
    
    // Create test user
    const testUser = await prisma.user.create({
      data: {
        email: 'test-encryption@example.com',
        passwordHash: 'test-hash',
        tier: 'STANDARD'
      }
    });
    
    testUserId = testUser.id;
    testUserEmail = testUser.email;
    
    // Initialize ProfileManager
    profileManager = new ProfileManager();
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.encrypted_profile_data.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.user.deleteMany();
    
    await prisma.$disconnect();
    
    // Restore original environment
    process.env = originalEnv;
  });

  beforeEach(async () => {
    // Clean up profile data before each test
    await prisma.encrypted_profile_data.deleteMany();
    await prisma.userProfile.deleteMany();
  });

  describe('Profile Creation and Encryption', () => {
    it('should create and encrypt new profile', async () => {
      const testProfileText = 'Test profile data with sensitive information';
      
      // Create profile
      await profileManager.updateProfile(testUserId, testProfileText);
      
      // Verify profile was created
      const profile = await prisma.userProfile.findUnique({
        where: { userId: testUserId },
        include: { encrypted_profile_data: true }
      });
      
      expect(profile).toBeDefined();
      expect(profile?.encrypted_profile_data).toBeDefined();
      expect(profile?.encrypted_profile_data?.algorithm).toBe('aes-256-gcm');
      expect(profile?.encrypted_profile_data?.keyVersion).toBe(1);
      
      // Verify data can be decrypted
      const retrievedProfile = await profileManager.getOrCreateProfile(testUserId);
      expect(retrievedProfile).toBe(testProfileText);
    });

    it('should handle empty profile text', async () => {
      const emptyProfileText = '';
      
      await profileManager.updateProfile(testUserId, emptyProfileText);
      
      const retrievedProfile = await profileManager.getOrCreateProfile(testUserId);
      expect(retrievedProfile).toBe(emptyProfileText);
    });

    it('should handle long profile text', async () => {
      const longProfileText = 'A'.repeat(1000);
      
      await profileManager.updateProfile(testUserId, longProfileText);
      
      const retrievedProfile = await profileManager.getOrCreateProfile(testUserId);
      expect(retrievedProfile).toBe(longProfileText);
    });
  });

  describe('Profile Updates and Re-encryption', () => {
    it('should update existing encrypted profile', async () => {
      const initialProfileText = 'Initial profile data';
      const updatedProfileText = 'Updated profile data with new information';
      
      // Create initial profile
      await profileManager.updateProfile(testUserId, initialProfileText);
      
      // Update profile
      await profileManager.updateProfile(testUserId, updatedProfileText);
      
      // Verify update
      const retrievedProfile = await profileManager.getOrCreateProfile(testUserId);
      expect(retrievedProfile).toBe(updatedProfileText);
      
      // Verify encryption metadata was updated
      const profile = await prisma.userProfile.findUnique({
        where: { userId: testUserId },
        include: { encrypted_profile_data: true }
      });
      
      expect(profile?.encrypted_profile_data?.updatedAt).toBeDefined();
    });

    it('should maintain encryption consistency across updates', async () => {
      const profileTexts = [
        'First profile version',
        'Second profile version',
        'Third profile version'
      ];
      
      for (const profileText of profileTexts) {
        await profileManager.updateProfile(testUserId, profileText);
        const retrieved = await profileManager.getOrCreateProfile(testUserId);
        expect(retrieved).toBe(profileText);
      }
    });
  });

  describe('Profile Retrieval and Decryption', () => {
    it('should retrieve and decrypt existing profile', async () => {
      const testProfileText = 'Profile for retrieval testing';
      
      // Create profile
      await profileManager.updateProfile(testUserId, testProfileText);
      
      // Retrieve profile
      const retrievedProfile = await profileManager.getOrCreateProfile(testUserId);
      expect(retrievedProfile).toBe(testProfileText);
    });

    it('should handle profile retrieval for non-existent user', async () => {
      const nonExistentUserId = 'non-existent-user-id';
      
      const profile = await profileManager.getOrCreateProfile(nonExistentUserId);
      expect(profile).toBe('');
    });

    it('should fallback to plain text if decryption fails', async () => {
      // Create profile with plain text only (no encryption)
      const testProfileText = 'Plain text profile';
      
      const profile = await prisma.userProfile.create({
        data: {
          email: testUserEmail,
          profileHash: `profile_${testUserId}_${Date.now()}`,
          userId: testUserId,
          profileText: testProfileText,
          isActive: true,
          conversationCount: 0
        }
      });
      
      // Retrieve profile (should fallback to plain text)
      const retrievedProfile = await profileManager.getOrCreateProfile(testUserId);
      expect(retrievedProfile).toBe(testProfileText);
    });
  });

  describe('Backward Compatibility', () => {
    it('should handle profiles without encrypted data', async () => {
      const plainTextProfile = 'Plain text profile for backward compatibility';
      
      // Create profile with only plain text
      await prisma.userProfile.create({
        data: {
          email: testUserEmail,
          profileHash: `profile_${testUserId}_${Date.now()}`,
          userId: testUserId,
          profileText: plainTextProfile,
          isActive: true,
          conversationCount: 0
        }
      });
      
      // Should still be able to retrieve
      const retrievedProfile = await profileManager.getOrCreateProfile(testUserId);
      expect(retrievedProfile).toBe(plainTextProfile);
    });

    it('should migrate plain text profiles to encryption on update', async () => {
      const plainTextProfile = 'Plain text profile to be migrated';
      
      // Create profile with only plain text
      await prisma.userProfile.create({
        data: {
          email: testUserEmail,
          profileHash: `profile_${testUserId}_${Date.now()}`,
          userId: testUserId,
          profileText: plainTextProfile,
          isActive: true,
          conversationCount: 0
        }
      });
      
      // Update should create encrypted version
      const updatedProfileText = 'Updated and now encrypted profile';
      await profileManager.updateProfile(testUserId, updatedProfileText);
      
      // Verify encryption was created
      const profile = await prisma.userProfile.findUnique({
        where: { userId: testUserId },
        include: { encrypted_profile_data: true }
      });
      
      expect(profile?.encrypted_profile_data).toBeDefined();
      
      // Verify data is accessible
      const retrievedProfile = await profileManager.getOrCreateProfile(testUserId);
      expect(retrievedProfile).toBe(updatedProfileText);
    });
  });

  describe('Error Handling', () => {
    it('should handle encryption service errors gracefully', async () => {
      // Create ProfileManager with invalid key
      const invalidKey = 'invalid-key';
      process.env.PROFILE_ENCRYPTION_KEY = invalidKey;
      
      expect(() => new ProfileManager()).toThrow('Invalid PROFILE_ENCRYPTION_KEY format');
      
      // Restore valid key
      process.env.PROFILE_ENCRYPTION_KEY = 'test-encryption-key-32-bytes-long-here';
    });

    it('should handle database errors gracefully', async () => {
      // This test would require mocking database failures
      // For now, we'll test that the service handles basic errors
      const profileManager = new ProfileManager();
      
      // Test with invalid user ID format
      const invalidUserId = 'invalid-user-id-format';
      
      // Should not crash, should return empty string
      const profile = await profileManager.getOrCreateProfile(invalidUserId);
      expect(profile).toBe('');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple profile operations efficiently', async () => {
      const startTime = Date.now();
      
      // Perform multiple profile operations
      for (let i = 0; i < 10; i++) {
        const profileText = `Profile iteration ${i}`;
        await profileManager.updateProfile(testUserId, profileText);
        const retrieved = await profileManager.getOrCreateProfile(testUserId);
        expect(retrieved).toBe(profileText);
      }
      
      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(5000); // Should complete in <5 seconds
    });

    it('should maintain consistent performance across operations', async () => {
      const profileText = 'Performance test profile';
      
      // Measure encryption time
      const encryptStart = Date.now();
      await profileManager.updateProfile(testUserId, profileText);
      const encryptTime = Date.now() - encryptStart;
      
      // Measure decryption time
      const decryptStart = Date.now();
      await profileManager.getOrCreateProfile(testUserId);
      const decryptTime = Date.now() - decryptStart;
      
      // Both operations should be reasonably fast
      expect(encryptTime).toBeLessThan(1000); // <1 second
      expect(decryptTime).toBeLessThan(1000); // <1 second
    });
  });
});
*/
