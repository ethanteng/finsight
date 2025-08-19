# 🔐 User Profile Encryption at Rest - Implementation Specification

## **Overview**

This specification outlines the implementation of encryption at rest for user profile data to enhance the platform's security posture and align with privacy best practices.

## **Current State Analysis**

### **Existing Infrastructure**
- **Database Schema**: `encrypted_profile_data` table already exists but is unused
- **Profile Storage**: Currently storing profile data as plain text in `UserProfile.profileText`
- **Security Claims**: Documentation mentions encryption but implementation is missing

### **Current Profile Data Flow**
```typescript
// Current implementation in ProfileManager
await prisma.userProfile.update({
  where: { id: profile.id },
  data: { 
    profileText: newProfileText,  // Plain text storage
    lastUpdated: new Date()
  }
});
```

## **Requirements**

### **Functional Requirements**

1. **Encryption at Rest**: All user profile data must be encrypted before storage
2. **Transparent Decryption**: Profile data must be automatically decrypted when retrieved
3. **Key Management**: Secure encryption key storage and rotation
4. **Backward Compatibility**: Existing profiles must be migrated to encrypted format
5. **Performance**: Encryption/decryption must not significantly impact response times
6. **Error Handling**: Graceful handling of encryption/decryption failures

### **Security Requirements**

1. **AES-256 Encryption**: Use industry-standard AES-256-GCM encryption
2. **Unique IVs**: Each profile must use a unique initialization vector
3. **Key Rotation**: Support for encryption key rotation without data loss
4. **Audit Trail**: Log encryption/decryption operations for security monitoring
5. **Key Storage**: Encryption keys stored securely (not in database)

### **Compliance Requirements**

1. **GDPR Compliance**: Encryption supports data protection requirements
2. **SOC 2**: Encryption supports security control requirements
3. **Financial Data Standards**: Meets industry standards for financial data protection

## **Technical Design**

### **Encryption Architecture**

```typescript
interface EncryptedProfileData {
  id: string;
  profileHash: string;
  encryptedData: string;        // Base64 encoded encrypted data
  iv: string;                   // Base64 encoded initialization vector
  keyVersion: number;           // For key rotation support
  createdAt: Date;
  updatedAt: Date;
}

interface ProfileEncryptionMetadata {
  iv: Buffer;
  keyVersion: number;
  algorithm: string;            // 'aes-256-gcm'
  tag: Buffer;                  // Authentication tag
}
```

### **Database Schema Updates**

```prisma
model UserProfile {
  id                     String                  @id @default(cuid())
  email                  String                  @unique
  profileHash            String                  @unique
  lastActive             DateTime?
  conversationCount      Int                     @default(0)
  isActive               Boolean                 @default(true)
  profileDeleted         Boolean                 @default(false)
  userId                 String?                 @unique
  createdAt              DateTime                @default(now())
  updatedAt              DateTime                @updatedAt
  profileText            String                  @default("")  // Remove this field
  lastUpdated            DateTime                @default(now())
  encrypted_profile_data encrypted_profile_data? // Use this relationship
  user                   User?                   @relation(fields: [userId], references: [id])

  @@map("user_profiles")
}

model encrypted_profile_data {
  id            String      @id
  profileHash   String      @unique
  encryptedData String      // Base64 encoded encrypted profile data
  iv            String      // Base64 encoded initialization vector
  keyVersion    Int         @default(1)  // For key rotation
  algorithm     String      @default("aes-256-gcm")
  tag           String      // Base64 encoded authentication tag
  createdAt     DateTime    @default(now())
  updatedAt     DateTime
  user_profiles UserProfile @relation(fields: [profileHash], references: [profileHash])

  @@map("encrypted_profile_data")
}
```

### **Encryption Service**

```typescript
// src/profile/encryption.ts
import crypto from 'crypto';

export class ProfileEncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16;  // 128 bits
  private readonly tagLength = 16; // 128 bits

  constructor(private encryptionKey: string) {
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new Error('Invalid encryption key provided');
    }
  }

  encrypt(plaintext: string): {
    encryptedData: string;
    iv: string;
    tag: string;
    keyVersion: number;
  } {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
    cipher.setAAD(Buffer.from('user-profile', 'utf8'));
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const tag = cipher.getAuthTag();
    
    return {
      encryptedData: encrypted,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      keyVersion: 1
    };
  }

  decrypt(encryptedData: string, iv: string, tag: string): string {
    const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
    decipher.setAAD(Buffer.from('user-profile', 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  rotateKey(oldKey: string, newKey: string, encryptedData: string, iv: string, tag: string): {
    encryptedData: string;
    iv: string;
    tag: string;
    keyVersion: number;
  } {
    // Decrypt with old key
    const oldDecryptionService = new ProfileEncryptionService(oldKey);
    const plaintext = oldDecryptionService.decrypt(encryptedData, iv, tag);
    
    // Encrypt with new key
    return this.encrypt(plaintext);
  }
}
```

