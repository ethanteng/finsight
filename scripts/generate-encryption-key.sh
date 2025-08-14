#!/bin/bash

# Generate a secure 32-byte (256-bit) encryption key for user profile encryption
echo "Generating secure encryption key for user profile encryption..."

# Generate the key using OpenSSL
ENCRYPTION_KEY=$(openssl rand -base64 32)

echo "Generated encryption key:"
echo "$ENCRYPTION_KEY"
echo ""
echo "Add this to your environment variables:"
echo "PROFILE_ENCRYPTION_KEY=$ENCRYPTION_KEY"
echo ""
echo "For local development, add to .env file:"
echo "PROFILE_ENCRYPTION_KEY=$ENCRYPTION_KEY"
echo ""
echo "For production, add to your deployment environment variables."
echo ""
echo "⚠️  IMPORTANT: Keep this key secure and never commit it to version control!"
echo "⚠️  IMPORTANT: Backup this key securely - you'll need it to decrypt existing profiles!"
echo ""
echo "Key length: ${#ENCRYPTION_KEY} characters"
echo "Key validation: $([ ${#ENCRYPTION_KEY} -ge 32 ] && echo "✅ Valid" || echo "❌ Invalid")"
