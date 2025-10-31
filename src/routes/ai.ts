import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { getLatestGPTContext, getGPTContextById } from '../services/gpt-logger';
import { getPrismaClient } from '../prisma-client';
import { openai } from '../openai';

const router = Router();
const prisma = getPrismaClient();

/**
 * GET /api/ai/context/latest
 * Get the latest GPT context for the current user
 */
router.get('/context/latest', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    console.log('AI Routes: Fetching latest context for userId:', userId);
    
    // Check if context logging is enabled
    if (process.env.PERSIST_GPT_CONTEXT !== 'true') {
      return res.status(403).json({
        error: 'GPT context logging is not enabled',
        message: 'Set PERSIST_GPT_CONTEXT=true to enable context logging',
      });
    }
    
    const context = await getLatestGPTContext(userId);
    
    if (!context) {
      return res.status(404).json({
        error: 'No context found',
        message: 'No GPT context has been logged for this user yet',
      });
    }
    
    res.json(context);
  } catch (error) {
    console.error('Error fetching latest GPT context:', error);
    res.status(500).json({ error: 'Failed to fetch GPT context' });
  }
});

/**
 * GET /api/ai/context/:contextId
 * Get a specific GPT context by ID
 */
router.get('/context/:contextId', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { contextId } = req.params;
    
    // Check if context logging is enabled
    if (process.env.PERSIST_GPT_CONTEXT !== 'true') {
      return res.status(403).json({
        error: 'GPT context logging is not enabled',
        message: 'Set PERSIST_GPT_CONTEXT=true to enable context logging',
      });
    }
    
    const context = await getGPTContextById(userId, contextId);
    
    if (!context) {
      return res.status(404).json({
        error: 'Context not found',
        message: 'No GPT context found with that ID',
      });
    }
    
    res.json(context);
  } catch (error) {
    console.error('Error fetching GPT context by ID:', error);
    res.status(500).json({ error: 'Failed to fetch GPT context' });
  }
});

/**
 * POST /api/ai/categorize-transactions
 * Generate AI categories for transactions
 */
router.post('/categorize-transactions', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { transactionIds } = req.body;
    
    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      return res.status(400).json({ error: 'transactionIds must be a non-empty array' });
    }
    
    // Fetch transactions from database
    const transactions = await prisma.transaction.findMany({
      where: {
        id: { in: transactionIds },
        account: { userId },
      },
      include: {
        account: true,
      },
    });
    
    if (transactions.length === 0) {
      return res.status(404).json({ error: 'No transactions found' });
    }
    
    // Generate AI categories for each transaction
    const results = [];
    
    for (const transaction of transactions) {
      try {
        // Build a prompt for AI categorization
        const prompt = `Analyze this financial transaction and provide:
1. A clear, specific category (e.g., "Groceries", "Dining", "Transportation", "Healthcare", "Entertainment")
2. A brief explanation of why you chose this category

Transaction Details:
- Name: ${transaction.name}
- Merchant: ${transaction.merchantName || 'Unknown'}
- Amount: $${Math.abs(transaction.amount).toFixed(2)}
- Date: ${transaction.date.toISOString().split('T')[0]}
- Original Category: ${transaction.category || 'Unknown'}
${transaction.enriched_data ? `- Enhanced Data: ${JSON.stringify(transaction.enriched_data)}` : ''}

Respond in this exact format:
Category: [category name]
Reasoning: [brief explanation]`;
        
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini', // Use cheaper model for categorization
          messages: [
            {
              role: 'system',
              content: 'You are a financial transaction categorization expert. Provide accurate, specific categories.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 200,
        });
        
        const response = completion.choices[0]?.message?.content || '';
        
        // Parse the response
        const categoryMatch = response.match(/Category:\s*(.+)/i);
        const reasoningMatch = response.match(/Reasoning:\s*(.+)/i);
        
        const aiCategory = categoryMatch ? categoryMatch[1].trim() : 'Unknown';
        const aiCategoryReason = reasoningMatch ? reasoningMatch[1].trim() : 'No reasoning provided';
        
        // Update transaction with AI category
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            aiCategory,
            aiCategoryReason,
            categoryComparedAt: new Date(),
          },
        });
        
        results.push({
          id: transaction.id,
          name: transaction.name,
          originalCategory: transaction.category,
          aiCategory,
          aiCategoryReason,
          match: transaction.category === aiCategory,
        });
      } catch (error) {
        console.error(`Error categorizing transaction ${transaction.id}:`, error);
        results.push({
          id: transaction.id,
          name: transaction.name,
          originalCategory: transaction.category,
          aiCategory: null,
          aiCategoryReason: 'Error during categorization',
          match: false,
        });
      }
    }
    
    res.json({ results });
  } catch (error) {
    console.error('Error categorizing transactions:', error);
    res.status(500).json({ error: 'Failed to categorize transactions' });
  }
});

/**
 * GET /api/transactions/comparison
 * Get transactions with category comparison data
 */
router.get('/transactions/comparison', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { filter = 'all', limit = 100 } = req.query;
    
    // Build filter conditions
    let whereClause: any = {
      account: { userId },
    };
    
    if (filter === 'matched') {
      // Only show transactions where AI category matches original
      whereClause.aiCategory = { not: null };
      whereClause.AND = {
        category: { equals: prisma.transaction.fields.aiCategory },
      };
    } else if (filter === 'mismatched') {
      // Only show transactions where AI category doesn't match original
      whereClause.aiCategory = { not: null };
      whereClause.AND = {
        category: { not: prisma.transaction.fields.aiCategory },
      };
    } else if (filter === 'uncategorized') {
      // Only show transactions without AI categories
      whereClause.aiCategory = null;
    }
    
    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      include: {
        account: {
          select: {
            name: true,
            institution: true,
          },
        },
      },
      orderBy: { date: 'desc' },
      take: Number(limit),
    });
    
    const results = transactions.map((transaction: any) => ({
      id: transaction.id,
      name: transaction.name,
      merchantName: transaction.merchantName,
      amount: transaction.amount,
      date: transaction.date,
      account: transaction.account,
      originalCategory: transaction.category,
      aiCategory: transaction.aiCategory,
      aiCategoryReason: transaction.aiCategoryReason,
      categoryComparedAt: transaction.categoryComparedAt,
      match: transaction.category === transaction.aiCategory,
      enrichedData: transaction.enriched_data,
    }));
    
    res.json({
      transactions: results,
      total: results.length,
      filter,
    });
  } catch (error) {
    console.error('Error fetching transaction comparison:', error);
    res.status(500).json({ error: 'Failed to fetch transaction comparison' });
  }
});

export default router;

