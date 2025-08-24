import 'dotenv/config';
import { config } from 'dotenv';
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import cron from 'node-cron';
// Removed syncAllAccounts import - keeping transactions real-time only
import { PrismaClient } from '@prisma/client';
import { dataOrchestrator } from './data/orchestrator';
import { isFeatureEnabled } from './config/features';
import authRoutes from './auth/routes';
import stripeRoutes from './routes/stripe';
import { optionalAuth, requireAuth, adminAuth } from './auth/middleware';
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

// Load environment variables from .env.local (for local development)
config({ path: '.env.local' });

// DEBUG: Log the actual DATABASE_URL being used
console.log('🔍 DEBUG - DATABASE_URL:', process.env.DATABASE_URL);
console.log('🔍 DEBUG - NODE_ENV:', process.env.NODE_ENV);

// Now import Plaid after environment variables are loaded
import { setupPlaidRoutes } from './plaid';
import { askOpenAI, askOpenAIWithEnhancedContext } from './openai';

import { getPrismaClient } from './prisma-client';

const app: Application = express();

// Initialize Sentry for backend monitoring
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: 1.0, // Capture 100% of transactions for now
  enableLogs: true,
});

// CORS setup
app.use(cors({
  origin: [
    'https://asklinc.com', // your Vercel frontend URL
    'https://www.asklinc.com', // www version
    'http://localhost:3001' // for localdev, optional
  ],
  credentials: true
}));

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
app.get('/health/cron', (req: Request, res: Response) => {
  console.log('Cron health check requested:', {
    timestamp: new Date().toISOString(),
    userAgent: req.headers['user-agent']
  });
  
  // Check if cron jobs are running
  const cronJobs = cron.getTasks();
  const syncJob = Array.from(cronJobs.values()).find((job: any) => job.name === 'daily-sync');
  const marketContextJob = Array.from(cronJobs.values()).find((job: any) => job.name === 'market-context-refresh');
  const mailerLiteJob = Array.from(cronJobs.values()).find((job: any) => job.name === 'mailerlite-sync');
  
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
      },
      mailerLiteSync: {
        running: !!mailerLiteJob,
        name: 'mailerlite-sync'
      }
    },
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

// Setup Stripe routes (webhook route already registered above)
app.use('/api/stripe', stripeRoutes);

