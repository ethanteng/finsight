# 🚀 Development Workflow Guide

## Overview

This document outlines the development workflow for the Finsight project, including best practices for feature development, testing, and deployment to prevent common issues like schema drift.

## 🏗️ Development Setup

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Git
- Prisma CLI

### Initial Setup
```bash
# Clone repository
git clone https://github.com/ethanteng/finsight.git
cd finsight

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database URL and API keys

# Generate Prisma client
npx prisma generate
```

## 🔄 Feature Development Workflow

### 1. Start New Feature
```bash
# Ensure you're on clean main branch
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/your-feature-name

# Sync with production schema (CRITICAL!)
npx prisma db pull
npx prisma generate
```

### 2. Database Schema Changes

#### ✅ Correct Approach:
```bash
# 1. Edit schema.prisma
# 2. Create migration
npx prisma migrate dev --name descriptive_migration_name

# 3. Test migration locally
npx prisma migrate reset
npx prisma migrate deploy

# 4. Commit everything
git add prisma/
git commit -m "feat: add UserProfile model with proper migrations"
```

#### ❌ Never Do This:
```bash
# DON'T: Use db push in production
npx prisma db push

# DON'T: Modify database directly
# DON'T: Skip migration files
# DON'T: Forget to commit migration files
```

### ⚠️ CRITICAL: Migration Order & Deployment Sequence

**This is the #1 cause of production schema drift and deployment failures.**

#### 🚨 The Golden Rule: Schema First, Code Second

**❌ WRONG ORDER (Causes Schema Drift):**
```bash
# 1. Deploy code that expects new schema
git push origin main  # Code deployed with new expectations

# 2. Database still has old schema
# 3. Code fails with "Column 'xyz' does not exist"
# 4. Emergency manual intervention required
```

**✅ CORRECT ORDER (Prevents Schema Drift):**
```bash
# 1. Create and test migration locally
npx prisma migrate dev --name add_new_columns
npx prisma migrate reset  # Test full migration cycle
npx prisma migrate deploy  # Verify deployment works

# 2. Commit migration files WITH code changes
git add prisma/migrations/
git add src/
git commit -m "feat: add new columns + migration"
git push origin main

# 3. CI/CD handles the rest
# - Code deployment happens
# - npx prisma migrate deploy runs automatically
# - Database schema updated
# - Everything works!
```

#### 🔍 Migration Validation Checklist

**Before ANY deployment, verify:**

```bash
# 1. Check migration status
npx prisma migrate status
# Should show: "Database schema is up to date"

# 2. Preview what will happen in production
npx prisma migrate deploy --preview-feature
# Should show: "No pending migrations to apply"

# 3. Verify schema matches locally
npx prisma db pull
npx prisma generate
# Should show: "No changes detected"

# 4. Test migration locally
npx prisma migrate reset
npx prisma migrate deploy
# Should complete without errors
```

#### 🚨 Common Schema Drift Scenarios

**Scenario 1: Deployed Code Before Migration**
```bash
# ❌ What happened to us:
1. Updated schema.prisma locally
2. Deployed code expecting new columns
3. Production database still had old schema
4. Result: "Column 'iv' does not exist" errors

# ✅ How to prevent:
1. ALWAYS test migrations locally first
2. NEVER deploy code before migration is ready
3. Commit migration files with code changes
```

**Scenario 2: Missing Migration Files**
```bash
# ❌ What causes this:
1. Used `npx prisma db push` instead of migrations
2. Forgot to commit migration files
3. Production database schema differs from local

# ✅ How to prevent:
1. ALWAYS use `npx prisma migrate dev`
2. ALWAYS commit migration files
3. NEVER use `db push` in production
```

**Scenario 3: Incomplete Migration Testing**
```bash
# ❌ What causes this:
1. Created migration but didn't test it
2. Assumed migration would work in production
3. Production migration fails

# ✅ How to prevent:
1. ALWAYS test full migration cycle locally
2. Use `npx prisma migrate reset` to test from scratch
3. Verify migration works before committing
```

#### 🛡️ Deployment Safety Measures

**Pre-Deployment Checklist:**
- [ ] **Migration created and tested locally** ✅
- [ ] **Migration files committed to git** ✅
- [ ] **Local migration reset/deploy tested** ✅
- [ ] **Schema status shows "up to date"** ✅
- [ ] **No pending migrations detected** ✅
- [ ] **All tests passing with new schema** ✅

