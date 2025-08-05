# 🧪 Testing Documentation

## Overview

This document provides comprehensive documentation for the testing implementation in the Finsight project. The testing suite includes unit tests, integration tests, and automated CI/CD pipeline testing.

## Test Structure

### Unit Tests
- **Location**: `src/__tests__/unit/`
- **Configuration**: `jest.config.js`
- **Coverage**: 80% threshold for branches, functions, lines, statements
- **Execution**: `npm run test:unit`

### Integration Tests
- **Location**: `src/__tests__/integration/`
- **Configuration**: `jest.integration.config.js`
- **Execution**: `npm run test:integration`

### Test Categories

#### ✅ Core System Tests
- **RAG System**: `rag-system.test.ts` (14 tests)
- **RAG Components**: `rag-components.test.ts` (13 tests)
- **RAG + Profile Integration**: `rag-profile-integration.test.ts` (14 tests)

#### ✅ Profile Management Tests
- **Profile Manager**: `profile-manager.test.ts` (14 tests)
- **Profile Extractor**: `profile-extractor.test.ts` (22 tests)
- **PlaidProfileEnhancer**: `plaid-profile-enhancer.test.ts` (25 tests)

#### ✅ Tier System Tests
- **Tier System**: `tier-system.test.ts` (14 tests)
- **Data Source Management**: Tier-based access control
- **Upgrade Paths**: Clear progression between tiers

#### ✅ Security & Privacy Tests
- **Plaid Security**: `plaid-security.test.ts` (20 tests)
- **Privacy Logic**: `privacy-logic.test.ts` (10 tests)
- **Demo Mode Security**: `demo-mode-security.test.ts` (8 tests)

#### ✅ API & Integration Tests
- **Admin Endpoints**: `admin-endpoints.test.ts` (12 tests)
- **Enhanced Market Context**: `enhanced-market-context-simple.test.ts` (15 tests)
- **Dual Data System**: `dual-data-system.test.ts` (8 tests)

## Tier System Testing

### Tier-Based Access Control Testing

The tier system implements different levels of access to RAG functionality and data sources. Testing ensures proper access control and upgrade paths.

#### Tier Levels
- **Starter**: Basic functionality, no RAG access
- **Standard**: RAG access with enhanced market context
- **Premium**: Full RAG access with all data sources

#### Testing Strategy
```typescript
describe('Tier System Tests', () => {
  it('should block RAG access for Starter tier', async () => {
    // Test that Starter users cannot access RAG features
  });

  it('should allow RAG access for Standard tier', async () => {
    // Test that Standard users can access RAG with limitations
  });

  it('should provide full RAG access for Premium tier', async () => {
    // Test that Premium users have full RAG access
  });
});
```

#### Tier Upgrade Testing
- **Upgrade Paths**: Test progression between tiers
- **Feature Unlocking**: Verify features unlock with tier upgrades
- **Data Source Access**: Test access to different data sources per tier
- **Limitation Enforcement**: Ensure tier limitations are properly enforced

## Database Schema Management

### ⚠️ Critical: Preventing Schema Drift

**Schema drift** occurs when local and production database schemas become out of sync, causing deployment failures and data inconsistencies.

#### ❌ Common Causes of Schema Drift:
1. **Direct database modifications** without migrations
2. **Using `prisma db push`** instead of proper migrations
3. **Incomplete git history** of schema changes
4. **Feature branch development** without proper schema sync
5. **Manual SQL modifications** to production database

#### ✅ Proper Schema Workflow:

**Before Starting New Features:**
```bash
# 1. Sync with production schema
npx prisma db pull
npx prisma generate

# 2. Verify schema is clean
npx prisma migrate status
```

**When Making Schema Changes:**
```bash
# 1. Edit schema.prisma
# 2. Create proper migration
npx prisma migrate dev --name descriptive_migration_name

# 3. Test migration locally
npx prisma migrate reset
npx prisma migrate deploy

# 4. Commit everything to git
git add prisma/
git commit -m "feat: add UserProfile model with proper migrations"
```

**Before Deploying:**
```bash
# 1. Test migrations in preview
npx prisma migrate deploy --preview-feature

# 2. Verify schema consistency
npx prisma db pull
npx prisma generate
```

#### 🚨 Schema Drift Recovery:

If schema drift occurs (like the 2025-08-05 incident):

1. **Identify the drift:**
   ```bash
   npx prisma migrate status
   npx prisma db pull
   ```

2. **Create conditional migrations** for missing columns:
   ```sql
   -- Example: Safe column addition
   DO $$
   BEGIN
       IF NOT EXISTS (
           SELECT 1 FROM information_schema.columns 
           WHERE table_name = 'user_profiles' 
           AND column_name = 'email'
       ) THEN
           ALTER TABLE "user_profiles" ADD COLUMN "email" TEXT;
       END IF;
   END $$;
   ```

3. **Never use `prisma db push`** in production
4. **Always test migrations** before deploying

#### 📋 Schema Management Checklist:

- [ ] **Before feature development**: `npx prisma db pull`
- [ ] **Schema changes**: Always use `npx prisma migrate dev`
- [ ] **Test migrations**: `npx prisma migrate reset && npx prisma migrate deploy`
- [ ] **Commit migrations**: Always commit migration files to git
- [ ] **Before deployment**: `npx prisma migrate deploy --preview-feature`
- [ ] **Monitor deployments**: Check migration logs for failures

## Test Commands

