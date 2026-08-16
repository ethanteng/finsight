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
  // Measured on main at the time of writing (93 suites / 974 tests, PostgreSQL 16):
  //   statements 50.88 · branches 40.46 · functions 60.24 · lines 50.47
  // The ~2-3 point gap absorbs normal drift without letting a real drop through.
  // The original values (10/21/20/20) sat at roughly half of actual coverage, so
  // more than half the suite could have been deleted with CI still green.
  //
  // Ratchet these up as coverage improves. src/plaid.ts is now at ~16% (its route
  // handlers, lines 369-1996, are still untested); src/openai/context-service.ts
  // (1,037 lines, ~2%) is the largest remaining gap.
  coverageThreshold: {
    global: {
      branches: 38,
      functions: 58,
      lines: 48,
      statements: 48
    }
  }
};
