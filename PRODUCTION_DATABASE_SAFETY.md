# 🚨 PRODUCTION DATABASE SAFETY GUIDE

## ⚠️ CRITICAL: Your Production Database Was Wiped Multiple Times

**Date of Last Incident**: August 17, 2025  
**Root Cause**: Dangerous database migration commands running during deployment  
**Impact**: Complete loss of production data, user accounts, and financial information  

## 🔍 What Happened

### **Primary Cause**: `deploy-build.sh` Script
The `scripts/deploy-build.sh` script contained `npx prisma migrate deploy` which:
- Ran during every Render deployment
- Executed destructive database migrations automatically
- Wiped all production data without warning

### **Secondary Cause**: CI/CD Pipeline
- GitHub Actions triggered on every push to main
- Render deployment executed via webhook
- Build script ran migrations against production database

## 🛡️ Safety Measures Implemented

### **1. Removed Dangerous Commands**
- ✅ Removed `npx prisma migrate deploy` from `deploy-build.sh`
- ✅ Added production environment detection
- ✅ Added safety warnings and logging

### **2. Added Safety Checks**
```bash
# 🚨 PRODUCTION SAFETY CHECK
if [[ "$DATABASE_URL" == *"render.com"* ]] || [[ "$NODE_ENV" == "production" ]]; then
    echo "🚨 PRODUCTION ENVIRONMENT DETECTED!"
    echo "🚨 This script will NOT run database migrations in production!"
fi
```

### **3. Updated Scripts**
- ✅ `deploy-build.sh` - Safe build only, no migrations
- ✅ `package.json` - Safe build scripts
- ✅ CI/CD workflow - Only test database operations

## 🚫 NEVER DO THESE THINGS IN PRODUCTION

### **❌ Dangerous Commands**
```bash
# NEVER run these in production:
npx prisma migrate deploy          # Can wipe data
npx prisma migrate reset           # Wipes entire database
npx prisma db push --force-reset  # Destructive schema changes
npx prisma db push                 # Can cause data loss
```

### **❌ Dangerous Scripts**
```bash
# NEVER include these in build scripts:
npm run build                      # If it includes migrations
./scripts/deploy-build.sh          # If it includes migrations
npx prisma migrate deploy          # In any build script
```

### **❌ Dangerous CI/CD**
```bash
# NEVER run migrations automatically in production:
- Pre-deploy commands with migrations
- Build scripts with migrations
- Automatic migration deployment
```

## ✅ SAFE ALTERNATIVES

### **1. Manual Migration (Recommended)**
```bash
# Run migrations manually when needed:
npm run migrate:deploy             # Safe manual migration
npm run migrate:status             # Check migration status
```

### **2. CI/CD Controlled Migration**
```bash
# Only in controlled CI/CD pipeline:
- Test migrations locally first
- Use separate migration job
- Require manual approval
```

### **3. Safe Build Process**
```bash
# Build scripts should only:
npm install                        # Install dependencies
npx prisma generate               # Generate client
npx tsc                           # Compile TypeScript
# NO DATABASE OPERATIONS!
```

## 🔧 How to Deploy Safely

### **Step 1: Build (Safe)**
```bash
npm run build:render              # Safe build, no migrations
```

### **Step 2: Check Migrations (Optional)**
```bash
npm run migrate:status            # Check what needs to be applied
```

### **Step 3: Apply Migrations (Manual)**
```bash
npm run migrate:deploy            # Apply migrations manually
```

### **Step 4: Deploy**
```bash
# Deploy code without touching database
```

## 🚨 Emergency Response

### **If Database Gets Wiped Again:**

1. **IMMEDIATELY stop all deployments**
2. **Check Render configuration** - ensure no migrations in build
3. **Check package.json** - ensure no dangerous build scripts
4. **Check CI/CD workflow** - ensure no automatic migrations
5. **Restore from backup** if available
6. **Fix configuration** before any redeployment

### **Emergency Commands**
```bash
# Stop all processes
pkill -f "npm run dev"
pkill -f "ts-node"

# Check what's running
ps aux | grep -E "(npm|ts-node|prisma)"

# Check environment
echo "DATABASE_URL: $DATABASE_URL"
echo "NODE_ENV: $NODE_ENV"
```

## 📋 Safety Checklist

### **Before Every Deployment:**
- [ ] **No migrations in build scripts**
- [ ] **No migrations in pre-deploy commands**
- [ ] **No migrations in CI/CD automation**
- [ ] **Environment variables are safe**
- [ ] **Database URL is correct**

### **After Every Deployment:**
- [ ] **Database data is intact**
- [ ] **User accounts exist**
- [ ] **No error logs about migrations**
- [ ] **Application functions normally**

## 🔒 Security Best Practices

### **1. Environment Separation**
```bash
# Development
NODE_ENV=development
DATABASE_URL=localhost:5432/dev_db

# Production
NODE_ENV=production
DATABASE_URL=render.com/prod_db
```

### **2. Script Safety**
```bash
# Always check environment before database operations
if [[ "$NODE_ENV" == "production" ]]; then
    echo "🚨 PRODUCTION: Skipping dangerous operations"
    exit 0
fi
```

### **3. Manual Control**
```bash
# Never automate production database changes
# Always require manual intervention
# Always test in development first
```

## 📞 Emergency Contacts

- **Primary Developer**: Ethan Teng
- **Backup Access**: Check admin dashboard
- **Database Access**: Render dashboard
- **CI/CD Access**: GitHub Actions

## 📚 Related Documentation

- [DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md) - Development best practices
- [MIGRATION_DRIFT_PREVENTION.md](docs/MIGRATION_DRIFT_PREVENTION.md) - Migration safety
- [RENDER_DEPLOYMENT_SETUP.md](docs/RENDER_DEPLOYMENT_SETUP.md) - Deployment configuration

---

**🚨 REMEMBER: Your production database contains real user financial data. Treat it with extreme caution! 🚨**

**Last Updated**: August 17, 2025  
**Next Review**: September 17, 2025
