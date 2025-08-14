const { PrismaClient } = require('@prisma/client');

// Import the compiled ProfileEncryptionService
let ProfileEncryptionService;
try {
  // Try to import from the compiled dist folder
  ProfileEncryptionService = require('../dist/profile/encryption').ProfileEncryptionService;
} catch (error) {
  console.error('Failed to import ProfileEncryptionService from dist folder:', error);
  console.error('Make sure the code has been compiled with: npm run build');
  process.exit(1);
}

async function migrateProfilesToEncryption() {
  const prisma = new PrismaClient();
  
  const encryptionKey = process.env.PROFILE_ENCRYPTION_KEY;
  if (!encryptionKey) {
    console.error('PROFILE_ENCRYPTION_KEY environment variable is required');
    process.exit(1);
  }
  
  if (!ProfileEncryptionService.validateKey(encryptionKey)) {
    console.error('Invalid PROFILE_ENCRYPTION_KEY format. Key must be at least 32 bytes long.');
    process.exit(1);
  }
  
  const encryptionService = new ProfileEncryptionService(encryptionKey);
  
  console.log('Starting profile encryption migration...');
  console.log('This will encrypt all existing user profiles and store them in encrypted_profile_data table.');
  
  try {
    // Get all profiles with plain text data that don't have encrypted data yet
    const profiles = await prisma.userProfile.findMany({
      where: {
        profileText: { not: '' },
        encrypted_profile_data: null
      },
      select: {
        id: true,
        email: true,
        profileHash: true,
        profileText: true
      }
    });
    
    console.log(`Found ${profiles.length} profiles to encrypt`);
    
    if (profiles.length === 0) {
      console.log('No profiles need encryption. Migration completed.');
      await prisma.$disconnect();
      return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const profile of profiles) {
      try {
        console.log(`Encrypting profile for user: ${profile.email}`);
        
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
        
        console.log(`✅ Successfully encrypted profile for user: ${profile.email}`);
        successCount++;
        
      } catch (error) {
        console.error(`❌ Failed to encrypt profile for ${profile.email}:`, error);
        errorCount++;
      }
    }
    
    console.log('\n=== Migration Summary ===');
    console.log(`Total profiles processed: ${profiles.length}`);
    console.log(`Successfully encrypted: ${successCount}`);
    console.log(`Failed to encrypt: ${errorCount}`);
    
    if (errorCount > 0) {
      console.log('\n⚠️  Some profiles failed to encrypt. Check the logs above for details.');
      console.log('You may need to investigate and retry the migration for failed profiles.');
    } else {
      console.log('\n🎉 All profiles successfully encrypted!');
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateProfilesToEncryption().catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}

module.exports = { migrateProfilesToEncryption };
