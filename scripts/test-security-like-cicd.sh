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

# Test 1 & 2: the two security commands ci-cd.yml runs. test:real-security covers
# plaid / privacy / profile-encryption / snaptrade against the real Plaid client;
# test:security covers the comprehensive and complete security suites.
run_security_test "Real security suites" "npm run test:real-security" "CI=true GITHUB_ACTIONS=true" || exit 1

run_security_test "Core security suites" "npm run test:security" "CI=true GITHUB_ACTIONS=true" || exit 1

# The plaid-security and privacy-security integration patterns used to be re-run
# here. ci-cd.yml's security-tests job runs only the two commands above; those two
# patterns belong to the integration-tests job and are already covered there, so
# invoking them again made this script diverge from the workflow it simulates and
# re-introduced the duplicate execution the audit removed.

# Test 3: An unreachable database must FAIL in CI mode. This block used to assert
# that the security suite stayed green against a broken database by falling back
# to an in-memory mock — the behaviour that made these tests unable to fail.
#
# Both URLs are overridden — see the equivalent note in test-like-cicd.sh. Without
# the TEST_DATABASE_URL override this probe only exercised security-test-setup.ts's
# own bare `new PrismaClient()` (Prisma reads DATABASE_URL, never TEST_DATABASE_URL).
# The guard it actually names lives in test-database-ci.ts, which prefers
# TEST_DATABASE_URL and so kept reaching the real database.
echo -e "\n${YELLOW}🔒 Verifying an unreachable database is fatal...${NC}"
if CI=true GITHUB_ACTIONS=true \
   DATABASE_URL=postgresql://invalid:invalid@localhost:9999/invalid \
   TEST_DATABASE_URL=postgresql://invalid:invalid@localhost:9999/invalid \
   npm run test:security >/dev/null 2>&1; then
    echo -e "${RED}❌ Security suite passed against an unreachable database — the mock fallback is back${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Unreachable database correctly fails the run${NC}"

echo -e "\n${GREEN}🔒 All Security Tests Passed! Safe to push to CI/CD.${NC}"
echo -e "${BLUE}💡 Security validation includes:${NC}"
echo -e "${BLUE}   - Profile encryption/decryption${NC}"
echo -e "${BLUE}   - User data isolation${NC}"
echo -e "${BLUE}   - Authentication/authorization${NC}"
echo -e "${BLUE}   - Privacy protection${NC}"
echo -e "${BLUE}   - Cross-user data access prevention${NC}"
