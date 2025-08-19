# 🚨 Render Deployment Setup - PRODUCTION DATABASE SAFETY FIRST

## ⚠️ CRITICAL: This Document Was Previously Incorrect and Dangerous

**Previous Version**: Advocated automatic database migrations during deployment  
**Problem**: This caused your production database to be wiped multiple times  
**Solution**: Complete rewrite with safety-first approach  

## 🚨 PRODUCTION DATABASE WIPE PREVENTION

### **What Happened (Production Incident):**
- **Date**: August 17, 2025
- **Issue**: Production database was completely wiped during deployment
- **Root Cause**: `npx prisma migrate deploy` was running in `deploy-build.sh` script
- **Impact**: All production data lost

### **Why It Happened:**
The previous configuration was **EXTREMELY DANGEROUS** because:
1. **Build scripts ran during every deployment**
2. **Database migrations executed automatically**
3. **Destructive migrations wiped production data**
4. **No manual control over when migrations run**

## ✅ SAFE RENDER CONFIGURATION (CURRENT)

### **Your Current Safe Configuration:**
- **Build Command**: `$ npm run build:backend` ✅ SAFE
- **Pre-Deploy Command**: `$ npm run build:prisma` ✅ SAFE  
- **Start Command**: `$ npm run start` ✅ SAFE
- **Auto-Deploy**: `Off` ✅ SAFE (manual control)

### **Why This Configuration is Safe:**
- **`build:backend`**: Only compiles TypeScript, no database operations
- **`build:prisma`**: Only generates Prisma client, no migrations
- **`start`**: Only starts the application, no database changes
- **Manual deployment**: Full control over when deployments happen

## 🚫 NEVER DO THESE THINGS IN PRODUCTION

### **❌ Dangerous Commands (NEVER USE):**
```bash
# NEVER in build scripts:
npx prisma migrate deploy          # Can wipe data
npx prisma migrate reset           # Wipes entire database
npx prisma db push --force-reset  # Destructive schema changes
npx prisma db push                 # Can cause data loss
```

### **❌ Dangerous Scripts (NEVER USE):**
```bash
# NEVER in Render configuration:
$ npm run build                    # If it includes migrations
$ npm run build:render             # If it includes migrations
$ ./deploy-build.sh                # If it includes migrations
```

### **❌ Dangerous CI/CD (NEVER USE):**
```bash
# NEVER automate in production:
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
npm run build:backend              # Safe TypeScript compilation
npm run build:prisma               # Safe Prisma client generation
```

### **Step 2: Check Migrations (Optional)**
```bash
npm run migrate:status             # Check what needs to be applied
```

### **Step 3: Apply Migrations (Manual)**
```bash
npm run migrate:deploy             # Apply migrations manually
```

### **Step 4: Deploy**
```bash
# Deploy code without touching database
```

## 🚨 Emergency Response

### **If Database Gets Wiped Again:**

1. **IMMEDIATELY stop all deployments**
2. **Check Render configuration** - ensure no migrations in build
3. **Check deploy-build.sh** - ensure no migrate deploy commands
4. **Check package.json** - ensure no dangerous build scripts
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

- [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) - Development best practices
- [MIGRATION_DRIFT_PREVENTION.md](MIGRATION_DRIFT_PREVENTION.md) - Migration safety
- [PRODUCTION_DATABASE_SAFETY.md](../PRODUCTION_DATABASE_SAFETY.md) - Safety guide

---

**🚨 REMEMBER: Your production database contains real user financial data. Treat it with extreme caution! 🚨**

**Last Updated**: August 17, 2025  
**Next Review**: September 17, 2025
- Check Render service logs for webhook reception

### Build Command Issues
- Ensure `npm run build` script exists in package.json
- Check if build.sh has proper permissions
- Verify all dependencies are available

## Next Steps

1. **Update Render configuration** with new build command
2. **Add RENDER_DEPLOY_HOOK secret** to GitHub
3. **Test deployment** by pushing to main branch
4. **Verify migrations** are applied automatically
5. **Monitor deployment logs** for any issues
