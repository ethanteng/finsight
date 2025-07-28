module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/integration/**/*.ts',
    '**/integration/**/*.ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  setupFilesAfterEnv: [],
  testTimeout: 30000,
  // Integration tests can be slower
  maxWorkers: 1,
}; 