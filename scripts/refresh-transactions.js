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
const { HomeValueRefreshService } = require(path.join(distPath, 'services/home-value-refresh'));
const { FinancialRevisionService } = require(path.join(distPath, 'services/financial-revision-service'));
const { isUserActionRequiredPlaidError } = require(path.join(distPath, 'services/plaid-error-classification'));
const {
  acquireScheduledRefreshLease,
  completeScheduledRefreshLease,
  failScheduledRefreshLease,
} = require(path.join(distPath, 'market-news/refresh-lease'));
require('dotenv').config({ path: '.env.local' });

const FINANCIAL_REFRESH_JOB = 'financial-data-refresh';

/**
 * Name the connections stuck behind a re-link. These do not fail the run, so
 * without this line they would vanish from the output entirely and nobody would
 * know an account had gone stale.
 */
function logReauthConnections(result, timestamp) {
  const stuck = result.results.filter(
    (item) => !item.result.success && isUserActionRequiredPlaidError(item.result.errorCode)
  );
  if (stuck.length === 0) return;
  console.warn(
    `[${timestamp}] 🔑 ${stuck.length}/${result.totalTokens} connection(s) need the account holder to ` +
    `re-authenticate via Plaid Link update mode. Not failing the run -- these cannot clear on retry:`
  );
  stuck.forEach((item) => {
    console.warn(
      `[${timestamp}]   - Token ${item.tokenId.substring(0, 8)}... user ${String(item.userId || 'unknown').substring(0, 8)}...: ${item.result.errorCode}`
    );
  });
}

/**
 * Name the users whose snapshot was deliberately left alone this run. Retention
 * is a successful outcome, so these users are counted under Processed and the
 * run stays green -- which means without this line a frozen snapshot is
 * indistinguishable in the logs from a refreshed one. The same reasoning as
 * logReauthConnections above: a non-failing outcome still has to be visible.
 */
function logRetainedSnapshots(result, timestamp) {
  const retained = result.retainedUserIds || [];
  if (retained.length === 0) return;
  console.warn(
    `[${timestamp}] 🧊 ${retained.length}/${result.usersProcessed} user snapshot(s) were retained, not refreshed: ` +
    'a connected provider returned partial data and the prior revision is still within the retention window. ' +
    'These users see no new figures until the provider recovers or the window expires:'
  );
  retained.forEach((userId) => {
    console.warn(`[${timestamp}]   - User ${userId}`);
  });
}

const FINANCIAL_REFRESH_LEASE_MS = 6 * 60 * 60 * 1000;

