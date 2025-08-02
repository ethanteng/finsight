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
import { isFeatureEnabled } from './config/features';
import authRoutes from './auth/routes';
import { optionalAuth } from './auth/middleware';

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

// Load environment variables from .env.local
config({ path: '.env.local' });

// Initialize Prisma client lazily to avoid import issues during ts-node startup
let prisma: PrismaClient | null = null;

export const getPrismaClient = () => {
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
app.get('/health/cron', (req: Request, res: Response) => {
  console.log('Cron health check requested:', {
    timestamp: new Date().toISOString(),
    userAgent: req.headers['user-agent']
  });
  
  // Check if cron jobs are running
  const cronJobs = cron.getTasks();
  const syncJob = Array.from(cronJobs.values()).find((job: any) => job.name === 'daily-sync');
  const marketContextJob = Array.from(cronJobs.values()).find((job: any) => job.name === 'market-context-refresh');
  
  res.json({
    status: 'OK',
    cronJobs: {
      dailySync: {
        running: !!syncJob,
        name: 'daily-sync'
      },
      marketContextRefresh: {
        running: !!marketContextJob,
        name: 'market-context-refresh'
      }
    },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});



// Apply optional auth middleware to all routes AFTER health endpoints
app.use(optionalAuth);

// Setup Plaid routes
setupPlaidRoutes(app);

// Setup Auth routes
app.use('/auth', authRoutes);

// OpenAI Q&A endpoint with tier-aware system
app.post('/ask', async (req: Request, res: Response) => {
  try {
    const { question, userTier = 'starter', isDemo = false } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    // Debug authentication
    console.log('Ask endpoint - headers:', req.headers);
    console.log('Ask endpoint - user:', req.user);
    console.log('Ask endpoint - isDemo:', isDemo);
    
    // Demo mode always works (no auth required)
    if (isDemo) {
      return handleDemoRequest(req, res);
    }
    
    // User mode requires auth when enabled
    if (isFeatureEnabled('USER_AUTH') && !req.user) {
      console.log('Ask endpoint - Authentication required, user not found');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    return handleUserRequest(req, res);
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// New tier-aware endpoint for enhanced context
app.post('/ask/tier-aware', async (req: Request, res: Response) => {
  try {
    const { question, isDemo = false } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    console.log('Tier-aware ask endpoint - user:', req.user);
    console.log('Tier-aware ask endpoint - isDemo:', isDemo);
    
    // Demo mode always works (no auth required)
    if (isDemo) {
      return handleTierAwareDemoRequest(req, res);
    }
    
    // User mode requires auth when enabled
    if (isFeatureEnabled('USER_AUTH') && !req.user) {
      console.log('Tier-aware ask endpoint - Authentication required, user not found');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    return handleTierAwareUserRequest(req, res);
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// Demo request handler (always available)
const handleDemoRequest = async (req: Request, res: Response) => {
  try {
    // Test database connection
    try {
      await getPrismaClient().$queryRaw`SELECT 1`;
      console.log('Database connection verified');
    } catch (dbError) {
      console.error('Database connection failed:', dbError);
      return res.status(500).json({ error: 'Database connection failed' });
    }
    
    const { question } = req.body;
    // Ensure question is a string
    const questionString = String(question);
    const sessionId = req.headers['x-session-id'] as string;
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required for demo mode' });
    }
    
    // Get or create demo session
    let demoSession = await getPrismaClient().demoSession.findUnique({
      where: { sessionId }
    });
    
    if (!demoSession) {
      try {
        demoSession = await getPrismaClient().demoSession.create({
          data: {
            sessionId,
            userAgent
          }
        });
        console.log('Demo session created successfully:', { 
          id: demoSession.id, 
          sessionId: demoSession.sessionId 
        });
        
        // Verify the session was actually stored
        const verifySession = await getPrismaClient().demoSession.findUnique({
          where: { id: demoSession.id }
        });
        
        if (!verifySession) {
          console.error('Demo session was not actually stored in database');
          return res.status(500).json({ error: 'Failed to create demo session' });
        } else {
          console.log('Demo session verified in database:', { 
            id: verifySession.id,
            sessionId: verifySession.sessionId
          });
        }
      } catch (sessionError: any) {
        // Handle unique constraint violation gracefully
        if (sessionError.code === 'P2002') {
          console.log('Demo session already exists, fetching existing session');
          demoSession = await getPrismaClient().demoSession.findUnique({
            where: { sessionId }
          });
        } else {
          console.error('Failed to create demo session:', sessionError);
          return res.status(500).json({ error: 'Failed to create demo session' });
        }
      }
    } else {
      console.log('Demo session found:', { 
        id: demoSession.id, 
        sessionId: demoSession.sessionId 
      });
    }
    
    // Ensure demoSession exists
    if (!demoSession) {
      return res.status(500).json({ error: 'Failed to create or find demo session' });
    }
    
    // Get recent conversation history for this demo session (last 5 Q&A pairs)
    const recentConversations = await getPrismaClient().demoConversation.findMany({
      where: { sessionId: demoSession.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    
    // Use environment variable for tier in demo mode
    const backendTier = process.env.TEST_USER_TIER || 'starter';
    
    // Always demo mode in this handler
    const marketContext = await dataOrchestrator.getMarketContext(backendTier as any, true); // true = demo mode
    
    const answer = await askOpenAI(questionString, recentConversations, backendTier as any, true, undefined);
    
    // Store the demo conversation with session association
    try {
      // Double-check that the demo session still exists before creating conversation
      const verifySession = await getPrismaClient().demoSession.findUnique({
        where: { id: demoSession.id }
      });
      
      if (!verifySession) {
        console.error('Demo session no longer exists, cannot store conversation');
        return res.status(500).json({ error: 'Demo session not found' });
      }
      
      const storedConversation = await getPrismaClient().demoConversation.create({
        data: {
          question: questionString,
          answer,
          sessionId: demoSession.id,
        },
      });
      console.log('Demo conversation stored successfully:', { 
        id: storedConversation.id, 
        sessionId: demoSession.id,
        questionLength: questionString.length 
      });
      
      // Verify the conversation was actually stored
      const verifyConversation = await getPrismaClient().demoConversation.findUnique({
        where: { id: storedConversation.id }
      });
      
      if (!verifyConversation) {
        console.error('Demo conversation was not actually stored in database');
      } else {
        console.log('Demo conversation verified in database:', { 
          id: verifyConversation.id,
          question: verifyConversation.question.substring(0, 50)
        });
      }
    } catch (storageError) {
      console.error('Failed to store demo conversation:', storageError);
      // Don't fail the request, just log the error
    }
    
    // Log demo interactions for analytics (disabled in test environment)
    if (process.env.NODE_ENV !== 'test') {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/log-demo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: questionString,
            answer,
            timestamp: new Date().toISOString(),
            sessionId,
            userAgent
          })
        });
      } catch (logError) {
        console.error('Failed to log demo interaction:', logError);
      }
    }
    
    res.json({ answer });
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  }
};

// User request handler (feature flagged)
const handleUserRequest = async (req: Request, res: Response) => {
  try {
    const { question } = req.body;
    
    // Get user from request (set by optionalAuth middleware)
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get recent conversation history for this user (last 5 Q&A pairs)
    const recentConversations = await getPrismaClient().conversation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    
    // Use user's tier
    const userTier = user.tier;
    
    // Get market context (will be tier-aware in Step 4)
    const marketContext = await dataOrchestrator.getMarketContext(userTier as any, false);
    
    console.log('Ask endpoint - calling askOpenAI with userId:', user.id);
    const answer = await askOpenAI(question, recentConversations, userTier as any, false, user.id);
    console.log('Ask endpoint - received answer from OpenAI');
    
    // Store the new Q&A pair with user association
    await getPrismaClient().conversation.create({
      data: {
        question,
        answer,
        userId: user.id,
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
};

// Tier-aware user request handler
const handleTierAwareUserRequest = async (req: Request, res: Response) => {
  try {
    const { question } = req.body;
    
    // Get user from request (set by optionalAuth middleware)
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get recent conversation history for this user (last 5 Q&A pairs)
    const recentConversations = await getPrismaClient().conversation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    
    // Use user's tier
    const userTier = user.tier;
    
    console.log('Tier-aware ask endpoint - calling askOpenAI with userId:', user.id, 'tier:', userTier);
    const answer = await askOpenAI(question, recentConversations, userTier as any, false, user.id);
    console.log('Tier-aware ask endpoint - received answer from OpenAI');
    
    // Store the new Q&A pair with user association
    await getPrismaClient().conversation.create({
      data: {
        question,
        answer,
        userId: user.id,
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
};

// Tier-aware demo request handler
const handleTierAwareDemoRequest = async (req: Request, res: Response) => {
  try {
    // Test database connection
    try {
      await getPrismaClient().$queryRaw`SELECT 1`;
      console.log('Database connection verified');
    } catch (dbError) {
      console.error('Database connection failed:', dbError);
      return res.status(500).json({ error: 'Database connection failed' });
    }
    
    const { question } = req.body;
    // Ensure question is a string
    const questionString = String(question);
    const sessionId = req.headers['x-session-id'] as string;
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required for demo mode' });
    }
    
    // Get or create demo session with better error handling
    let demoSession = await getPrismaClient().demoSession.findUnique({
      where: { sessionId }
    });
    
    if (!demoSession) {
      try {
        demoSession = await getPrismaClient().demoSession.create({
          data: {
            sessionId,
            userAgent
          }
        });
        console.log('Demo session created successfully:', { 
          id: demoSession.id, 
          sessionId: demoSession.sessionId 
        });
      } catch (sessionError: any) {
        // Handle unique constraint violation gracefully
        if (sessionError.code === 'P2002') {
          console.log('Demo session already exists, fetching existing session');
          demoSession = await getPrismaClient().demoSession.findUnique({
            where: { sessionId }
          });
          
          if (!demoSession) {
            console.error('Failed to find demo session after unique constraint violation');
            return res.status(500).json({ error: 'Failed to create or find demo session' });
          }
        } else {
          console.error('Failed to create demo session:', sessionError);
          return res.status(500).json({ error: 'Failed to create demo session' });
        }
      }
    } else {
      console.log('Demo session found:', { 
        id: demoSession.id, 
        sessionId: demoSession.sessionId 
      });
    }
    
    // Ensure demoSession exists
    if (!demoSession) {
      return res.status(500).json({ error: 'Failed to create or find demo session' });
    }
    
    // Get recent conversation history for this demo session (last 5 Q&A pairs)
    const recentConversations = await getPrismaClient().demoConversation.findMany({
      where: { sessionId: demoSession.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    
    // Use environment variable for tier in demo mode
    const backendTier = process.env.TEST_USER_TIER || 'starter';
    
    console.log('Tier-aware demo - calling askOpenAI with tier:', backendTier);
    const answer = await askOpenAI(questionString, recentConversations, backendTier as any, true, undefined);
    
    // Store the demo conversation with session association
    try {
      // Double-check that the session exists before creating conversation
      const verifySession = await getPrismaClient().demoSession.findUnique({
        where: { id: demoSession.id }
      });
      
      if (!verifySession) {
        console.error('Demo session not found when trying to create conversation');
        return res.status(500).json({ error: 'Demo session not found' });
      }
      
      const storedConversation = await getPrismaClient().demoConversation.create({
        data: {
          question: questionString,
          answer,
          sessionId: demoSession.id,
        },
      });
      console.log('Demo conversation stored successfully:', { 
        id: storedConversation.id, 
        sessionId: demoSession.id,
        questionLength: questionString.length 
      });
    } catch (conversationError: any) {
      console.error('Failed to store demo conversation:', conversationError);
      
      // Handle foreign key constraint violation
      if (conversationError.code === 'P2003') {
        console.error('Foreign key constraint violation - session may not exist');
        return res.status(500).json({ error: 'Demo session not found' });
      }
      
      return res.status(500).json({ error: 'Failed to store demo conversation' });
    }
    
    res.json({ answer });
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  }
};

// Get demo conversation history
app.get('/demo/conversations', async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers['x-session-id'] as string;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }
    
    const demoSession = await getPrismaClient().demoSession.findUnique({
      where: { sessionId },
      include: {
        conversations: {
          orderBy: { createdAt: 'desc' },
          take: 20 // Get last 20 conversations
        }
      }
    });
    
    if (!demoSession) {
      return res.json({ conversations: [] });
    }
    
    res.json({ 
      conversations: demoSession.conversations.map(conv => ({
        id: conv.id,
        question: conv.question,
        answer: conv.answer,
        timestamp: conv.createdAt.getTime()
      }))
    });
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

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
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// Get user conversation history
app.get('/conversations', async (req: Request, res: Response) => {
  try {
    // Require user authentication
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get user's conversations from the database
    const conversations = await getPrismaClient().conversation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50, // Get last 50 conversations
    });

    console.log(`Found ${conversations.length} conversations for user ${user.id}`);
    console.log('Conversations:', conversations.map(c => ({ id: c.id, question: c.question.substring(0, 50) })));

    res.json({ 
      conversations: conversations.map(conv => ({
        id: conv.id,
        question: conv.question,
        answer: conv.answer,
        timestamp: conv.createdAt.getTime()
      }))
    });
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// Demo logging endpoint
app.post('/log-demo', async (req: Request, res: Response) => {
  try {
    const { question, answer, timestamp, sessionId, userAgent } = req.body;
    
    // Log to console for immediate visibility
    console.log('📊 DEMO INTERACTION:', {
      timestamp,
      sessionId,
      question: question.substring(0, 100) + (question.length > 100 ? '...' : ''),
      answerLength: answer.length,
      userAgent: userAgent?.substring(0, 50) + (userAgent?.length > 50 ? '...' : '')
    });
    
    // Store in database for persistence
    await getPrismaClient().conversation.create({
      data: {
        question: `[DEMO-${sessionId}] ${question}`,
        answer: answer,
        // Store demo info in anonymized fields for tracking
        anonymizedQuestion: JSON.stringify({
          isDemo: true,
          sessionId,
          userAgent,
          timestamp,
          originalQuestion: question
        }),
        anonymizedAnswer: answer
      },
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error logging demo interaction:', err);
    res.status(500).json({ error: 'Failed to log demo interaction' });
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

// Test endpoint to get cache statistics
app.get('/test/cache-stats', async (req: Request, res: Response) => {
  try {
    const cacheStats = await dataOrchestrator.getCacheStats();
    res.json(cacheStats);
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

// Test endpoint for enhanced market context
app.get('/test/enhanced-market-context', async (req: Request, res: Response) => {
  try {
    const { tier = 'starter', isDemo = false } = req.query;
    const userTier = tier as string;
    
    console.log('Testing enhanced market context for tier:', userTier, 'isDemo:', isDemo);
    
    // Get enhanced market context
    const marketContextSummary = await dataOrchestrator.getMarketContextSummary(userTier as any, isDemo === 'true');
    
    // Get cache stats
    const cacheStats = await dataOrchestrator.getCacheStats();
    
    res.json({
      tier: userTier,
      isDemo: isDemo === 'true',
      marketContextSummary: marketContextSummary.substring(0, 1000) + (marketContextSummary.length > 1000 ? '...' : ''),
      contextLength: marketContextSummary.length,
      cacheStats,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// Test endpoint to force refresh market context
app.post('/test/refresh-market-context', async (req: Request, res: Response) => {
  try {
    const { tier = 'starter', isDemo = false } = req.body;
    const userTier = tier as string;
    
    console.log('Force refreshing market context for tier:', userTier, 'isDemo:', isDemo);
    
    // Force refresh market context
    await dataOrchestrator.refreshMarketContext(userTier as any, isDemo);
    
    // Get updated cache stats
    const cacheStats = await dataOrchestrator.getCacheStats();
    
    res.json({
      success: true,
      tier: userTier,
      isDemo,
      cacheStats,
      timestamp: new Date().toISOString()
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
    // Check if this is a demo request
    const isDemo = req.headers['x-demo-mode'] === 'true';
    
    if (isDemo) {
      // Return demo sync data for demo mode
      const { demoData } = await import('./demo-data');
      res.json({ 
        syncInfo: {
          lastSync: new Date().toISOString(),
          accountsSynced: demoData.accounts.length,
          transactionsSynced: demoData.transactions.length
        }
      });
      return;
    }

    const user = (req as any).user;
    const userId = user?.id;
    const syncInfo = await getLastSyncInfo(userId);
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
            // Check if this is a demo request
            const isDemo = req.headers['x-demo-mode'] === 'true';
            
            if (isDemo) {
              // Return demo sync data for demo mode
              const { demoData } = await import('./demo-data');
              res.json({ 
                success: true,
                accountsSynced: demoData.accounts.length,
                transactionsSynced: demoData.transactions.length,
                message: 'Demo data refreshed successfully'
              });
              return;
            }

            const user = (req as any).user;
            const userId = user?.id;
            const result = await syncAllAccounts(userId);
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
        // Check if this is a demo request
        const isDemo = req.headers['x-demo-mode'] === 'true';
        
        if (isDemo) {
          // Return demo data for demo mode
          const { demoData } = await import('./demo-data');
          
          // Count demo conversations from all demo sessions
          const demoConversations = await getPrismaClient().demoConversation.count();
          
          res.json({
            accounts: demoData.accounts.length,
            transactions: demoData.transactions.length,
            conversations: demoConversations,
            lastSync: await getLastSyncInfo() // Demo mode uses global sync status
          });
          return;
        }

        // Require user authentication for real users
        const user = req.user;
        if (!user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

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
          lastSync: await getLastSyncInfo(user.id)
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
        // user_id will be used when user system is implemented
        
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
      const startTime = Date.now();
      
      try {
        const result = await syncAllAccounts();
        const duration = Date.now() - startTime;
        
        if (result.success) {
          console.log(`✅ Daily sync completed successfully in ${duration}ms: ${result.accountsSynced} accounts, ${result.transactionsSynced} transactions synced`);
          
          // Log success metrics for monitoring
          console.log(`📊 Sync Metrics: duration=${duration}ms, accounts=${result.accountsSynced}, transactions=${result.transactionsSynced}`);
        } else {
          console.error(`❌ Daily sync failed after ${duration}ms:`, result.error);
          
          // Log failure for monitoring
          console.error(`📊 Sync Failure: duration=${duration}ms, error=${result.error}`);
          
          // TODO: Send alert to monitoring service (e.g., Sentry, LogRocket)
          // await sendAlert('Daily sync failed', { error: result.error, duration });
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ Error in daily sync job after ${duration}ms:`, error);
        
        // Log failure for monitoring
        console.error(`📊 Sync Error: duration=${duration}ms, error=${error}`);
        
        // TODO: Send alert to monitoring service
        // await sendAlert('Daily sync error', { error, duration });
      }
    }, {
      timezone: 'America/New_York',
      name: 'daily-sync'
    });
    
    console.log('Cron job scheduled: daily sync at 2 AM EST');

    // Set up cron job to refresh market context every hour
    cron.schedule('0 * * * *', async () => {
      console.log('🔄 Starting hourly market context refresh...');
      const startTime = Date.now();
      
      try {
        await dataOrchestrator.forceRefreshAllContext();
        const duration = Date.now() - startTime;
        
        console.log(`✅ Market context refresh completed successfully in ${duration}ms`);
        console.log(`📊 Market Context Metrics: duration=${duration}ms`);
        
        // Log cache stats for monitoring
        const cacheStats = await dataOrchestrator.getCacheStats();
        console.log(`📊 Cache Stats: marketContextCache.size=${cacheStats.marketContextCache.size}`);
        
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ Error in market context refresh after ${duration}ms:`, error);
        console.error(`📊 Market Context Error: duration=${duration}ms, error=${error}`);
      }
    }, {
      timezone: 'America/New_York',
      name: 'market-context-refresh'
    });
    
    console.log('Cron job scheduled: market context refresh every hour');
  });
}

// Export app for testing
export { app };
// Force rebuild Mon Jul 28 20:28:57 PDT 2025