**Emergency Recovery (If Schema Drift Occurs):**
```bash
# 1. Identify the drift
npx prisma migrate status
npx prisma db pull

# 2. Apply missing migrations
npx prisma migrate deploy

# 3. If manual intervention needed:
npx prisma db execute --stdin --schema=./prisma/schema.prisma
# Paste SQL commands manually

# 4. Regenerate client
npx prisma generate

# 5. Clear build cache and redeploy
```

### 3. Development Process
```bash
# Make your changes
# Write tests
npm run test:unit
npm run test:integration

# Commit frequently
git add .
git commit -m "feat: implement user profile functionality"

# Push to feature branch
git push origin feature/your-feature-name
```

### 4. Before Merging
```bash
# Test everything locally
npm run test:all
npm run build

# Check migration status
npx prisma migrate status

# Preview migrations
npx prisma migrate deploy --preview-feature
```

## 🎭 DEMO Mode Development - SEPARATE FROM CORE APP

### ⚠️ CRITICAL: DEMO Mode is Completely Separate

**DEMO mode should NEVER be mixed with core app development or debugging. When developing features, focus ONLY on the core application.**

#### ✅ Correct Development Approach:
```bash
# For core app development (production mode)
npm run dev:production

# Focus ONLY on:
# - Core app functionality
# - Production features
# - Real user workflows
# - Production data handling
# - Core app testing

# DO NOT:
# - Compare DEMO vs production behavior
# - "Fix" DEMO mode during core development
# - Mix DEMO and production logic
# - Update DEMO data structures
```

#### ❌ Never Do This During Core Development:
```bash
# DON'T: Try to "fix" DEMO mode while developing core features
# DON'T: Compare DEMO behavior with production behavior
# DON'T: Update DEMO data or components during core development
# DON'T: Mix DEMO and production debugging
# DON'T: Use DEMO mode to test production features
```

#### 🔄 DEMO Mode Development Workflow:
```bash
# 1. Complete core app development FIRST
# 2. Test core functionality thoroughly
# 3. Commit and merge core changes
# 4. ONLY THEN: Switch to DEMO mode development

# For DEMO mode development (separate task):
npm run dev:sandbox  # or appropriate DEMO mode command

# Focus ONLY on:
# - DEMO data structures
# - DEMO user experience
# - DEMO testing scenarios
# - DEMO mode specific features
```

#### 📋 Development Priority Order:
1. **Core App Development** (production mode)
   - Implement new features
   - Fix production bugs
   - Test core functionality
   - Deploy to production

2. **DEMO Mode Updates** (separate task)
   - Update DEMO data structures
   - Enhance DEMO user experience
   - Test DEMO scenarios
   - Deploy DEMO improvements

#### 🚫 Common Anti-Patterns to Avoid:
- **"Let me check if this works in DEMO mode too"** - NO! Focus on core app first
- **"I need to fix DEMO mode while I'm here"** - NO! Separate task
- **"Let me compare DEMO vs production behavior"** - NO! One at a time
- **"I'll update DEMO data while developing this feature"** - NO! Sequential development

#### 💡 Why This Separation Matters:
- **Prevents confusion** between DEMO and production logic
- **Faster development** by focusing on one thing at a time
- **Cleaner commits** with clear separation of concerns
- **Easier debugging** without cross-contamination
- **Better testing** of each mode independently

## 🗄️ Database Schema Management

### ⚠️ Critical: Preventing Schema Drift

Schema drift occurs when local and production database schemas become out of sync, causing deployment failures.

#### Common Causes:
1. **Direct database modifications** without migrations
2. **Using `prisma db push`** instead of proper migrations
3. **Incomplete git history** of schema changes
4. **Feature branch development** without proper schema sync
5. **Manual SQL modifications** to production database

#### Prevention Checklist:
- [ ] **Before feature development**: `npx prisma db pull`
- [ ] **Schema changes**: Always use `npx prisma migrate dev`
- [ ] **Test migrations**: `npx prisma migrate reset && npx prisma migrate deploy`
- [ ] **Commit migrations**: Always commit migration files to git
- [ ] **Before deployment**: `npx prisma migrate deploy --preview-feature`
- [ ] **Monitor deployments**: Check migration logs for failures

#### Schema Drift Recovery:
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

## 🧪 Testing Workflow

### Running Tests
```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# All tests
npm run test:all

# Coverage
npm run test:coverage:all
```

### Test Best Practices
- Write tests for new features
- Maintain 80% coverage threshold
- Test database operations with proper cleanup
- Mock external API calls
- Use realistic test data

## 🔒 CI/CD API Safety

### ⚠️ Critical: API Key Safety in CI/CD

