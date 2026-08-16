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
    '!src/sync.ts',
    '!src/privacy.ts',
    '!src/prisma-client.ts',
    '!src/factories/**',
    '!src/retirement-analytics/**' // Exclude retirement analytics from coverage until tests are added
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Set just under measured coverage so this gate can actually catch a regression.
  // Measured on main at the time of writing (94 suites / 1039 tests, PostgreSQL 16):
  //   statements 52.32 · branches 42.09 · functions 61.84 · lines 51.92
  // The ~2 point gap absorbs normal drift without letting a real drop through.
  // The original values (10/21/20/20) sat at roughly half of actual coverage, so
  // more than half the suite could have been deleted with CI still green.
  //
  // Ratchet these up as coverage improves. What is left in the two big files is
  // the I/O-shaped half: src/plaid.ts route handlers (369-1996) and
  // context-service's gatherContextSnapshot orchestrator (57-662). Both need
  // supertest and a database, so they belong in the integration suite.
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 60,
      lines: 50,
      statements: 50
    }
  }
};
