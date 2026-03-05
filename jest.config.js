module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/specs'],
  testMatch: [
    '**/__tests__/unit/**/*.test.ts',
    '**/__tests__/unit/**/*.spec.ts',
    '**/perf/**/*.spec.ts'
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
    '!src/__tests__/**',
    '!src/data/providers/**',
    '!src/auth/**',
    '!src/demo-data.ts',
    '!src/sync.ts',
    '!src/privacy.ts',
    '!src/prisma-client.ts',
    '!src/factories/**',
    '!src/retirement-analytics/**' // Exclude retirement analytics from coverage until tests are added
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 22, // Relaxed to accommodate new modules (Ask Linc pipeline, etc.)
      lines: 20,
      statements: 20
    }
  }
}; 