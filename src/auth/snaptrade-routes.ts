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

    const result = await snapTradeService.getLoginRedirect(userId, user.userSecret);
    
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