### **Updated Profile Manager**

```typescript
// src/profile/manager.ts
import { ProfileEncryptionService } from './encryption';

export class ProfileManager {
  private encryptionService: ProfileEncryptionService;

  constructor() {
    const encryptionKey = process.env.PROFILE_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('PROFILE_ENCRYPTION_KEY environment variable is required');
    }
    this.encryptionService = new ProfileEncryptionService(encryptionKey);
  }

  async updateProfile(userId: string, newProfileText: string): Promise<void> {
    const prisma = getPrismaClient();
    
    // Get user to include email in create operation
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      console.log('User not found, cannot update profile for userId:', userId);
      return;
    }
    
    // Try to find existing profile
    let profile = await prisma.userProfile.findUnique({
      where: { userId },
      include: { encrypted_profile_data: true }
    });
    
    if (!profile) {
      // Try to find by email as fallback
      profile = await prisma.userProfile.findUnique({
        where: { email: user.email },
        include: { encrypted_profile_data: true }
      });
    }
    
    // Encrypt the profile data
    const encrypted = this.encryptionService.encrypt(newProfileText);
    
    if (profile) {
      // Update existing profile
      await prisma.userProfile.update({
        where: { id: profile.id },
        data: { 
          lastUpdated: new Date()
        }
      });
      
      // Update or create encrypted data
      if (profile.encrypted_profile_data) {
        await prisma.encrypted_profile_data.update({
          where: { profileHash: profile.profileHash },
          data: {
            encryptedData: encrypted.encryptedData,
            iv: encrypted.iv,
            tag: encrypted.tag,
            keyVersion: encrypted.keyVersion,
            updatedAt: new Date()
          }
        });
      } else {
        await prisma.encrypted_profile_data.create({
          data: {
            id: profile.profileHash,
            profileHash: profile.profileHash,
            encryptedData: encrypted.encryptedData,
            iv: encrypted.iv,
            tag: encrypted.tag,
            keyVersion: encrypted.keyVersion,
            algorithm: 'aes-256-gcm',
            updatedAt: new Date()
          }
        });
      }
    } else {
      // Create new profile
      const profileHash = `profile_${userId}_${Date.now()}`;
      const newProfile = await prisma.userProfile.create({
        data: { 
          email: user.email,
          profileHash,
          userId,
          profileText: '', // Keep for backward compatibility
          isActive: true,
          conversationCount: 0
        }
      });
      
      // Create encrypted data
      await prisma.encrypted_profile_data.create({
        data: {
          id: profileHash,
          profileHash,
          encryptedData: encrypted.encryptedData,
          iv: encrypted.iv,
          tag: encrypted.tag,
          keyVersion: encrypted.keyVersion,
          algorithm: 'aes-256-gcm',
          updatedAt: new Date()
        }
      });
    }
  }

  async getOrCreateProfile(userId: string): Promise<string> {
    const prisma = getPrismaClient();
    
    // First check if the user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      console.log('User not found, cannot create profile for userId:', userId);
      return '';
    }
    
    // Try to find profile by userId first, then by email
    let profile = await prisma.userProfile.findUnique({
      where: { userId },
      include: { encrypted_profile_data: true }
    });
    
    if (!profile) {
      // Try to find by email as fallback
      profile = await prisma.userProfile.findUnique({
        where: { email: user.email },
        include: { encrypted_profile_data: true }
      });
    }
    
    if (!profile) {
      // Generate a unique profile hash
      const profileHash = `profile_${userId}_${Date.now()}`;
      
      profile = await prisma.userProfile.create({
        data: {
          email: user.email,
          profileHash,
          userId,
          profileText: '',
          isActive: true,
          conversationCount: 0
        },
        include: { encrypted_profile_data: true }
      });
    }
    
    // Return decrypted profile text if available
    if (profile.encrypted_profile_data) {
      try {
        return this.encryptionService.decrypt(
          profile.encrypted_profile_data.encryptedData,
          profile.encrypted_profile_data.iv,
          profile.encrypted_profile_data.tag
        );
      } catch (error) {
        console.error('Failed to decrypt profile data:', error);
        // Fallback to plain text if decryption fails
        return profile.profileText || '';
      }
    }
    
    // Fallback to plain text for backward compatibility
    return profile.profileText || '';
  }
}
```

