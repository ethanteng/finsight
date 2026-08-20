import './instrument';
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import cron from 'node-cron';
// Removed syncAllAccounts import - keeping transactions real-time only
import { PrismaClient } from '@prisma/client';
import { dataOrchestrator } from './data/orchestrator';
import authRoutes from './auth/routes';
import manualAccountsRoutes from './auth/manual-accounts-routes';
import accountsRoutes from './auth/accounts-routes';
import transactionCategoriesRoutes from './auth/transaction-categories-routes';
import financesRoutes from './auth/finances-routes';
import stripeRoutes from './routes/stripe';
import aiRoutes from './routes/ai';
import aiPerformanceRoutes from './routes/ai-performance';
import askRoutes from './routes/ask';
import { optionalAuth, requireAuth, adminAuth } from './auth/middleware';
import { assertJwtSecretConfigured } from './auth/utils';
import { UserTier } from './data/types';
import * as Sentry from '@sentry/node';


// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        tier: string;
      };
    }
  }
}

// Helper to safely get string from req.params/req.query (Express types can be string | string[])
function asString(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? '' : v ?? '';
}

// DEBUG: Log environment configuration
console.log('🔍 Environment Configuration:');
console.log('  NODE_ENV:', process.env.NODE_ENV);
console.log('  DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('  SNAPTRADE_MODE:', process.env.SNAPTRADE_MODE || 'sandbox');
console.log('  SNAPTRADE_CLIENT_ID:', process.env.SNAPTRADE_CLIENT_ID ? 'SET' : 'NOT SET');
console.log('  SNAPTRADE_CONSUMER_KEY:', process.env.SNAPTRADE_CONSUMER_KEY ? 'SET' : 'NOT SET');
console.log('  SNAPTRADE_CLIENT_ID_PROD:', process.env.SNAPTRADE_CLIENT_ID_PROD ? 'SET' : 'NOT SET');
console.log('  SNAPTRADE_CONSUMER_KEY_PROD:', process.env.SNAPTRADE_CONSUMER_KEY_PROD ? 'SET' : 'NOT SET');

// Now import Plaid after environment variables are loaded
import { setupPlaidRoutes } from './plaid';
import { getLatestFinancialSnapshot } from './services/financial-snapshot-persistence';

// Import SnapTrade configuration
import './snaptrade';
import { setupSnapTradeRoutes } from './auth/snaptrade-routes';

import { getPrismaClient } from './prisma-client';

const app: Application = express();

// CORS setup with explicit configuration for preflight requests
const allowedOrigins = [
  'https://asklinc.com',
  'https://www.asklinc.com',
  'http://localhost:3001'
];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS: Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-session-id'],
  exposedHeaders: ['Content-Length', 'X-AI-Response-Time', 'X-AI-Mode'],
  maxAge: 86400, // 24 hours - cache preflight responses
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// IMPORTANT: Register Stripe webhook route BEFORE JSON middleware
// This ensures raw body is available for signature verification
app.use('/api/stripe/webhooks', express.raw({ type: 'application/json' }), stripeRoutes);

// Global JSON middleware for all other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Root endpoint for basic connectivity test
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Finsight API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Health check endpoints (accessible without auth)
app.get('/health', (req: Request, res: Response) => {
  console.log('Health check requested:', {
    timestamp: new Date().toISOString(),
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });

  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Cron job health check endpoint
app.get('/health/cron', async (req: Request, res: Response) => {
  console.log('Cron health check requested:', {
    timestamp: new Date().toISOString(),
    userAgent: req.headers['user-agent']
  });

  // Check if cron jobs are running
  const cronJobs = cron.getTasks();
  const marketNewsJob = Array.from(cronJobs.values()).find((job: any) => job.name === 'market-news-refresh');
  const mailerLiteJob = Array.from(cronJobs.values()).find((job: any) => job.name === 'mailerlite-sync');

  let leaseMonitoringError: string | undefined;
  let leaseByName = new Map<string, {
    leaseUntil: Date;
    lastStartedAt: Date | null;
    lastCompletedAt: Date | null;
    lastError: string | null;
  }>();
  try {
    const leases = await getPrismaClient().scheduledJobLease.findMany({
      where: { name: { in: ['financial-data-refresh', 'balance-data-refresh', 'market-news-refresh'] } },
      select: {
        name: true,
        leaseUntil: true,
        lastStartedAt: true,
        lastCompletedAt: true,
        lastError: true,
      },
    });
    leaseByName = new Map(leases.map(lease => [lease.name, lease]));
  } catch (error) {
    leaseMonitoringError = error instanceof Error ? error.message : String(error);
    console.warn('Unable to read scheduled-job lease health:', error);
  }

  // A snapshot older than a full refresh cycle means the daily job ran without
  // moving that user's revision -- the retention guard in SummaryCacheService
  // returns the prior snapshot on partial provider data, and it does so as a
  // *success*, so lease status and exit code both stay green while the user
  // sees week-old figures. Counted here because nothing else surfaces it.
  //
  // Deliberately a count and not a list: this endpoint is unauthenticated.
  const STALE_SNAPSHOT_THRESHOLD_MS = 26 * 60 * 60 * 1000;
  let frozenSnapshotCount: number | null = null;
  let frozenSnapshotError: string | undefined;
  try {
    frozenSnapshotCount = await getPrismaClient().financialSummarySnapshot.count({
      where: { computedAt: { lt: new Date(Date.now() - STALE_SNAPSHOT_THRESHOLD_MS) } },
    });
  } catch (error) {
    frozenSnapshotError = error instanceof Error ? error.message : String(error);
    console.warn('Unable to count frozen financial snapshots:', error);
  }

  const now = new Date();
  const leaseStatus = (name: string) => {
    const lease = leaseByName.get(name);
    return {
      running: Boolean(lease && lease.leaseUntil > now),
      lastStartedAt: lease?.lastStartedAt ?? null,
      lastCompletedAt: lease?.lastCompletedAt ?? null,
      lastError: lease?.lastError ?? null,
    };
  };

  res.json({
    status: 'OK',
    cronJobs: {
      financialDataRefresh: {
        name: 'financial-data-refresh',
        execution: 'external',
        command: 'node scripts/refresh-transactions.js',
        ...leaseStatus('financial-data-refresh'),
        // Non-zero means the job completed but left that many snapshots
        // untouched. A green lease with a non-zero count here is the signature
        // of the retention guard holding users on a prior revision.
        frozenSnapshots: frozenSnapshotCount,
        frozenSnapshotThresholdHours: STALE_SNAPSHOT_THRESHOLD_MS / (60 * 60 * 1000),
        ...(frozenSnapshotError ? { frozenSnapshotError } : {}),
      },
      balanceDataRefresh: {
        name: 'balance-data-refresh',
        execution: 'external',
        command: 'node scripts/run-balance-refresh-cron.js',
        ...leaseStatus('balance-data-refresh'),
      },
      marketNewsRefresh: {
        name: 'market-news-refresh',
        execution: 'in-process',
        scheduled: !!marketNewsJob,
        ...leaseStatus('market-news-refresh'),
      },
      mailerLiteSync: {
        running: !!mailerLiteJob,
        name: 'mailerlite-sync',
        execution: 'in-process',
      }
    },
    ...(leaseMonitoringError && { leaseMonitoringError }),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});



// Apply optional auth middleware to all routes AFTER health endpoints
app.use(optionalAuth);

// Setup Plaid routes
try {
	console.log('🔧 Calling setupPlaidRoutes...');
setupPlaidRoutes(app);
console.log('✅ setupPlaidRoutes completed successfully');

console.log('🔧 Calling setupSnapTradeRoutes...');
setupSnapTradeRoutes(app);
console.log('✅ setupSnapTradeRoutes completed successfully');
	// Test-only: list registered routes to diagnose 404s
	if (process.env.NODE_ENV === 'test') {
		try {
			const router = (app as any)._router;
			console.log('Router present:', !!router);
			console.log('Router stack length:', router?.stack?.length);
			const routes = router?.stack
				?.filter((layer: any) => layer.route)
				?.map((layer: any) => ({ methods: Object.keys(layer.route.methods), path: layer.route.path }));
			console.log('🗺️ Registered routes:', routes);
			app.get('/__routes', (_req: Request, res: Response) => {
				res.json({ routes });
			});
		} catch (e) {
			console.log('Route introspection failed', e);
		}
	}
} catch (error) {
	console.error('❌ Error in setupPlaidRoutes:', error);
}

// Setup Auth routes
app.use('/auth', authRoutes);

// Setup Manual Accounts routes
app.use('/api/manual-accounts', manualAccountsRoutes);

// Setup Accounts routes (for Plaid and SnapTrade accounts)
app.use('/api/accounts', accountsRoutes);

// Setup user-chosen transaction category routes
app.use('/api/transaction-categories', transactionCategoriesRoutes);

// Setup the revisioned Finances overview and lazy account-detail routes
app.use('/api/finances', financesRoutes);

// Setup AI routes
app.use('/api/ai', aiRoutes);
app.use('/ai/performance', aiPerformanceRoutes);
app.use(askRoutes);

// Setup Stripe routes (webhook route already registered above)
app.use('/api/stripe', stripeRoutes);

// Get tier information and upgrade suggestions
app.get('/tier-info', async (req: Request, res: Response) => {
  try {
    // Require user authentication
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { DataSourceManager } = await import('./data/sources');
    const userTier = user.tier as any;

    const tierInfo = {
      currentTier: userTier,
      availableSources: DataSourceManager.getSourcesForTier(userTier).map(s => ({
        name: s.name,
        description: s.description,
        category: s.category
      })),
      unavailableSources: DataSourceManager.getUnavailableSourcesForTier(userTier).map(s => ({
        name: s.name,
        description: s.description,
        category: s.category,
        upgradeBenefit: s.upgradeBenefit,
        requiredTier: s.tiers[0]
      })),
      upgradeSuggestions: DataSourceManager.getUpgradeSuggestions(userTier),
      limitations: DataSourceManager.getTierLimitations(userTier),
      nextTier: DataSourceManager.getNextTier(userTier)
    };

    res.json(tierInfo);
  } catch (err) {
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in tier-info endpoint', 'error');
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});


// Test endpoint for market data (development only)
app.get('/test/market-data/:tier', async (req: Request, res: Response) => {
  try {
    const tier = asString(req.params.tier);
    const tierMap: Record<string, string> = {
      'starter': 'starter',
      'standard': 'standard',
      'premium': 'premium'
    };

    const backendTier = tierMap[tier] || 'starter';
    const marketContext = await dataOrchestrator.getMarketContext(backendTier as any);

    res.json({
      tier: backendTier,
      marketContext,
      cacheStats: await dataOrchestrator.getCacheStats()
    });
  } catch (err) {
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in test market data endpoint', 'error');
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// Get current user's tier information
app.get('/user/tier', async (req: Request, res: Response) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = req.user;

    res.json({
      tier: user.tier,
      message: `Current user tier: ${user.tier}`
    });
  } catch (err) {
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in user tier endpoint', 'error');
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// Test endpoint to check current tier setting
app.get('/test/current-tier', async (req: Request, res: Response) => {
  try {
    const testTier = process.env.TEST_USER_TIER;
    const tierMap: Record<string, string> = {
      'starter': 'starter',
      'standard': 'standard',
      'premium': 'premium'
    };

    const backendTier = testTier ? tierMap[testTier] || 'starter' : 'none (using request tier)';

    res.json({
      testTier: testTier || 'none',
      backendTier,
      message: testTier ? `Testing with ${testTier} tier` : 'Using tier from request'
    });
  } catch (err) {
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in test current tier endpoint', 'error');
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// Test endpoint to get cache statistics
// Test endpoint to check current tier setting
app.get('/test/current-tier', async (req: Request, res: Response) => {
  try {
    const testTier = process.env.TEST_USER_TIER;
    const tierMap: Record<string, string> = {
      'starter': 'starter',
      'standard': 'standard',
      'premium': 'premium'
    };

    const backendTier = testTier ? tierMap[testTier] || 'starter' : 'none (using request tier)';

    res.json({
      testTier: testTier || 'none',
      backendTier,
      message: testTier ? `Testing with ${testTier} tier` : 'Using tier from request'
    });
  } catch (err) {
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in test current tier endpoint', 'error');
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// Test endpoint to get cache statistics
app.get('/test/cache-stats', async (req: Request, res: Response) => {
  try {
    const cacheStats = await dataOrchestrator.getCacheStats();
    res.json(cacheStats);
  } catch (err) {
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in test cache stats endpoint', 'error');
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// Test endpoint to invalidate cache
app.post('/test/invalidate-cache', async (req: Request, res: Response) => {
  try {
    const { pattern } = req.body;
    await dataOrchestrator.invalidateCache(pattern || 'economic_indicators');
    res.json({ message: `Cache invalidated for pattern: ${pattern || 'economic_indicators'}` });
  } catch (err) {
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in test invalidate cache endpoint', 'error');
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// Test endpoint to check FRED API key
app.get('/test/fred-api-key', async (req: Request, res: Response) => {
  try {
    const fredApiKey = process.env.FRED_API_KEY;
    res.json({
      fredApiKey: fredApiKey ? `${fredApiKey.substring(0, 8)}...` : 'not set',
      fredApiKeyLength: fredApiKey ? fredApiKey.length : 0,
      isTestKey: fredApiKey === 'test_fred_key'
    });
  } catch (err) {
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in test FRED API key endpoint', 'error');
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// Test endpoint for enhanced market context
app.get('/test/enhanced-market-context', async (req: Request, res: Response) => {
  try {
    const { tier = 'starter' } = req.query;
    const userTier = tier as string;

    console.log('Testing enhanced market context for tier:', userTier);

    // Get enhanced market context
    const marketContextSummary = await dataOrchestrator.getMarketContextSummary(userTier as any);

    // Get cache stats
    const cacheStats = await dataOrchestrator.getCacheStats();

    res.json({
      tier: userTier,
      marketContextSummary: marketContextSummary.substring(0, 1000) + (marketContextSummary.length > 1000 ? '...' : ''),
      contextLength: marketContextSummary.length,
      cacheStats,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in test enhanced market context endpoint', 'error');
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// Test endpoint to force refresh market context
app.post('/test/refresh-market-context', async (req: Request, res: Response) => {
  try {
    const { tier = 'starter' } = req.body;
    const userTier = tier as string;

    console.log('Force refreshing market context for tier:', userTier);

    // Force refresh market context
    await dataOrchestrator.refreshMarketContext(userTier as any);

    // Get updated cache stats
    const cacheStats = await dataOrchestrator.getCacheStats();

    res.json({
      success: true,
      tier: userTier,
      cacheStats,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in test refresh market context endpoint', 'error');
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// Get sync status endpoint
app.get('/sync/status', async (req: Request, res: Response) => {
  try {
    // Sync info endpoint removed - transactions are now real-time only
    res.json({
      syncInfo: {
        lastSync: null,
        accountsSynced: 0,
        transactionsSynced: 0
      }
    });
  } catch (err) {
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in sync status endpoint', 'error');
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});





    // Privacy and data control endpoints
    app.get('/privacy/data', requireAuth, async (req: Request, res: Response) => {
      try {
        const user = req.user!;

        // Return user-specific data only
        const accounts = await getPrismaClient().account.findMany({
          where: { userId: user.id }
        });
        const transactions = await getPrismaClient().transaction.findMany({
          where: { account: { userId: user.id } }
        });
        const conversations = await getPrismaClient().conversation.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 10
        });

        res.json({
          accounts: accounts.length,
          transactions: transactions.length,
          conversations: conversations.length,
          lastSync: null // Sync info removed - transactions are now real-time only
        });
      } catch (err) {
        // Capture error in Sentry
        if (err instanceof Error) {
          Sentry.captureException(err);
        } else {
          Sentry.captureMessage('Unknown error in privacy data endpoint', 'error');
        }

        res.status(500).json({ error: 'Failed to retrieve data summary' });
      }
    });



    app.delete('/privacy/delete-all-data', requireAuth, async (req: Request, res: Response) => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();

        // Get user info before deletion for logging
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true }
        });

        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        console.log('User deleting all data:', user.email);

        // Send admin notification before deleting user data
        try {
          const { sendAdminNotification } = await import('./auth/resend-email');
          await sendAdminNotification('account_deactivated', user.email);
        } catch (notificationError) {
          console.error('Failed to send admin notification:', notificationError);
          // Don't fail the main operation if notification fails
        }

        // Delete user data in the correct order (respecting foreign key constraints)
        // 1. Delete conversations (references users)
        await prisma.conversation.deleteMany({
          where: { userId }
        });

        // 2. Delete transactions (references accounts)
        await prisma.transaction.deleteMany({
          where: { account: { userId } }
        });

        // 3. Delete accounts (references users)
        await prisma.account.deleteMany({
          where: { userId }
        });

        // 4. Delete access tokens (references users)
        await prisma.accessToken.deleteMany({
          where: { userId }
        });

        // 5. Delete sync statuses (references users)
        await prisma.syncStatus.deleteMany({
          where: { userId }
        });

        // 6. Delete SnapTrade user data (references users)
        await prisma.snapTradeUser.deleteMany({
          where: { userId }
        });

        // 7. Delete privacy settings (references users)
        await prisma.privacySettings.deleteMany({
          where: { userId }
        });

        // 8. Delete encrypted profile data first (references userProfile)
        await prisma.encrypted_profile_data.deleteMany({
          where: {
            profileHash: {
              in: await prisma.userProfile.findMany({
                where: { userId },
                select: { profileHash: true }
              }).then((profiles: any[]) => profiles.map((p: any) => p.profileHash))
            }
          }
        });

        // 9. Delete user profile (references users)
        await prisma.userProfile.deleteMany({
          where: { userId }
        });

        // 10. Delete encrypted user data (references users)
        await prisma.encryptedUserData.deleteMany({
          where: { userId }
        });

        // 11. Delete password reset tokens (references users)
        await prisma.passwordResetToken.deleteMany({
          where: { userId }
        });

        // 12. Delete email verification codes (references users)
        await prisma.emailVerificationCode.deleteMany({
          where: { userId }
        });

        // 13. Finally, delete the user themselves (including login/email)
        await prisma.user.delete({
          where: { id: userId }
        });

        console.log('Successfully deleted all data and account for user:', user.email);

        res.json({
          success: true,
          message: 'All data and account deleted successfully. You will need to create a new account to use the service again.'
        });
      } catch (err) {
        console.error('Error deleting user data:', err);

        // Capture error in Sentry
        if (err instanceof Error) {
          Sentry.captureException(err);
        } else {
          Sentry.captureMessage('Unknown error in delete all data endpoint', 'error');
        }

        res.status(500).json({ error: 'Failed to delete data' });
      }
    });

    app.post('/privacy/disconnect-accounts', requireAuth, async (req: Request, res: Response) => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();

        // Get user info before disconnection for admin notification
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true }
        });

        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        // Send admin notification before disconnecting accounts
        try {
          const { sendAdminNotification } = await import('./auth/resend-email');
          await sendAdminNotification('account_disconnected', user.email);
        } catch (notificationError) {
          console.error('Failed to send admin notification:', notificationError);
          // Don't fail the main operation if notification fails
        }

        // Remove only the authenticated user's Plaid access tokens
        await prisma.accessToken.deleteMany({
          where: { userId }
        });

        // Clear only the authenticated user's account and transaction data
        await prisma.transaction.deleteMany({
          where: { account: { userId } }
        });
        await prisma.account.deleteMany({
          where: { userId }
        });
        await prisma.syncStatus.deleteMany({
          where: { userId }
        });

        // Clear SnapTrade user data
        await prisma.snapTradeUser.deleteMany({
          where: { userId }
        });

        res.json({ success: true, message: 'All accounts disconnected and data cleared' });
      } catch (err) {
        // Capture error in Sentry
        if (err instanceof Error) {
          Sentry.captureException(err);
        } else {
          Sentry.captureMessage('Unknown error in disconnect accounts endpoint', 'error');
        }

        res.status(500).json({ error: 'Failed to disconnect accounts' });
      }
    });

    // Admin endpoint to check access
    app.get('/admin/check-access', adminAuth, async (req: Request, res: Response) => {
      try {
        // If we get here, the user has admin access (adminAuth middleware passed)
        res.json({
          user: {
            email: req.user?.email,
            id: req.user?.id,
            tier: req.user?.tier
          },
          access: 'granted'
        });
      } catch (error) {
        console.error('Error in admin check-access endpoint:', error);
        res.status(500).json({ error: 'Failed to check admin access' });
      }
    });

    // Admin endpoints for production data analysis
    app.get('/admin/production-sessions', adminAuth, async (req: Request, res: Response) => {
      try {
        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();

        console.log('Admin: Fetching production sessions...');

        // Get all production users with conversation counts and stats
        const users = await prisma.user.findMany({
          include: {
            conversations: {
              orderBy: { createdAt: 'asc' }
            },
            _count: {
              select: { conversations: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        });

        console.log('Admin: Found production users:', users.length);

        const userStats = users.map((user: any) => {
          const conversations = user.conversations;
          const firstConversation = conversations[0];
          const lastConversation = conversations[conversations.length - 1];

          return {
            userId: user.id,
            email: user.email,
            tier: user.tier,
            conversationCount: user._count.conversations,
            firstQuestion: firstConversation?.question || 'No questions yet',
            lastActivity: lastConversation?.createdAt || user.createdAt,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt
          };
        });

        console.log('Admin: Returning user stats:', userStats.length);
        res.json({ users: userStats });
      } catch (error) {
        console.error('Error fetching production sessions:', error);

        // Capture error in Sentry
        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage('Unknown error in admin production sessions endpoint', 'error');
        }

        res.status(500).json({ error: 'Failed to fetch production sessions' });
      }
    });

    // Answer quality joins semantic planning, evidence outcomes, and user
    // ratings. Persisted manifests survive deploys and remain attributable to
    // the questions that produced them.
    app.get('/admin/answer-quality', adminAuth, async (req: Request, res: Response) => {
      try {
        const { getPrismaClient } = await import('./prisma-client');
        const { buildAnswerQualityReport } = await import('./services/answer-quality');
        const prisma = getPrismaClient();

        const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);
        const recentLimit = Math.min(Math.max(Number(req.query.recent) || 50, 1), limit);
        const conversations = await prisma.conversation.findMany({
          where: { userId: { not: null } },
          select: {
            id: true,
            question: true,
            createdAt: true,
            showTheMathData: true,
            feedback: { select: { score: true, createdAt: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });

        res.json(buildAnswerQualityReport(conversations as any, recentLimit));
      } catch (error) {
        console.error('Error building answer quality report:', error);
        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage('Unknown error in admin answer quality endpoint', 'error');
        }
        res.status(500).json({ error: 'Failed to build answer quality report' });
      }
    });

    app.get('/admin/production-conversations', adminAuth, async (req: Request, res: Response) => {
      try {
        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();

        console.log('Admin: Fetching production conversations...');

        // Get all production conversations with user info and feedback
        // Filter out conversations without users to prevent data integrity issues
        const conversations = await prisma.conversation.findMany({
          where: {
            userId: { not: null } // Only include conversations with valid user IDs
          },
          include: {
            user: true,
            feedback: {
              select: {
                id: true,
                score: true,
                createdAt: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        });

        console.log('Admin: Found conversations:', conversations.length);

        // Log any conversations that might still have issues
        const conversationsWithoutUsers = conversations.filter((conv: any) => !conv.user);
        if (conversationsWithoutUsers.length > 0) {
          console.warn('Admin: Found conversations without users:', conversationsWithoutUsers.length);
        }

        res.json({ conversations });
      } catch (error) {
        console.error('Error fetching production conversations:', error);

        // Capture error in Sentry
        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage('Unknown error in admin production conversations endpoint', 'error');
        }

        res.status(500).json({ error: 'Failed to fetch production conversations' });
      }
    });

    // Admin endpoint to get all production users
    app.get('/admin/production-users', adminAuth, async (req: Request, res: Response) => {
      try {
        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();

        console.log('Admin: Fetching production users...');

        const users = await prisma.user.findMany({
          select: {
            id: true,
            email: true,
            tier: true,
            isActive: true,
            createdAt: true,
            lastLoginAt: true,
            _count: {
              select: { conversations: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        });

        console.log('Admin: Raw users from database:', users.map((u: any) => ({ email: u.email, id: u.id, tier: u.tier })));

        // Enhance users with subscription status from Stripe service
        console.log('Admin: Starting subscription status enhancement...');
        const { stripeService } = await import('./services/stripe');
        console.log('Admin: Stripe service imported successfully');

        const enhancedUsers = await Promise.all(
          users.map(async (user: any) => {
            try {
              console.log(`Admin: Processing user ${user.email} (${user.id}) with tier ${user.tier}`);
              const subscriptionStatus = await stripeService.getUserSubscriptionStatus(user.id);
              console.log(`Admin: User ${user.email} - Status: ${subscriptionStatus.status}, Access: ${subscriptionStatus.accessLevel}, Message: ${subscriptionStatus.message}`);
              return {
                ...user,
                subscriptionStatus: subscriptionStatus.status,
                trialExpiresAt: subscriptionStatus.status === 'trialing'
                  ? subscriptionStatus.expiresAt || null
                  : null,
                accessLevel: subscriptionStatus.accessLevel,
                upgradeRequired: subscriptionStatus.upgradeRequired,
                subscriptionMessage: subscriptionStatus.message
              };
            } catch (error) {
              console.error(`Error getting subscription status for user ${user.id}:`, error);
              return {
                ...user,
                subscriptionStatus: 'unknown',
                trialExpiresAt: null,
                accessLevel: 'unknown',
                upgradeRequired: false,
                subscriptionMessage: 'Error fetching subscription status'
              };
            }
          })
        );
        console.log('Admin: Subscription status enhancement completed');

        console.log('Admin: Found users:', users.length);
        res.json({ users: enhancedUsers });
      } catch (error) {
        console.error('Error fetching production users:', error);

        // Capture error in Sentry
        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage('Unknown error in admin production users endpoint', 'error');
        }

        res.status(500).json({ error: 'Failed to fetch production users' });
      }
    });

    // Admin endpoint to update user tier
    app.put('/admin/update-user-tier', adminAuth, async (req: Request, res: Response) => {
      try {
        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();

        const { userId, newTier } = req.body;

        if (!userId || !newTier) {
          return res.status(400).json({ error: 'Missing userId or newTier' });
        }

        console.log('Admin: Updating user tier:', { userId, newTier });

        const updatedUser = await prisma.user.update({
          where: { id: userId },
          data: { tier: newTier },
          select: {
            id: true,
            email: true,
            tier: true,
            updatedAt: true
          }
        });

        console.log('Admin: Updated user tier:', updatedUser);
        res.json({ success: true, user: updatedUser });
      } catch (error) {
        console.error('Error updating user tier:', error);

        // Capture error in Sentry
        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage('Unknown error in admin update user tier endpoint', 'error');
        }

        res.status(500).json({ error: 'Failed to update user tier' });
      }
    });

    // Admin endpoint to get remembered personal context and linked institutions
    app.get('/admin/user-financial-data/:userId', adminAuth, async (req: Request, res: Response) => {
      try {
        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();

        const userId = asString(req.params.userId);

        if (!userId) {
          return res.status(400).json({ error: 'Missing userId' });
        }

        console.log('Admin: Fetching financial data for user:', userId);

        // Format the bounded personal context instead of exposing its encrypted storage document.
        const { ProfileManager } = await import('./profile/manager');
        const profileManager = new ProfileManager();
        const currentPersonalContext = await profileManager.getPersonalContextForModel(userId);

        // Get user profile metadata for lastUpdated
        const userProfile = await prisma.userProfile.findUnique({
          where: { userId },
          select: {
            lastUpdated: true
          }
        });

        // Get user's linked financial institutions through access tokens
        const accessTokens = await prisma.accessToken.findMany({
          where: { userId },
          select: {
            id: true,
            token: true,
            createdAt: true,
            lastRefreshed: true
          }
        });

        console.log('Admin: Found access tokens:', accessTokens.length, 'for user:', userId);

        // Get accounts associated with this user from database
        const accounts = await prisma.account.findMany({
          where: { userId },
          select: {
            id: true,
            name: true,
            type: true,
            subtype: true,
            institution: true,
            currentBalance: true,
            lastSynced: true
          },
          orderBy: [
            { institution: 'asc' },
            { name: 'asc' }
          ]
        });

        console.log('Admin: Found accounts in database:', accounts.length, 'for user:', userId);
        if (accounts.length > 0) {
          console.log('Admin: Account details from database:', accounts.map((a: any) => ({
            name: a.name,
            institution: a.institution,
            type: a.type
          })));
        }

        // If no accounts in database but user has access tokens, try to fetch live from Plaid
        const liveAccounts: any[] = [];
        if (accessTokens.length > 0) {
          console.log('Admin: Fetching live accounts from Plaid for all access tokens...');
          try {
            const { plaidClient: workingPlaidClient } = await import('./plaid');

            // Fetch accounts from ALL access tokens, not just the first one
            for (const tokenRecord of accessTokens) {
              try {
                console.log('Admin: Fetching accounts from token:', tokenRecord.id);

                const accountsResponse = await workingPlaidClient.accountsGet({
                  access_token: tokenRecord.token,
                });

                if (accountsResponse.data.accounts && accountsResponse.data.accounts.length > 0) {
                  console.log('Admin: Found accounts from token:', tokenRecord.id, ':', accountsResponse.data.accounts.length);

                  // Create account objects from Plaid response (without balances)
                  const tokenAccounts = accountsResponse.data.accounts.map((account: any) => {
                    // Extract institution name from account name if institution_name is not available
                    let institutionName = account.institution_name;
                    if (!institutionName && account.name) {
                      // Try to extract institution from account name patterns
                      if (account.name.includes('Robinhood')) {
                        institutionName = 'Robinhood';
                      } else if (account.name.includes('Chase')) {
                        institutionName = 'Chase';
                      } else if (account.name.includes('Bank of America')) {
                        institutionName = 'Bank of America';
                      } else if (account.name.includes('Betterment')) {
                        institutionName = 'Betterment';
                      } else if (account.name.includes('Vanguard')) {
                        institutionName = 'Vanguard';
                      } else if (account.name.includes('Fidelity')) {
                        institutionName = 'Fidelity';
                      } else if (account.name.includes('American Express')) {
                        institutionName = 'American Express';
                      } else {
                        // Betterment accounts often have goal-based names like "Retirement - Roth IRA", "Mortgage Payoff Fund", etc.
                        // Check for common Betterment account patterns
                        const accountName = account.name.toLowerCase();
                        if (accountName.includes('retirement') ||
                            accountName.includes('mortgage') ||
                            accountName.includes('travel') ||
                            accountName.includes('healthcare') ||
                            accountName.includes('bridge fund') ||
                            (accountName.includes('fund') && accountName.includes('$')) ||
                            accountName.includes('traditional ira') ||
                            accountName.includes('roth ira') ||
                            accountName.includes('taxable')) {
                          // This looks like a Betterment account based on naming patterns
                          institutionName = 'Betterment';
                        } else {
                          // Extract first word as institution if no pattern matches
                          institutionName = account.name.split(' ')[0];
                        }
                      }
                    }

                    return {
                      id: account.account_id,
                      name: account.name,
                      type: account.type,
                      subtype: account.subtype,
                      institution: institutionName || 'Unknown Institution',
                      balance: null, // Don't show balances
                      lastSynced: new Date().toISOString(),
                      isLiveData: true
                    };
                  });

                  liveAccounts.push(...tokenAccounts);
                }
              } catch (error) {
                console.log('Admin: Failed to fetch accounts from token:', tokenRecord.id, ':', error);
              }
            }

            console.log('Admin: Total live accounts fetched from all tokens:', liveAccounts.length);
          } catch (error) {
            console.log('Admin: Failed to fetch live Plaid data:', error);
          }
        }

        // Debug: Check if there are any accounts without userId that might belong to this user
        const allAccountsInDb = await prisma.account.findMany({
          select: {
            id: true,
            name: true,
            institution: true,
            userId: true
          }
        });
        console.log('Admin: Total accounts in database:', allAccountsInDb.length);
        console.log('Admin: Accounts without userId:', allAccountsInDb.filter((a: any) => !a.userId).length);
        if (allAccountsInDb.filter((a: any) => !a.userId).length > 0) {
          console.log('Admin: Orphaned accounts:', allAccountsInDb.filter((a: any) => !a.userId).map((a: any) => ({
            name: a.name,
            institution: a.institution
          })));
        }

        // The user may have financial data from non-Plaid sources.
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            email: true,
            tier: true
          }
        });

        console.log('Admin: User details:', user);

        // Check if there are any transactions that might indicate real financial data
        const transactions = await prisma.transaction.findMany({
          where: {
            account: {
              userId: userId
            }
          },
          select: {
            id: true,
            amount: true,
            date: true
          }
        });

        console.log('Admin: Found transactions:', transactions.length, 'for user:', userId);

        // Combine database accounts with live Plaid accounts
        const allAccounts = [...accounts, ...liveAccounts];

        // Group accounts by institution
        const institutions = allAccounts.reduce((acc: any[], account) => {
          const institutionName = account.institution || 'Unknown Institution';
          const existingInstitution = acc.find(inst => inst.name === institutionName);

          if (existingInstitution) {
            existingInstitution.accounts.push({
              id: account.id,
              name: account.name,
              type: account.type,
              subtype: account.subtype,
              balance: account.balance || account.currentBalance,
              lastSynced: account.lastSynced,
              isLiveData: account.isLiveData || false
            });
          } else {
            acc.push({
              name: institutionName,
              accounts: [{
                id: account.id,
                name: account.name,
                type: account.type,
                subtype: account.subtype,
                balance: account.balance || account.currentBalance,
                lastSynced: account.lastSynced,
                isLiveData: account.isLiveData || false
              }]
            });
          }

          return acc;
        }, []);

        const financialData = {
          profile: {
            text: currentPersonalContext || 'Linc does not remember any personal details yet',
            lastUpdated: userProfile?.lastUpdated || null
          },
          institutions: institutions,
          accessTokens: accessTokens.length,
          totalAccounts: allAccounts.length,
          lastSync: allAccounts.length > 0 ? Math.max(...allAccounts.map(a => {
            if (a.lastSynced instanceof Date) {
              return a.lastSynced.getTime();
            } else if (typeof a.lastSynced === 'string') {
              return new Date(a.lastSynced).getTime();
            }
            return 0;
          })) : null
        };

        console.log('Admin: Returning financial data for user:', userId, {
          profileLength: financialData.profile.text.length,
          institutions: financialData.institutions.length,
          accounts: financialData.totalAccounts,
          databaseAccounts: accounts.length,
          liveAccounts: liveAccounts.length
        });

        res.json(financialData);
      } catch (error) {
        console.error('Error fetching user financial data:', error);

        // Capture error in Sentry
        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage('Unknown error in admin user financial data endpoint', 'error');
        }

        res.status(500).json({ error: 'Failed to fetch user financial data' });
      }
    });

// Test database connection
app.get('/test-db', async (req: Request, res: Response) => {
      try {
        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();

        // Test basic database connection
        await prisma.$queryRaw`SELECT 1`;

        res.json({
          status: 'OK',
          message: 'Database connection working correctly'
        });
      } catch (error) {
        console.error('Database test failed:', error);

        // Capture error in Sentry
        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage('Unknown error in test database endpoint', 'error');
        }

        res.status(500).json({
          error: 'Database test failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

// Profile endpoints
app.get('/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const { ProfileManager } = await import('./profile/manager');
    const profileManager = new ProfileManager();
    const memory = await profileManager.getPersonalContext(req.user!.id);
    res.json({ memory });
  } catch (error) {
    console.error('Failed to fetch profile:', error);

    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in profile fetch endpoint', 'error');
    }

    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.put('/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const { memory } = req.body;

    if (!memory || typeof memory !== 'object' || Array.isArray(memory)) {
      return res.status(400).json({ error: 'memory must be an object' });
    }

    const { ProfileManager } = await import('./profile/manager');
    const profileManager = new ProfileManager();
    const savedMemory = await profileManager.replacePersonalContext(req.user!.id, memory);

    res.json({ success: true, memory: savedMemory });
  } catch (error) {
    // A rejected field or value is user input, not a server fault: answer 400
    // and keep it out of Sentry.
    if (error instanceof Error && error.message.startsWith('Invalid personal context')) {
      return res.status(400).json({ error: error.message });
    }

    console.error('Failed to update personal context:', error);

    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in profile update endpoint', 'error');
    }

    res.status(500).json({ error: 'Failed to update personal context' });
  }
});

// Home value endpoints
app.get('/profile/home', requireAuth, async (req: Request, res: Response) => {
  try {
    console.log('🏠 GET /profile/home called for user:', req.user!.id);

    const { ProfileManager } = await import('./profile/manager');
    const profileManager = new ProfileManager();

    const profileText = await profileManager.getOriginalProfile(req.user!.id);

    const homeData = profileManager.extractHomeData(profileText);
    console.log('🏠 Extracted home data:', homeData);

    if (!homeData.address) {
      console.log('🏠 No home address found, returning hasHome: false');
      return res.json({
        hasHome: false,
        homeData: null
      });
    }

    console.log('🏠 Returning home data:', {
      address: homeData.address,
      value: homeData.value,
      valueLow: homeData.valueLow,
      valueHigh: homeData.valueHigh
    });

    const valueLow = homeData.isManualOverride ? null : homeData.valueLow;
    const valueHigh = homeData.isManualOverride ? null : homeData.valueHigh;

    // Safely convert lastUpdated to ISO string, checking if date is valid
    let lastUpdatedISO: string;
    if (homeData.lastUpdated && !isNaN(homeData.lastUpdated.getTime())) {
      lastUpdatedISO = homeData.lastUpdated.toISOString();
    } else {
      lastUpdatedISO = new Date().toISOString();
    }

    res.json({
      hasHome: true,
      homeData: {
        address: homeData.address || '',
        value: homeData.value ?? 0,
        valueLow: valueLow,
        valueHigh: valueHigh,
        lastUpdated: lastUpdatedISO,
        isManualOverride: homeData.isManualOverride || false
      }
    });
  } catch (error) {
    console.error('Failed to fetch home data:', error);

    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in home data fetch endpoint', 'error');
    }

    res.status(500).json({ error: 'Failed to fetch home data' });
  }
});

app.post('/profile/home', requireAuth, async (req: Request, res: Response) => {
  try {
    const { address, ownsHome } = req.body;

    if (!address || typeof address !== 'string') {
      return res.status(400).json({ error: 'address is required and must be a string' });
    }

    if (typeof ownsHome !== 'boolean') {
      return res.status(400).json({ error: 'ownsHome is required and must be a boolean' });
    }

    if (!ownsHome) {
      return res.status(400).json({ error: 'ownsHome must be true to add home data' });
    }

    const { ProfileManager } = await import('./profile/manager');
    const profileManager = new ProfileManager();

    // Fetch home value from RentCast and update profile. A null return means
    // RentCast has nothing usable for this address; a throw means the lookup
    // could not be attempted, which is not the user's address to fix.
    let homeValue;
    try {
      homeValue = await profileManager.updateHomeValue(req.user!.id, address);
    } catch (error) {
      console.error('Home value lookup unavailable:', error);
      Sentry.captureException(error);
      return res.status(503).json({
        error: 'Home valuations are temporarily unavailable. Please try again later.'
      });
    }

    if (!homeValue) {
      return res.status(404).json({
        error: 'Unable to fetch home value for the provided address. Please verify the address is correct.'
      });
    }

    // Refresh the canonical snapshot so every consumer sees the new home value.
    try {
      const { FinancialRevisionService } = await import('./services/financial-revision-service');
      FinancialRevisionService.schedule(req.user!.id, {
        categorize: false,
        history: { kind: 'material', reason: 'home-value-updated' },
      }, 'Home value update');
    } catch (error) {
      console.error('Failed to trigger financial summary refresh:', error);
      // Don't fail the request if cache refresh fails
    }

    // Get updated home data
    const profileText = await profileManager.getOriginalProfile(req.user!.id);
    const homeData = profileManager.extractHomeData(profileText);

    const valueLow = homeData.isManualOverride ? null : homeData.valueLow;
    const valueHigh = homeData.isManualOverride ? null : homeData.valueHigh;

    // Safely convert lastUpdated to ISO string, checking if date is valid
    let lastUpdatedISO: string;
    if (homeData.lastUpdated && !isNaN(homeData.lastUpdated.getTime())) {
      lastUpdatedISO = homeData.lastUpdated.toISOString();
    } else {
      lastUpdatedISO = new Date().toISOString();
    }

    res.json({
      success: true,
      homeData: {
        address: homeData.address || '',
        value: homeData.value ?? 0,
        valueLow: valueLow,
        valueHigh: valueHigh,
        lastUpdated: lastUpdatedISO,
        isManualOverride: homeData.isManualOverride || false
      }
    });
  } catch (error) {
    console.error('Failed to add home data:', error);

    if (error instanceof Error) {
      Sentry.captureException(error);
      res.status(500).json({ error: error.message });
    } else {
      Sentry.captureMessage('Unknown error in home data add endpoint', 'error');
      res.status(500).json({ error: 'Failed to add home data' });
    }
  }
});

app.post('/profile/home/refresh', requireAuth, async (req: Request, res: Response) => {
  try {
    const { ProfileManager } = await import('./profile/manager');
    const profileManager = new ProfileManager();

    // Get current home address from profile
    const profileText = await profileManager.getOriginalProfile(req.user!.id);
    const currentHomeData = profileManager.extractHomeData(profileText);

    if (!currentHomeData.address) {
      return res.status(404).json({ error: 'No home address found in profile' });
    }

    // Refresh home value from RentCast
    let homeValue;
    try {
      homeValue = await profileManager.updateHomeValue(req.user!.id, currentHomeData.address);
    } catch (error) {
      console.error('Home value refresh unavailable:', error);
      Sentry.captureException(error);
      return res.status(503).json({
        error: 'Home valuations are temporarily unavailable. Please try again later.'
      });
    }

    if (!homeValue) {
      return res.status(422).json({
        error: 'RentCast has no current valuation for the address on file. The previous value is unchanged.'
      });
    }

    // Refresh the canonical snapshot so every consumer sees the refreshed value.
    try {
      const { FinancialRevisionService } = await import('./services/financial-revision-service');
      FinancialRevisionService.schedule(req.user!.id, {
        categorize: false,
        history: { kind: 'material', reason: 'home-value-refreshed' },
      }, 'Home value refresh');
    } catch (error) {
      console.error('Failed to trigger financial summary refresh:', error);
      // Don't fail the request if cache refresh fails
    }

    // Get updated home data
    const updatedProfileText = await profileManager.getOriginalProfile(req.user!.id);
    const homeData = profileManager.extractHomeData(updatedProfileText);

    const valueLow = homeData.isManualOverride ? null : homeData.valueLow;
    const valueHigh = homeData.isManualOverride ? null : homeData.valueHigh;

    // Safely convert lastUpdated to ISO string, checking if date is valid
    let lastUpdatedISO: string;
    if (homeData.lastUpdated && !isNaN(homeData.lastUpdated.getTime())) {
      lastUpdatedISO = homeData.lastUpdated.toISOString();
    } else {
      lastUpdatedISO = new Date().toISOString();
    }

    res.json({
      success: true,
      homeData: {
        address: homeData.address || '',
        value: homeData.value ?? 0,
        valueLow: valueLow,
        valueHigh: valueHigh,
        lastUpdated: lastUpdatedISO,
        isManualOverride: homeData.isManualOverride || false
      }
    });
  } catch (error) {
    console.error('Failed to refresh home value:', error);

    if (error instanceof Error) {
      Sentry.captureException(error);
      res.status(500).json({ error: error.message });
    } else {
      Sentry.captureMessage('Unknown error in home value refresh endpoint', 'error');
      res.status(500).json({ error: 'Failed to refresh home value' });
    }
  }
});

interface PersistedHomeData {
  address?: string | null;
  value?: number | null;
  valueLow?: number | null;
  valueHigh?: number | null;
  lastUpdated?: Date | null;
  isManualOverride?: boolean;
}

function serializeHomeData(homeData: PersistedHomeData) {
  const lastUpdated = homeData.lastUpdated && !Number.isNaN(homeData.lastUpdated.getTime())
    ? homeData.lastUpdated.toISOString()
    : new Date().toISOString();
  return {
    address: homeData.address || '',
    value: homeData.value ?? 0,
    valueLow: homeData.isManualOverride ? null : homeData.valueLow ?? null,
    valueHigh: homeData.isManualOverride ? null : homeData.valueHigh ?? null,
    lastUpdated,
    isManualOverride: Boolean(homeData.isManualOverride),
  };
}

// The setting itself is already durable when this runs. Rebuilding the canonical snapshot
// re-reads every connected provider and takes tens of seconds, so it happens in the
// background — the same as POST /profile/home and /profile/home/refresh. Clients see the
// saved value immediately from the mutation response and reconcile totals against the next
// snapshot revision.
async function refreshSnapshotAfterHomeMutation(
  userId: string,
  reason: 'home-value-override-set' | 'home-value-override-removed' | 'home-value-removed'
): Promise<void> {
  try {
    const { FinancialRevisionService } = await import('./services/financial-revision-service');
    FinancialRevisionService.schedule(
      userId,
      { categorize: false, history: { kind: 'material', reason } },
      reason
    );
  } catch (error) {
    console.error(`Home setting was saved but the snapshot refresh could not be scheduled for user ${userId}:`, error);
    Sentry.captureException(error);
  }
}

// Update manual home value override
app.put('/profile/home/value', requireAuth, async (req: Request, res: Response) => {
  try {
    const { value } = req.body;

    if (typeof value !== 'number' || value <= 0) {
      return res.status(400).json({ error: 'value is required and must be a positive number' });
    }

    const { ProfileManager } = await import('./profile/manager');
    const profileManager = new ProfileManager();

    // Update manual override
    const homeData = await profileManager.updateManualHomeValue(req.user!.id, value);
    await refreshSnapshotAfterHomeMutation(req.user!.id, 'home-value-override-set');

    res.json({
      success: true,
      homeData: serializeHomeData(homeData),
    });
  } catch (error) {
    console.error('Failed to update manual home value:', error);

    if (error instanceof Error) {
      Sentry.captureException(error);
      res.status(500).json({ error: error.message });
    } else {
      Sentry.captureMessage('Unknown error updating manual home value', 'error');
      res.status(500).json({ error: 'Failed to update manual home value' });
    }
  }
});

// Remove manual home value override (reset to estimate)
app.delete('/profile/home/value', requireAuth, async (req: Request, res: Response) => {
  try {
    const { ProfileManager } = await import('./profile/manager');
    const profileManager = new ProfileManager();

    // Remove manual override
    const homeData = await profileManager.removeManualHomeValue(req.user!.id);
    await refreshSnapshotAfterHomeMutation(req.user!.id, 'home-value-override-removed');

    res.json({
      success: true,
      homeData: serializeHomeData(homeData),
    });
  } catch (error) {
    console.error('Failed to remove manual home value:', error);

    if (error instanceof Error) {
      Sentry.captureException(error);
      res.status(500).json({ error: error.message });
    } else {
      Sentry.captureMessage('Unknown error removing manual home value', 'error');
      res.status(500).json({ error: 'Failed to remove manual home value' });
    }
  }
});

app.delete('/profile/home', requireAuth, async (req: Request, res: Response) => {
  try {
    const { ProfileManager } = await import('./profile/manager');
    const profileManager = new ProfileManager();

    await profileManager.removeHomeData(req.user!.id);
    await refreshSnapshotAfterHomeMutation(req.user!.id, 'home-value-removed');

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to remove home data:', error);

    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in home data remove endpoint', 'error');
    }

    res.status(500).json({ error: 'Failed to remove home data' });
  }
});

// Monthly income/expense override endpoints
app.get('/api/finances/overrides', requireAuth, async (req: Request, res: Response) => {
  try {
    const { getPrismaClient } = await import('./prisma-client');
    const prisma = getPrismaClient();

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        monthlyIncomeOverride: true,
        monthlyExpenseOverride: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { averageCanonicalTransactionSummary } = await import('./services/finances-overview-service');
    const snapshot = await getLatestFinancialSnapshot(req.user!.id, 'summary');
    const averages = averageCanonicalTransactionSummary(snapshot?.transactionsSummary);
    const calculatedIncome = averages?.averageIncome;
    const calculatedExpense = averages?.averageExpenses;

    res.json({
      monthlyIncome: user.monthlyIncomeOverride,
      monthlyExpense: user.monthlyExpenseOverride,
      calculatedIncome,
      calculatedExpense
    });
  } catch (error) {
    console.error('Failed to fetch overrides:', error);

    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in fetch overrides endpoint', 'error');
    }

    res.status(500).json({ error: 'Failed to fetch overrides' });
  }
});

app.put('/api/finances/overrides', requireAuth, async (req: Request, res: Response) => {
  try {
    const { monthlyIncome, monthlyExpense } = req.body;

    const { getPrismaClient } = await import('./prisma-client');
    const prisma = getPrismaClient();

    const updateData: any = {};

    if (monthlyIncome !== undefined) {
      if (monthlyIncome === null) {
        updateData.monthlyIncomeOverride = null;
      } else if (typeof monthlyIncome === 'number' && monthlyIncome >= 0) {
        updateData.monthlyIncomeOverride = monthlyIncome;
      } else {
        return res.status(400).json({ error: 'monthlyIncome must be a non-negative number or null' });
      }
    }

    if (monthlyExpense !== undefined) {
      if (monthlyExpense === null) {
        updateData.monthlyExpenseOverride = null;
      } else if (typeof monthlyExpense === 'number' && monthlyExpense >= 0) {
        updateData.monthlyExpenseOverride = monthlyExpense;
      } else {
        return res.status(400).json({ error: 'monthlyExpense must be a non-negative number or null' });
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'At least one field (monthlyIncome or monthlyExpense) must be provided' });
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: updateData,
      select: {
        monthlyIncomeOverride: true,
        monthlyExpenseOverride: true
      }
    });

    res.json({
      success: true,
      monthlyIncome: user.monthlyIncomeOverride,
      monthlyExpense: user.monthlyExpenseOverride
    });
  } catch (error) {
    console.error('Failed to update overrides:', error);

    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in update overrides endpoint', 'error');
    }

    res.status(500).json({ error: 'Failed to update overrides' });
  }
});

// Get user's Plaid access tokens with status
app.get('/profile/tokens', requireAuth, async (req: Request, res: Response) => {
  try {
    const prisma = getPrismaClient();
    const { plaidClient } = await import('./plaid');

    // Superseded connections are excluded outright. They are still valid at Plaid - the user
    // replaced them by re-linking, they were never removed there - so revalidation below would
    // succeed, flip isActive back to true, clear lastError, and then re-create every duplicate
    // account because the cleanup had deleted them. Filtering here is what makes the cleanup stick.
    const tokens = await prisma.accessToken.findMany({
      where: { userId: req.user!.id, supersededAt: null },
      select: {
        id: true,
        token: true,
        createdAt: true,
        lastChecked: true,
        isActive: true,
        lastError: true,
        institutionName: true,
        itemId: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Validate tokens and update institution names
    const updatedTokens = await Promise.all(tokens.map(async (token: any) => {
      const updatedToken = { ...token };

      // Validate token if it hasn't been checked recently (within last hour)
      const shouldValidate = !token.lastChecked ||
        (Date.now() - new Date(token.lastChecked).getTime()) > 60 * 60 * 1000; // 1 hour

      if (shouldValidate) {
        try {
          // Validate token by trying to get accounts
          try {
            const accountsResponse = await plaidClient.accountsGet({
              access_token: token.token
            });

            // Token is valid - update status
            await prisma.accessToken.update({
              where: { id: token.id },
              data: {
                isActive: true,
                lastError: null,
                lastChecked: new Date()
              }
            });

            updatedToken.isActive = true;
            updatedToken.lastError = null;
            updatedToken.lastChecked = new Date();

            // Also ensure accounts are persisted to database
            // Get institution name from item if not already set
            let institutionName = updatedToken.institutionName;
            if (!institutionName && token.itemId) {
              try {
                const itemResponse = await plaidClient.itemGet({
                  access_token: token.token
                });

                if (itemResponse.data.item.institution_id) {
                  const institutionResponse = await plaidClient.institutionsGetById({
                    institution_id: itemResponse.data.item.institution_id,
                    country_codes: ['US' as any]
                  });

                  institutionName = institutionResponse.data.institution.name;

                  // Update institution name in database
                  await prisma.accessToken.update({
                    where: { id: token.id },
                    data: { institutionName }
                  });

                  updatedToken.institutionName = institutionName;
                }
              } catch (err) {
                console.warn(`Failed to fetch institution name for token ${token.id}:`, err);
              }
            }

            // Check if accounts exist for this token's user
            const accountsCount = await prisma.account.count({
              where: {
                userId: token.userId || req.user!.id,
                plaidAccountId: {
                  in: accountsResponse.data.accounts.map((acc: any) => acc.account_id)
                }
              }
            });

            if (accountsCount === 0 && accountsResponse.data.accounts.length > 0) {
              console.log(`Token ${token.id.substring(0, 8)}... is valid but has ${accountsResponse.data.accounts.length} accounts not in database - syncing accounts`);
              // Sync accounts to database
              for (const account of accountsResponse.data.accounts) {
                await prisma.account.upsert({
                  where: { plaidAccountId: account.account_id },
                  update: {
                    // Don't update name - preserve user customizations
                    mask: account.mask,
                    type: account.type,
                    subtype: account.subtype,
                    currentBalance: account.balances.current,
                    availableBalance: account.balances.available,
                    limit: account.balances.limit,
                    currency: account.balances.iso_currency_code,
                    institution: institutionName || undefined,
                    persistentAccountId: (account as any).persistent_account_id || null,
                    userId: token.userId || req.user!.id,
                    accessTokenId: token.id,
                    lastSynced: new Date()
                  },
                  create: {
                    plaidAccountId: account.account_id,
                    name: account.name,
                    mask: account.mask,
                    type: account.type,
                    subtype: account.subtype,
                    currentBalance: account.balances.current,
                    availableBalance: account.balances.available,
                    limit: account.balances.limit,
                    currency: account.balances.iso_currency_code,
                    institution: institutionName || undefined,
                    persistentAccountId: (account as any).persistent_account_id || null,
                    userId: token.userId || req.user!.id,
                    accessTokenId: token.id,
                    lastSynced: new Date()
                  }
                });
              }
            }
          } catch (plaidError: any) {
            const errorCode = plaidError?.response?.data?.error_code;
            const errorMessage = plaidError?.response?.data?.error_message || plaidError.message;

            // Token has an issue - update status
            const isActive = errorCode !== 'ITEM_LOGIN_REQUIRED' && errorCode !== 'INVALID_ACCESS_TOKEN';

            await prisma.accessToken.update({
              where: { id: token.id },
              data: {
                isActive,
                lastError: errorCode || errorMessage,
                lastChecked: new Date()
              }
            });

            updatedToken.isActive = isActive;
            updatedToken.lastError = errorCode || errorMessage;
            updatedToken.lastChecked = new Date();
          }
        } catch (err) {
          console.warn(`Failed to validate token ${token.id}:`, err);
        }
      }

      // Update institution name if still missing (fallback if not set during validation)
      if (!updatedToken.institutionName && updatedToken.itemId) {
        try {
          const itemResponse = await plaidClient.itemGet({
            access_token: token.token
          });

          if (itemResponse.data.item.institution_id) {
            const institutionResponse = await plaidClient.institutionsGetById({
              institution_id: itemResponse.data.item.institution_id,
              country_codes: ['US' as any]
            });

            const institutionName = institutionResponse.data.institution.name;

            // Update in database
            await prisma.accessToken.update({
              where: { id: token.id },
              data: { institutionName }
            });

            updatedToken.institutionName = institutionName;
          }
        } catch (err) {
          console.warn(`Failed to fetch institution name for token ${token.id}:`, err);
        }
      }

      // Remove actual token from response
      const { token: _, ...tokenWithoutSecret } = updatedToken;
      return tokenWithoutSecret;
    }));

    res.json({ tokens: updatedTokens });
  } catch (error) {
    console.error('Failed to fetch tokens:', error);

    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in tokens fetch endpoint', 'error');
    }

    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

// Get SnapTrade connection status
app.get('/api/summaries', requireAuth, async (req: Request, res: Response) => {
  try {
    const view = (req.query.view as string) === 'full' ? 'full' : 'summary';
    const snapshot = await getLatestFinancialSnapshot(req.user!.id, view as any);
    if (!snapshot) {
      return res.status(204).json({ computedAt: null });
    }
    res.json(snapshot);
  } catch (error) {
    console.error('❌ Failed to fetch cached financial summary:', error);
    if (error instanceof Error) {
      Sentry.captureException(error);
      res.status(500).json({ error: error.message });
    } else {
      Sentry.captureMessage('Unknown error in cached financial summary endpoint', 'error');
      res.status(500).json({ error: 'Failed to fetch financial summary' });
    }
  }
});

// Get historical financial snapshots
app.get('/api/financial-history', requireAuth, async (req: Request, res: Response) => {
  try {
    const { FinancialHistoryService } = await import('./services/financial-history-service');
    const userId = req.user!.id;

    // Parse optional query parameters
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : undefined;
    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : undefined;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : undefined;
    const includeMaterial = req.query.includeMaterial === 'true';

    // Validate dates
    if (startDate && isNaN(startDate.getTime())) {
      return res.status(400).json({ error: 'Invalid startDate format' });
    }
    if (endDate && isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid endDate format' });
    }
    if (limit !== undefined && (isNaN(limit) || limit < 1)) {
      return res.status(400).json({ error: 'Invalid limit value' });
    }

    const snapshots = await FinancialHistoryService.getHistoricalSnapshots(
      userId,
      startDate,
      endDate,
      limit,
      includeMaterial
    );

    // Convert dates to ISO strings for JSON response
    const formattedSnapshots = snapshots.map(snapshot => ({
      computedAt: snapshot.computedAt.toISOString(),
      asOf: snapshot.asOf?.toISOString() || null,
      status: snapshot.status,
      reportingCurrency: snapshot.reportingCurrency,
      netWorth: snapshot.netWorth,
      totalCash: snapshot.totalCash,
      totalInvestments: snapshot.totalInvestments,
      totalDebt: snapshot.totalDebt,
      homeValue: snapshot.homeValue,
      totalAssets: snapshot.totalAssets,
      totalLiabilities: snapshot.totalLiabilities,
      observationDate: snapshot.observationDate?.toISOString() || null,
      observationKind: snapshot.observationKind,
      observationReason: snapshot.observationReason,
      timeZone: snapshot.timeZone,
    }));

    res.json(formattedSnapshots);
  } catch (error) {
    console.error('❌ Failed to fetch financial history:', error);
    if (error instanceof Error) {
      Sentry.captureException(error);
      res.status(500).json({ error: error.message });
    } else {
      Sentry.captureMessage('Unknown error in financial history endpoint', 'error');
      res.status(500).json({ error: 'Failed to fetch financial history' });
    }
  }
});

// Optional admin/per-user endpoint to recompute snapshot on demand
app.post('/api/refresh-summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    // A user-initiated refresh means live provider balances, not merely a new
    // snapshot over values still inside the normal freshness window.
    // Refresh the home estimate first so the recompute below picks it up in the
    // same revision. A manual override and a recent estimate are both skipped
    // inside the service, and a RentCast failure must not fail the refresh —
    // the rest of the snapshot is still worth producing.
    try {
      const { HomeValueRefreshService } = await import('./services/home-value-refresh');
      await new HomeValueRefreshService().refreshUserHomeValue(userId);
    } catch (error) {
      console.warn('Refresh summary: home value refresh failed (non-fatal):', error);
    }
    const { FinancialRevisionService } = await import('./services/financial-revision-service');
    // Fast path: skip heavy categorization to avoid request timeouts
    const payload = await FinancialRevisionService.recompute(userId, {
      categorize: false,
      forceBalanceRefresh: true,
      history: { kind: 'material', reason: 'user-refresh' },
    });
    // Recompute can materialize large detail arrays; callers only need an
    // acknowledgement before requesting the lightweight view they consume.
    res.json({
      computedAt: payload.computedAt,
      asOf: payload.asOf,
      status: payload.status,
      // True when a provider failed and the prior revision was kept instead. The status
      // above then belongs to that older revision, so it cannot be read as this refresh
      // having reached the providers.
      retainedPriorRevision: Boolean((payload as any).retainedPriorRevision),
    });
  } catch (error) {
    console.error('❌ Failed to refresh financial summary:', error);
    if (error instanceof Error) {
      Sentry.captureException(error);
      res.status(500).json({ error: error.message });
    } else {
      Sentry.captureMessage('Unknown error in refresh summary endpoint', 'error');
      res.status(500).json({ error: 'Failed to refresh financial summary' });
    }
  }
});

app.get('/profile/snaptrade-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const prisma = getPrismaClient();

    const snapTradeUser = await prisma.snapTradeUser.findUnique({
      where: { userId: req.user!.id },
      select: {
        id: true,
        snapTradeUserId: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!snapTradeUser) {
      return res.json({
        connected: false,
        status: 'not_connected'
      });
    }

    // Validate the SnapTrade connection by checking token health
    const { TokenValidationService } = await import('./services/token-validation-service');
    const tokenValidationService = new TokenValidationService();
    const tokenHealth = await tokenValidationService.validateSnapTradeToken(req.user!.id);

    res.json({
      connected: true,
      status: tokenHealth.status,
      error: tokenHealth.error,
      lastChecked: tokenHealth.lastChecked,
      snapTradeUserId: snapTradeUser.snapTradeUserId,
      createdAt: snapTradeUser.createdAt,
      updatedAt: snapTradeUser.updatedAt
    });
  } catch (error) {
    console.error('Failed to fetch SnapTrade status:', error);

    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in SnapTrade status endpoint', 'error');
    }

    res.status(500).json({ error: 'Failed to fetch SnapTrade status' });
  }
});

// Admin-only provider diagnostic. Production analysis never sends a raw user
// prompt through this endpoint; it uses the validated semantic query plan.
app.get('/test/search-context', adminAuth, async (req: Request, res: Response) => {
  try {
    const { query, tier = 'standard' } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const userTier = tier as UserTier;
    console.log('Search Context Test:', { query, tier: userTier });

    const searchContext = await dataOrchestrator.getSearchContext(query, userTier);

    res.json({
      query,
      tier: userTier,
      searchContext,
      cacheStats: await dataOrchestrator.getCacheStats()
    });
  } catch (error) {
    console.error('Search context test error:', error);

    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in test search context endpoint', 'error');
    }

    res.status(500).json({ error: 'Failed to get search context' });
  }
});

// Market News Context API Endpoints

// Get current market context for a tier
app.get('/market-news/context/:tier', async (req: Request, res: Response) => {
  try {
    const tier = asString(req.params.tier);
    const { MarketNewsManager } = await import('./market-news/manager');
    const manager = new MarketNewsManager();
    // Same selection rule the answer path uses, so the admin UI cannot show a
    // different context than the one users receive.
    const contextRecord = await manager.getActiveMarketContextRecord(tier as UserTier);

    if (!contextRecord) {
      return res.status(404).json({ error: 'Market context not found for this tier' });
    }

    res.json({
      contextText: contextRecord.contextText,
      dataSources: contextRecord.dataSources,
      keyEvents: contextRecord.keyEvents,
      lastUpdate: contextRecord.lastUpdate,
      tier: tier
    });
  } catch (error) {
    console.error('Error fetching market context:', error);

    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in market news context endpoint', 'error');
    }

    res.status(500).json({ error: 'Failed to fetch market context' });
  }
});

// Admin: Get the configurable AI response tone
app.get('/admin/ai/response-tone', adminAuth, async (req: Request, res: Response) => {
  try {
    const { DEFAULT_RESPONSE_TONE, AI_PROMPT_CONFIG_ID } = await import('./openai/prompt-config');
    const { getPrismaClient } = await import('./prisma-client');
    const prisma = getPrismaClient();

    const config = await prisma.aiPromptConfig.findUnique({
      where: { id: AI_PROMPT_CONFIG_ID },
    });

    const storedTone = config?.responseTone?.trim() ?? '';
    const responseTone = storedTone || DEFAULT_RESPONSE_TONE;
    const isDefault = storedTone.length === 0 || storedTone === DEFAULT_RESPONSE_TONE;

    res.json({
      responseTone,
      defaultResponseTone: DEFAULT_RESPONSE_TONE,
      isDefault,
      lastEditedBy: config?.lastEditedBy || null,
      updatedAt: config?.updatedAt || null,
    });
  } catch (error) {
    console.error('Error fetching AI response tone:', error);
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in admin AI response tone GET endpoint', 'error');
    }
    res.status(500).json({ error: 'Failed to fetch AI response tone' });
  }
});

// Admin: Describe the allowlisted context packs. Their definitions are code,
// not mutable vocabulary, so changing what a pack means remains reviewable.
app.get('/admin/ai/context-packs', adminAuth, async (_req: Request, res: Response) => {
  const { CONTEXT_PACKS } = await import('./openai/context-packs');
  const { scenarioCalculatorRegistry } = await import('./scenarios/calculator-registry');
  res.json({ packs: CONTEXT_PACKS, calculators: scenarioCalculatorRegistry.manifests() });
});

// Admin: Run the same semantic preflight planner production uses against an
// arbitrary active-decision transcript.
app.post('/admin/ai/context-planner-preview', adminAuth, async (req: Request, res: Response) => {
  try {
    const { question, turns, tier } = req.body;
    if (typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'question must be a non-empty string' });
    }
    if (turns !== undefined && !Array.isArray(turns)) {
      return res.status(400).json({ error: 'turns must be an array of question/answer objects' });
    }
    const recentTurns = (Array.isArray(turns) ? turns : []).slice(-10).map((turn: unknown) => {
      if (!turn || typeof turn !== 'object' || Array.isArray(turn)) {
        throw new Error('Every turn must be a question/answer object.');
      }
      const record = turn as Record<string, unknown>;
      if (typeof record.question !== 'string' || !record.question.trim()) {
        throw new Error('Every turn must have a non-empty question.');
      }
      return {
        question: record.question.trim(),
        answer: typeof record.answer === 'string' ? record.answer.trim() : undefined,
      };
    }).reverse();

    const { loadModelConfig } = await import('./openai/model-config');
    const { planContext } = await import('./openai/context-planner');
    const { CONTEXT_PACKS } = await import('./openai/context-packs');
    const { scenarioCalculatorRegistry } = await import('./scenarios/calculator-registry');
    await loadModelConfig(true);
    const plan = await planContext({
      question: question.trim(),
      recentTurns,
      tier: typeof tier === 'string' ? tier : undefined,
    });
    res.json({ plan, packs: CONTEXT_PACKS, calculators: scenarioCalculatorRegistry.manifests() });
  } catch (error) {
    console.error('Error previewing context planning:', error);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    const message = error instanceof Error ? error.message : 'Failed to preview context planning';
    res.status(message.startsWith('Every turn') ? 400 : 500).json({ error: message });
  }
});

/**
 * Turn a Prisma failure into an ops-actionable message when the cause is a
 * migration that has not been applied. Without this the model endpoints return
 * a bare 500 and the missing `models` column looks like a code bug.
 */
function modelConfigErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: string }).code
      : undefined;
  // P2021: table missing. P2022: column missing — the shape this migration takes.
  const missingSchema =
    code === 'P2021' ||
    code === 'P2022' ||
    message.includes('ai_prompt_config') ||
    message.includes('does not exist');
  return missingSchema
    ? 'Database migration missing (ai_prompt_config schema). Run prisma migrate deploy on production, then retry.'
    : fallback;
}

// Admin: Read the configured models, with each one checked against what the
// provider actually serves right now.
app.get('/admin/ai/models', adminAuth, async (req: Request, res: Response) => {
  try {
    const { getActiveGenerationSettings, getActiveModelConfig, loadModelConfig, MODEL_PROVIDERS } =
      await import('./openai/model-config');
    const { getAllProviderCatalogs, verifyAgainstCatalog } = await import('./openai/model-catalog');

    await loadModelConfig(true);
    const refresh = req.query.refresh === 'true';
    const catalogs = await getAllProviderCatalogs(refresh);
    const catalogByProvider = new Map(catalogs.map(catalog => [catalog.provider, catalog]));

    res.json({
      slots: getActiveModelConfig().map(slot => ({
        ...slot,
        verification: verifyAgainstCatalog(catalogByProvider.get(slot.provider)!, slot.model),
      })),
      generationSettings: getActiveGenerationSettings(),
      providers: Object.values(MODEL_PROVIDERS).map(provider => ({
        ...provider,
        ...catalogByProvider.get(provider.id)!,
      })),
    });
  } catch (error) {
    console.error('Error reading model config:', error);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    res.status(500).json({ error: modelConfigErrorMessage(error, 'Failed to read model config') });
  }
});

// Admin: Update the model used in each pipeline slot
app.put('/admin/ai/models', adminAuth, async (req: Request, res: Response) => {
  try {
    const { models, generationSettings, allowUnlisted } = req.body;
    if (!models || typeof models !== 'object' || Array.isArray(models)) {
      return res.status(400).json({ error: 'models must be an object of slot -> model id' });
    }
    // Optional so a client that predates generation settings keeps working; an
    // omitted key leaves the stored settings alone rather than clearing them.
    if (
      generationSettings !== undefined &&
      (!generationSettings || typeof generationSettings !== 'object' || Array.isArray(generationSettings))
    ) {
      return res
        .status(400)
        .json({ error: 'generationSettings must be an object of setting -> value' });
    }

    const {
      MODEL_SLOTS,
      generationSettingsForSlot,
      isGenerationSettingId,
      isModelSlotId,
      isPlausibleModelId,
      isValidGenerationSettingValue,
      setActiveGenerationSettings,
      setActiveModelOverrides,
      slotDefault,
    } = await import('./openai/model-config');
    const { AI_PROMPT_CONFIG_ID, DEFAULT_RESPONSE_TONE } = await import('./openai/prompt-config');
    const { getProviderCatalog, verifyAgainstCatalog } = await import('./openai/model-catalog');
    const { getPrismaClient } = await import('./prisma-client');

    const submitted = models as Record<string, unknown>;
    for (const key of Object.keys(submitted)) {
      if (!isModelSlotId(key)) {
        return res.status(400).json({ error: `Unknown model slot: ${key}` });
      }
    }

    // An empty value clears the override so the slot falls back to its
    // environment variable or shipped default.
    const cleaned: Record<string, string> = {};
    for (const slot of MODEL_SLOTS) {
      const value = submitted[slot.id];
      if (value === undefined) continue;
      if (typeof value !== 'string') {
        return res.status(400).json({ error: `${slot.id} must be a string` });
      }
      const trimmed = value.trim();
      if (trimmed.length === 0) continue;
      if (!isPlausibleModelId(trimmed)) {
        return res.status(400).json({
          error: `"${trimmed}" is not a model id. Enter the id exactly as the provider publishes it, e.g. claude-opus-4-8.`,
        });
      }
      // Only reject against a catalog we could actually read: an unreachable
      // provider must not look like a typo in the admin's input.
      const verification = verifyAgainstCatalog(await getProviderCatalog(slot.provider), trimmed);
      if (verification.status === 'not_served' && allowUnlisted !== true) {
        return res.status(400).json({
          error: `${slot.label}: "${trimmed}" is not a model your API key can call. Check the provider's model list, or save again with "use anyway" if you know it is valid.`,
          slot: slot.id,
          unlisted: true,
        });
      }
      cleaned[slot.id] = trimmed;
    }

    // slot -> setting -> value, matching how the panel groups them.
    const submittedSettings = (generationSettings ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(submittedSettings)) {
      if (!isModelSlotId(key)) {
        return res.status(400).json({ error: `Unknown model slot in generationSettings: ${key}` });
      }
    }

    const cleanedSettings: Record<string, Record<string, string>> = {};
    for (const slot of MODEL_SLOTS) {
      const submittedForSlot = submittedSettings[slot.id];
      if (submittedForSlot === undefined) continue;
      if (!submittedForSlot || typeof submittedForSlot !== 'object' || Array.isArray(submittedForSlot)) {
        return res.status(400).json({ error: `generationSettings.${slot.id} must be an object` });
      }
      const perSlotSubmitted = submittedForSlot as Record<string, unknown>;
      for (const key of Object.keys(perSlotSubmitted)) {
        if (!isGenerationSettingId(key)) {
          return res.status(400).json({ error: `Unknown generation setting: ${slot.id}.${key}` });
        }
      }

      const perSlot: Record<string, string> = {};
      for (const setting of generationSettingsForSlot(slot.id)) {
        const value = perSlotSubmitted[setting.id];
        if (value === undefined) continue;
        if (typeof value !== 'string') {
          return res.status(400).json({ error: `${slot.id}.${setting.id} must be a string` });
        }
        const trimmed = value.trim();
        // Empty clears the override, exactly as it does for a model slot.
        if (trimmed.length === 0) continue;
        if (!isValidGenerationSettingValue(setting, trimmed)) {
          const allowed =
            setting.kind === 'enum'
              ? `one of ${(setting.options ?? []).join(', ')}`
              : `${setting.kind === 'integer' ? 'a whole number' : 'a number'} between ${setting.min} and ${setting.max}`;
          return res.status(400).json({
            error: `${slot.label} — ${setting.label}: "${trimmed}" is not valid. Expected ${allowed}${setting.omittable ? ', or off to leave the parameter out of the request' : ''}.`,
            slot: slot.id,
            setting: setting.id,
          });
        }
        perSlot[setting.id] = trimmed;
      }
      if (Object.keys(perSlot).length > 0) cleanedSettings[slot.id] = perSlot;
    }

    const adminUser = req.user?.email || 'admin';
    const prisma = getPrismaClient();
    const saved = await prisma.aiPromptConfig.upsert({
      where: { id: AI_PROMPT_CONFIG_ID },
      update: {
        models: cleaned,
        lastEditedBy: adminUser,
        ...(generationSettings === undefined ? {} : { generationSettings: cleanedSettings }),
      },
      create: {
        id: AI_PROMPT_CONFIG_ID,
        responseTone: DEFAULT_RESPONSE_TONE,
        models: cleaned,
        generationSettings: cleanedSettings,
        lastEditedBy: adminUser,
      },
    });

    // Replace rather than merge: the panel always submits every slot, and a
    // cleared field has to be able to remove an override.
    const active = setActiveModelOverrides(cleaned);
    if (generationSettings !== undefined) setActiveGenerationSettings(cleanedSettings);
    res.json({
      models: Object.fromEntries(
        MODEL_SLOTS.map(slot => [slot.id, active[slot.id] ?? slotDefault(slot)])
      ),
      ...(generationSettings === undefined ? {} : { generationSettings: cleanedSettings }),
      updatedAt: saved.updatedAt,
    });
  } catch (error) {
    console.error('Error updating model config:', error);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    res.status(500).json({ error: modelConfigErrorMessage(error, 'Failed to update model config') });
  }
});

// Admin: Update the configurable AI response tone
app.put('/admin/ai/response-tone', adminAuth, async (req: Request, res: Response) => {
  try {
    const { responseTone } = req.body;

    if (typeof responseTone !== 'string' || responseTone.trim().length === 0) {
      return res.status(400).json({ error: 'responseTone must be a non-empty string' });
    }

    const adminUser = req.user?.email || 'unknown';
    const trimmedTone = responseTone.trim();

    const { AI_PROMPT_CONFIG_ID, setActiveResponseTone } = await import('./openai/prompt-config');
    const { getPrismaClient } = await import('./prisma-client');
    const prisma = getPrismaClient();

    const config = await prisma.aiPromptConfig.upsert({
      where: { id: AI_PROMPT_CONFIG_ID },
      update: { responseTone: trimmedTone, lastEditedBy: adminUser },
      create: { id: AI_PROMPT_CONFIG_ID, responseTone: trimmedTone, lastEditedBy: adminUser },
    });

    // Refresh the in-memory cache so the change applies to the next prompt build.
    setActiveResponseTone(trimmedTone);

    console.log(`Admin: Updated AI response tone (by ${adminUser})`);
    res.json({
      success: true,
      responseTone: config.responseTone,
      lastEditedBy: config.lastEditedBy,
      updatedAt: config.updatedAt,
    });
  } catch (error) {
    console.error('Error updating AI response tone:', error);
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in admin AI response tone PUT endpoint', 'error');
    }
    const errMsg = error instanceof Error ? error.message : '';
    const missingTable =
      errMsg.includes('ai_prompt_config') ||
      errMsg.includes('does not exist') ||
      (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2021');
    res.status(500).json({
      error: missingTable
        ? 'Database migration missing (ai_prompt_config table). Run prisma migrate deploy on production, then retry.'
        : 'Failed to update AI response tone',
    });
  }
});

// Admin: Update market context manually
app.put('/admin/market-news/context/:tier', adminAuth, async (req: Request, res: Response) => {
  try {
    const tier = asString(req.params.tier);
    const { contextText } = req.body;

    if (!contextText || typeof contextText !== 'string') {
      return res.status(400).json({ error: 'contextText must be a string' });
    }

    const adminUser = req.user?.email || 'unknown';

    const { MarketNewsManager } = await import('./market-news/manager');
    const manager = new MarketNewsManager();
    await manager.updateMarketContextManual(tier as UserTier, contextText, adminUser);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating market context:', error);

    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in admin market news context endpoint', 'error');
    }

    res.status(500).json({ error: 'Failed to update market context' });
  }
});

// Admin: Get market context history
app.get('/admin/market-news/history/:tier', adminAuth, async (req: Request, res: Response) => {
  try {
    const { tier } = req.params;

    const { MarketNewsManager } = await import('./market-news/manager');
    const manager = new MarketNewsManager();
    const history = await manager.getMarketContextHistory(tier as UserTier);

    res.json({ history });
  } catch (error) {
    console.error('Error fetching market context history:', error);

    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in admin market news history endpoint', 'error');
    }

    res.status(500).json({ error: 'Failed to fetch market context history' });
  }
});

const ALL_MARKET_NEWS_TIERS = [UserTier.STARTER, UserTier.STANDARD, UserTier.PREMIUM] as const;

async function refreshAdminMarketNewsContexts(
  res: Response,
  tiers: readonly UserTier[],
  requestedTier?: UserTier
): Promise<void> {
  try {
    const { MarketNewsManager } = await import('./market-news/manager');
    const manager = new MarketNewsManager();
    const result = await manager.refreshMarketContexts(tiers, {
      force: true,
      clearManualOverride: true,
    });

    if (!result.refreshed) {
      res.status(409).json({
        success: false,
        requestedTier: requestedTier ?? 'all',
        reason: result.reason,
      });
      return;
    }

    res.json({
      success: true,
      requestedTier: requestedTier ?? 'all',
      refreshedTiers: tiers,
    });
  } catch (error) {
    console.error('Error refreshing market context:', error);

    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in admin market news refresh endpoint', 'error');
    }

    res.status(500).json({ error: 'Failed to refresh market context' });
  }
}

// Admin: Force-refresh every tier from one shared external evidence batch.
app.post('/admin/market-news/refresh', adminAuth, async (_req: Request, res: Response) => {
  await refreshAdminMarketNewsContexts(res, ALL_MARKET_NEWS_TIERS);
});

// Admin: Force-refresh one tier without changing the semantics of its control.
app.post('/admin/market-news/refresh/:tier', adminAuth, async (req: Request, res: Response) => {
  const { tier } = req.params;
  if (!Object.values(UserTier).includes(tier as UserTier)) {
    res.status(400).json({ error: 'Invalid tier' });
    return;
  }
  await refreshAdminMarketNewsContexts(res, [tier as UserTier], tier as UserTier);
});

const PORT = process.env.PORT || 3000;

// Only start the server if this file is run directly
if (require.main === module) {
  // Before anything can accept a request. A production deploy missing
  // JWT_SECRET would otherwise serve normally while signing sessions with a
  // value published in this repository.
  assertJwtSecretConfigured();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Financial refresh runs as a separately monitored Render cron so a web
    // process restart cannot silently cancel it.
    console.log('ℹ️  Financial refresh is managed externally by scripts/refresh-transactions.js');

    // Refresh the durable market-news context every four hours. This is the
    // canonical scheduled path for FRED, Tiingo, Brave, and Massive evidence;
    // the old hourly process-local FRED cache warmer duplicated calls and was
    // invisible to other application instances.
    cron.schedule('0 */4 * * *', async () => {
      console.log('🔄 Starting market news context refresh...');

      try {
        const { MarketNewsManager } = await import('./market-news/manager');
        const manager = new MarketNewsManager();

        // Collect external inputs once. Tier-specific synthesis reuses the same
        // raw batch, so six Brave searches do not become eighteen.
        const refreshResult = await manager.refreshMarketContexts([
          UserTier.STARTER,
          UserTier.STANDARD,
          UserTier.PREMIUM,
        ]);

        if (!refreshResult.refreshed) {
          console.log(`ℹ️ Market news refresh skipped: ${refreshResult.reason}`);
          return;
        }

        console.log('✅ Market news context refresh completed');
      } catch (error) {
        console.error('❌ Error in market news context refresh:', error);

        // Capture error in Sentry
        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage('Unknown error in market news context refresh cron job', 'error');
        }
      }
    }, {
      timezone: 'America/New_York',
      name: 'market-news-refresh'
    });

    console.log('Cron jobs scheduled: market news context (every 4 hours)');

    // Set up cron job to sync users to MailerLite daily at 3 AM EST
    cron.schedule('0 3 * * *', async () => {
      console.log('🔄 Starting daily MailerLite user sync...');
      const startTime = Date.now();

      try {
        const { MailerLiteSyncService } = await import('./services/mailerlite-sync');
        const mailerLiteService = new MailerLiteSyncService();

        const result = await mailerLiteService.syncAllUsers();
        const duration = Date.now() - startTime;

        if (result.success) {
          console.log(`✅ MailerLite sync completed successfully in ${duration}ms`);
          console.log(`📊 MailerLite Sync Metrics: duration=${duration}ms, users=${result.usersSynced}/${result.usersProcessed}`);
        } else {
          console.error(`❌ MailerLite sync failed after ${duration}ms:`, result.errors);
          console.error(`📊 MailerLite Sync Failure: duration=${duration}ms, errors=${result.errors.length}`);
        }

      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ Error in MailerLite sync after ${duration}ms:`, error);
        console.error(`📊 MailerLite Sync Error: duration=${duration}ms, error=${error}`);

        // Capture error in Sentry
        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage('Unknown error in MailerLite sync cron job', 'error');
        }
      }
    }, {
      timezone: 'America/New_York',
      name: 'mailerlite-sync'
    });

    console.log('Cron job scheduled: MailerLite user sync daily at 3 AM EST');
  });
}

// Admin: Recompute FinancialSummarySnapshot + summary service for a user (fixes stale Ask Linc context after SnapTrade, etc.)
app.post('/admin/refresh-user-snapshot/:userId', adminAuth, async (req: Request, res: Response) => {
  try {
    const userId = asString(req.params.userId);

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const { getPrismaClient } = await import('./prisma-client');
    const prisma = getPrismaClient();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('Admin: Refreshing financial snapshot for user:', userId, user.email);

    const { FinancialRevisionService } = await import('./services/financial-revision-service');
    const payload = await FinancialRevisionService.recompute(userId, { categorize: false });

    res.json({
      success: true,
      userId: user.id,
      email: user.email,
      computedAt: payload?.computedAt,
      accountCount: Array.isArray(payload?.accounts) ? payload.accounts.length : 0,
    });
  } catch (error) {
    console.error('Admin: Failed to refresh user financial snapshot:', error);

    if (error instanceof Error) {
      Sentry.captureException(error);
      res.status(500).json({ error: error.message });
    } else {
      Sentry.captureMessage('Unknown error in admin refresh-user-snapshot endpoint', 'error');
      res.status(500).json({ error: 'Failed to refresh financial snapshot' });
    }
  }
});

// Admin: Revoke user access (prevent login)
app.put('/admin/revoke-user-access/:userId', adminAuth, async (req: Request, res: Response) => {
  try {
    const userId = asString(req.params.userId);

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const { getPrismaClient } = await import('./prisma-client');
    const prisma = getPrismaClient();

    console.log('Admin: Revoking access for user:', userId);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isActive: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Deactivate user account
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false }
    });

    console.log('Admin: Successfully revoked access for user:', user.email);

    res.json({
      success: true,
      message: `Access revoked for user ${user.email}`,
      user: {
        id: user.id,
        email: user.email,
        isActive: false
      }
    });
  } catch (error) {
    console.error('Error revoking user access:', error);

    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in admin revoke user access endpoint', 'error');
    }

    res.status(500).json({ error: 'Failed to revoke user access' });
  }
});

// Admin: Restore user access (re-enable login)
app.put('/admin/restore-user-access/:userId', adminAuth, async (req: Request, res: Response) => {
  try {
    const userId = asString(req.params.userId);

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const { getPrismaClient } = await import('./prisma-client');
    const prisma = getPrismaClient();

    console.log('Admin: Restoring access for user:', userId);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isActive: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Reactivate user account
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: true }
    });

    console.log('Admin: Successfully restored access for user:', user.email);

    res.json({
      success: true,
      message: `Access restored for user ${user.email}`,
      user: {
        id: user.id,
        email: user.email,
        isActive: true
      }
    });
  } catch (error) {
    console.error('Error restoring user access:', error);

    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in admin restore user access endpoint', 'error');
    }

    res.status(500).json({ error: 'Failed to restore user access' });
  }
});

// Admin: Delete user account completely (including login/email)
app.delete('/admin/delete-user-account/:userId', adminAuth, async (req: Request, res: Response) => {
  try {
    const userId = asString(req.params.userId);

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const { getPrismaClient } = await import('./prisma-client');
    const prisma = getPrismaClient();

    console.log('Admin: Deleting account for user:', userId);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user data in the correct order (respecting foreign key constraints)
    // 1. Delete conversations (references users)
    await prisma.conversation.deleteMany({
      where: { userId }
    });

    // 2. Delete transactions (references accounts)
    await prisma.transaction.deleteMany({
      where: { account: { userId } }
    });

    // 3. Delete accounts (references users)
    await prisma.account.deleteMany({
      where: { userId }
    });

    // 4. Delete access tokens (references users)
    await prisma.accessToken.deleteMany({
      where: { userId }
    });

    // 5. Delete sync statuses (references users)
    await prisma.syncStatus.deleteMany({
      where: { userId }
    });

    // 6. Delete privacy settings (references users)
    await prisma.privacySettings.deleteMany({
      where: { userId }
    });

    // 7. Delete encrypted profile data first (references userProfile)
    await prisma.encrypted_profile_data.deleteMany({
      where: {
        profileHash: {
          in: await prisma.userProfile.findMany({
            where: { userId },
            select: { profileHash: true }
          }).then((profiles: any[]) => profiles.map((p: any) => p.profileHash))
        }
      }
    });

    // 8. Delete user profile (references users)
    await prisma.userProfile.deleteMany({
      where: { userId }
    });

    // 9. Delete encrypted user data (references users)
    await prisma.encryptedUserData.deleteMany({
      where: { userId }
    });

    // 10. Delete password reset tokens (references users)
    await prisma.passwordResetToken.deleteMany({
      where: { userId }
    });

    // 11. Delete email verification codes (references users)
    await prisma.emailVerificationCode.deleteMany({
      where: { userId }
    });

    // 12. Finally, delete the user themselves
    await prisma.user.delete({
      where: { id: userId }
    });

    console.log('Admin: Successfully deleted account for user:', user.email);

    res.json({
      success: true,
      message: `Account completely deleted for user ${user.email}`,
      deletedUser: {
        id: user.id,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Error deleting user account:', error);

    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in admin delete user account endpoint', 'error');
    }

    res.status(500).json({ error: 'Failed to delete user account' });
  }
});

// Register after every route so uncaught Express errors are reported consistently.
Sentry.setupExpressErrorHandler(app);

// Export app for testing
export { app };
// Force rebuild Mon Jul 28 20:28:57 PDT 2025
