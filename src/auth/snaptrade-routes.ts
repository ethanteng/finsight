import express from 'express';
import { snapTradeService } from '../snaptrade';
import { requireAuth } from './middleware';
import { getPrismaClient } from '../prisma-client';

const router = express.Router();

// GET /snaptrade/status - Get SnapTrade service status
router.get('/status', async (req, res) => {
  try {
    const isHealthy = await snapTradeService.healthCheck();
    res.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'snaptrade',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('SnapTrade status check failed:', error);
    res.status(500).json({
      error: 'Failed to check SnapTrade status',
      status: 'error'
    });
  }
});

// GET /snaptrade/config - Get SnapTrade configuration (for debugging)
router.get('/config', async (req, res) => {
  try {
    const snapTradeMode = process.env.SNAPTRADE_MODE || 'sandbox';
    const clientId = process.env.SNAPTRADE_CLIENT_ID;
    const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
    const clientIdProd = process.env.SNAPTRADE_CLIENT_ID_PROD;
    const consumerKeyProd = process.env.SNAPTRADE_CONSUMER_KEY_PROD;
    
    // Determine which credentials will be used
    const getSnapTradeCredentials = () => {
      if (snapTradeMode === 'production') {
        return {
          clientId: clientIdProd || clientId,
          consumerKey: consumerKeyProd || consumerKey,
          env: process.env.SNAPTRADE_ENV_PROD || 'production'
        };
      } else {
        return {
          clientId: clientId,
          consumerKey: consumerKey,
          env: 'sandbox'
        };
      }
    };
    
    const credentials = getSnapTradeCredentials();
    
    res.json({
      mode: snapTradeMode,
      environment: credentials.env,
      hasClientId: !!credentials.clientId,
      hasConsumerKey: !!credentials.consumerKey,
      credentialsConfigured: !!(credentials.clientId && credentials.consumerKey),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('SnapTrade config check failed:', error);
    res.status(500).json({
      error: 'Failed to check SnapTrade configuration',
      status: 'error'
    });
  }
});

// GET /snaptrade/status/user - Get user's SnapTrade status
router.get('/status/user', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const result = await snapTradeService.getUserStatus(userId);
    
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(404).json({
        error: result.error,
        status: 'not_initialized'
      });
    }
  } catch (error) {
    console.error('SnapTrade user status check failed:', error);
    res.status(500).json({
      error: 'Failed to get user SnapTrade status',
      status: 'error'
    });
  }
});

// POST /snaptrade/init - Initialize SnapTrade for user
router.post('/init', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    console.log('🔍 Initializing SnapTrade for user:', userId);
    
    const result = await snapTradeService.registerUser(userId);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'SnapTrade initialized successfully',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('SnapTrade initialization failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize SnapTrade'
    });
  }
});

// POST /snaptrade/login - Get login redirect URI
router.post('/login', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    console.log('🔍 Getting login redirect for user:', userId);
    
    // Get user from database to get userSecret
    const db = getPrismaClient();
    const user = await db.snapTradeUser.findUnique({
      where: { userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'SnapTrade user not found. Please initialize first.'
      });
    }

    // Reconnecting repairs the named authorization instead of adding a second
    // connection to the same brokerage. Read from the body so the reconnect
    // affordance can pass the authorization it is offering to fix; absent, this
    // stays the ordinary "connect an account" flow.
    const reconnectAuthorizationId = typeof req.body?.reconnect === 'string' && req.body.reconnect.trim()
      ? req.body.reconnect.trim()
      : undefined;

    // Confirm the authorization is actually this user's before handing it to
    // SnapTrade. The userId/userSecret pair almost certainly makes a foreign id
    // fail upstream, but "almost certainly" is not a control: this turns a
    // caller-supplied id into a checked one and returns a clear 400 instead of
    // a provider error. Only the reconnect path pays for the extra lookup.
    if (reconnectAuthorizationId) {
      const accountsResult = await snapTradeService.getUserAccounts(userId, user.userSecret);
      const owned = Array.isArray(accountsResult.data?.accounts)
        && accountsResult.data.accounts.some(
          (account: any) => account?.brokerageAuthorizationId === reconnectAuthorizationId
        );
      if (!owned) {
        console.warn(
          `SnapTrade login: refusing reconnect for an authorization not belonging to user ${userId}`
        );
        return res.status(400).json({
          success: false,
          error: 'Unknown brokerage connection for this user.'
        });
      }
    }

    const result = await snapTradeService.getLoginRedirect(
      userId,
      user.userSecret,
      reconnectAuthorizationId
    );
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Login redirect URI obtained',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('SnapTrade login redirect failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get login redirect'
    });
  }
});