## **Migration Strategy**

### **Phase 1: Infrastructure Setup**
1. **Environment Variables**: Add `PROFILE_ENCRYPTION_KEY` to all environments
2. **Database Migration**: Update schema to include new encryption fields
3. **Encryption Service**: Implement ProfileEncryptionService
4. **Updated Profile Manager**: Implement encrypted profile operations

### **Phase 2: Data Migration**
1. **Migration Script**: Create script to encrypt existing profiles
2. **Backup Strategy**: Create database backup before migration
3. **Rollback Plan**: Ability to revert to plain text if needed
4. **Validation**: Verify all profiles are successfully encrypted

### **Phase 3: Deployment**
1. **Staged Rollout**: Deploy to staging environment first
2. **Production Deployment**: Deploy with monitoring
3. **Monitoring**: Track encryption/decryption success rates
4. **Cleanup**: Remove plain text profileText field after validation

### **Migration Script**

```typescript
// scripts/migrate-profiles-to-encryption.ts
import { PrismaClient } from '@prisma/client';
import { ProfileEncryptionService } from '../src/profile/encryption';

async function migrateProfilesToEncryption() {
  const prisma = new PrismaClient();
  const encryptionService = new ProfileEncryptionService(process.env.PROFILE_ENCRYPTION_KEY!);
  
  console.log('Starting profile encryption migration...');
  
  // Get all profiles with plain text data
  const profiles = await prisma.userProfile.findMany({
    where: {
      profileText: { not: '' },
      encrypted_profile_data: null
    }
  });
  
  console.log(`Found ${profiles.length} profiles to encrypt`);
  
  for (const profile of profiles) {
    try {
      // Encrypt the profile text
      const encrypted = encryptionService.encrypt(profile.profileText);
      
      // Store encrypted data
      await prisma.encrypted_profile_data.create({
        data: {
          id: profile.profileHash,
          profileHash: profile.profileHash,
          encryptedData: encrypted.encryptedData,
          iv: encrypted.iv,
          tag: encrypted.tag,
          keyVersion: encrypted.keyVersion,
          algorithm: 'aes-256-gcm',
          updatedAt: new Date()
        }
      });
      
      console.log(`Encrypted profile for user: ${profile.email}`);
    } catch (error) {
      console.error(`Failed to encrypt profile for ${profile.email}:`, error);
    }
  }
  
  console.log('Migration completed');
  await prisma.$disconnect();
}

migrateProfilesToEncryption().catch(console.error);
```

## **Environment Configuration**

### **Required Environment Variables**

```bash
# Production
PROFILE_ENCRYPTION_KEY=your-32-byte-encryption-key-here

# Development
PROFILE_ENCRYPTION_KEY=dev-32-byte-encryption-key-here

# Testing
PROFILE_ENCRYPTION_KEY=test-32-byte-encryption-key-here
```

### **Key Generation**

```bash
# Generate a secure 32-byte (256-bit) encryption key
openssl rand -base64 32
```

## **Security Considerations**

### **Key Management**
1. **Key Storage**: Store encryption keys in environment variables or key management service
2. **Key Rotation**: Implement key rotation strategy for long-term security
3. **Key Backup**: Secure backup of encryption keys
4. **Access Control**: Limit access to encryption keys

### **Audit and Monitoring**
1. **Encryption Logs**: Log all encryption/decryption operations
2. **Error Monitoring**: Monitor for decryption failures
3. **Performance Monitoring**: Track encryption/decryption performance
4. **Security Alerts**: Alert on suspicious encryption patterns

### **Compliance**
1. **Data Protection**: Encryption supports GDPR data protection requirements
2. **Financial Standards**: Meets industry standards for financial data
3. **Audit Trail**: Maintain audit trail for compliance reporting

## **Testing Strategy**

