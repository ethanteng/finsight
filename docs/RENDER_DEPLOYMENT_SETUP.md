# Render Deployment Setup for CI/CD Pipeline

## Overview

This document explains how to configure Render to work seamlessly with your GitHub Actions CI/CD pipeline, ensuring that database migrations are applied automatically during deployment.

## Current Issue

Your Render service is currently configured with:
- **Build Command**: `$ npm install` (only installs dependencies)
- **Pre-Deploy Command**: Empty (missing migrations)
- **Start Command**: `$ npm run start`

This means **database migrations are never applied** during deployment, causing migration drift.

## Solution: CI/CD Controlled Deployment

### Option 1: Render Webhook (Recommended)

1. **Get your Render Deploy Hook**:
   - Go to your Render service dashboard
   - Navigate to Settings → Deploy Hook
   - Copy the deploy hook URL

2. **Add to GitHub Secrets**:
   - Go to your GitHub repository → Settings → Secrets and variables → Actions
   - Add new secret: `RENDER_DEPLOY_HOOK`
   - Value: Your Render deploy hook URL

3. **Update Render Configuration**:
   - **Build Command**: `$ npm run build` (this runs your build.sh script)
   - **Pre-Deploy Command**: Leave empty (CI/CD handles this)
   - **Start Command**: `$ npm run start`

### Option 2: Render CLI (Alternative)

If you prefer direct CLI control:

1. **Get Render API Key**:
   - Go to Render dashboard → Account → API Keys
   - Create new API key

2. **Get Service ID**:
   - From your service URL or dashboard

3. **Add to GitHub Secrets**:
   - `RENDER_API_KEY`: Your Render API key
   - `RENDER_SERVICE_ID`: Your service ID

4. **Uncomment the CLI deployment code** in your CI/CD workflow

## Updated Render Configuration

### Build Command
```
$ npm run build
```

This will run your `scripts/build.sh` which includes:
- Installing dependencies
- Generating Prisma client
- **Running database migrations** ← This is key!
- Building TypeScript

### Pre-Deploy Command
Leave empty (CI/CD handles migrations)

### Start Command
```
$ npm run start
```

## How It Works Now

1. **GitHub Actions** runs tests and builds
2. **On main branch push**, triggers deployment
3. **Vercel deployment** happens first
4. **Render deployment** is triggered via webhook
5. **Render runs** `npm run build` which includes migrations
6. **Database schema** is updated automatically
7. **App starts** with new schema

## Benefits

- ✅ **Full CI/CD control** over both Vercel and Render
- ✅ **Automatic migrations** during deployment
- ✅ **No more migration drift**
- ✅ **Consistent deployment process**
- ✅ **Better error handling** and rollback capabilities

## Troubleshooting

### Migration Still Fails
- Check Render build logs for migration errors
- Ensure `DATABASE_URL` environment variable is set in Render
- Verify Prisma client is generated correctly

### Deployment Hook Not Working
- Check if the webhook URL is correct
- Verify the secret is properly set in GitHub
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
