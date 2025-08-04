# 🔧 Utility Scripts

This folder contains utility scripts for development, testing, and deployment.

## 🧪 **Testing Scripts**

### **test-*.js/ts files**
- `test-auth-flow.js` - Authentication flow testing
- `test-plaid-flow.js` - Plaid integration testing
- `test-brave-search.ts` - Brave Search API testing
- `test-deduplication.js` - Data deduplication testing
- `test.ts` - Quick test script

## 🗄️ **Database Scripts**

### **Database Management**
- `check-db.js` - Database connection and health checks
- `clear-conversations.js` - Clear demo conversations
- `clear-user-data.js` - Clear user data and accounts
- `investigate-users.js` - User data investigation
- `fix-access-token.js` - Fix access token issues

## 🔍 **Debug Scripts**

### **Debugging Tools**
- `debug-login.js` - Login debugging and testing

## 🚀 **Deployment Scripts**

### **Build and Deploy**
- `build.sh` - Build the application
- `deploy-build.sh` - Deploy build to production
- `verify-deploy.sh` - Verify deployment status

## 🧹 **Cleanup Scripts**

### **Environment Cleanup**
- `clear-localhost.sh` - Clear localhost environment
- `quick-clear.sh` - Quick cleanup script

## 📖 **Usage**

### **Running Scripts**
```bash
# Database operations
node scripts/check-db.js
DATABASE_URL="external-db-url" node scripts/clear-user-data.js

# Testing
node scripts/test-auth-flow.js
node scripts/test-plaid-flow.js

# Deployment
./scripts/build.sh
./scripts/deploy-build.sh

# Cleanup
./scripts/clear-localhost.sh
./scripts/quick-clear.sh
```

### **Script Categories**

- **Testing**: Use for development and debugging
- **Database**: Use for data management and cleanup
- **Deployment**: Use for production deployment
- **Cleanup**: Use for environment maintenance

## ⚠️ **Important Notes**

- **Production Scripts**: Be careful with deployment scripts in production
- **Database Scripts**: Some scripts modify database data - use with caution
- **Cleanup Scripts**: May delete data - verify before running
- **Testing Scripts**: Safe to run for development and debugging

## 🔄 **Maintenance**

- Keep scripts updated with code changes
- Test scripts before using in production
- Document any script dependencies
- Maintain script permissions and shebangs 