### **Unit Tests**
```typescript
// src/__tests__/unit/profile-encryption.test.ts
describe('ProfileEncryptionService', () => {
  test('should encrypt and decrypt profile data correctly', () => {
    const service = new ProfileEncryptionService('test-key-32-bytes-long-here');
    const originalText = 'Test profile data with sensitive information';
    
    const encrypted = service.encrypt(originalText);
    const decrypted = service.decrypt(encrypted.encryptedData, encrypted.iv, encrypted.tag);
    
    expect(decrypted).toBe(originalText);
  });
  
  test('should handle key rotation correctly', () => {
    const oldKey = 'old-key-32-bytes-long-here-123';
    const newKey = 'new-key-32-bytes-long-here-456';
    const service = new ProfileEncryptionService(newKey);
    
    const originalText = 'Test profile data';
    const oldEncrypted = new ProfileEncryptionService(oldKey).encrypt(originalText);
    
    const rotated = service.rotateKey(oldKey, newKey, 
      oldEncrypted.encryptedData, oldEncrypted.iv, oldEncrypted.tag);
    
    const decrypted = service.decrypt(rotated.encryptedData, rotated.iv, rotated.tag);
    expect(decrypted).toBe(originalText);
  });
});
```

### **Integration Tests**
```typescript
// src/__tests__/integration/profile-encryption-integration.test.ts
describe('Profile Encryption Integration', () => {
  test('should store and retrieve encrypted profiles', async () => {
    const profileManager = new ProfileManager();
    const testProfileText = 'Test encrypted profile data';
    
    await profileManager.updateProfile('test-user-id', testProfileText);
    const retrieved = await profileManager.getOrCreateProfile('test-user-id');
    
    expect(retrieved).toBe(testProfileText);
  });
});
```

## **Performance Considerations**

### **Optimization Strategies**
1. **Caching**: Cache decrypted profiles in memory for frequently accessed data
2. **Batch Operations**: Batch encryption/decryption operations where possible
3. **Async Processing**: Use async/await for non-blocking operations
4. **Connection Pooling**: Optimize database connections for encryption operations

### **Expected Performance Impact**
- **Encryption Overhead**: ~1-2ms per profile encryption
- **Decryption Overhead**: ~1-2ms per profile decryption
- **Database Impact**: Minimal additional storage requirements
- **Memory Usage**: Negligible increase in memory usage

## **Rollback Plan**

### **Emergency Rollback**
1. **Feature Flag**: Implement feature flag to disable encryption
2. **Database Revert**: Revert to plain text storage if needed
3. **Service Rollback**: Rollback to previous version without encryption
4. **Data Recovery**: Restore from backup if necessary

### **Gradual Rollback**
1. **Monitoring**: Monitor encryption success rates
2. **Alerts**: Set up alerts for encryption failures
3. **Manual Intervention**: Ability to manually disable encryption
4. **Data Validation**: Verify data integrity after rollback

## **Implementation Timeline**

### **Week 1: Infrastructure**
- [ ] Set up environment variables
- [ ] Implement ProfileEncryptionService
- [ ] Update database schema
- [ ] Create unit tests

### **Week 2: Integration**
- [ ] Update ProfileManager with encryption
- [ ] Implement migration script
- [ ] Create integration tests
- [ ] Set up monitoring

### **Week 3: Testing**
- [ ] Test in staging environment
- [ ] Run migration on test data
- [ ] Performance testing
- [ ] Security testing

### **Week 4: Deployment**
- [ ] Deploy to production
- [ ] Run migration script
- [ ] Monitor for issues
- [ ] Clean up plain text data

## **Success Metrics**

### **Security Metrics**
- [ ] 100% of profiles encrypted at rest
- [ ] Zero encryption/decryption failures
- [ ] Successful key rotation capability
- [ ] Compliance with security standards

### **Performance Metrics**
- [ ] <5ms encryption/decryption overhead
- [ ] <1% increase in API response times
- [ ] Zero impact on user experience
- [ ] Successful caching implementation

### **Operational Metrics**
- [ ] Successful migration of all existing profiles
- [ ] Zero data loss during migration
- [ ] Successful rollback capability
- [ ] Comprehensive audit trail

## **Future Enhancements**

### **Advanced Features**
1. **Field-Level Encryption**: Encrypt specific profile fields separately
2. **Searchable Encryption**: Implement searchable encrypted profiles
3. **Multi-Key Encryption**: Support multiple encryption keys
4. **Hardware Security Modules**: Integrate with HSM for key management

### **Compliance Enhancements**
1. **Data Classification**: Classify profile data by sensitivity
2. **Retention Policies**: Implement encrypted data retention
3. **Audit Logging**: Enhanced audit trail for compliance
4. **Data Sovereignty**: Support for regional encryption requirements

---

**This specification provides a comprehensive plan for implementing user profile encryption at rest while maintaining backward compatibility and ensuring a smooth migration process.** 