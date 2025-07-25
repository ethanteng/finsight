import express, { Application, Request, Response } from 'express';
import { setupPlaidRoutes } from './plaid';
import { askOpenAI } from './openai';

const app: Application = express();
app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Placeholder for Plaid routes
setupPlaidRoutes(app);

// Placeholder for OpenAI endpoint
app.post('/ask', async (req: Request, res: Response) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'Missing question' });
  try {
    const answer = await askOpenAI(question);
    res.json({ answer });
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: 'OpenAI error', details: err.message });
    } else {
      res.status(500).json({ error: 'OpenAI error', details: 'Unknown error' });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