### Development Commands
```bash
# Run all unit tests
npm run test:unit

# Run all integration tests
npm run test:integration

# Run all tests
npm run test:all

# Run tests with coverage
npm run test:coverage:unit
npm run test:coverage:integration
npm run test:coverage:all

# Watch mode
npm run test:watch
npm run test:integration:watch
```

### CI/CD Commands
```bash
# CI-specific integration tests
npm run test:integration:ci

# Specific test suites
npm run test:enhanced-market-context
npm run test:dual-data
```

## Test Data Management

### Database Setup
- **Test Database**: PostgreSQL with isolated test schema
- **Cleanup**: Automatic cleanup between tests
- **Factories**: Reusable test data factories

### Mock Data
- **Demo Data**: Realistic financial data for testing
- **API Mocks**: External API responses
- **User Data**: Test user profiles and accounts

## Coverage Requirements

### Unit Tests
- **Branches**: 80% minimum
- **Functions**: 80% minimum
- **Lines**: 80% minimum
- **Statements**: 80% minimum

### Integration Tests
- **Functional Coverage**: All user workflows
- **API Coverage**: All endpoints tested
- **Error Handling**: Graceful failure scenarios

## CI/CD Pipeline

### GitHub Actions Workflow
- **Trigger**: Push to main, pull requests
- **Jobs**: 
  - Lint and test
  - Backend tests with coverage
  - Frontend build
  - Integration tests with coverage
  - Build verification
  - Deployment

### Coverage Reporting
- **Codecov Integration**: Automatic coverage uploads
- **Unit Tests**: Separate coverage flags
- **Integration Tests**: Separate coverage flags
- **Reports**: HTML and LCOV formats

## Test Patterns

### Database Tests
```typescript
describe('Database Tests', () => {
  beforeEach(async () => {
    // Clean up test data
    await prisma.user.deleteMany();
  });

  afterEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
  });

  it('should create user successfully', async () => {
    const user = await prisma.user.create({
      data: { email: generateUniqueEmail(), passwordHash: 'hash' }
    });
    expect(user).toBeDefined();
  });
});
```

### API Tests
```typescript
describe('API Tests', () => {
  it('should return 200 for valid request', async () => {
    const response = await request(app)
      .post('/api/ask')
      .send({ question: 'What is my net worth?' })
      .expect(200);
    
    expect(response.body).toHaveProperty('answer');
  });
});
```

### Mock Tests
```typescript
describe('Mock Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call OpenAI with correct parameters', async () => {
    const mockAskOpenAI = jest.mocked(askOpenAI);
    mockAskOpenAI.mockResolvedValue('Mock response');
    
    await someFunction();
    
    expect(mockAskOpenAI).toHaveBeenCalledWith(
      expect.stringContaining('test question')
    );
  });
});
```

## Error Handling

### Test Failures
- **Database Errors**: Foreign key constraint violations
- **API Errors**: Network timeouts, rate limiting
- **Mock Errors**: Incorrect mock implementations

### Debugging
- **Verbose Output**: `--verbose` flag for detailed logs
- **Test Isolation**: Each test runs in isolation
- **Cleanup**: Automatic cleanup prevents test interference

## Performance

### Test Execution
- **Unit Tests**: ~3.9 seconds for 302 tests
- **Integration Tests**: ~60 second timeout
- **Parallel Execution**: Unit tests run in parallel
- **Sequential Execution**: Integration tests run sequentially

### Memory Management
- **Database Connections**: Proper cleanup
- **Mock Cleanup**: Jest mock reset between tests
- **Resource Cleanup**: Automatic cleanup in setup/teardown

## Best Practices

### Test Organization
1. **Arrange**: Set up test data and mocks
2. **Act**: Execute the function being tested
3. **Assert**: Verify the expected outcome

### Naming Conventions
- **Test Files**: `*.test.ts` or `*.spec.ts`
- **Test Descriptions**: Clear, descriptive names
- **Group Names**: Logical grouping of related tests

### Test Isolation
- **Database**: Clean state between tests
- **Mocks**: Reset all mocks after each test
- **Environment**: Isolated test environment

## Troubleshooting

### Common Issues
1. **Database Constraints**: Foreign key violations during cleanup
2. **Mock Failures**: Incorrect mock implementations
3. **Timeout Issues**: Long-running tests exceeding limits
4. **Coverage Gaps**: Missing test coverage for new features

### Solutions
1. **Database Issues**: Update cleanup order in setup.ts
2. **Mock Issues**: Verify mock implementations and reset
3. **Timeout Issues**: Increase timeout or optimize test
4. **Coverage Issues**: Add tests for uncovered code paths

## Maintenance

### Regular Tasks
- **Update Tests**: When adding new features
- **Review Coverage**: Ensure 80% threshold maintained
- **Update Mocks**: When external APIs change
- **Performance**: Monitor test execution times

### Documentation Updates
- **Test Documentation**: Update when adding new test categories
- **API Documentation**: Update when endpoints change
- **Coverage Reports**: Review and address gaps

## Success Metrics

### Current Status
- **Total Tests**: 302 unit tests
- **Test Suites**: 24 test suites
- **Coverage**: 80%+ across all metrics
- **Execution Time**: ~3.9 seconds for unit tests
- **CI/CD**: Automated testing on all deployments

### Quality Indicators
- **Zero Failing Tests**: All tests passing
- **High Coverage**: 80%+ coverage maintained
- **Fast Execution**: Tests complete quickly
- **Reliable CI/CD**: Automated pipeline working

This testing implementation provides comprehensive coverage of the Finsight platform's functionality while maintaining high quality and performance standards. 