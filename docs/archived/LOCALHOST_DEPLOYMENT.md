# 🚀 Localhost Deployment Guide

## **Overview**

This guide explains how to manage localhost deployment for different branches and testing scenarios in the Ask Linc project. This is optimized for solo development but can be adapted for team environments.

## **Branch Management Strategy**

### **Current Branch Structure**
- **`main`**: Production-ready code
- **`feature/*`**: Experimental features (e.g., `feature/intelligent-user-profile`)

### **Environment Configuration**
- **`.env.local`**: Contains `ENABLE_USER_AUTH=true` for production-like testing
- **Feature branches**: Often need `ENABLE_USER_AUTH=false` for easier testing

## **Quick Reference Commands**

### **Feature Branch Development**
```bash
# Switch to feature branch
git checkout feature/intelligent-user-profile

# Test with auth disabled (recommended for experimental features)
ENABLE_USER_AUTH=false npm start

# Test with auth enabled (production-like testing)
ENABLE_USER_AUTH=true npm start
```

### **Main Branch Testing**
```bash
# Switch to main branch
git checkout main

# Stash any uncommitted changes
git stash

# Test production code
npm start  # Uses ENABLE_USER_AUTH=true from .env.local
```

### **Quick Branch Switching**
```bash
# Test feature branch
git checkout feature/intelligent-user-profile
ENABLE_USER_AUTH=false npm start

# Test main branch
git checkout main
npm start
```

## **Environment Variables**

### **ENABLE_USER_AUTH Configuration**

**Location**: `src/config/features.ts`
```typescript
export const getFeatures = (): FeatureFlags => ({
  USER_AUTH: process.env.ENABLE_USER_AUTH === 'true',
  // ...
});
```

**Behavior**:
- `ENABLE_USER_AUTH=true` (or unset): Authentication required for real users
- `ENABLE_USER_AUTH=false`: Authentication disabled, easier testing

### **Current Configuration**
- **`.env.local`**: `ENABLE_USER_AUTH=true`
- **Feature testing**: Override with `ENABLE_USER_AUTH=false npm start`

## **Testing Scenarios**

### **1. Feature Development Testing**
```bash
# On feature branch
git checkout feature/intelligent-user-profile

# Test with auth disabled
ENABLE_USER_AUTH=false npm start

# Test demo functionality
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -H "x-session-id: test-session-123" \
  -d '{"question": "I am 35 years old and work at Google...", "isDemo": true}'
```

### **2. Production-Like Testing**
```bash
# On main branch
git checkout main
git stash

# Test production settings
npm start

# Test production endpoints
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -H "x-session-id: test-session-123" \
  -d '{"question": "What should I do with my savings?", "isDemo": true}'
```

### **3. Authentication Testing**
```bash
# Test with auth enabled
ENABLE_USER_AUTH=true npm start

# Test authenticated endpoints (requires valid JWT tokens)
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer valid-jwt-token" \
  -d '{"question": "What should I do with my savings?", "isDemo": false}'
```

## **Workflow Examples**

### **Feature Development Workflow**
```bash
# 1. Start feature development
git checkout feature/intelligent-user-profile

# 2. Test with auth disabled
ENABLE_USER_AUTH=false npm start

# 3. Make changes and test
# ... edit code ...
npm run build
ENABLE_USER_AUTH=false npm start

# 4. Test with auth enabled (production-like)
ENABLE_USER_AUTH=true npm start

# 5. Commit changes
git add .
git commit -m "feat: add intelligent user profile system"
```

### **Production Testing Workflow**
```bash
# 1. Switch to main branch
git checkout main
git stash  # Save any uncommitted changes

# 2. Test production code
npm start

# 3. Test production endpoints
# ... test with production settings ...

# 4. Return to feature development
git checkout feature/intelligent-user-profile
git stash pop  # Restore uncommitted changes
```

## **Common Scenarios**

### **Scenario 1: Testing New Feature**
```bash
# You're developing the intelligent user profile feature
git checkout feature/intelligent-user-profile
ENABLE_USER_AUTH=false npm start

# Test profile extraction
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -H "x-session-id: test-session-123" \
  -d '{"question": "I am 35 years old and work as a software engineer at Google. I have a wife and two kids, ages 5 and 8. What should I do with my savings?", "isDemo": true}'
```

### **Scenario 2: Testing Production Bug**
```bash
# You need to test a production issue
git checkout main
git stash
npm start

# Test the specific issue
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -H "x-session-id: test-session-123" \
  -d '{"question": "What is the current mortgage rate?", "isDemo": true}'
```

### **Scenario 3: Comparing Feature vs Production**
```bash
# Test feature branch
git checkout feature/intelligent-user-profile
ENABLE_USER_AUTH=false npm start
# ... test feature ...

# Test main branch
git checkout main
npm start
# ... test production ...
```

## **Benefits of This Approach**

### **For Solo Development**
- **🎯 Focused Testing**: Test feature code without production interference
- **⚡ Fast Iteration**: No deployment delays, instant feedback
- **💰 Cost Effective**: No additional infrastructure needed
- **🔄 Easy Switching**: Quick branch switching for different test scenarios
- **🛡️ Safe Development**: Feature work doesn't affect production testing

### **When You'd Need Staging Environment**
- **Multiple developers** working on different features
- **Complex deployment scenarios** (Docker, Kubernetes, etc.)
- **Integration testing** with external services
- **Performance testing** with production-like load
- **Team collaboration** requiring shared testing environment

## **Troubleshooting**

### **Common Issues**

#### **1. Authentication Errors**
```bash
# Problem: Getting "Authentication required" errors
# Solution: Use ENABLE_USER_AUTH=false for feature testing
ENABLE_USER_AUTH=false npm start
```

#### **2. Branch Conflicts**
```bash
# Problem: Uncommitted changes preventing branch switch
# Solution: Stash changes
git stash
git checkout main
# ... test ...
git checkout feature/intelligent-user-profile
git stash pop
```

#### **3. Environment Variable Issues**
```bash
# Problem: Environment variables not taking effect
# Solution: Restart server after changing environment
ENABLE_USER_AUTH=false npm start
```

### **Debug Commands**
```bash
# Check current branch
git branch

# Check environment variables
echo $ENABLE_USER_AUTH

# Check server status
curl http://localhost:3000/health

# Check feature flags
curl http://localhost:3000/test/current-tier
```

## **Best Practices**

### **1. Always Use Feature Branches**
- Never develop directly on `main`
- Create feature branches for all experimental work
- Keep `main` stable and production-ready

### **2. Test Both Configurations**
- Test with `ENABLE_USER_AUTH=false` for easy development
- Test with `ENABLE_USER_AUTH=true` for production-like scenarios

### **3. Use Demo Mode for Testing**
- Demo mode works regardless of authentication settings
- Perfect for testing new features without authentication complexity

### **4. Regular Production Testing**
- Periodically test `main` branch to ensure stability
- Test production endpoints before deploying

### **5. Document Changes**
- Update this guide when adding new environment variables
- Document any new testing scenarios

## **Future Considerations**

### **When to Add Staging Environment**
- Team grows beyond 1-2 developers
- Complex deployment requirements
- Need for integration testing with external services
- Performance testing requirements

### **Scaling This Approach**
- Consider Docker containers for isolated testing
- Add automated testing scripts
- Implement CI/CD pipeline for automated testing
- Add monitoring and logging for better debugging

---

**Last Updated**: August 4, 2025  
**Maintained By**: Development Team  
**Version**: 1.0 