import express, { Application, Request, Response } from 'express';
import { setupPlaidRoutes } from './plaid';
import { askOpenAI } from './openai';
import cors from 'cors';
import cron from 'node-cron';
import { syncAllAccounts, getLastSyncInfo } from './sync';

const app: Application = express();
app.use(express.json());
app.use(cors({
  origin: [
    'https://asklinc.com', // your Vercel frontend URL
    'https://www.asklinc.com', // www version
    'http://localhost:3001' // for localdev, optional
  ],
  credentials: true
}));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Setup Plaid routes
setupPlaidRoutes(app);

// OpenAI Q&A endpoint
app.post('/ask', async (req: Request, res: Response) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    const answer = await askOpenAI(question);
    res.json({ answer });
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

const PORT = process.env.PORT || 3000;
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
