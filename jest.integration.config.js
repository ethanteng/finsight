module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/integration/**/*.test.ts',
    '**/__tests__/integration/**/*.spec.ts',
    // src/__tests__/auth was excluded from every config, so 39 tests never ran
    // anywhere and quietly rotted. They need a database and supertest, which this
    // config already provides.
    '**/__tests__/auth/**/*.test.ts'
  ],
  // Keep in sync with jest.integration.ci.config.js — security suites are owned
  // by the security configs, which run them without this config's plaidClient stub.
  testPathIgnorePatterns: [
    'comprehensive-security.test.ts', // -> jest.security.config.js
    'complete-security-suite.test.ts', // has its own setup; see jest.complete-security.config.js
    'plaid-security-integration.test.ts', // -> jest.real-security.config.js
    'privacy-security-integration.test.ts', // -> jest.real-security.config.js
    'profile-encryption-security.test.ts', // -> jest.real-security.config.js
    'snaptrade-security.test.ts' // -> jest.real-security.config.js
  ],
  setupFilesAfterEnv: [
    '<rootDir>/src/__tests__/integration/setup.ts',
    '<rootDir>/src/__tests__/setup/test-database.ts'
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
};
