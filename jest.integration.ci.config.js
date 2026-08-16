module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/src/__tests__/integration/**/*.test.ts',
    '<rootDir>/src/__tests__/integration/**/*.spec.ts',
    // src/__tests__/auth was excluded from every config, so 39 tests never ran
    // anywhere and quietly rotted. They need a database and supertest, which this
    // config already provides.
    '<rootDir>/src/__tests__/auth/**/*.test.ts'
  ],
  // Security suites are owned by the security-tests job, which runs them without
  // this config's plaidClient stub. Running them here as well executed the same
  // files a second (and for plaid-security-integration, a third) time per
  // pipeline without testing anything the security job does not already cover.
  testPathIgnorePatterns: [
    'comprehensive-security.test.ts', // -> jest.security.config.js
    'complete-security-suite.test.ts', // -> jest.security.config.js
    'plaid-security-integration.test.ts', // -> jest.real-security.config.js
    'privacy-security-integration.test.ts', // -> jest.real-security.config.js
    'profile-encryption-security.test.ts', // -> jest.real-security.config.js
    'snaptrade-security.test.ts' // -> jest.real-security.config.js
  ],
  setupFilesAfterEnv: [
    '<rootDir>/src/__tests__/integration/setup.ts',
    '<rootDir>/src/__tests__/setup/test-database-ci.ts' // Use CI-specific database setup
  ],
  testTimeout: 60000, // 60 seconds for integration tests
  verbose: true,
  collectCoverage: true, // Enable coverage for integration tests
  maxWorkers: 1, // Use single worker to avoid race conditions and match CI/CD behavior
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
  // Load environment variables from .env.test
  setupFiles: ['<rootDir>/src/__tests__/setup/load-env.ts'],
  
  // 🔒 CI/CD INTEGRATION TEST CONFIGURATION
  // This configuration ensures we test integration logic with proper CI/CD database setup
  // We do NOT mock the database - we use the real CI/CD test database
  moduleNameMapper: {
    // Only mock external services that aren't available in CI/CD
    // DO NOT mock database or security logic
  },
  
  // Clear mocks between tests to ensure clean state
  clearMocks: true,
  restoreMocks: true,
  
  // Add explicit root directory and module directories
  rootDir: '.',
  moduleDirectories: ['node_modules', 'src'],
  
  // Add test discovery options
  testLocationInResults: true,
  detectOpenHandles: true,
  forceExit: true,
};
