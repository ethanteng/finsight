module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/integration/dual-data-integration.test.ts',
    '**/__tests__/integration/enhanced-market-context-api.test.ts',
    '**/__tests__/integration/basic-integration.test.ts'
  ],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/integration/setup.ts'],
  testTimeout: 60000, // 60 seconds for integration tests
  verbose: true,
  collectCoverage: false, // Disable coverage for integration tests
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  }
}; 