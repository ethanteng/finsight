import 'dotenv/config';
import { config } from 'dotenv';
import express, { Application, Request, Response } from 'express';
import { setupPlaidRoutes } from './plaid';
import { askOpenAI } from './openai';
import cors from 'cors';
import cron from 'node-cron';
import { syncAllAccounts, getLastSyncInfo } from './sync';
import { PrismaClient } from '@prisma/client';
import { dataOrchestrator } from './data/orchestrator';

// Load environment variables from .env.local
config({ path: '.env.local' });

// Initialize Prisma client lazily to avoid import issues during ts-node startup
let prisma: PrismaClient | null = null;

const getPrismaClient = () => {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
};

const app: Application = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors({
  origin: [
    'https://asklinc.com', // your Vercel frontend URL
    'https://www.asklinc.com', // www version
    'http://localhost:3001' // for localdev, optional
  ],
  credentials: true
}));

// Increase response size limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK' });
});

// Setup Plaid routes
setupPlaidRoutes(app);

// OpenAI Q&A endpoint
app.post('/ask', async (req: Request, res: Response) => {
  try {
    const { question, userTier = 'starter', isDemo = false } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    // Get recent conversation history (last 5 Q&A pairs)
    const recentConversations = await getPrismaClient().conversation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    
    // Map frontend tier to backend enum
    const tierMap: Record<string, string> = {
      'starter': 'starter',
      'standard': 'standard', 
      'premium': 'premium'
    };
    
    // Use request tier if provided, otherwise fall back to environment variable
    const effectiveTier = userTier || process.env.TEST_USER_TIER || 'starter';
    
    const backendTier = tierMap[effectiveTier] || 'starter';
    
    // If in demo mode, use demo data context
    let marketContext = null;
    if (isDemo) {
      // For demo mode, we'll use the data orchestrator with demo flag
      // The orchestrator will need to be updated to handle demo data
      marketContext = await dataOrchestrator.getMarketContext(backendTier as any, true); // true = demo mode
    }
    
    const answer = await askOpenAI(question, recentConversations, backendTier as any, isDemo);
    
    // Store the new Q&A pair (even in demo mode for consistency)
    await getPrismaClient().conversation.create({
      data: {
        question,
        answer,
      },
    });
    
    res.json({ answer });
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// Test endpoint for market data (development only)
app.get('/test/market-data/:tier', async (req: Request, res: Response) => {
  try {
    const { tier } = req.params;
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
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
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
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// Test endpoint for demo data
app.get('/test/demo-data', async (req: Request, res: Response) => {
  try {
    const { demoData } = await import('./demo-data');
    res.json({ 
      accounts: demoData.accounts.length,
      transactions: demoData.transactions.length,
      sampleAccount: demoData.accounts[0],
      sampleTransaction: demoData.transactions[0]
    });
  } catch (error) {
    console.error('Error in /test/demo-data endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test endpoint to invalidate cache
app.post('/test/invalidate-cache', async (req: Request, res: Response) => {
  try {
    const { pattern } = req.body;
    await dataOrchestrator.invalidateCache(pattern || 'economic_indicators');
    res.json({ message: `Cache invalidated for pattern: ${pattern || 'economic_indicators'}` });
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
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
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// Test endpoint to check Alpha Vantage API key
app.get('/test/alpha-vantage-api-key', async (req: Request, res: Response) => {
  try {
    const alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY;
    res.json({ 
      alphaVantageApiKey: alphaVantageApiKey ? `${alphaVantageApiKey.substring(0, 8)}...` : 'not set',
      alphaVantageApiKeyLength: alphaVantageApiKey ? alphaVantageApiKey.length : 0,
      isTestKey: alphaVantageApiKey === 'your_alpha_vantage_api_key'
    });
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// Get sync status endpoint
app.get('/sync/status', async (req: Request, res: Response) => {
  try {
    const syncInfo = await getLastSyncInfo();
    res.json({ syncInfo });
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

        // Manual sync endpoint for testing
        app.post('/sync/manual', async (req: Request, res: Response) => {
          try {
            const result = await syncAllAccounts();
            res.json(result);
          } catch (err) {
            if (err instanceof Error) {
              res.status(500).json({ error: err.message });
            } else {
              res.status(500).json({ error: 'Unknown error' });
            }
          }
        });

        // Fix transactions appearing under multiple accounts
        app.post('/sync/fix-transaction-accounts', async (req: Request, res: Response) => {
          try {
            // Get all transactions with their account details
            const allTransactions = await getPrismaClient().transaction.findMany({
              include: { account: true },
              orderBy: { date: 'desc' }
            });

            console.log(`Found ${allTransactions.length} total transactions in database`);

            // Group transactions by unique key
            const uniqueTransactions = new Map();
            const duplicatesToDelete: string[] = [];

            for (const transaction of allTransactions) {
              // Use a comprehensive key that includes all relevant fields
              const key = `${transaction.name}-${transaction.amount}-${transaction.date.toISOString().slice(0, 10)}`;
              
              if (uniqueTransactions.has(key)) {
                // This is a duplicate, mark for deletion
                console.log(`Duplicate found: ${transaction.name} ${transaction.amount} on ${transaction.date.toISOString().slice(0, 10)} from ${transaction.account.name}`);
                duplicatesToDelete.push(transaction.id);
              } else {
                uniqueTransactions.set(key, transaction);
                console.log(`Unique: ${transaction.name} ${transaction.amount} on ${transaction.date.toISOString().slice(0, 10)} from ${transaction.account.name}`);
              }
            }

            console.log(`Unique transactions: ${uniqueTransactions.size}`);
            console.log(`Duplicates to remove: ${duplicatesToDelete.length}`);

            // Delete duplicate transactions
            if (duplicatesToDelete.length > 0) {
              await getPrismaClient().transaction.deleteMany({
                where: { id: { in: duplicatesToDelete } }
              });
            }

            res.json({ 
              success: true, 
              duplicatesRemoved: duplicatesToDelete.length,
              uniqueTransactionsRemaining: uniqueTransactions.size,
              totalBefore: allTransactions.length
            });
          } catch (err) {
            if (err instanceof Error) {
              res.status(500).json({ error: err.message });
            } else {
              res.status(500).json({ error: 'Unknown error' });
            }
          }
        });

    // Privacy and data control endpoints
    app.get('/privacy/data', async (req: Request, res: Response) => {
      try {
        // Return what data we have about the user (anonymized)
        const accounts = await getPrismaClient().account.findMany();
        const transactions = await getPrismaClient().transaction.findMany();
        const conversations = await getPrismaClient().conversation.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10
        });

        res.json({
          accounts: accounts.length,
          transactions: transactions.length,
          conversations: conversations.length,
          lastSync: await getLastSyncInfo()
        });
      } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve data summary' });
      }
    });

    app.delete('/privacy/delete-all', async (req: Request, res: Response) => {
      try {
        // Delete all user data
        await getPrismaClient().conversation.deleteMany();
        await getPrismaClient().transaction.deleteMany();
        await getPrismaClient().account.deleteMany();
        await getPrismaClient().accessToken.deleteMany();
        await getPrismaClient().syncStatus.deleteMany();

        res.json({ success: true, message: 'All data deleted successfully' });
      } catch (err) {
        res.status(500).json({ error: 'Failed to delete data' });
      }
    });

    app.delete('/privacy/delete-all-data', async (req: Request, res: Response) => {
      try {
        const { user_id } = req.body;
        
        // Delete all user data
        await getPrismaClient().conversation.deleteMany();
        await getPrismaClient().transaction.deleteMany();
        await getPrismaClient().account.deleteMany();
        await getPrismaClient().accessToken.deleteMany();
        await getPrismaClient().syncStatus.deleteMany();

        res.json({ success: true, message: 'All data deleted successfully' });
      } catch (err) {
        res.status(500).json({ error: 'Failed to delete data' });
      }
    });

    app.post('/privacy/disconnect-accounts', async (req: Request, res: Response) => {
      try {
        // Remove all Plaid access tokens
        await getPrismaClient().accessToken.deleteMany();
        
        // Clear account and transaction data
        await getPrismaClient().transaction.deleteMany();
        await getPrismaClient().account.deleteMany();
        await getPrismaClient().syncStatus.deleteMany();

        res.json({ success: true, message: 'All accounts disconnected and data cleared' });
      } catch (err) {
        res.status(500).json({ error: 'Failed to disconnect accounts' });
      }
    });

const PORT = process.env.PORT || 3000;

// Only start the server if this file is run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    // Set up cron job to sync accounts and transactions daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
      console.log('Starting daily sync job...');
      try {
        const result = await syncAllAccounts();
        if (result.success) {
          console.log(`Daily sync completed: ${result.accountsSynced} accounts, ${result.transactionsSynced} transactions synced`);
        } else {
          console.error('Daily sync failed:', result.error);
        }
      } catch (error) {
        console.error('Error in daily sync job:', error);
      }
    }, {
      timezone: 'America/New_York'
    });
    
    console.log('Cron job scheduled: daily sync at 2 AM EST');
  });
}

// Export app for testing
export { app };
// Force rebuild Mon Jul 28 20:28:57 PDT 2025
