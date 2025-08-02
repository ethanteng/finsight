module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/unit/**/*.test.ts',
    '**/__tests__/unit/**/*.spec.ts'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/integration/',
    '/auth/',
    '/setup.ts'
  ],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/unit/setup.ts'],
  testTimeout: 30000,
  // Run tests sequentially to avoid database race conditions
  maxWorkers: 1,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/__tests__/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
}; 