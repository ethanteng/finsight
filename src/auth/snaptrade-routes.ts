import express from 'express';
import { snapTradeService } from '../snaptrade';
import { requireAuth } from './middleware';

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

export default router;

// Setup function to register SnapTrade routes
export const setupSnapTradeRoutes = (app: any) => {
  console.log('🔧 Setting up SnapTrade routes...');
  app.use('/snaptrade', router);
  console.log('✅ SnapTrade routes setup completed');
};
