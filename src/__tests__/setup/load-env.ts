import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.test file for integration tests
config({ path: resolve(process.cwd(), '.env.test') });

// Log the loaded environment variables for debugging
console.log('🔧 Test Environment Variables Loaded:');
console.log('  TEST_DATABASE_URL:', process.env.TEST_DATABASE_URL ? '✅ Set' : '❌ Not set');
console.log('  PROFILE_ENCRYPTION_KEY:', process.env.PROFILE_ENCRYPTION_KEY ? '✅ Set' : '❌ Not set');
console.log('  NODE_ENV:', process.env.NODE_ENV);