**Problem**: CI/CD integration tests were previously using real API keys (`FRED_API_KEY_REAL`, `ALPHA_VANTAGE_API_KEY_REAL`) which could hit live API endpoints.

**Solution**: Updated GitHub Actions workflow and all providers to use test API keys for all test environments.

### 🛡️ Safety Measures in Place

#### 1. **Multiple Layers of Protection**
- GitHub Actions environment variables (test keys only)
- Provider-level API key validation
- Environment detection (`NODE_ENV === 'test'`)
- CI/CD detection (`process.env.GITHUB_ACTIONS`)
- Comprehensive Jest mocking for all external APIs
- Module-level safety checks

#### 2. **Environment Isolation**
- **Test environment**: Uses `test_*` keys
- **CI/CD environment**: Uses `test_*` keys  
- **Production environment**: Uses real keys (only on Render)
- **Development environment**: Uses real keys (only on localhost)

#### 3. **What This Prevents**
- ❌ Real FRED API calls in CI/CD
- ❌ Real Alpha Vantage API calls in CI/CD
- ❌ Real Search API calls in CI/CD
- ❌ Real Polygon.io API calls in CI/CD
- ❌ Real OpenAI API calls in CI/CD
- ❌ Real Plaid API calls in CI/CD
- ❌ Any accidental real API usage during testing

### 🔧 Implementation Details

#### GitHub Actions Workflow
```yaml
# SAFE: All tests use test API keys
FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
ALPHA_VANTAGE_API_KEY: ${{ secrets.ALPHA_VANTAGE_API_KEY }}
```

#### Provider-Level Safety Checks
```typescript
// Example: FRED Provider safety check
if (this.apiKey === 'test_fred_key' || 
    this.apiKey.startsWith('test_') || 
    process.env.GITHUB_ACTIONS) {
  // Return mock data, no real API calls
}
```

#### Comprehensive Mocking
```typescript
// Integration test setup mocks all external APIs
jest.mock('../../openai', () => ({
  askOpenAI: jest.fn().mockResolvedValue('Mocked AI response'),
  // ... other mocks
}));
```

### 📋 Verification Steps

To verify these changes work:

1. **Run tests locally**: `npm run test:unit && npm run test:integration`
2. **Check CI/CD logs**: Ensure no real API calls are made
3. **Verify mock data**: Confirm tests receive expected mock responses
4. **Monitor API usage**: Check that no real API endpoints are hit

### 🚀 Deployment Safety

These changes are safe to deploy immediately as they:
- Don't affect production functionality
- Only change test/CI behavior
- Maintain backward compatibility
- Improve security and reliability

## 🚀 Deployment Workflow

### Pre-Deployment Checklist
- [ ] All tests passing locally
- [ ] **Migration created and tested locally** ✅
- [ ] **Full migration cycle tested** (reset + deploy) ✅
- [ ] **Migration files committed to git** ✅
- [ ] **Schema status shows "up to date"** ✅
- [ ] **No pending migrations detected** ✅
- [ ] Migrations tested with `--preview-feature`
- [ ] Schema synced with production
- [ ] No breaking changes
- [ ] Environment variables configured

### Deployment Process
```bash
# Merge to main
git checkout main
git merge feature/your-feature-name
git push origin main

# CI/CD will automatically:
# 1. Run tests
# 2. Apply migrations (CRITICAL: This happens BEFORE code deployment)
# 3. Deploy to production
```

### ⚠️ CRITICAL: Deployment Order Matters

**The CI/CD pipeline follows this exact sequence:**
1. **Tests run** - Ensure code quality
2. **Migrations applied** - Update database schema FIRST
3. **Code deployed** - Deploy code that expects new schema

**This is why committing migration files is critical:**
- Migration files tell CI/CD what schema changes to apply
- Without migration files, CI/CD can't update the schema
- Code deployment fails because schema doesn't match expectations

## 🔧 Troubleshooting

### Common Issues

#### Migration Failures
```bash
# Check migration status
npx prisma migrate status

# Reset local database
npx prisma migrate reset

# Sync with production
npx prisma db pull
```

#### Schema Drift
```bash
# Identify differences
npx prisma db pull
npx prisma migrate status

# Create conditional migrations
# See Schema Drift Recovery section above
```

#### Test Failures
```bash
# Clear test cache
npm run test:unit -- --clearCache

# Check database connection
npx prisma db push --preview-feature

# Verify environment variables
echo $DATABASE_URL
```

## 📋 Development Checklist

