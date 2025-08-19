module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/integration/plaid-security-integration.test.ts',
    '**/__tests__/integration/comprehensive-security.test.ts',
    '**/__tests__/integration/profile-encryption-security.test.ts',
    '**/__tests__/integration/complete-security-suite.test.ts'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/src/__tests__/integration/security-test-setup.ts',
    '<rootDir>/src/__tests__/setup/test-database-ci.ts' // Use CI-specific database setup
  ],
  testTimeout: 60000, // 60 seconds for security tests
  verbose: true,
  collectCoverage: true, // Enable coverage for security tests
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
  // Load environment variables from .env.test
  setupFiles: ['<rootDir>/src/__tests__/setup/load-env.ts'],
  
  // 🔒 CI/CD SECURITY TEST CONFIGURATION
  // This configuration ensures we test the REAL security implementation in CI/CD
  // We do NOT mock security logic - we test the actual implementation
  moduleNameMapper: {
    // Only mock non-security dependencies
    '^../../openai$': '<rootDir>/src/__tests__/integration/security-test-setup.ts',
    '^../../market-news/synthesizer$': '<rootDir>/src/__tests__/integration/security-test-setup.ts',
    // DO NOT mock Plaid or database - we need real security implementation
    // DO NOT mock Prisma - we need real database queries to test security filtering
  },
  
  // Clear mocks between tests to ensure clean state
  clearMocks: true,
  restoreMocks: true,
};
