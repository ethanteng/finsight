import 'dotenv/config';
import { config } from 'dotenv';
import express, { Application, Request, Response } from 'express';
import { setupPlaidRoutes } from './plaid';
import { askOpenAI, askOpenAIWithEnhancedContext } from './openai';
import cors from 'cors';
import cron from 'node-cron';
// Removed syncAllAccounts import - keeping transactions real-time only
import { PrismaClient } from '@prisma/client';
import { dataOrchestrator } from './data/orchestrator';
import { isFeatureEnabled } from './config/features';
import authRoutes from './auth/routes';
import { optionalAuth, requireAuth, adminAuth } from './auth/middleware';
import { UserTier } from './data/types';

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

import { getPrismaClient } from './prisma-client';

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

// New endpoint for AI responses with real data display
// This implements a dual-data system:
// 1. AI receives tokenized/anonymized data for privacy
// 2. User sees real data for usability
// 3. Responses are converted back to user-friendly format
app.post('/ask/display-real', async (req: Request, res: Response) => {
  try {
    const { question, isDemo = false, sessionId } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    console.log('Ask endpoint called with:', { question, isDemo, sessionId });

    // Get user info for tier-aware responses
    let userTier = UserTier.STARTER;
    let userId: string | undefined;

    if (!isDemo) {
      // Extract user from token for authenticated requests
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const { verifyToken } = await import('./auth/utils');
        const token = authHeader.replace('Bearer ', '');
        const payload = verifyToken(token);
        if (payload) {
          userId = payload.userId;
          userTier = payload.tier as UserTier || UserTier.STARTER;
          console.log('Authenticated user:', { userId, userTier });
        }
      }
    } else {
      // For demo mode, use environment variable for tier
      const demoTier = process.env.TEST_USER_TIER || 'premium';
      userTier = demoTier as UserTier;
      console.log('Demo mode - using tier from environment:', { demoTier, userTier });
    }

    // Get AI response using enhanced context with RAG
    const aiResponse = await askOpenAIWithEnhancedContext(question, [], userTier, isDemo, userId);

    // For demo mode, use the AI response directly (no tokenization needed for fake data)
    if (isDemo) {
      console.log('Demo mode: using AI response directly (no tokenization needed for fake data)');
      const displayResponse = aiResponse;
      
      // Save conversation for demo mode
      if (isDemo && sessionId) {
        console.log('Attempting to save demo conversation for sessionId:', sessionId);
        console.log('isDemo:', isDemo, 'sessionId:', sessionId);
        try {
          const { getPrismaClient } = await import('./prisma-client');
          const prisma = getPrismaClient();
          
          // Get or create demo session
          let demoSession = await prisma.demoSession.findUnique({
            where: { sessionId }
          });
          
          if (!demoSession) {
            console.log('Creating new demo session for sessionId:', sessionId);
            demoSession = await prisma.demoSession.create({
              data: {
                sessionId,
                userAgent: req.headers['user-agent'] || 'unknown'
              }
            });
            console.log('Demo session created:', demoSession.id);
          } else {
            console.log('Found existing demo session:', demoSession.id);
          }
          
          // Store the demo conversation with session association
          const conversation = await prisma.demoConversation.create({
            data: {
              question,
              answer: displayResponse,
              sessionId: demoSession.id,
            }
          });
          console.log('Demo conversation saved successfully:', conversation.id);
          
          // Verify the conversation was actually stored
          const verifyConversation = await prisma.demoConversation.findUnique({
            where: { id: conversation.id }
          });
          
          if (verifyConversation) {
            console.log('Demo conversation verified in database:', verifyConversation.id);
          } else {
            console.error('Demo conversation was not actually stored in database');
          }
        } catch (error) {
          console.error('Error saving demo conversation:', error);
        }
      } else {
        console.log('Not saving demo conversation - isDemo:', isDemo, 'sessionId:', sessionId);
      }
      
      return res.json({ answer: displayResponse });
    }

    // For production, convert AI response back to user-friendly format
    console.log('Production mode: converting AI response to user-friendly format');
    const { convertResponseToUserFriendly } = await import('./privacy');
    const displayResponse = convertResponseToUserFriendly(aiResponse);
    
    console.log('Dual-data system: AI received tokenized data, user sees real data');



    // Save conversation for authenticated users
    if (!isDemo && userId) {
      try {
        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();
        
        await prisma.conversation.create({
          data: {
            userId,
            question,
            answer: displayResponse,
            createdAt: new Date()
          }
        });
        console.log('Conversation saved for user:', userId);
      } catch (error) {
        console.error('Error saving conversation:', error);
      }
    }

    res.json({ answer: displayResponse });
  } catch (error) {
    console.error('Error in ask endpoint:', error);
    res.status(500).json({ error: 'Failed to process question' });
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
    
    // Use userTier from request body, fallback to environment variable
    const { userTier = process.env.TEST_USER_TIER || 'starter' } = req.body;
    const backendTier = userTier;
    
    // Always demo mode in this handler
    const marketContext = await dataOrchestrator.getMarketContext(backendTier as any, true); // true = demo mode
    
    // Include demo profile in the AI prompt
    const { demoData } = await import('./demo-data');
    const demoProfile = demoData.profile?.profileText || 'Demo profile not available';
    
    const answer = await askOpenAIWithEnhancedContext(questionString, recentConversations, backendTier as any, true, undefined, undefined, demoProfile);
    
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
      // In test environment, this might be due to cleanup running concurrently
      if (process.env.NODE_ENV === 'test') {
        // Check if it's a foreign key constraint violation (session was deleted)
        if (storageError && typeof storageError === 'object' && 'code' in storageError) {
          const error = storageError as any;
          if (error.code === 'P2003' && error.meta?.constraint === 'DemoConversation_sessionId_fkey') {
            console.log('Demo conversation storage failed - session was deleted during test cleanup');
          } else {
            console.log('Demo conversation storage failed in test environment - likely due to concurrent cleanup');
          }
        } else {
          console.log('Demo conversation storage failed in test environment - likely due to concurrent cleanup');
        }
      }
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
    
    console.log('Ask endpoint - calling askOpenAIWithEnhancedContext with userId:', user.id);
    const answer = await askOpenAIWithEnhancedContext(question, recentConversations, userTier as any, false, user.id);
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
    
    console.log('Tier-aware ask endpoint - calling askOpenAIWithEnhancedContext with userId:', user.id, 'tier:', userTier);
    const answer = await askOpenAIWithEnhancedContext(question, recentConversations, userTier as any, false, user.id);
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
    
    // Use userTier from request body, fallback to environment variable
    const { userTier = process.env.TEST_USER_TIER || 'premium' } = req.body;
    const backendTier = userTier;
    
    console.log('Tier-aware demo - Environment check:', {
      TEST_USER_TIER: process.env.TEST_USER_TIER,
      backendTier,
      nodeEnv: process.env.NODE_ENV
    });
    
    // Include demo profile in the AI prompt
    const { demoData } = await import('./demo-data');
    const demoProfile = demoData.profile?.profileText || 'Demo profile not available';
    
    console.log('Tier-aware demo - calling askOpenAIWithEnhancedContext with tier:', backendTier);
    const answer = await askOpenAIWithEnhancedContext(questionString, recentConversations, backendTier as any, true, undefined, undefined, demoProfile);
    
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

    // Sync info endpoint removed - transactions are now real-time only
    res.json({ 
      syncInfo: {
        lastSync: null,
        accountsSynced: 0,
        transactionsSynced: 0
      }
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
            lastSync: null // Sync info removed - transactions are now real-time only
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
          lastSync: null // Sync info removed - transactions are now real-time only
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

    app.delete('/privacy/delete-all-data', requireAuth, async (req: Request, res: Response) => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Delete only the authenticated user's data
        await getPrismaClient().conversation.deleteMany({
          where: { userId }
        });
        await getPrismaClient().transaction.deleteMany({
          where: { account: { userId } }
        });
        await getPrismaClient().account.deleteMany({
          where: { userId }
        });
        await getPrismaClient().accessToken.deleteMany({
          where: { userId }
        });
        await getPrismaClient().syncStatus.deleteMany({
          where: { userId }
        });
        await getPrismaClient().userProfile.deleteMany({
          where: { userId }
        });

        res.json({ success: true, message: 'All data deleted successfully' });
      } catch (err) {
        res.status(500).json({ error: 'Failed to delete data' });
      }
    });

    app.post('/privacy/disconnect-accounts', requireAuth, async (req: Request, res: Response) => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Remove only the authenticated user's Plaid access tokens
        await getPrismaClient().accessToken.deleteMany({
          where: { userId }
        });
        
        // Clear only the authenticated user's account and transaction data
        await getPrismaClient().transaction.deleteMany({
          where: { account: { userId } }
        });
        await getPrismaClient().account.deleteMany({
          where: { userId }
        });
        await getPrismaClient().syncStatus.deleteMany({
          where: { userId }
        });

        res.json({ success: true, message: 'All accounts disconnected and data cleared' });
      } catch (err) {
        res.status(500).json({ error: 'Failed to disconnect accounts' });
      }
    });

    // Admin endpoints for demo data analysis
    app.get('/admin/demo-sessions', adminAuth, async (req: Request, res: Response) => {
      try {
        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();
        
        console.log('Admin: Fetching demo sessions...');
        
        // Get all demo sessions with conversation counts and stats
        const sessions = await prisma.demoSession.findMany({
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

        console.log('Admin: Found sessions:', sessions.length);

        const sessionStats = sessions.map(session => {
          const conversations = session.conversations;
          const firstConversation = conversations[0];
          const lastConversation = conversations[conversations.length - 1];
          
          return {
            sessionId: session.sessionId,
            conversationCount: session._count.conversations,
            firstQuestion: firstConversation?.question || 'No questions yet',
            lastActivity: lastConversation?.createdAt || session.createdAt,
            userAgent: session.userAgent
          };
        });

        console.log('Admin: Returning session stats:', sessionStats.length);
        res.json({ sessions: sessionStats });
      } catch (error) {
        console.error('Error fetching demo sessions:', error);
        res.status(500).json({ error: 'Failed to fetch demo sessions' });
      }
    });

    app.get('/admin/demo-conversations', adminAuth, async (req: Request, res: Response) => {
      try {
        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();
        
        console.log('Admin: Fetching demo conversations...');
        
        // Get all demo conversations with session info
        const conversations = await prisma.demoConversation.findMany({
          include: {
            session: true
          },
          orderBy: { createdAt: 'desc' }
        });

        console.log('Admin: Found conversations:', conversations.length);
        res.json({ conversations });
      } catch (error) {
        console.error('Error fetching demo conversations:', error);
        res.status(500).json({ error: 'Failed to fetch demo conversations' });
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

        const userStats = users.map(user => {
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
        res.status(500).json({ error: 'Failed to fetch production sessions' });
      }
    });

    app.get('/admin/production-conversations', adminAuth, async (req: Request, res: Response) => {
      try {
        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();
        
        console.log('Admin: Fetching production conversations...');
        
        // Get all production conversations with user info
        const conversations = await prisma.conversation.findMany({
          include: {
            user: true
          },
          orderBy: { createdAt: 'desc' }
        });

        console.log('Admin: Found conversations:', conversations.length);
        res.json({ conversations });
      } catch (error) {
        console.error('Error fetching production conversations:', error);
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
            createdAt: true,
            lastLoginAt: true,
            _count: {
              select: { conversations: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        });

        console.log('Admin: Found users:', users.length);
        res.json({ users });
      } catch (error) {
        console.error('Error fetching production users:', error);
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
        res.status(500).json({ error: 'Failed to update user tier' });
      }
    });

    // Test database connection
    app.get('/test-db', async (req: Request, res: Response) => {
      try {
        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();
        
        // Test basic database connection
        await prisma.$queryRaw`SELECT 1`;
        
        // Test demo session creation
        const testSession = await prisma.demoSession.create({
          data: {
            sessionId: 'test-db-session',
            userAgent: 'test'
          }
        });
        
        // Test demo conversation creation
        const testConversation = await prisma.demoConversation.create({
          data: {
            question: 'Test question',
            answer: 'Test answer',
            sessionId: testSession.id
          }
        });
        
        // Clean up test data
        await prisma.demoConversation.delete({
          where: { id: testConversation.id }
        });
        await prisma.demoSession.delete({
          where: { id: testSession.id }
        });
        
        res.json({ 
          status: 'OK', 
          message: 'Database connection and demo storage working correctly',
          sessionId: testSession.id,
          conversationId: testConversation.id
        });
      } catch (error) {
        console.error('Database test failed:', error);
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
    const profileText = await profileManager.getOrCreateProfile(req.user!.id);
    
    res.json({ profile: { profileText } });
  } catch (error) {
    console.error('Failed to fetch profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.put('/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const { profileText } = req.body;
    
    if (typeof profileText !== 'string') {
      return res.status(400).json({ error: 'profileText must be a string' });
    }
    
    const { ProfileManager } = await import('./profile/manager');
    const profileManager = new ProfileManager();
    await profileManager.updateProfile(req.user!.id, profileText);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Test endpoint for RAG search functionality
app.get('/test/search-context', async (req: Request, res: Response) => {
  try {
    const { query, tier = 'standard', isDemo = 'false' } = req.query;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const userTier = tier as UserTier;
    const isDemoMode = isDemo === 'true';

    console.log('Search Context Test:', { query, tier: userTier, isDemo: isDemoMode });

    const searchContext = await dataOrchestrator.getSearchContext(query, userTier, isDemoMode);

    res.json({
      query,
      tier: userTier,
      isDemo: isDemoMode,
      searchContext,
      cacheStats: await dataOrchestrator.getCacheStats()
    });
  } catch (error) {
    console.error('Search context test error:', error);
    res.status(500).json({ error: 'Failed to get search context' });
  }
});

// Market News Context API Endpoints

// Get current market context for a tier
app.get('/market-news/context/:tier', async (req: Request, res: Response) => {
  try {
    const { tier } = req.params;
    const { MarketNewsManager } = await import('./market-news/manager');
    const manager = new MarketNewsManager();
    const contextText = await manager.getMarketContext(tier as UserTier);
    
    // Get the full context object from database
    const contextRecord = await manager.prisma.marketNewsContext.findFirst({
      where: {
        availableTiers: { has: tier }
      },
      orderBy: { lastUpdate: 'desc' }
    });
    
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
    res.status(500).json({ error: 'Failed to fetch market context' });
  }
});

// Admin: Update market context manually
app.put('/admin/market-news/context/:tier', adminAuth, async (req: Request, res: Response) => {
  try {
    const { tier } = req.params;
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
    res.status(500).json({ error: 'Failed to fetch market context history' });
  }
});

// Admin: Force refresh market context
app.post('/admin/market-news/refresh/:tier', adminAuth, async (req: Request, res: Response) => {
  try {
    const { tier } = req.params;
    
    const { MarketNewsManager } = await import('./market-news/manager');
    const manager = new MarketNewsManager();
    await manager.updateMarketContext(tier as UserTier);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error refreshing market context:', error);
    res.status(500).json({ error: 'Failed to refresh market context' });
  }
});

const PORT = process.env.PORT || 3000;

// Only start the server if this file is run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    // Note: Removed daily sync cron job - keeping transactions real-time only for privacy
    console.log('ℹ️  Daily sync job removed - transactions are now real-time only');

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
    
    // Set up cron job to refresh market news context every 4 hours (reduced from 2 hours)
    cron.schedule('0 */4 * * *', async () => {
      console.log('🔄 Starting market news context refresh...');
      
      try {
        const { MarketNewsManager } = await import('./market-news/manager');
        const manager = new MarketNewsManager();
        
        // Update for all tiers (including Starter for future flexibility)
        // Note: Starter tier currently returns empty context, but this allows for future changes
        await Promise.all([
          manager.updateMarketContext(UserTier.STARTER),
          manager.updateMarketContext(UserTier.STANDARD),
          manager.updateMarketContext(UserTier.PREMIUM)
        ]);
        
        console.log('✅ Market news context refresh completed');
      } catch (error) {
        console.error('❌ Error in market news context refresh:', error);
      }
    }, {
      timezone: 'America/New_York',
      name: 'market-news-refresh'
    });
    
    console.log('Cron job scheduled: market context refresh every hour');
    console.log('Cron job scheduled: market news context refresh every 4 hours');
  });
}

// Export app for testing
export { app };
// Force rebuild Mon Jul 28 20:28:57 PDT 2025
