module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  env: {
    node: true,
    es6: true,
    jest: true,
  },
  rules: {
    'prefer-const': 'warn',
    'no-var': 'error',
    'no-console': 'warn',
    'no-unused-vars': 'warn',
  },
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/', '*.js'],
}; 