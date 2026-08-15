module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // plaid-security-integration is run by jest.real-security.config.js (the
  // `test:real-security` step, which runs immediately before this one in the
  // security-tests job). Listing it here as well ran it twice inside a single
  // job, on top of a third execution in the integration suite.
  testMatch: [
    '**/__tests__/integration/comprehensive-security.test.ts'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/src/__tests__/integration/security-test-setup.ts',
    '<rootDir>/src/__tests__/setup/test-database.ts'
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