// OpenAI Q&A endpoint with tier-aware system
app.post('/ask', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
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
          // Create Sentry performance span for AI request and handle demo request within it
          return Sentry.startSpan({
            op: 'ai.request',
            name: 'AI Financial Advice Request - Demo Mode',
          }, async (span: any) => {
            // Set span attributes for detailed monitoring and filtering
            span.setAttribute('ai.question_length', question.length);
            span.setAttribute('ai.mode', 'demo');
            span.setAttribute('ai.user_tier', userTier);
            span.setAttribute('ai.endpoint', '/ask');
            
            // Keep console logging for immediate visibility
            console.log(`📊 AI Response Time - Demo Mode: ${Date.now() - startTime}ms | Question Length: ${question.length} | User Tier: ${userTier}`);
            
            // Handle demo request within the span context
            await handleDemoRequest(req, res);
            
            // Set final response time
            span.setAttribute('ai.response_time_ms', Date.now() - startTime);
          });
        }
    
    // User mode requires auth when enabled
    if (isFeatureEnabled('USER_AUTH') && !req.user) {
      console.log('Ask endpoint - Authentication required, user not found');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Create Sentry performance span for AI request and handle user request within it
    return Sentry.startSpan({
      op: 'ai.request',
      name: 'AI Financial Advice Request - User Mode',
    }, async (span: any) => {
      // Set span attributes for detailed monitoring and filtering
      span.setAttribute('ai.question_length', question.length);
      span.setAttribute('ai.mode', 'production');
      span.setAttribute('ai.user_tier', userTier);
      span.setAttribute('ai.endpoint', '/ask');
      span.setAttribute('ai.user_id', req.user?.id || 'unknown');
      
      // Keep console logging for immediate visibility
      console.log(`📊 AI Response Time - User Mode: ${Date.now() - startTime}ms | Question Length: ${question.length} | User Tier: ${userTier} | User ID: ${req.user?.id}`);
      
      // Handle user request within the span context
      await handleUserRequest(req, res);
      
      // Set final response time
      span.setAttribute('ai.response_time_ms', Date.now() - startTime);
    });
    
  } catch (err) {
    const totalTime = Date.now() - startTime;
    
    // Create Sentry performance span for AI request error
    Sentry.startSpan({
      op: 'ai.request',
      name: 'AI Financial Advice Request - Error',
    }, (span: any) => {
      // Set span attributes for detailed monitoring and filtering
      span.setAttribute('ai.question_length', req.body?.question?.length || 0);
      span.setAttribute('ai.response_time_ms', totalTime);
      span.setAttribute('ai.mode', req.body?.isDemo ? 'demo' : 'production');
      span.setAttribute('ai.user_tier', req.body?.userTier || 'unknown');
      span.setAttribute('ai.endpoint', '/ask');
      span.setAttribute('ai.error', err instanceof Error ? err.message : 'Unknown error');
      span.setAttribute('ai.status', 'error');
    });
    
    // Log AI response time for error cases
    console.error(`📊 AI Response Time - Error: ${totalTime}ms | Question Length: ${req.body?.question?.length || 0} | Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    
    // Add response time to response headers even for errors
    res.set('X-AI-Response-Time', totalTime.toString());
    res.set('X-AI-Mode', 'error');
    
    if (err instanceof Error) {
      // Capture error in Sentry
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      // Capture unknown error in Sentry
      Sentry.captureMessage('Unknown error in AI endpoint', 'error');
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});

// New tier-aware endpoint for enhanced context
app.post('/ask/tier-aware', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { question, isDemo = false } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    console.log('Tier-aware ask endpoint - user:', req.user);
    console.log('Tier-aware ask endpoint - isDemo:', isDemo);
    
            // Demo mode always works (no auth required)
        if (isDemo) {
          // Create Sentry performance span for AI request and handle demo request within it
          return Sentry.startSpan({
            op: 'ai.request',
            name: 'AI Financial Advice Request - Tier-Aware Demo',
          }, async (span: any) => {
            // Set span attributes for detailed monitoring and filtering
            span.setAttribute('ai.question_length', question.length);
            span.setAttribute('ai.mode', 'demo');
            span.setAttribute('ai.endpoint', '/ask/tier-aware');
            
            // Keep console logging for immediate visibility
            console.log(`📊 AI Response Time - Tier-Aware Demo: ${Date.now() - startTime}ms | Question Length: ${question.length}`);
            
            // Handle demo request within the span context
            await handleTierAwareDemoRequest(req, res);
            
            // Set final response time
            span.setAttribute('ai.response_time_ms', Date.now() - startTime);
          });
        }
    
    // User mode requires auth when enabled
    if (isFeatureEnabled('USER_AUTH') && !req.user) {
      console.log('Tier-aware ask endpoint - Authentication required, user not found');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
        // Create Sentry performance span for AI request and handle user request within it
        return Sentry.startSpan({
          op: 'ai.request',
          name: 'AI Financial Advice Request - Tier-Aware User',
        }, async (span: any) => {
          // Set span attributes for detailed monitoring and filtering
          span.setAttribute('ai.question_length', question.length);
          span.setAttribute('ai.mode', 'production');
          span.setAttribute('ai.endpoint', '/ask/tier-aware');
          span.setAttribute('ai.user_id', req.user?.id || 'unknown');
          
          // Keep console logging for immediate visibility
          console.log(`📊 AI Response Time - Tier-Aware User: ${Date.now() - startTime}ms | Question Length: ${question.length} | User ID: ${req.user?.id}`);
          
          // Handle user request within the span context
          await handleTierAwareUserRequest(req, res);
          
          // Set final response time
          span.setAttribute('ai.response_time_ms', Date.now() - startTime);
        });
    
  } catch (err) {
    const totalTime = Date.now() - startTime;
    
    // Create Sentry performance span for AI request error
    Sentry.startSpan({
      op: 'ai.request',
      name: 'AI Financial Advice Request - Tier-Aware Error',
    }, (span: any) => {
      // Set span attributes for detailed monitoring and filtering
      span.setAttribute('ai.question_length', req.body?.question?.length || 0);
      span.setAttribute('ai.response_time_ms', totalTime);
      span.setAttribute('ai.mode', req.body?.isDemo ? 'demo' : 'production');
      span.setAttribute('ai.endpoint', '/ask/tier-aware');
      span.setAttribute('ai.error', err instanceof Error ? err.message : 'Unknown error');
      span.setAttribute('ai.status', 'error');
    });
    
    // Log AI response time for error cases
    console.error(`📊 AI Response Time - Tier-Aware Error: ${totalTime}ms | Question Length: ${req.body?.question?.length || 0} | Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    
    // Add response time to response headers even for errors
    res.set('X-AI-Response-Time', totalTime.toString());
    res.set('X-AI-Mode', 'tier-aware-error');
    
    if (err instanceof Error) {
      // Capture error in Sentry
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      // Capture unknown error in Sentry
      Sentry.captureMessage('Unknown error in tier-aware AI endpoint', 'error');
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
  const startTime = Date.now();
  
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

    // Create Sentry performance span for AI request BEFORE processing
    const totalTime = Date.now() - startTime;
    Sentry.startSpan({
      op: 'ai.request',
      name: isDemo ? 'AI Financial Advice Request - Display Real Demo' : 'AI Financial Advice Request - Display Real Production',
    }, async (span: any) => {
      // Set span attributes for detailed monitoring and filtering
      span.setAttribute('ai.question_length', question.length);
      span.setAttribute('ai.mode', isDemo ? 'demo' : 'production');
      span.setAttribute('ai.endpoint', '/ask/display-real');
      span.setAttribute('ai.user_tier', userTier);
      if (!isDemo && userId) {
        span.setAttribute('ai.user_id', userId);
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
        
        // Set response time after processing completes
        span.setAttribute('ai.response_time_ms', Date.now() - startTime);
        
        // Keep console logging for immediate visibility
        console.log(`📊 AI Response Time - Display Real Demo: ${Date.now() - startTime}ms | Question Length: ${question.length} | User Tier: ${userTier}`);
        
        return res.json({ 
          answer: displayResponse,
          conversationId: null
        });
      }

      // For production, convert AI response back to user-friendly format
      console.log('Production mode: converting AI response to user-friendly format');
      const { convertResponseToUserFriendly } = await import('./privacy');
      
      // ✅ DEBUG: Log the AI response before conversion
      console.log('DEBUG: AI response before conversion:', aiResponse.substring(0, 500));
      
      // ✅ DEBUG: Check if July transactions are in the response
      const julyTransactions = aiResponse.match(/July.*Transactions?/g);
      const julyTransactionLines = aiResponse.match(/- \*\*.*\*\*: \$.*/g);
      console.log('DEBUG: July transaction patterns found:', {
        julyHeader: julyTransactions,
        julyTransactionLines: julyTransactionLines?.slice(0, 5)
      });
      
      const displayResponse = convertResponseToUserFriendly(aiResponse);
      
      // ✅ DEBUG: Log the converted response
      console.log('DEBUG: Response after conversion:', displayResponse.substring(0, 500));
      
      console.log('Dual-data system: AI received tokenized data, user sees real data');

      // Save conversation for authenticated users
      if (!isDemo && userId) {
        try {
          const { getPrismaClient } = await import('./prisma-client');
          const prisma = getPrismaClient();
          
          const conversation = await prisma.conversation.create({
            data: {
              userId,
              question,
              answer: displayResponse,
              createdAt: new Date()
            }
          });
          console.log('Conversation saved for user:', userId);
          
          // Set response time after processing completes
          span.setAttribute('ai.response_time_ms', Date.now() - startTime);
          
          // Keep console logging for immediate visibility
          console.log(`📊 AI Response Time - Display Real Production: ${Date.now() - startTime}ms | Question Length: ${question.length} | User Tier: ${userTier} | User ID: ${userId || 'none'}`);
          
          return res.json({ 
            answer: displayResponse,
            conversationId: conversation.id
          });
        } catch (error) {
          console.error('Error saving conversation:', error);
        }
      }

      // Set response time after processing completes
      span.setAttribute('ai.response_time_ms', Date.now() - startTime);
      
      // Keep console logging for immediate visibility
      console.log(`📊 AI Response Time - Display Real Production: ${Date.now() - startTime}ms | Question Length: ${question.length} | User Tier: ${userTier} | User ID: ${userId || 'none'}`);
      
      return res.json({ 
        answer: displayResponse,
        conversationId: null
      });
    });
  } catch (error) {
    console.error('Error in ask endpoint:', error);
    
    // Create Sentry performance span for AI request error
    const totalTime = Date.now() - startTime;
    Sentry.startSpan({
      op: 'ai.request',
      name: 'AI Financial Advice Request - Display Real Error',
    }, (span: any) => {
      // Set span attributes for detailed monitoring and filtering
      span.setAttribute('ai.question_length', req.body?.question?.length || 0);
      span.setAttribute('ai.response_time_ms', totalTime);
      span.setAttribute('ai.mode', req.body?.isDemo ? 'demo' : 'production');
      span.setAttribute('ai.endpoint', '/ask/display-real');
      span.setAttribute('ai.error', error instanceof Error ? error.message : 'Unknown error');
      span.setAttribute('ai.status', 'error');
    });
    
    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in display-real AI endpoint', 'error');
    }
    
    res.status(500).json({ error: 'Failed to process question' });
  }
});

