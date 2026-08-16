# Testing Environment Variables Guide

## Setting CI/CD Environment Variables

### Option 1: The Script Sets Them Automatically ✅

The `test:like-cicd` script automatically sets `CI=true` and `GITHUB_ACTIONS=true`:

```bash
npm run test:like-cicd
```

This script runs multiple test scenarios with the appropriate environment variables set.

### Option 2: Set Them Manually

#### For a Single Command:
```bash
CI=true GITHUB_ACTIONS=true npm run test:integration:ci
```

#### Export for Current Shell Session:
```bash
export CI=true
export GITHUB_ACTIONS=true
npm run test:integration:ci
```

#### In package.json Scripts:
Already configured in `package.json`:
```json
"test:security:like-cicd:script": "./scripts/test-security-like-cicd.sh"
```

### Option 3: Use a .env File (Not Recommended)

You can create a `.env.test.ci` file, but this is not recommended as it can cause confusion.

## Important Notes

### Network Tests Behavior

**Local Development:**
- Network tests are **automatically skipped** locally, even if `CI=true` is set
- This prevents EPERM errors on macOS (permission issues with binding to 0.0.0.0)
- Tests will show: `⏭️ Skipping network test locally - will run in CI/CD`

**Actual CI/CD (GitHub Actions):**
- Network tests **will run** because we detect the actual GitHub Actions environment
- Detection uses `GITHUB_RUN_ID` which is only set in real GitHub Actions runners

### Environment Detection Logic

The code checks if we're **actually** in GitHub Actions, not just if variables are set:

```typescript
const isActuallyInGitHubActions = 
  process.env.GITHUB_ACTIONS === 'true' && 
  process.env.GITHUB_RUN_ID !== undefined;
```

This means:
- ✅ Setting `CI=true` locally → Network tests still skipped (avoids EPERM errors)
- ✅ Running in GitHub Actions → Network tests run normally
- ✅ Local tests without CI variables → Network tests skipped

## Available Test Commands

### Local Development (Network Tests Skipped)
```bash
npm run test:security              # Security tests (network tests skipped locally)
npm run test:integration           # Integration tests
npm run test:unit                  # Unit tests
```

### CI/CD Simulation (Network Tests Still Skipped Locally)
```bash
npm run test:like-cicd            # Full CI/CD simulation
npm run test:security:like-cicd:script  # Security tests with CI variables
```

### Actual CI/CD (GitHub Actions)
- Network tests will run automatically
- All environment variables are set by GitHub Actions
- No manual configuration needed

## Troubleshooting

### Why are network tests skipped even with CI=true?

This is intentional! Even if you set `CI=true` locally, you're still on macOS which has permission restrictions. The tests detect the actual GitHub Actions environment using `GITHUB_RUN_ID`, which is only present in real CI/CD runners.

### How to force network tests to run locally?

**Not recommended**, but if you really need to:
1. Grant your terminal/Node.js special network permissions on macOS
2. Or modify the detection logic (not recommended as it defeats the purpose)

### Why do I see EPERM errors?

This happens when network tests try to bind to `0.0.0.0` on macOS without proper permissions. The fix skips these tests locally, which is the correct behavior.

## Summary

- **Local**: Network tests automatically skipped (even with CI=true)
- **CI/CD**: Network tests run normally
- **Manual CI=true**: Still skips network tests (avoids EPERM errors)
- **Actual GitHub Actions**: Network tests run (detected via GITHUB_RUN_ID)
