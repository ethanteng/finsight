import express from 'express';
import { setupPlaidRoutes } from '../../plaid';
import { optionalAuth } from '../../auth/middleware';
import stripeRoutes from '../../routes/stripe';

// Create a test app instance that doesn't depend on main app initialization
export function createTestApp() {
  const app = express();
  
  // Add middleware
  app.use(express.json());
  app.use(optionalAuth);
  
  // Add routes
  setupPlaidRoutes(app);
  app.use('/api/stripe', stripeRoutes);
  
  // Add market news routes for testing
  app.get('/market-news/context/:tier', async (req, res) => {
    try {
      const { MarketNewsManager } = await import('../../market-news/manager');
      const manager = new MarketNewsManager();
      const context = await manager.getMarketContext(req.params.tier as any);
      res.json({ contextText: context, tier: req.params.tier });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get market context' });
    }
  });
  
  app.put('/admin/market-news/context/:tier', async (req, res) => {
    res.status(401).json({ error: 'Authentication required' });
  });
  
  app.get('/admin/market-news/history/:tier', async (req, res) => {
    res.status(401).json({ error: 'Authentication required' });
  });
  
  // Add basic health endpoint for testing
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'test'
    });
  });
  
  // Add root endpoint
  app.get('/', (req, res) => {
    res.json({ 
      message: 'Finsight Test API is running',
      timestamp: new Date().toISOString(),
      environment: 'test'
    });
  });
  
  return app;
}

// Export a default test app instance
export const testApp = createTestApp();
