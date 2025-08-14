#!/usr/bin/env node

/**
 * Migration script to encrypt existing sensitive data
 * This script encrypts existing email addresses, verification codes, and reset tokens
 */

const { PrismaClient } = require('@prisma/client');
const { DataEncryptionService } = require('../dist/auth/encryption');

const prisma = new PrismaClient();

async function migrateToEncryption() {
  const encryptionKey = process.env.DATA_ENCRYPTION_KEY;
  
  if (!encryptionKey) {
    console.error('❌ DATA_ENCRYPTION_KEY environment variable is required');
    process.exit(1);
  }

  if (!DataEncryptionService.validateKey(encryptionKey)) {
    console.error('❌ Invalid encryption key format. Key must be base64 encoded 32-byte value');
    process.exit(1);
  }

  const encryptionService = new DataEncryptionService(encryptionKey);
  
  console.log('🔐 Starting encryption migration...');
  console.log('📊 This will encrypt existing sensitive data in the database');

  try {
    // Step 1: Encrypt existing user emails
    console.log('\n📧 Step 1: Encrypting existing user emails...');
    const users = await prisma.user.findMany({
      where: {
        encryptedUserData: null
      }
    });

    console.log(`Found ${users.length} users to encrypt`);

    for (const user of users) {
      try {
        const encryptedEmail = encryptionService.encrypt(user.email);
        
        await prisma.encryptedUserData.create({
          data: {
            userId: user.id,
            encryptedEmail: encryptedEmail.encryptedValue,
            iv: encryptedEmail.iv,
            tag: encryptedEmail.tag,
            keyVersion: encryptedEmail.keyVersion,
            algorithm: 'aes-256-gcm'
          }
        });

        console.log(`✅ Encrypted email for user: ${user.id}`);
      } catch (error) {
        console.error(`❌ Failed to encrypt email for user ${user.id}:`, error.message);
      }
    }

    // Step 2: Encrypt existing password reset tokens
    console.log('\n🔑 Step 2: Encrypting existing password reset tokens...');
    const resetTokens = await prisma.passwordResetToken.findMany({
      where: {
        encryptedData: null
      }
    });

    console.log(`Found ${resetTokens.length} reset tokens to encrypt`);

    for (const token of resetTokens) {
      try {
        const encryptedToken = encryptionService.encrypt(token.token);
        
        await prisma.encryptedPasswordResetToken.create({
          data: {
            tokenId: token.id,
            encryptedToken: encryptedToken.encryptedValue,
            iv: encryptedToken.iv,
            tag: encryptedToken.tag,
            keyVersion: encryptedToken.keyVersion,
            algorithm: 'aes-256-gcm'
          }
        });

        console.log(`✅ Encrypted reset token: ${token.id}`);
      } catch (error) {
        console.error(`❌ Failed to encrypt reset token ${token.id}:`, error.message);
      }
    }

    // Step 3: Encrypt existing email verification codes
    console.log('\n📨 Step 3: Encrypting existing email verification codes...');
    const verificationCodes = await prisma.emailVerificationCode.findMany({
      where: {
        encryptedData: null
      }
    });

    console.log(`Found ${verificationCodes.length} verification codes to encrypt`);

    for (const code of verificationCodes) {
      try {
        const encryptedCode = encryptionService.encrypt(code.code);
        
        await prisma.encryptedEmailVerificationCode.create({
          data: {
            codeId: code.id,
            encryptedCode: encryptedCode.encryptedValue,
            iv: encryptedCode.iv,
            tag: encryptedCode.tag,
            keyVersion: encryptedCode.keyVersion,
            algorithm: 'aes-256-gcm'
          }
        });

        console.log(`✅ Encrypted verification code: ${code.id}`);
      } catch (error) {
        console.error(`❌ Failed to encrypt verification code ${code.id}:`, error.message);
      }
    }

    console.log('\n🎉 Encryption migration completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`- Users encrypted: ${users.length}`);
    console.log(`- Reset tokens encrypted: ${resetTokens.length}`);
    console.log(`- Verification codes encrypted: ${verificationCodes.length}`);

    console.log('\n⚠️  Important notes:');
    console.log('- Plain text data is still stored for backward compatibility');
    console.log('- You can now use the EncryptedUserService for new operations');
    console.log('- Consider removing plain text fields in a future migration');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateToEncryption().catch(console.error);
}

module.exports = { migrateToEncryption };
