# Testing Best Practices Guide

## 🎯 **Current Test Structure Analysis**

### **Unit Tests** (Fast, Isolated, No External Dependencies)
- ✅ **Location**: `src/__tests__/` (excluding `/integration/`, `/auth/`)
- ✅ **Purpose**: Test business logic in isolation
- ✅ **Speed**: < 30 seconds
- ✅ **Dependencies**: Mocked/No external APIs

### **Integration Tests** (Real APIs, Full Workflows)
- ✅ **Location**: `src/__tests__/integration/`
- ✅ **Purpose**: Test end-to-end workflows with real services
- ✅ **Speed**: 30+ seconds
- ✅ **Dependencies**: Real OpenAI, FRED, Alpha Vantage APIs

## 🚀 **Best Practices Implementation**

### **1. Unit Test Best Practices**

#### **✅ Current Good Practices:**
```typescript
// tier-system.test.ts - EXCELLENT unit test example
describe('Tier System', () => {
  describe('DataSourceManager', () => {
    test('should get correct sources for Starter tier', () => {
      const sources = DataSourceManager.getSourcesForTier(UserTier.STARTER);
      
      // ✅ Tests business logic in isolation
      // ✅ No external dependencies
      // ✅ Fast execution
      // ✅ Clear assertions
    });
  });
});
```

#### **🔧 Recommended Improvements:**

**A. Add Unit Test Organization:**
```typescript
// Move unit tests to dedicated directory
src/__tests__/unit/
├── tier-system.test.ts
├── data-orchestrator.test.ts
├── openai.test.ts
└── auth.test.ts
```

**B. Add Unit Test Setup:**
```typescript
// src/__tests__/unit/setup.ts
import { PrismaClient } from '@prisma/client';

// Mock external dependencies
jest.mock('../openai', () => ({
  askOpenAI: jest.fn(),
  askOpenAIForTests: jest.fn()
}));

jest.mock('../data/providers/fred', () => ({
  FREDProvider: jest.fn()
}));

// Setup test database
beforeAll(async () => {
  // Setup test database
});

afterAll(async () => {
  // Cleanup test database
});
```

**C. Add Unit Test Patterns:**
```typescript
// src/__tests__/unit/tier-system.test.ts
describe('Tier System Unit Tests', () => {
  // ✅ Arrange-Act-Assert pattern
  test('should calculate tier limitations correctly', () => {
    // Arrange
    const tier = UserTier.STARTER;
    
    // Act
    const limitations = DataSourceManager.getTierLimitations(tier);
    
    // Assert
    expect(limitations).toContain('account data only');
    expect(limitations.length).toBeGreaterThan(0);
  });

  // ✅ Test edge cases
  test('should handle invalid tier gracefully', () => {
    expect(() => {
      DataSourceManager.getSourcesForTier('invalid' as any);
    }).toThrow();
  });

  // ✅ Test data transformations
  test('should transform tier data correctly', () => {
    const mockData = { tier: 'starter', features: ['basic'] };
    const result = transformTierData(mockData);
    expect(result.upgradePath).toBeDefined();
  });
});
```

### **2. Integration Test Best Practices**

#### **✅ Current Good Practices:**
```typescript
// api-integration.test.ts - GOOD integration test example
describe('API Integration Tests', () => {
  afterAll(async () => {
    await prisma.$disconnect(); // ✅ Proper cleanup
  });

  it('should test FRED API with real questions', async () => {
    // ✅ Tests real API integration
    // ✅ Uses proper test data
    // ✅ Handles API failures gracefully
  });
});
```

#### **🔧 Recommended Improvements:**

**A. Add Integration Test Organization:**
```typescript
src/__tests__/integration/
├── api/
│   ├── openai-integration.test.ts
│   ├── fred-integration.test.ts
│   └── alpha-vantage-integration.test.ts
├── workflows/
│   ├── user-onboarding.test.ts
│   ├── tier-upgrade.test.ts
│   └── data-sync.test.ts
└── setup.ts
```

**B. Add Integration Test Setup:**
```typescript
// src/__tests__/integration/setup.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeAll(async () => {
  // ✅ Setup test environment
  process.env.NODE_ENV = 'test';
  
  // ✅ Verify API keys are available
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY required for integration tests');
  }
});

afterAll(async () => {
  // ✅ Cleanup
  await prisma.$disconnect();
});

beforeEach(async () => {
  // ✅ Reset test data
  await prisma.demoSession.deleteMany();
  await prisma.demoConversation.deleteMany();
});
```

