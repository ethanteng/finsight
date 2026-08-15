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
  // Measured on main at the time of writing (89 suites / 855 tests, PostgreSQL 16):
  //   statements 48.77 · branches 38.24 · functions 57.93 · lines 48.38
  // The ~2-3 point gap absorbs normal drift without letting a real drop through.
  // The previous values (10/21/20/20) sat at roughly half of actual coverage, so
  // more than half the suite could have been deleted with CI still green.
  //
  // Raise these as coverage improves — notably src/plaid.ts (2,003 lines, 0%) and
  // src/openai/context-service.ts (1,037 lines, ~2%), the two largest gaps.
  coverageThreshold: {
    global: {
      branches: 35,
      functions: 55,
      lines: 46,
      statements: 46
    }
  }
};
