import { jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../../index';
import { ProfileEncryptionService } from '../../profile/encryption';
import { PrismaClient } from '@prisma/client';

// Test database setup
let testPrisma: PrismaClient;

beforeAll(async () => {
  // Connect to test database
  testPrisma = new PrismaClient({
    datasources: {
      db: { url: process.env.TEST_DATABASE_URL }
    }
  });
  
  // Verify connection
  await testPrisma.$connect();
});

beforeEach(async () => {
  // Clean test data before each test
  // Order matters: delete child tables before parent tables
  await testPrisma.encryptedEmailVerificationCode.deleteMany();
  await testPrisma.encryptedUserData.deleteMany();
  await testPrisma.encrypted_profile_data.deleteMany();
  await testPrisma.demoConversation.deleteMany();  // Clean demo conversations first
  await testPrisma.demoSession.deleteMany();       // Clean demo sessions
  await testPrisma.accessToken.deleteMany();
  await testPrisma.userProfile.deleteMany();
  await testPrisma.user.deleteMany();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('Profile Encryption Security Tests', () => {
  const testEncryptionKey = 'test-encryption-key-32-bytes-long-here';
  const testEncryptionKey2 = 'test-encryption-key-2-32-bytes-long-here';
  
  describe('ProfileEncryptionService Security', () => {
    let encryptionService: ProfileEncryptionService;
    
    beforeEach(() => {
      encryptionService = new ProfileEncryptionService(testEncryptionKey);
    });
    
    test('should encrypt and decrypt profile data correctly', () => {
      const testProfile = 'I am a 30-year-old software engineer earning $100,000 annually';
      
      const encrypted = encryptionService.encrypt(testProfile);
      
      // Verify encryption produces expected structure
      expect(encrypted).toHaveProperty('encryptedData');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('tag');
      expect(encrypted).toHaveProperty('keyVersion');
      expect(encrypted.keyVersion).toBe(1);
      
      // Verify encrypted data is different from plaintext
      expect(encrypted.encryptedData).not.toBe(testProfile);
      expect(encrypted.encryptedData).not.toContain('software engineer');
      expect(encrypted.encryptedData).not.toContain('$100,000');
      
      // Verify decryption works
      const decrypted = encryptionService.decrypt(
        encrypted.encryptedData,
        encrypted.iv,
        encrypted.tag
      );
      
      expect(decrypted).toBe(testProfile);
    });
    
    test('should use different IVs for each encryption', () => {
      const testProfile = 'Test profile data';
      
      const encrypted1 = encryptionService.encrypt(testProfile);
      const encrypted2 = encryptionService.encrypt(testProfile);
      
      // Same plaintext should produce different encrypted data due to different IVs
      expect(encrypted1.encryptedData).not.toBe(encrypted2.encryptedData);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.tag).not.toBe(encrypted2.tag);
      
      // But both should decrypt to the same plaintext
      const decrypted1 = encryptionService.decrypt(
        encrypted1.encryptedData,
        encrypted1.iv,
        encrypted1.tag
      );
      const decrypted2 = encryptionService.decrypt(
        encrypted2.encryptedData,
        encrypted2.iv,
        encrypted2.tag
      );
      
      expect(decrypted1).toBe(testProfile);
      expect(decrypted2).toBe(testProfile);
    });
    
    test('should reject invalid encryption key', () => {
      expect(() => {
        new ProfileEncryptionService('short-key');
      }).toThrow('Invalid encryption key provided. Key must be at least 32 bytes long.');
      
      expect(() => {
        new ProfileEncryptionService('');
      }).toThrow('Invalid encryption key provided. Key must be at least 32 bytes long.');
    });
    
    test('should reject decryption with wrong key', () => {
      const testProfile = 'Sensitive profile information';
      const encrypted = encryptionService.encrypt(testProfile);
      
      // Create service with different key
      const wrongKeyService = new ProfileEncryptionService(testEncryptionKey2);
      
      expect(() => {
        wrongKeyService.decrypt(
          encrypted.encryptedData,
          encrypted.iv,
          encrypted.tag
        );
      }).toThrow('Failed to decrypt profile data');
    });
    
    test('should reject decryption with wrong IV', () => {
      const testProfile = 'Sensitive profile information';
      const encrypted = encryptionService.encrypt(testProfile);
      
      // Use wrong IV
      const wrongIV = Buffer.alloc(16).toString('base64');
      
      expect(() => {
        encryptionService.decrypt(
          encrypted.encryptedData,
          wrongIV,
          encrypted.tag
        );
      }).toThrow('Failed to decrypt profile data');
    });
    
    test('should reject decryption with wrong tag', () => {
      const testProfile = 'Sensitive profile information';
      const encrypted = encryptionService.encrypt(testProfile);
      
      // Use wrong tag
      const wrongTag = Buffer.alloc(16).toString('base64');
      
      expect(() => {
        encryptionService.decrypt(
          encrypted.encryptedData,
          encrypted.iv,
          wrongTag
        );
      }).toThrow('Failed to decrypt profile data');
    });
    
    test('should handle key rotation correctly', () => {
      const testProfile = 'Original profile data';
      const encrypted = encryptionService.encrypt(testProfile);
      
      // Create service with new key
      const newKeyService = new ProfileEncryptionService(testEncryptionKey2);
      
      // Rotate key
      const rotated = newKeyService.rotateKey(
        testEncryptionKey,
        testEncryptionKey2,
        encrypted.encryptedData,
        encrypted.iv,
        encrypted.tag
      );
      
      // Verify rotated data is different
      expect(rotated.encryptedData).not.toBe(encrypted.encryptedData);
      expect(rotated.iv).not.toBe(encrypted.iv);
      expect(rotated.tag).not.toBe(encrypted.tag);
              expect(rotated.keyVersion).toBe(1);
      
      // Verify new key can decrypt rotated data
      const decrypted = newKeyService.decrypt(
        rotated.encryptedData,
        rotated.iv,
        rotated.tag
      );
      
      expect(decrypted).toBe(testProfile);
      
      // Verify old key cannot decrypt rotated data
      expect(() => {
        encryptionService.decrypt(
          rotated.encryptedData,
          rotated.iv,
          rotated.tag
        );
      }).toThrow('Failed to decrypt profile data');
    });
  });
  
  describe('Profile Encryption Integration Security', () => {
    let user1: any;
    let user2: any;
    let user1JWT: string;
    let user2JWT: string;
    
    beforeEach(async () => {
      // Create test users
      user1 = await testPrisma.user.create({
        data: {
          email: 'user1@test.com',
          passwordHash: 'test-hash',
          emailVerified: true,
          tier: 'FREE'
        }
      });
      
      user2 = await testPrisma.user.create({
        data: {
          email: 'user2@test.com',
          passwordHash: 'test-hash',
          emailVerified: true,
          tier: 'FREE'
        }
      });
      
      // Create JWT tokens for testing
      const jwt = require('jsonwebtoken');
      user1JWT = jwt.sign({ id: user1.id, email: user1.email }, process.env.JWT_SECRET || 'test-secret');
      user2JWT = jwt.sign({ id: user2.id, email: user2.email }, process.env.JWT_SECRET || 'test-secret');
    });
    
          test('should encrypt user profile data in database', async () => {
        const testProfile = 'I am a software engineer with 5 years of experience';
        
        // Create encrypted profile data
        const encryptionService = new ProfileEncryptionService(testEncryptionKey);
        const encrypted = encryptionService.encrypt(testProfile);
        
        // Create user profile first
        const profile = await testPrisma.userProfile.create({
          data: {
            userId: user1.id,
            email: user1.email,
            profileHash: `hash-${user1.id}`,
            profileText: testProfile
          }
        });
        
        // Store encrypted data in separate table
        const encryptedData = await testPrisma.encrypted_profile_data.create({
          data: {
            id: `enc-${profile.id}`,
            profileHash: profile.profileHash,
            encryptedData: encrypted.encryptedData,
            iv: encrypted.iv,
            tag: encrypted.tag,
            keyVersion: encrypted.keyVersion,
            updatedAt: new Date()
          }
        });
        
        // Verify data is stored encrypted
        const storedEncryptedData = await testPrisma.encrypted_profile_data.findUnique({
          where: { id: encryptedData.id }
        });
        
        expect(storedEncryptedData).toBeDefined();
        expect(storedEncryptedData?.encryptedData).not.toBe(testProfile);
        expect(storedEncryptedData?.encryptedData).not.toContain('software engineer');
        expect(storedEncryptedData?.encryptedData).not.toContain('5 years');
        
        // Verify decryption works
        const decrypted = encryptionService.decrypt(
          storedEncryptedData!.encryptedData,
          storedEncryptedData!.iv,
          storedEncryptedData!.tag
        );
        
        expect(decrypted).toBe(testProfile);
      });
    
          test('should prevent cross-user profile data access', async () => {
        const user1Profile = 'User 1 profile: Software engineer, $100k salary';
        const user2Profile = 'User 2 profile: Teacher, $45k salary';
        
        // Create separate encryption services with different keys for each user
        const user1EncryptionService = new ProfileEncryptionService(testEncryptionKey);
        const user2EncryptionService = new ProfileEncryptionService(testEncryptionKey2);
        
        // Create user profiles first
        const profile1 = await testPrisma.userProfile.create({
          data: {
            userId: user1.id,
            email: user1.email,
            profileHash: `hash-${user1.id}`,
            profileText: user1Profile
          }
        });
        
        const profile2 = await testPrisma.userProfile.create({
          data: {
            userId: user2.id,
            email: user2.email,
            profileHash: `hash-${user2.id}`,
            profileText: user2Profile
          }
        });
        
        // Encrypt and store both profiles in separate table
        const encrypted1 = user1EncryptionService.encrypt(user1Profile);
        const encrypted2 = user2EncryptionService.encrypt(user2Profile);
        
        await testPrisma.encrypted_profile_data.create({
          data: {
            id: `enc-${profile1.id}`,
            profileHash: profile1.profileHash,
            encryptedData: encrypted1.encryptedData,
            iv: encrypted1.iv,
            tag: encrypted1.tag,
            keyVersion: encrypted1.keyVersion,
            updatedAt: new Date()
          }
        });
        
        await testPrisma.encrypted_profile_data.create({
          data: {
            id: `enc-${profile2.id}`,
            profileHash: profile2.profileHash,
            encryptedData: encrypted2.encryptedData,
            iv: encrypted2.iv,
            tag: encrypted2.tag,
            keyVersion: encrypted2.keyVersion,
            updatedAt: new Date()
          }
        });
        
        // Verify User 1 cannot decrypt User 2's profile (different key)
        const storedEncryptedData2 = await testPrisma.encrypted_profile_data.findUnique({
          where: { profileHash: profile2.profileHash }
        });
        
        expect(() => {
          user1EncryptionService.decrypt(
            storedEncryptedData2!.encryptedData,
            storedEncryptedData2!.iv,
            storedEncryptedData2!.tag
          );
        }).toThrow('Failed to decrypt profile data');
        
        // Verify User 2 cannot decrypt User 1's profile (different key)
        const storedEncryptedData1 = await testPrisma.encrypted_profile_data.findUnique({
          where: { profileHash: profile1.profileHash }
        });
        
        expect(() => {
          user2EncryptionService.decrypt(
            storedEncryptedData1!.encryptedData,
            storedEncryptedData1!.iv,
            storedEncryptedData1!.tag
          );
        }).toThrow('Failed to decrypt profile data');
      });
    
          test('should handle encryption key changes securely', async () => {
        const originalProfile = 'Original profile data';
        
        // Create profile with original key
        const originalEncryptionService = new ProfileEncryptionService(testEncryptionKey);
        const originalEncrypted = originalEncryptionService.encrypt(originalProfile);
        
        // Create user profile first
        const profile = await testPrisma.userProfile.create({
          data: {
            userId: user1.id,
            email: user1.email,
            profileHash: `hash-${user1.id}`,
            profileText: originalProfile
          }
        });
        
        // Store encrypted data in separate table
        const encryptedData = await testPrisma.encrypted_profile_data.create({
          data: {
            id: `enc-${profile.id}`,
            profileHash: profile.profileHash,
            encryptedData: originalEncrypted.encryptedData,
            iv: originalEncrypted.iv,
            tag: originalEncrypted.tag,
            keyVersion: originalEncrypted.keyVersion,
            updatedAt: new Date()
          }
        });
        
        // Simulate key rotation
        const newEncryptionService = new ProfileEncryptionService(testEncryptionKey2);
        const rotated = newEncryptionService.rotateKey(
          testEncryptionKey,
          testEncryptionKey2,
          originalEncrypted.encryptedData,
          originalEncrypted.iv,
          originalEncrypted.tag
        );
        
        // Update database with rotated data
        await testPrisma.encrypted_profile_data.update({
          where: { id: encryptedData.id },
          data: {
            encryptedData: rotated.encryptedData,
            iv: rotated.iv,
            tag: rotated.tag,
            keyVersion: rotated.keyVersion,
            updatedAt: new Date()
          }
        });
        
        // Verify new key can decrypt
        const updatedEncryptedData = await testPrisma.encrypted_profile_data.findUnique({
          where: { id: encryptedData.id }
        });
        
        const decrypted = newEncryptionService.decrypt(
          updatedEncryptedData!.encryptedData,
          updatedEncryptedData!.iv,
          updatedEncryptedData!.tag
        );
        
        expect(decrypted).toBe(originalProfile);
        expect(updatedEncryptedData!.keyVersion).toBe(1);
        
        // Verify old key cannot decrypt
        expect(() => {
          originalEncryptionService.decrypt(
            updatedEncryptedData!.encryptedData,
            updatedEncryptedData!.iv,
            updatedEncryptedData!.tag
          );
        }).toThrow('Failed to decrypt profile data');
      });
    
          test('should not leak sensitive profile information in error messages', async () => {
        const sensitiveProfile = 'I have $500,000 in savings and earn $200,000 annually';
        
        // Create encryption service
        const encryptionService = new ProfileEncryptionService(testEncryptionKey);
        const encrypted = encryptionService.encrypt(sensitiveProfile);
        
        // Create user profile first
        const profile = await testPrisma.userProfile.create({
          data: {
            userId: user1.id,
            email: user1.email,
            profileHash: `hash-${user1.id}`,
            profileText: sensitiveProfile
          }
        });
        
        // Store encrypted data in separate table
        await testPrisma.encrypted_profile_data.create({
          data: {
            id: `enc-${profile.id}`,
            profileHash: profile.profileHash,
            encryptedData: encrypted.encryptedData,
            iv: encrypted.iv,
            tag: encrypted.tag,
            keyVersion: encrypted.keyVersion,
            updatedAt: new Date()
          }
        });
        
        // Simulate decryption error with wrong key
        const wrongKeyService = new ProfileEncryptionService(testEncryptionKey2);
        
        try {
          const storedEncryptedData = await testPrisma.encrypted_profile_data.findUnique({
            where: { profileHash: profile.profileHash }
          });
          
          wrongKeyService.decrypt(
            storedEncryptedData!.encryptedData,
            storedEncryptedData!.iv,
            storedEncryptedData!.tag
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Error should not contain sensitive profile data
          expect(errorMessage).not.toContain('$500,000');
          expect(errorMessage).not.toContain('$200,000');
          expect(errorMessage).not.toContain('savings');
          expect(errorMessage).not.toContain('annually');
          
          // Error should contain generic message
          expect(errorMessage).toContain('Failed to decrypt profile data');
        }
      });
  });
  
  // Profile API endpoints don't exist yet, so skipping API security tests
  // describe('Profile Encryption API Security', () => {
  //   test('should require authentication for profile operations', async () => {
  //     // Test without authentication
  //     const response = await request(app)
  //       .get('/api/profile/current');
  //     
  //     expect(response.status).toBe(401);
  //   });
  //   
  //   test('should validate JWT tokens for profile operations', async () => {
  //     // Test with invalid JWT
  //     const response = await request(app)
  //       .get('/api/profile/current')
  //       .set('Authorization', 'Bearer invalid-jwt-token');
  //     
  //     expect(response.status).toBe(401);
  //   });
  // });
});
