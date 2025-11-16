#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

// Determine project root first - look for package.json
let projectRoot = process.cwd();
if (__dirname.includes('/src/scripts')) {
  // Running from src/scripts/, project root is one level up (src/)
  projectRoot = path.join(__dirname, '..');
} else if (__dirname.includes('/scripts')) {
  // Running from scripts/, project root is one level up
  projectRoot = path.join(__dirname, '..');
}

// Verify project root by checking for package.json
if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  // Try parent directory
  const parentRoot = path.join(projectRoot, '..');
  if (fs.existsSync(path.join(parentRoot, 'package.json'))) {
    projectRoot = parentRoot;
  } else {
    // Fall back to current working directory
    projectRoot = process.cwd();
  }
}

// Resolve dist path - try multiple possible locations
// On Render, the dist folder should be at project root/dist after build
const possiblePaths = [
  path.join(projectRoot, 'dist'),            // Project root/dist (most common)
  path.join(projectRoot, 'src/dist'),        // Project root/src/dist (if build outputs there)
  path.join(__dirname, '../dist'),           // From src/scripts/ -> src/dist
  path.join(__dirname, '../../dist'),        // From root/scripts/ -> dist
  path.join(process.cwd(), 'dist'),          // From current working directory
  path.join(process.cwd(), 'src/dist'),      // From current working directory/src
  '/opt/render/project/src/dist',            // Explicit Render path
  '/opt/render/project/dist',                // Alternative Render path
];

let distPath = null;
for (const testPath of possiblePaths) {
  if (fs.existsSync(testPath) && fs.existsSync(path.join(testPath, 'services'))) {
    distPath = testPath;
    break;
  }
}

if (!distPath) {
  console.error(`❌ Error: Could not find dist folder. Tried:`);
  possiblePaths.forEach(p => {
    const exists = fs.existsSync(p);
    console.error(`   - ${p} ${exists ? '(exists but no services folder)' : '(not found)'}`);
  });
  console.error(`   Script location: ${__dirname}`);
  console.error(`   Working directory: ${process.cwd()}`);
  
  // Try to list what's actually in the parent directories for debugging
  try {
    const parentDir = path.dirname(__dirname);
    console.error(`   Contents of ${parentDir}:`, fs.readdirSync(parentDir).join(', '));
    if (fs.existsSync(path.join(parentDir, '..'))) {
      const grandParentDir = path.join(parentDir, '..');
      console.error(`   Contents of ${grandParentDir}:`, fs.readdirSync(grandParentDir).join(', '));
    }
  } catch (e) {
    console.error(`   Could not list directory contents:`, e.message);
  }
  
  console.error(`   Attempting to build...`);
  
  // Verify project root has package.json before building
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    console.error(`   ❌ package.json not found at ${packageJsonPath}`);
    console.error(`   Cannot build - project root is incorrect`);
    process.exit(1);
  }
  
  console.log(`   Project root determined as: ${projectRoot}`);
  console.log(`   Verified package.json exists at: ${packageJsonPath}`);
  console.log(`   Running: npm run build from ${projectRoot}`);
  
  const { execSync } = require('child_process');
  try {
    // Use build:render which has memory limits set, or build:backend if dependencies are already installed
    // First check if node_modules exists and Prisma client is generated
    const nodeModulesExists = fs.existsSync(path.join(projectRoot, 'node_modules'));
    const prismaClientExists = fs.existsSync(path.join(projectRoot, 'node_modules/@prisma/client'));
    
    let buildCommand = 'npm run build';
    if (nodeModulesExists && prismaClientExists) {
      // Dependencies are installed, use build:backend which has memory limits and skips npm install
      buildCommand = 'npm run build:backend';
    } else {
      // Need to install dependencies, use build:render which has memory limits
      buildCommand = 'npm run build:render';
    }
    
    console.log(`   Using build command: ${buildCommand}`);
    
    // Set Node memory limit for TypeScript compilation
    const buildEnv = {
      ...process.env,
      NODE_OPTIONS: '--max-old-space-size=4096'
    };
    
    execSync(buildCommand, { 
      stdio: 'inherit',
      cwd: projectRoot,
      env: buildEnv
    });
    
    // Try to find dist again after build
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath) && fs.existsSync(path.join(testPath, 'services'))) {
        distPath = testPath;
        console.log(`✅ Found dist folder after build at: ${distPath}`);
        break;
      }
    }
    
    if (!distPath) {
      console.error(`❌ Still could not find dist folder after build`);
      process.exit(1);
    }
  } catch (buildError) {
    console.error(`❌ Build failed:`, buildError.message);
    process.exit(1);
  }
} else {
  console.log(`✅ Found dist folder at: ${distPath}`);
}