// GET /snaptrade/accounts - Get user accounts
router.get('/accounts', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    console.log('🔍 Getting accounts for user:', userId);
    
    // Get user from database to get userSecret
    const db = getPrismaClient();
    const user = await db.snapTradeUser.findUnique({
      where: { userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'SnapTrade user not found. Please initialize first.'
      });
    }

    const result = await snapTradeService.getUserAccounts(userId, user.userSecret);
    
    if (result.success) {
      // ✅ Merge with database accounts to get custom names
      // Fetch accounts from database to get any custom names
      const dbAccounts = await db.account.findMany({
        where: {
          userId
        },
        select: {
          plaidAccountId: true,
          name: true
        }
      });
      
      // Filter to only SnapTrade accounts
      const snapTradeDbAccounts = dbAccounts.filter(acc => 
        acc.plaidAccountId && acc.plaidAccountId.startsWith('snaptrade-')
      );
      
      // Create a map of plaidAccountId -> custom name
      const customNamesMap = new Map<string, string>();
      snapTradeDbAccounts.forEach(acc => {
        customNamesMap.set(acc.plaidAccountId, acc.name);
      });
      
      // Update account names with custom names from database
      if (result.data?.accounts) {
        result.data.accounts = result.data.accounts.map((account: any) => {
          const accountId = account.id.startsWith('snaptrade-') ? account.id : `snaptrade-${account.id}`;
          const customName = customNamesMap.get(accountId);
          if (customName) {
            return {
              ...account,
              id: accountId,
              name: customName // Use custom name from database
            };
          }
          return {
            ...account,
            id: accountId
          };
        });
      }
      
      res.json({
        success: true,
        message: 'Accounts retrieved successfully',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('SnapTrade get accounts failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get accounts'
    });
  }
});

// GET /snaptrade/activities - Get user activities (transactions)
router.get('/activities', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    console.log('🔍 Getting activities for user:', userId);
    
    // Get user from database to get userSecret
    const db = getPrismaClient();
    const user = await db.snapTradeUser.findUnique({
      where: { userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'SnapTrade user not found. Please initialize first.'
      });
    }

    const result = await snapTradeService.getUserActivities(userId, user.userSecret);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Activities retrieved successfully',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('SnapTrade get activities failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get activities'
    });
  }
});

// GET /snaptrade/holdings - Get user holdings
router.get('/holdings', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    console.log('🔍 Getting holdings for user:', userId);
    
    // Get user from database to get userSecret
    const db = getPrismaClient();
    const user = await db.snapTradeUser.findUnique({
      where: { userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'SnapTrade user not found. Please initialize first.'
      });
    }

    const result = await snapTradeService.getUserHoldings(userId, user.userSecret);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Holdings retrieved successfully',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('SnapTrade get holdings failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get holdings'
    });
  }
});

// DELETE /snaptrade/delete - Delete SnapTrade user
router.delete('/delete', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    console.log('🔍 Deleting SnapTrade user:', userId);
    
    const result = await snapTradeService.deleteUser(userId);
    
    if (result.success) {
      // Ask Linc reads FinancialSummarySnapshot; refresh so removed SnapTrade accounts drop out of GPT context
      try {
        const { FinancialRevisionService } = await import('../services/financial-revision-service');
        FinancialRevisionService.schedule(userId, {
          categorize: false,
          history: { kind: 'material', reason: 'snaptrade-account-deleted' },
        }, 'SnapTrade delete');
      } catch {
        // non-fatal
      }
      res.json({
        success: true,
        message: 'SnapTrade user deleted successfully',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('SnapTrade delete user failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete SnapTrade user'
    });
  }
});

export default router;

// Setup function to register SnapTrade routes
export const setupSnapTradeRoutes = (app: any) => {
  console.log('🔧 Setting up SnapTrade routes...');
  app.use('/snaptrade', router);
  console.log('✅ SnapTrade routes setup completed');
};