**C. Add Integration Test Patterns:**
```typescript
// src/__tests__/integration/api/openai-integration.test.ts
describe('OpenAI Integration Tests', () => {
  // ✅ Test real API responses
  it('should get AI response for financial question', async () => {
    const response = await request(app)
      .post('/ask')
      .set('x-session-id', 'test-session-id')
      .send({
        question: 'What is my account balance?',
        isDemo: true
      });

    expect(response.status).toBe(200);
    expect(response.body.answer).toContain('account');
  });

  // ✅ Test API error handling
  it('should handle OpenAI API errors gracefully', async () => {
    // Test with invalid API key
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'invalid-key';

    const response = await request(app)
      .post('/ask')
      .set('x-session-id', 'test-session-id')
      .send({
        question: 'Test question',
        isDemo: true
      });

    expect(response.status).toBe(500);
    
    // Restore original key
    process.env.OPENAI_API_KEY = originalKey;
  });

  // ✅ Test rate limiting
  it('should handle rate limiting', async () => {
    const promises = Array(5).fill(null).map(() =>
      request(app)
        .post('/ask')
        .set('x-session-id', 'test-session-id')
        .send({
          question: 'Test question',
          isDemo: true
        })
    );

    const responses = await Promise.all(promises);
    responses.forEach(response => {
      expect([200, 429]).toContain(response.status);
    });
  });
});
```

### **3. Test Configuration Best Practices**

#### **✅ Current Good Configuration:**
```javascript
// jest.config.js - Unit tests
module.exports = {
  testPathIgnorePatterns: [
    '/integration/',
    '/auth/'
  ],
  testTimeout: 30000,
};

// jest.integration.config.js - Integration tests
module.exports = {
  testMatch: ['**/__tests__/integration/**/*.test.ts'],
  testTimeout: 30000,
  collectCoverage: false,
};
```

#### **🔧 Recommended Improvements:**

**A. Add Test Scripts:**
```json
// package.json
{
  "scripts": {
    "test": "jest", // Unit tests only
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --config jest.integration.config.js",
    "test:all": "npm run test:unit && npm run test:integration",
    "test:coverage": "jest --coverage --testPathPattern=unit",
    "test:watch": "jest --watch --testPathPattern=unit"
  }
}
```

**B. Add Environment-Specific Configs:**
```javascript
// jest.config.js
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
```

### **4. CI/CD Integration Best Practices**

#### **✅ Current Good Setup:**
```yaml
# .github/workflows/ci-cd.yml
- name: Run backend tests
  run: npm test  # Unit tests only
```

#### **🔧 Recommended Improvements:**

**A. Add Separate Integration Test Workflow:**
```yaml
# .github/workflows/integration-tests.yml
name: Integration Tests
on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM daily
  workflow_dispatch:      # Manual trigger
  push:
    branches: [main]      # On main branch pushes

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Run Integration Tests
        run: npm run test:integration
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
          ALPHA_VANTAGE_API_KEY: ${{ secrets.ALPHA_VANTAGE_API_KEY }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

**B. Add Test Reporting:**
```yaml
# Add to both workflows
- name: Upload test results
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: test-results
    path: coverage/
```

### **5. Test Data Management Best Practices**

#### **✅ Current Good Practices:**
```typescript
// Using demo data for tests
const demoAccounts = getDemoAccounts();
const demoTransactions = getDemoTransactions();
```

#### **🔧 Recommended Improvements:**

**A. Add Test Data Factories:**
```typescript
// src/__tests__/unit/factories/user.factory.ts
export const createTestUser = (overrides = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  tier: 'starter',
  ...overrides
});

export const createTestAccount = (overrides = {}) => ({
  id: 'test-account-id',
  name: 'Test Account',
  balance: 1000.00,
  type: 'checking',
  ...overrides
});
```

**B. Add Test Data Cleanup:**
```typescript
// src/__tests__/unit/setup.ts
beforeEach(async () => {
  // Clean up test data
  await prisma.demoSession.deleteMany();
  await prisma.demoConversation.deleteMany();
  await prisma.user.deleteMany();
});

afterEach(async () => {
  // Verify cleanup
  const sessions = await prisma.demoSession.count();
  expect(sessions).toBe(0);
});
```

## 🎯 **Implementation Plan**

### **Phase 1: Reorganize Unit Tests**
1. ✅ Move unit tests to `src/__tests__/unit/`
2. ✅ Add unit test setup file
3. ✅ Update Jest configuration
4. ✅ Add test factories

### **Phase 2: Improve Integration Tests**
1. ✅ Organize integration tests by feature
2. ✅ Add proper setup and teardown
3. ✅ Add error handling tests
4. ✅ Add rate limiting tests

### **Phase 3: CI/CD Optimization**
1. ✅ Separate unit and integration test workflows
2. ✅ Add test reporting
3. ✅ Add coverage thresholds
4. ✅ Add test result artifacts

## 🚀 **Benefits of This Approach**

- ✅ **Fast CI/CD**: Unit tests run in < 30 seconds
- ✅ **Comprehensive Coverage**: Integration tests catch real issues
- ✅ **Cost Effective**: Only pay for API calls when needed
- ✅ **Maintainable**: Clear separation of concerns
- ✅ **Reliable**: No external dependencies blocking development
- ✅ **Scalable**: Easy to add new tests following patterns 