const { TransactionSyncService } = require(path.join(distPath, 'services/transaction-sync-service'));
const { SummaryCacheService } = require(path.join(distPath, 'services/summary-cache-service'));
require('dotenv').config({ path: '.env.local' });

async function refreshTransactions() {
  const startTime = Date.now();
  const startTimestamp = new Date().toISOString();
  console.log(`[${startTimestamp}] 🚀 Starting scheduled transaction sync...`);
  
  try {
    const result = await TransactionSyncService.syncAllActiveTokens();
    
    if (result.success) {
      const syncTimestamp = new Date().toISOString();
      console.log(`[${syncTimestamp}] ✅ Transaction sync completed successfully`);
      console.log(`[${syncTimestamp}] 📊 Total tokens: ${result.totalTokens}`);
      console.log(`[${syncTimestamp}] ✅ Successful: ${result.successful}`);
      console.log(`[${syncTimestamp}] ❌ Failed: ${result.failed}`);
      
      // Log summary statistics
      let totalAdded = 0;
      let totalModified = 0;
      let totalRemoved = 0;
      
      result.results.forEach((r) => {
        totalAdded += r.result.added;
        totalModified += r.result.modified;
        totalRemoved += r.result.removed;
      });
      
      console.log(`[${syncTimestamp}] 📈 Summary: ${totalAdded} added, ${totalModified} modified, ${totalRemoved} removed`);
      
      if (result.failed > 0) {
        console.log(`[${syncTimestamp}] ⚠️  Some tokens failed to sync:`);
        result.results
          .filter((r) => !r.result.success)
          .forEach((r) => {
            console.log(`[${syncTimestamp}]   - Token ${r.tokenId.substring(0, 8)}...: ${r.result.error}`);
          });
      }
    } else {
      const syncTimestamp = new Date().toISOString();
      console.log(`[${syncTimestamp}] ❌ Transaction sync completed with errors`);
      console.log(`[${syncTimestamp}] 📊 Total tokens: ${result.totalTokens}`);
      console.log(`[${syncTimestamp}] ✅ Successful: ${result.successful}`);
      console.log(`[${syncTimestamp}] ❌ Failed: ${result.failed}`);
    }
  } catch (error) {
    const errorTimestamp = new Date().toISOString();
    console.error(`[${errorTimestamp}] 💥 Unexpected error in transaction sync:`, error);
    process.exit(1);
  }
  
  // After transactions sync, refresh cached summaries for all users
  try {
    const summaryTimestamp = new Date().toISOString();
    console.log(`[${summaryTimestamp}] 🧮 Refreshing cached financial summaries for all users...`);
    const result = await SummaryCacheService.refreshAllUsers();
    const summaryEndTimestamp = new Date().toISOString();
    console.log(`[${summaryEndTimestamp}] ✅ Summary cache refresh completed. Users processed: ${result.usersProcessed}`);
  } catch (error) {
    const errorTimestamp = new Date().toISOString();
    console.error(`[${errorTimestamp}] ⚠️ Summary cache refresh failed:`, error);
    // Do not fail the entire cron; proceed
  }
  
  const endTime = Date.now();
  const endTimestamp = new Date().toISOString();
  const durationMs = endTime - startTime;
  const durationSeconds = Math.round(durationMs / 1000);
  const durationMinutes = Math.floor(durationSeconds / 60);
  const remainingSeconds = durationSeconds % 60;
  
  console.log(`[${endTimestamp}] 🏁 Transaction sync + summary refresh finished`);
  if (durationMinutes > 0) {
    console.log(`[${endTimestamp}] ⏱️  Total duration: ${durationMinutes}m ${remainingSeconds}s (${durationMs}ms)`);
  } else {
    console.log(`[${endTimestamp}] ⏱️  Total duration: ${durationSeconds}s (${durationMs}ms)`);
  }
  console.log(); // Empty line for readability
}

// If run directly, execute immediately
if (require.main === module) {
  console.log('🕐 Transaction Sync Cron Job');
  console.log('=============================\n');
  
  refreshTransactions().then(() => {
    console.log('🎉 Cron job completed');
    process.exit(0);
  }).catch((error) => {
    console.error('💀 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { refreshTransactions };

