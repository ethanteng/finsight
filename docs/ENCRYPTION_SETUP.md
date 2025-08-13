# 🔐 Data Encryption Setup Guide

## Overview

This document outlines the implementation of encryption at rest for sensitive user data including email addresses, verification codes, and password reset tokens.

## Security Features

- **AES-256-GCM Encryption**: Industry-standard authenticated encryption
- **Unique IVs**: Each piece of data uses a unique initialization vector
- **Authentication Tags**: Prevents tampering and ensures data integrity
- **Key Versioning**: Support for future key rotation
- **Additional Authenticated Data**: Extra security layer

## Environment Setup

### Required Environment Variable

```bash
# Generate a secure 32-byte encryption key
DATA_ENCRYPTION_KEY=your-32-byte-base64-encryption-key-here
```

### Key Generation

```bash
# Option 1: Using OpenSSL
openssl rand -base64 32

# Option 2: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Database Schema

The encryption system adds three new tables:

1. **`encrypted_user_data`**: Encrypted email addresses
2. **`encrypted_password_reset_tokens`**: Encrypted reset tokens
3. **`encrypted_email_verification_codes`**: Encrypted verification codes

## Migration Process

### 1. Run Database Migration

```bash
# Apply the new schema
npx prisma migrate deploy
```

### 2. Encrypt Existing Data

```bash
# Set your encryption key
export DATA_ENCRYPTION_KEY="your-generated-key"

# Run the migration script
node scripts/migrate-to-encryption.js
```

## Usage

### Creating Encrypted Users

```typescript
import { EncryptedUserService } from './src/auth/encrypted-user-service';

const encryptedService = new EncryptedUserService(process.env.DATA_ENCRYPTION_KEY!);

// Create user with encrypted email
const user = await encryptedService.createUser(prisma, 'user@example.com', 'hashedPassword');
```

### Verifying Encrypted Data

```typescript
// Verify password reset token
const token = await encryptedService.verifyPasswordResetToken(prisma, 'token', 'userId');

// Verify email code
const code = await encryptedService.verifyEmailCode(prisma, '123456', 'userId');
```

## Testing

Run the encryption tests:

```bash
npm run test:unit -- --testPathPattern=encryption
npm run test:unit -- --testPathPattern=encrypted-user-service
```

## Security Considerations

- **Key Storage**: Store encryption keys in environment variables, not in code
- **Key Rotation**: Plan for future key rotation without data loss
- **Backup Security**: Ensure encrypted data backups are also secure
- **Access Control**: Limit access to encryption keys to authorized personnel only

## Backward Compatibility

The system maintains backward compatibility by:
- Keeping plain text fields for existing functionality
- Gradually migrating to encrypted operations
- Supporting both encrypted and plain text data during transition

## Future Enhancements

- **Key Rotation**: Implement automated key rotation
- **Hardware Security**: Use hardware security modules (HSMs)
- **Audit Logging**: Enhanced encryption operation logging
- **Performance Optimization**: Batch encryption operations
