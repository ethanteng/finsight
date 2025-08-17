# 🛡️ Migration Drift Prevention Guide

## Overview

This guide explains how to prevent migration drift between your local development environment and production database. Migration drift occurs when local and production migration histories become out of sync, causing deployment failures.

## 🚨 Why Migration Drift Happens

### **1. Docker Container Issues**
- **Container restarts** can lose migration history
- **Volume corruption** in Docker volumes
- **Migration table** gets out of sync with actual schema
- **Local migrations** applied but history not persisted

### **2. Development Workflow Issues**
- **Feature branches** create migrations that never get committed
- **Production deployments** from different branches
- **Manual database changes** bypassing migrations
- **Incomplete git history** of schema changes

### **3. Environment Sync Issues**
- **Local development** continues without syncing production
- **Different migration states** between environments
- **Schema changes** deployed before migrations are ready

## 🛡️ Prevention Strategy

### **Before Starting ANY Development Work**

#### **Step 1: Run Pre-Development Checklist**
```bash
# This script does everything needed to prevent drift
./scripts/pre-dev-checklist.sh
```

**What it does:**
- ✅ Ensures you're on main branch
- ✅ Pulls latest changes
- ✅ Backs up migration history
- ✅ Syncs local with production
- ✅ Checks for any existing drift

#### **Step 2: Manual Verification (if needed)**
```bash
# Check migration counts
docker exec finsight-postgres psql -U postgres -d finsight -c "SELECT COUNT(*) FROM _prisma_migrations;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM _prisma_migrations;"

# Check for drift
npx prisma migrate status
```

### **During Development**

#### **✅ DO:**
- **Create migrations** for ALL schema changes: `npx prisma migrate dev --name descriptive_name`
- **Test migrations locally** before committing
- **Commit migration files** with code changes
- **Keep feature branches small** and focused

#### **❌ DON'T:**
- **Use `prisma db push`** in production
- **Skip migration files** when committing
- **Deploy code** before migrations are ready
- **Make manual database changes** in production

### **Before Deploying**

#### **Step 1: Verify Local State**
```bash
# Ensure all migrations are committed
git status

# Check migration status
npx prisma migrate status

# Verify no drift
npx prisma migrate deploy --preview-feature
```

#### **Step 2: Backup Migration History**
```bash
# Backup before any deployment
./scripts/backup-migration-history.sh
```

## 🔧 Prevention Scripts

### **1. Pre-Development Checklist**
```bash
./scripts/pre-dev-checklist.sh
```
**When to run:** Before starting ANY new development work
**What it does:** Complete setup and verification

### **2. Migration Backup**
```bash
./scripts/backup-migration-history.sh
```
**When to run:** Before deployments, after major changes
**What it does:** Backs up migration history from both databases

### **3. Migration Sync**
```bash
./scripts/sync-migrations.sh
```
**When to run:** When you suspect drift, before development
**What it does:** Syncs local schema with production

## 📋 Daily Development Workflow

### **Morning Routine**
```bash
# 1. Start your day
./scripts/pre-dev-checklist.sh

# 2. Create feature branch
git checkout -b feature/your-feature

# 3. Start development
```

### **During Development**
```bash
# Make changes to schema.prisma
# Create migration
npx prisma migrate dev --name descriptive_name

# Test locally
npm run test:all

# Commit everything together
git add prisma/ src/
git commit -m "feat: your feature with migration"
```

### **Before Pushing**
```bash
# 1. Verify no drift
npx prisma migrate status

# 2. Backup migration history
./scripts/backup-migration-history.sh

# 3. Push to feature branch
git push origin feature/your-feature
```

## 🚨 Emergency Recovery

### **If Drift is Detected**

#### **Step 1: Stop Development**
```bash
# Don't continue until drift is fixed
git stash  # Save your work
git checkout main
```

#### **Step 2: Analyze the Drift**
```bash
# Check what's different
./scripts/sync-migrations.sh

# Look at the differences
npx prisma migrate status
```

#### **Step 3: Fix the Drift**
```bash
# Option 1: Fix local to match production
npx prisma db pull
npx prisma generate

# Option 2: Fix production to match local (if safe)
# (This requires careful analysis)
```

#### **Step 4: Verify Fix**
```bash
# Check both databases
./scripts/pre-dev-checklist.sh
```

## 🔍 Monitoring & Detection

### **Automated Checks**
- **CI/CD pipeline** should catch migration mismatches
- **Pre-commit hooks** can verify migration files
- **Regular sync checks** during development

### **Manual Checks**
- **Before starting work:** Run pre-dev checklist
- **After major changes:** Check migration status
- **Before deployments:** Verify no drift

## 📚 Best Practices Summary

1. **Always run** `./scripts/pre-dev-checklist.sh` before development
2. **Never skip** migration files when committing
3. **Always test** migrations locally before deploying
4. **Backup migration history** before major changes
5. **Keep feature branches** small and focused
6. **Sync with production** regularly during development
7. **Verify no drift** before any deployment

## 🆘 When Things Go Wrong

### **Common Error Messages**
- `"Migration X not found in database"` → Drift detected
- `"Column X does not exist"` → Schema mismatch
- `"Migration history corrupted"` → Database issues

### **Immediate Actions**
1. **Stop development** immediately
2. **Backup current state** with scripts
3. **Analyze the drift** using sync script
4. **Fix the drift** before continuing
5. **Verify the fix** with pre-dev checklist

## 🎯 Success Metrics

- ✅ **Zero deployment failures** due to migration drift
- ✅ **Consistent migration counts** between environments
- ✅ **Clean migration history** in both databases
- ✅ **Successful CI/CD deployments** every time
- ✅ **No manual database fixes** needed in production

---

**Remember:** Prevention is always better than recovery. Run the pre-development checklist every time you start work, and you'll never have migration drift again!