// Feedback endpoint for both demo and production conversations
app.post('/feedback', async (req: Request, res: Response) => {
  try {
    const { conversationId, score, isDemo } = req.body;
    
    if (!conversationId || !score || typeof isDemo !== 'boolean') {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (score < 1 || score > 5) {
      return res.status(400).json({ error: 'Score must be between 1 and 5' });
    }
    
    const { getPrismaClient } = await import('./prisma-client');
    const prisma = getPrismaClient();
    
    let feedback;
    
    if (isDemo) {
      // Save feedback for demo conversation
      feedback = await prisma.feedback.create({
        data: {
          score,
          demoConversationId: conversationId
        }
      });
    } else {
      // Save feedback for production conversation
      feedback = await prisma.feedback.create({
        data: {
          score,
          conversationId: conversationId
        }
      });
    }
    
    console.log('Feedback saved:', { id: feedback.id, score, isDemo });
    res.json({ success: true, feedbackId: feedback.id });
    
  } catch (error) {
    console.error('Error saving feedback:', error);
    
    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in feedback endpoint', 'error');
    }
    
    res.status(500).json({ error: 'Failed to save feedback' });
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
    
    // Get recent conversation history for this demo session (last 10 Q&A pairs for better context)
    const recentConversations = await getPrismaClient().demoConversation.findMany({
      where: { sessionId: demoSession.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
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
      
      // Log demo interactions for analytics (disabled in test environment)
      if (process.env.NODE_ENV !== 'test') {
        try {
          // Log directly instead of making HTTP request to self
          console.log('📊 DEMO INTERACTION:', {
            timestamp: new Date().toISOString(),
            sessionId,
            question: questionString.substring(0, 100) + (questionString.length > 100 ? '...' : ''),
            answerLength: answer.length,
            userAgent: userAgent?.substring(0, 50) + (userAgent?.length > 50 ? '...' : '')
          });
        } catch (logError) {
          console.error('Failed to log demo interaction:', logError);
        }
      }
      
      // Send response with conversation ID
      res.json({ 
        answer,
        conversationId: storedConversation.id 
      });
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
      
      // Send response without conversation ID if storage failed
      res.json({ answer });
    }
  } catch (err) {
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in handleDemoRequest', 'error');
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
    
    // Get recent conversation history for this user (last 10 Q&A pairs for better context)
    const recentConversations = await getPrismaClient().conversation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
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
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in handleUserRequest', 'error');
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
    
    // Get recent conversation history for this user (last 10 Q&A pairs for better context)
    const recentConversations = await getPrismaClient().conversation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
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
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in handleTierAwareUserRequest', 'error');
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
    
    // Get recent conversation history for this demo session (last 10 Q&A pairs for better context)
    const recentConversations = await getPrismaClient().demoConversation.findMany({
      where: { sessionId: demoSession.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
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
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in handleTierAwareDemoRequest', 'error');
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
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in demo conversations endpoint', 'error');
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
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in conversations endpoint', 'error');
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
    
    // Note: Demo conversations are already stored in the demoConversation table
    // This endpoint is just for analytics logging, not conversation storage
    console.log('📊 Demo interaction logged for analytics (conversation already stored in demo table)');
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error logging demo interaction:', err);
    
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
    } else {
      Sentry.captureMessage('Unknown error in log-demo endpoint', 'error');
    }
    
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
    
    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in test demo data endpoint', 'error');
    }
    
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
    // Capture error in Sentry
    if (err instanceof Error) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    } else {
      Sentry.captureMessage('Unknown error in test Alpha Vantage API key endpoint', 'error');
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
              }).then(profiles => profiles.map(p => p.profileHash))
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
        
        // 12. Finally, delete the user themselves (including login/email)
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
        
        // Capture error in Sentry
        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage('Unknown error in admin demo sessions endpoint', 'error');
        }
        
        res.status(500).json({ error: 'Failed to fetch demo sessions' });
      }
    });

    app.get('/admin/demo-conversations', adminAuth, async (req: Request, res: Response) => {
      try {
        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();
        
        console.log('Admin: Fetching demo conversations...');
        
        // Get all demo conversations with session info and feedback
        const conversations = await prisma.demoConversation.findMany({
          include: {
            session: true,
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
        res.json({ conversations });
      } catch (error) {
        console.error('Error fetching demo conversations:', error);
        
        // Capture error in Sentry
        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage('Unknown error in admin demo conversations endpoint', 'error');
        }
        
        res.status(500).json({ error: 'Failed to fetch demo conversations' });
      }
    });

    // Admin endpoint to delete demo session and all its conversations
    app.delete('/admin/demo-sessions/:sessionId', adminAuth, async (req: Request, res: Response) => {
      try {
        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();
        
        const { sessionId } = req.params;
        console.log('Admin: Deleting demo session:', sessionId);
        
        // First check if the session exists
        const session = await prisma.demoSession.findUnique({
          where: { sessionId },
          include: {
            _count: {
              select: { conversations: true }
            }
          }
        });
        
        if (!session) {
          return res.status(404).json({ error: 'Demo session not found' });
        }
        
        console.log(`Admin: Deleting session with ${session._count.conversations} conversations`);
        
        // Delete the session (this will cascade delete conversations due to foreign key constraints)
        await prisma.demoSession.delete({
          where: { sessionId }
        });
        
        console.log('Admin: Demo session deleted successfully');
        res.json({ 
          success: true, 
          message: `Demo session deleted with ${session._count.conversations} conversations`,
          deletedSessionId: sessionId
        });
      } catch (error) {
        console.error('Error deleting demo session:', error);
        
        // Capture error in Sentry
        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage('Unknown error in admin delete demo session endpoint', 'error');
        }
        
        res.status(500).json({ error: 'Failed to delete demo session' });
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
        
        // Capture error in Sentry
        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage('Unknown error in admin production sessions endpoint', 'error');
        }
        
        res.status(500).json({ error: 'Failed to fetch production sessions' });
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
        const conversationsWithoutUsers = conversations.filter(conv => !conv.user);
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

        console.log('Admin: Raw users from database:', users.map(u => ({ email: u.email, id: u.id, tier: u.tier })));

        // Enhance users with subscription status from Stripe service
        console.log('Admin: Starting subscription status enhancement...');
        const { stripeService } = await import('./services/stripe');
        console.log('Admin: Stripe service imported successfully');
        
        const enhancedUsers = await Promise.all(
          users.map(async (user) => {
            try {
              console.log(`Admin: Processing user ${user.email} (${user.id}) with tier ${user.tier}`);
              const subscriptionStatus = await stripeService.getUserSubscriptionStatus(user.id);
              console.log(`Admin: User ${user.email} - Status: ${subscriptionStatus.status}, Access: ${subscriptionStatus.accessLevel}, Message: ${subscriptionStatus.message}`);
              return {
                ...user,
                subscriptionStatus: subscriptionStatus.status,
                accessLevel: subscriptionStatus.accessLevel,
                upgradeRequired: subscriptionStatus.upgradeRequired,
                subscriptionMessage: subscriptionStatus.message
              };
            } catch (error) {
              console.error(`Error getting subscription status for user ${user.id}:`, error);
              return {
                ...user,
                subscriptionStatus: 'unknown',
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

    // Admin endpoint to get user financial profile and linked institutions
    app.get('/admin/user-financial-data/:userId', adminAuth, async (req: Request, res: Response) => {
      try {
        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();
        
        const { userId } = req.params;
        
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId' });
        }

        console.log('Admin: Fetching financial data for user:', userId);
        
        // Get user profile using ProfileManager to get the current encrypted profile
        const { ProfileManager } = await import('./profile/manager');
        const profileManager = new ProfileManager();
        const currentProfileText = await profileManager.getOriginalProfile(userId);
        
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
          console.log('Admin: Account details from database:', accounts.map(a => ({
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
        console.log('Admin: Accounts without userId:', allAccountsInDb.filter(a => !a.userId).length);
        if (allAccountsInDb.filter(a => !a.userId).length > 0) {
          console.log('Admin: Orphaned accounts:', allAccountsInDb.filter(a => !a.userId).map(a => ({
            name: a.name,
            institution: a.institution
          })));
        }

        // Check if user might be using demo mode or has other financial data sources
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
            text: currentProfileText || 'No profile available - user has not had any conversations yet',
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

    // AI Performance Monitoring Endpoint
app.get('/ai/performance', async (req: Request, res: Response) => {
  try {
    // This endpoint provides AI performance metrics
    // You can use this with Sentry uptime monitoring to track AI system health
    res.json({
      status: 'OK',
      message: 'AI Performance monitoring endpoint is active',
      timestamp: new Date().toISOString(),
      features: [
        'Response time tracking on all AI endpoints',
        'Performance logging with question length and user tier',
        'Response headers with timing data',
        'Error tracking with timing information'
      ],
      endpoints: [
        '/ask - Main AI endpoint with timing',
        '/ask/tier-aware - Tier-aware AI endpoint with timing',
        '/ask/display-real - Real data AI endpoint with timing'
      ],
      monitoring: {
        responseTimeHeaders: 'X-AI-Response-Time, X-AI-Mode',
        consoleLogging: '📊 AI Response Time logs for all requests',
        errorTracking: 'Timing data included even for failed requests'
      }
    });
  } catch (error) {
    console.error('AI Performance endpoint error:', error);
    
    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in AI performance endpoint', 'error');
    }
    
    res.status(500).json({ error: 'Failed to get AI performance info' });
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
    const profileText = await profileManager.getOriginalProfile(req.user!.id);
    
    res.json({ profile: { profileText } });
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
    
    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in profile update endpoint', 'error');
    }
    
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
    
    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in market news context endpoint', 'error');
    }
    
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
    
    // Capture error in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage('Unknown error in admin market news refresh endpoint', 'error');
    }
    
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
        
        // Capture error in Sentry
        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage('Unknown error in market context refresh cron job', 'error');
        }
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
    
    console.log('Cron job scheduled: market context refresh every hour');
    console.log('Cron job scheduled: market news context refresh every 4 hours');
    
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

// Admin: Revoke user access (prevent login)
app.put('/admin/revoke-user-access/:userId', adminAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
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
    const { userId } = req.params;
    
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
    const { userId } = req.params;
    
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
          }).then(profiles => profiles.map(p => p.profileHash))
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

// Export app for testing
export { app };
// Force rebuild Mon Jul 28 20:28:57 PDT 2025
