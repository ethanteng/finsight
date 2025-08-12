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
# 2. Apply migrations
# 3. Deploy to production
```

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