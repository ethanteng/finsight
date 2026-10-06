import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.test file for integration tests (if it exists)
try {
  config({ path: resolve(process.cwd(), '.env.test') });
  console.log('✅ Loaded .env.test file');
} catch (error) {
  console.log('⚠️ .env.test file not found, using environment variables from CI/CD');
}

/*
 * `/auth/register` meters every attempt (see REGISTER_RATE_LIMIT). Integration
 * and auth suites share one Jest worker and one in-memory window, and together
 * they exceed the production default of 20 — raise the ceiling here, before
 * `src/index` loads the router, so those suites are not fighting the limiter.
 * The unit case that pins the production default isolates its own module.
 */
if (!process.env.REGISTER_RATE_LIMIT) {
  process.env.REGISTER_RATE_LIMIT = '10000';
}

// For CI/CD, ensure we have the required environment variables
if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
  console.log('🔧 CI/CD Environment Detected');
  
  // Ensure required environment variables are set
  if (!process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL) {
    console.error('❌ DATABASE_URL or TEST_DATABASE_URL must be set in CI/CD');
    process.exit(1);
  }
  
  if (!process.env.PROFILE_ENCRYPTION_KEY) {
    console.error('❌ PROFILE_ENCRYPTION_KEY must be set in CI/CD');
    process.exit(1);
  }
  
  if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET must be set in CI/CD');
    process.exit(1);
  }
}

// Log the loaded environment variables for debugging
console.log('🔧 Test Environment Variables Loaded:');
console.log('  TEST_DATABASE_URL:', process.env.TEST_DATABASE_URL ? '✅ Set' : '❌ Not set');
console.log('  DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Not set');
console.log('  PROFILE_ENCRYPTION_KEY:', process.env.PROFILE_ENCRYPTION_KEY ? '✅ Set' : '❌ Not set');
console.log('  JWT_SECRET:', process.env.JWT_SECRET ? '✅ Set' : '❌ Not set');
console.log('  NODE_ENV:', process.env.NODE_ENV);
console.log('  CI:', process.env.CI);
console.log('  GITHUB_ACTIONS:', process.env.GITHUB_ACTIONS);
