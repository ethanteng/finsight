#!/bin/bash

echo "🚀 Testing like CI/CD environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to run test with specific environment
run_test() {
    local test_name="$1"
    local env_vars="$2"
    local expected_result="$3"
    
    echo -e "\n${YELLOW}🧪 Testing: $test_name${NC}"
    
    if eval "$env_vars npm run test:integration:ci"; then
        if [ "$expected_result" = "pass" ]; then
            echo -e "${GREEN}✅ $test_name: PASSED${NC}"
            return 0
        else
            echo -e "${RED}❌ $test_name: Expected to fail but passed${NC}"
            return 1
        fi
    else
        if [ "$expected_result" = "fail" ]; then
            echo -e "${GREEN}✅ $test_name: FAILED as expected${NC}"
            return 0
        else
            echo -e "${RED}❌ $test_name: FAILED unexpectedly${NC}"
            return 1
        fi
    fi
}

# Start PostgreSQL if not running
echo "📊 Ensuring PostgreSQL is available..."
if ! pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
    echo "Starting PostgreSQL..."
    # Assuming you have a local postgres setup
    brew services start postgresql || sudo service postgresql start || echo "Please start PostgreSQL manually"
    sleep 3
fi

# Test 1: Normal local environment (should pass)
run_test "Local Environment" "" "pass" || exit 1

# Test 2: CI environment variables (should pass)
run_test "CI Environment" "CI=true GITHUB_ACTIONS=true" "pass" || exit 1

# Test 3: Database fallback (should pass with mock)
run_test "Database Fallback" "DATABASE_URL=postgresql://invalid:invalid@localhost:9999/invalid CI=true" "pass" || exit 1

# Test 4: Run specific problematic tests
echo -e "\n${YELLOW}🎯 Running previously problematic tests...${NC}"
CI=true GITHUB_ACTIONS=true npm run test:integration:ci -- --testPathPattern="plaid-security|market-news" || exit 1

# Test 5: Profile Encryption Tests (need real database)
echo -e "\n${YELLOW}🔒 Running Profile Encryption Tests with real database...${NC}"
echo -e "${YELLOW}   - Profile Encryption Security (real DB)${NC}"
npm run test:security:ci -- --testPathPattern="profile-encryption-security" || exit 1

# Test 6: Security Tests (CRITICAL for CI/CD)
echo -e "\n${YELLOW}🔒 Running Security Tests...${NC}"
echo -e "${YELLOW}   - Complete Security Suite${NC}"
CI=true GITHUB_ACTIONS=true npm run test:complete-security || exit 1

echo -e "${YELLOW}   - Plaid Security Integration${NC}"
CI=true GITHUB_ACTIONS=true npm run test:integration:ci -- --testPathPattern="plaid-security" || exit 1

echo -e "\n${GREEN}🎉 All tests passed! Safe to push to CI/CD.${NC}"
