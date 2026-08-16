module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // plaid-security-integration is run by jest.real-security.config.js (the
  // `test:real-security` step, which runs immediately before this one in the
  // security-tests job). Listing it here as well ran it twice inside a single
  // job, on top of a third execution in the integration suite.
  testMatch: [
    '**/__tests__/integration/comprehensive-security.test.ts',
    // complete-security-suite was reachable only from jest.security.ci.config.js
    // and the two complete-security configs, none of which the workflow invokes —
    // so 23 passing security tests never ran in CI. Added here; those three
    // configs are deleted.
    '**/__tests__/integration/complete-security-suite.test.ts'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/src/__tests__/integration/security-test-setup.ts',
    // Security suites import testPrisma from test-database-ci; use the same module here
    // so hooks register once and privacySettings is cleared before user deletes.
    '<rootDir>/src/__tests__/setup/test-database-ci.ts'
  ],
  testTimeout: 60000, // 60 seconds for security tests
  // Serialized: these suites share one PostgreSQL database and their hooks call
  // unscoped deleteMany(), so parallel workers would delete each other's fixtures
  // between fixture creation and the request under test. This was harmless while CI
  // substituted a per-worker in-memory mock whose deleteMany was a no-op; it is not
  // now. Matches maxWorkers on the unit and integration configs.
  maxWorkers: 1,
  verbose: true,
  collectCoverage: true, // Enable coverage for security tests
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
  // Load environment variables from .env.test
  setupFiles: ['<rootDir>/src/__tests__/setup/load-env.ts'],
  
  // 🔒 SECURITY TEST CONFIGURATION
  // This configuration ensures we test the REAL security implementation
  // No mocking of Plaid routes or security logic
  moduleNameMapper: {
    // Only mock non-security dependencies
    '^../../openai$': '<rootDir>/src/__tests__/integration/security-test-setup.ts',
    '^../../market-news/synthesizer$': '<rootDir>/src/__tests__/integration/security-test-setup.ts',
    // DO NOT mock Plaid - we need real security implementation
  },
  
  // Clear mocks between tests to ensure clean state
  clearMocks: true,
  restoreMocks: true,
};
