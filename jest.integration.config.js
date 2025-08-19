module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/integration/**/*.test.ts',
    '**/__tests__/integration/**/*.spec.ts'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/src/__tests__/integration/setup.ts',
    '<rootDir>/src/__tests__/setup/test-database.ts'
  ],
  testTimeout: 60000, // 60 seconds for integration tests
  verbose: true,
  collectCoverage: true, // Enable coverage for integration tests
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
  // Load environment variables from .env.test
  setupFiles: ['<rootDir>/src/__tests__/setup/load-env.ts'],
}; 