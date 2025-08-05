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