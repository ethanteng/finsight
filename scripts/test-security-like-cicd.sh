#!/bin/bash

echo "🔒 Testing Security like CI/CD environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to run security test with specific environment
run_security_test() {
    local test_name="$1"
    local command="$2"
    local env_vars="$3"
    
    echo -e "\n${BLUE}🔒 Testing: $test_name${NC}"
    
    if eval "$env_vars $command"; then
        echo -e "${GREEN}✅ $test_name: PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ $test_name: FAILED${NC}"
        return 1
    fi
}

# Start PostgreSQL if not running
echo "📊 Ensuring PostgreSQL is available..."
if ! pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
    echo "Starting PostgreSQL..."
    brew services start postgresql || sudo service postgresql start || echo "Please start PostgreSQL manually"
    sleep 3
fi

# Test 1: Profile Encryption Security (CRITICAL)
run_security_test "Profile Encryption Security" "npm run test:profile-encryption" "CI=true GITHUB_ACTIONS=true" || exit 1

# Test 2: Complete Security Suite
run_security_test "Complete Security Suite" "npm run test:complete-security" "CI=true GITHUB_ACTIONS=true" || exit 1

# Test 3: Plaid Security Integration
run_security_test "Plaid Security Integration" "npm run test:integration:ci -- --testPathPattern=plaid-security" "CI=true GITHUB_ACTIONS=true" || exit 1

# Test 4: Privacy Security Integration
run_security_test "Privacy Security Integration" "npm run test:integration:ci -- --testPathPattern=privacy-security" "CI=true GITHUB_ACTIONS=true" || exit 1

# Test 5: Security with CI environment variables
echo -e "\n${YELLOW}🔒 Testing Security with CI Environment Variables...${NC}"
CI=true GITHUB_ACTIONS=true npm run test:security:ci || exit 1

# Test 6: Security with broken database (fallback testing)
echo -e "\n${YELLOW}🔒 Testing Security with Database Fallback...${NC}"
CI=true GITHUB_ACTIONS=true DATABASE_URL=postgresql://invalid:invalid@localhost:9999/invalid npm run test:security:ci || exit 1

echo -e "\n${GREEN}🔒 All Security Tests Passed! Safe to push to CI/CD.${NC}"
echo -e "${BLUE}💡 Security validation includes:${NC}"
echo -e "${BLUE}   - Profile encryption/decryption${NC}"
echo -e "${BLUE}   - User data isolation${NC}"
echo -e "${BLUE}   - Authentication/authorization${NC}"
echo -e "${BLUE}   - Privacy protection${NC}"
echo -e "${BLUE}   - Cross-user data access prevention${NC}"
