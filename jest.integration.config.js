module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/integration/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/integration/setup.ts'],
  testTimeout: 30000, // 30 seconds for integration tests
  verbose: true,
  collectCoverage: false, // Disable coverage for integration tests
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
}; 