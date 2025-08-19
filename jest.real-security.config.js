module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/integration/real-plaid-security.test.ts'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/src/__tests__/setup/test-database.ts'
  ],
  setupFiles: ['<rootDir>/src/__tests__/setup/load-env.ts'],
  testTimeout: 60000,
  
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
