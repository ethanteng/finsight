module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/__tests__/**/*',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: [
    '<rootDir>/src/__tests__/integration/setup.ts',
    '<rootDir>/src/__tests__/setup/test-database-ci.ts'
  ],
  setupFiles: ['<rootDir>/src/__tests__/setup/load-env.ts'],
  testTimeout: 120000, // 2 minutes for complete security tests
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  // CI Environment: Only include core security tests, exclude Profile Encryption tests
  // Profile Encryption tests require real database and are skipped in CI
  testMatch: [
    '**/complete-security-suite.test.ts'
  ],
  // Exclude Profile Encryption tests in CI environment
  testPathIgnorePatterns: [
    'profile-encryption-security.test.ts'
  ],
  // Environment variables for CI security testing
  testEnvironmentOptions: {
    NODE_ENV: 'test',
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/test_db',
    PROFILE_ENCRYPTION_KEY: process.env.PROFILE_ENCRYPTION_KEY || 'QffTMJcTkYC8Nyk/T9jH83958GLtdei8YzgDQ0PDCaw=',
    JWT_SECRET: process.env.JWT_SECRET || 'test-jwt-secret-for-security-tests',
    ENABLE_USER_AUTH: 'true',
    ENABLE_TIER_ENFORCEMENT: 'true',
    CI: 'true',
    GITHUB_ACTIONS: 'true'
  }
};