async function refreshTransactions() {
  const startTime = Date.now();
  const startTimestamp = new Date().toISOString();
  console.log(`[${startTimestamp}] 🚀 Starting scheduled transaction sync...`);
  const lease = await acquireScheduledRefreshLease({
    name: FINANCIAL_REFRESH_JOB,
    minimumIntervalMs: 0,
    leaseDurationMs: FINANCIAL_REFRESH_LEASE_MS,
    force: true,
  });
  if (!lease.acquired) {
    console.log(`[${new Date().toISOString()}] ℹ️ Financial refresh skipped: ${lease.reason}`);
    return { skipped: true, reason: lease.reason };
  }

  const phaseErrors = [];
  let homeRefreshedUserIds = [];

  try {
    const result = await TransactionSyncService.syncAllActiveTokens();
    
    if (result.success) {
      const syncTimestamp = new Date().toISOString();
      // "success" here means no failure a retry could clear -- connections
      // waiting on their owner to re-link may still be counted under Failed.
      console.log(
        `[${syncTimestamp}] ✅ Transaction sync completed with no provider failures`
      );
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
            const suffix = isUserActionRequiredPlaidError(r.result.errorCode)
              ? ' (awaiting user re-authentication)'
              : '';
            console.log(`[${syncTimestamp}]   - Token ${r.tokenId.substring(0, 8)}...: ${r.result.error}${suffix}`);
          });
        logReauthConnections(result, syncTimestamp);
      }
    } else {
      const syncTimestamp = new Date().toISOString();
      console.log(`[${syncTimestamp}] ❌ Transaction sync completed with errors`);
      console.log(`[${syncTimestamp}] 📊 Total tokens: ${result.totalTokens}`);
      console.log(`[${syncTimestamp}] ✅ Successful: ${result.successful}`);
      console.log(`[${syncTimestamp}] ❌ Failed: ${result.failed}`);
      result.results
        .filter((item) => !item.result.success)
        .forEach((item) => {
          const suffix = isUserActionRequiredPlaidError(item.result.errorCode)
            ? ' (awaiting user re-authentication)'
            : '';
          console.error(`[${syncTimestamp}]   - Token ${item.tokenId.substring(0, 8)}...: ${item.result.error}${suffix}`);
        });
      logReauthConnections(result, syncTimestamp);
      // Only failures a retry could clear fail the run. A connection waiting on
      // its owner to re-link fails identically every night, and failing for it
      // would leave this job permanently red -- the same reasoning the home
      // value phase below applies to an address RentCast cannot value.
      if (result.providerFailures > 0) {
        phaseErrors.push(
          `Transaction sync failed for ${result.providerFailures}/${result.totalTokens} Plaid connection(s)`
        );
      }
    }

    // Refresh home values before the summary rebuild below, so a new estimate
    // lands in the same snapshot rather than waiting a day to show up. The
    // service skips manual overrides and anything valued within 25 days, so
    // this only reaches RentCast for estimates that have aged out.
    try {
      const homeTimestamp = new Date().toISOString();
      console.log(`[${homeTimestamp}] 🏠 Refreshing home values...`);
      const results = await new HomeValueRefreshService().refreshAllHomeValues();
      homeRefreshedUserIds = results.refreshedUserIds;
      const homeEndTimestamp = new Date().toISOString();
      const unvaluableAddresses = results.unvaluableAddresses || 0;
      const providerFailures = results.providerFailures || 0;
      console.log(`[${homeEndTimestamp}] ✅ Home value refresh completed. Users: ${results.successful}/${results.total}, unvaluable addresses: ${unvaluableAddresses}, provider failures: ${providerFailures}, values changed: ${homeRefreshedUserIds.length}`);
      if (results.errors.length > 0) {
        console.error(`[${homeEndTimestamp}] ⚠️ Home value refresh errors:`, results.errors);
      }

      // An address RentCast cannot value fails identically on every run. Failing
      // the cron for it would leave this job permanently red and stop the exit
      // code from meaning anything, so only report it.
      if (unvaluableAddresses > 0) {
        console.warn(`[${homeEndTimestamp}] ℹ️ ${unvaluableAddresses} address(es) have no RentCast valuation; leaving the prior value in place`);
      }
      // Only provider failures fail the phase. An all-unvaluable batch (including
      // the single-user case) must stay green — failing it recreates the permanent
      // red cron this change exists to eliminate. Malformed RentCast payloads are
      // classified as provider failures, so a real outage still goes red here.
      if (providerFailures > 0) {
        phaseErrors.push(`Home value refresh could not reach RentCast for ${providerFailures}/${results.total} eligible user(s)`);
      }
    } catch (error) {
      const errorTimestamp = new Date().toISOString();
      console.error(`[${errorTimestamp}] ⚠️ Home value refresh failed:`, error);
      phaseErrors.push(`Home value refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // After transactions sync, refresh cached summaries for all users.
    try {
      const summaryTimestamp = new Date().toISOString();
      console.log(`[${summaryTimestamp}] 🧮 Refreshing cached financial summaries for all users...`);
      const result = await SummaryCacheService.refreshAllUsers();
      const summaryEndTimestamp = new Date().toISOString();
      console.log(`[${summaryEndTimestamp}] ${result.success ? '✅' : '⚠️'} Summary cache refresh completed. Users processed: ${result.usersProcessed}, failed: ${result.usersFailed}, retained: ${result.usersRetained || 0}`);
      logRetainedSnapshots(result, summaryEndTimestamp);
      if (!result.success) {
        console.error(`[${summaryEndTimestamp}] ⚠️ Summary refresh errors:`, result.errors);
        phaseErrors.push(`Summary refresh failed for ${result.usersFailed} user(s)`);
      }

      // A newly discovered home-only user may not yet satisfy the SQL selection
      // used by refreshAllUsers, so explicitly recompute any refreshed user the
      // batch did not cover.
      const covered = new Set([
        ...(result.processedUserIds || []),
        ...(result.errors || []).map((item) => item.userId),
      ]);
      const missed = homeRefreshedUserIds.filter((userId) => !covered.has(userId));
      for (const userId of missed) {
        try {
          await FinancialRevisionService.recompute(userId, {
            categorize: false,
            history: { kind: 'material', reason: 'home-value-refreshed' },
          });
          console.log(`[${new Date().toISOString()}] ✅ Recomputed snapshot for home-only user ${userId}`);
        } catch (error) {
          console.error(`[${new Date().toISOString()}] ⚠️ Snapshot recompute failed for user ${userId}:`, error);
          phaseErrors.push(`Snapshot recompute failed for user ${userId}`);
        }
      }
    } catch (error) {
      const errorTimestamp = new Date().toISOString();
      console.error(`[${errorTimestamp}] ⚠️ Summary cache refresh failed:`, error);
      phaseErrors.push(`Summary refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (phaseErrors.length > 0) {
      throw new Error(phaseErrors.join(' | '));
    }

    await completeScheduledRefreshLease(FINANCIAL_REFRESH_JOB, lease.ownerId);

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
    return { skipped: false };
  } catch (error) {
    await failScheduledRefreshLease(FINANCIAL_REFRESH_JOB, lease.ownerId, error).catch((leaseError) => {
      console.error('Failed to record financial refresh failure:', leaseError);
    });
    throw error;
  }
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
