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
    '<rootDir>/src/__tests__/setup/test-database.ts'
  ],
  setupFiles: ['<rootDir>/src/__tests__/setup/load-env.ts'],
  testTimeout: 120000, // 2 minutes for complete security tests
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  // Include all security tests
  testMatch: [
    '**/complete-security-suite.test.ts',
    '**/profile-encryption-security.test.ts'
  ],
  // Environment variables for security testing
  testEnvironmentOptions: {
    NODE_ENV: 'test',
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/finsight_test',
    PROFILE_ENCRYPTION_KEY: process.env.PROFILE_ENCRYPTION_KEY || 'test-encryption-key-32-bytes-long-here',
    JWT_SECRET: process.env.JWT_SECRET || 'test-jwt-secret-for-security-tests',
    ENABLE_USER_AUTH: 'true',
    ENABLE_TIER_ENFORCEMENT: 'true'
  }
};