### Before Starting Work
- [ ] Pull latest main branch
- [ ] Sync with production schema: `npx prisma db pull`
- [ ] Generate Prisma client: `npx prisma generate`
- [ ] Run tests to ensure clean state

### During Development
- [ ] Write tests for new features
- [ ] Use proper migrations for schema changes
- [ ] Commit frequently with descriptive messages
- [ ] Test migrations locally before pushing

### Before Merging
- [ ] All tests passing
- [ ] Migrations tested with preview
- [ ] No schema drift
- [ ] Code reviewed
- [ ] Documentation updated

### After Deployment
- [ ] Monitor deployment logs
- [ ] Verify migrations applied successfully
- [ ] Test critical functionality
- [ ] Monitor for errors

## 🎯 Best Practices

### Code Quality
- Write clear, descriptive commit messages
- Use TypeScript for type safety
- Follow existing code patterns
- Document complex logic

### Database Management
- Always use migrations, never `db push`
- Test migrations locally before deploying
- Keep schema in sync between environments
- Monitor migration logs in production

### Testing
- Write tests for new features
- Maintain high test coverage
- Use realistic test data
- Mock external dependencies

### Git Workflow
- Use feature branches for new work
- Keep branches small and focused
- Review code before merging
- Squash commits when appropriate

## 📚 Additional Resources

- [Testing Documentation](./TESTING.md)
- [Prisma Documentation](https://www.prisma.io/docs)
- [GitHub Actions Workflow](../.github/workflows/ci.yml)
- [Environment Variables](../.env.example)

This workflow ensures consistent, reliable development and deployment while preventing common issues like schema drift. 

## 🚨 **Schema Drift Prevention - Real Example**

### **The Profile Encryption Incident (August 2025)**

**What Happened:**
We experienced a critical schema drift issue when implementing profile encryption at rest. Here's the exact sequence that caused the problem:

#### **❌ The Wrong Sequence (What We Did)**

```bash
# 1. Updated schema.prisma locally
# Added: iv, tag, keyVersion, algorithm columns to encrypted_profile_data

# 2. Created migration file
npx prisma migrate dev --name add_encryption_columns_to_profile_data

# 3. ❌ DEPLOYED CODE BEFORE MIGRATION
git push origin main  # Code deployed expecting new columns

# 4. ❌ Production database still had old schema
# - Code expected: iv, tag, keyVersion, algorithm columns
# - Database had: Only encryptedData column
# - Result: "Column 'iv' does not exist" errors
```

#### **✅ The Correct Sequence (What We Should Have Done)**

```bash
# 1. Updated schema.prisma locally
# Added: iv, tag, keyVersion, algorithm columns

# 2. Created migration file
npx prisma migrate dev --name add_encryption_columns_to_profile_data

# 3. ✅ TESTED MIGRATION LOCALLY FIRST
npx prisma migrate reset  # Test from scratch
npx prisma migrate deploy  # Verify it works

# 4. ✅ COMMITTED MIGRATION FILES WITH CODE
git add prisma/migrations/
git add src/
git commit -m "feat: add encryption columns + migration"
git push origin main

# 5. ✅ CI/CD would have handled migration automatically
# - Code deployment
# - npx prisma migrate deploy
# - Database schema updated
# - Everything works!
```

#### **🚨 The Emergency Recovery (What We Had to Do)**

```bash
# 1. Identified the drift
npx prisma migrate status  # Showed pending migration
npx prisma db pull  # Showed missing columns

# 2. Manual SQL execution in production
npx prisma db execute --stdin --schema=./prisma/schema.prisma
# Pasted ALTER TABLE statements manually

# 3. Regenerated Prisma client
npx prisma generate

# 4. Cleared build cache and redeployed
```

#### **💡 Key Lessons Learned**

1. **Migration Order is Critical**: Schema must be updated before code deployment
2. **Local Testing is Mandatory**: Never assume migrations will work in production
3. **Commit Everything Together**: Migration files must be committed with code changes
4. **CI/CD Integration**: Let the deployment pipeline handle production migrations

#### **🛡️ Prevention Checklist for Future**

- [ ] **Migration created and tested locally** ✅
- [ ] **Full migration cycle tested** (reset + deploy) ✅
- [ ] **Migration files committed to git** ✅
- [ ] **Schema status verified** ✅
- [ ] **No pending migrations detected** ✅
- [ ] **All tests passing with new schema** ✅
- [ ] **Migration and code deployed together** ✅

**Remember**: Schema drift is expensive to fix and can cause production outages. Always follow the correct sequence: **Schema First, Code Second**. 