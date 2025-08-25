# Session Expiration Testing

## Overview

This document describes the testing approach for session expiration handling in the Ask Linc application. The tests ensure that expired or invalid JWT tokens are properly handled and users are redirected to login when their sessions expire.

## Test Coverage

### Unit Tests (`src/__tests__/unit/session-expiration.test.ts`)

The session expiration unit tests cover:

#### 1. Token Validation
- ✅ Valid token acceptance
- ✅ Expired token rejection
- ✅ Invalid token rejection
- ✅ Empty token rejection
- ✅ Null token rejection

#### 2. Authentication Logic
- ✅ Authentication header requirement for protected endpoints
- ✅ Token format validation before processing
- ✅ Valid token processing flow

#### 3. Error Response Logic
- ✅ "Authentication required" error for missing headers
- ✅ "Invalid or expired token" error for bad tokens

#### 4. Frontend Handling Logic
- ✅ 401 response detection and login redirect
- ✅ Token clearing on session expiration
- ✅ Normal flow for successful responses

## CI/CD Integration

### Automatic Test Execution

The session expiration tests are automatically run in the CI/CD pipeline:

1. **Unit Tests**: Run as part of `npm run test:unit` in the `backend-tests` job
2. **Coverage**: Included in unit test coverage reporting
3. **Failure Handling**: Test failures will block deployment

### CI/CD Pipeline Jobs

```yaml
# Backend Tests Job
backend-tests:
  runs-on: ubuntu-latest
  steps:
    - name: Run backend unit tests with coverage
      run: npm run test:coverage:unit
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
        JWT_SECRET: test-jwt-secret-for-security-tests
        # ... other test environment variables
```

### Test Environment

The tests run in a controlled test environment with:
- **Test Database**: Isolated PostgreSQL instance
- **Mocked External APIs**: No real API calls during testing
- **Test JWT Secret**: Consistent test environment
- **Clean State**: Fresh database for each test run

## Test Implementation Details

### Token Generation

```typescript
// Valid token for testing
validToken = generateToken({
  userId: 'test-user-123',
  email: 'test@example.com',
  tier: 'premium'
});

// Manually expired token
expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

### Authentication Logic Simulation

The tests simulate the actual authentication logic used in protected endpoints:

```typescript
// Simulate /ask/display-real endpoint logic
const authHeader = req.headers.authorization;
if (!authHeader) {
  return res.status(401).json({ error: 'Authentication required' });
}

const payload = verifyToken(token);
if (!payload) {
  return res.status(401).json({ error: 'Invalid or expired token' });
}
```

## Running Tests Locally

### Unit Tests Only
```bash
npm run test:unit -- --testPathPattern=session-expiration
```

### All Unit Tests
```bash
npm run test:unit
```

### With Coverage
```bash
npm run test:coverage:unit
```

## Test Results

### Expected Output
```
 PASS  src/__tests__/unit/session-expiration.test.ts
  Session Expiration Unit Tests
    Token Validation
      ✅ should validate a valid token
      ✅ should reject an expired token
      ✅ should reject an invalid token
      ✅ should reject an empty token
      ✅ should reject a null token
    Authentication Logic
      ✅ should require authentication header for protected endpoints
      ✅ should validate token format before processing
      ✅ should allow valid tokens to proceed
    Error Response Logic
      ✅ should return authentication required error for missing header
      ✅ should return invalid token error for bad tokens
    Frontend Handling Logic
      ✅ should detect 401 responses and redirect to login
      ✅ should allow 200 responses to proceed normally

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
```

## Integration with Production

### What Gets Tested

1. **Backend Token Validation**: JWT verification and expiration handling
2. **Error Response Generation**: Proper 401 status codes and error messages
3. **Authentication Flow**: Complete token validation pipeline

### What Gets Deployed

The tests verify that the production code includes:
- ✅ Proper token validation in `/ask/display-real` endpoint
- ✅ 401 responses for invalid/expired tokens
- ✅ Frontend 401 handling and login redirects

### Security Benefits

- **Prevents Incorrect Tier Information**: Users can't get "starter tier" responses when they're actually "premium"
- **Immediate Session Expiration**: Users are redirected to login as soon as their session expires
- **Clean User Experience**: Clear error messages and smooth redirects
- **No Data Leakage**: Expired sessions can't access protected endpoints

## Maintenance

### Adding New Tests

To add new session expiration test cases:

1. Add test to `src/__tests__/unit/session-expiration.test.ts`
2. Follow existing test patterns
3. Ensure test covers both positive and negative cases
4. Update this documentation if needed

### Updating Tests

When authentication logic changes:
1. Update test logic to match new implementation
2. Verify all test cases still pass
3. Add new test cases for new functionality
4. Update documentation

## Troubleshooting

### Common Test Failures

1. **JWT Secret Mismatch**: Ensure `JWT_SECRET` is set in test environment
2. **Database Connection Issues**: Check test database setup
3. **Token Generation Errors**: Verify `generateToken` function signature

### Debug Mode

Run tests with verbose output:
```bash
npm run test:unit -- --testPathPattern=session-expiration --verbose
```

## Related Documentation

- [Session Expiration Implementation](../features/SESSION_EXPIRATION_IMPLEMENTATION.md)
- [Authentication System](../security/AUTHENTICATION_SYSTEM.md)
- [Testing Strategy](../testing/TESTING.md)
- [CI/CD Pipeline](../ci-cd/CI_CD_PIPELINE.md)
