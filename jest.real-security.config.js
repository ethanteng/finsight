module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/integration/plaid-security-integration.test.ts',
    '**/__tests__/integration/privacy-security-integration.test.ts',
    '**/__tests__/integration/profile-encryption-security.test.ts',
    '**/__tests__/integration/snaptrade-security.test.ts'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/src/__tests__/setup/test-database-ci.ts'
  ],
  setupFiles: ['<rootDir>/src/__tests__/setup/load-env.ts'],
  testTimeout: 60000,
  // Serialized: these suites share one PostgreSQL database and their hooks call
  // unscoped deleteMany(), so parallel workers would delete each other's fixtures
  // between fixture creation and the request under test. This was harmless while CI
  // substituted a per-worker in-memory mock whose deleteMany was a no-op; it is not
  // now. Matches maxWorkers on the unit and integration configs.
  maxWorkers: 1,
  
  // 🔒 CRITICAL: No mocking of security logic
  moduleNameMapper: {
    // Only mock non-security dependencies
    '^../../openai$': '<rootDir>/src/__tests__/integration/security-test-setup.ts',
    '^../../market-news/synthesizer$': '<rootDir>/src/__tests__/integration/security-test-setup.ts',
    // DO NOT mock Plaid, auth, or database - we need real security testing
  },
  
  clearMocks: true,
  restoreMocks: true,
  
  // Enable verbose output for security testing
  verbose: true,
  
  // Collect coverage for security tests
  collectCoverage: true,
  
  // Load environment variables from .env.test
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
};
