import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { getLatestGPTContext, getGPTContextById } from '../services/gpt-logger';
import { getPrismaClient } from '../prisma-client';
import { CANONICAL_TRANSACTION_TYPES, isCanonicalTransactionType } from '../domain/financial-truth';
import { canonicalCashFlowAmount } from '../services/canonical-transaction-adapter';

function asString(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? '' : v ?? '';
}

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
    const contextId = asString(req.params.contextId);
    
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
 * @deprecated This endpoint is deprecated and should not be used.
 * 
 * This endpoint stored category names (like "Groceries", "Special", "Place") in the aiCategory field,
 * but we now use transaction types (like "income", "expense", "transfer_in") instead.
 * 
 * Transaction categorization is now handled automatically by TransactionCategorizationService
 * when financial data is fetched. Manual corrections can be made via:
 * PUT /api/ai/transactions/:transactionId/transaction-type
 * 
 * This endpoint is kept for backwards compatibility but returns an error to prevent data pollution.
 */
router.post('/categorize-transactions', requireAuth, async (req, res) => {
  res.status(410).json({ 
    error: 'This endpoint has been deprecated. Transaction categorization is now handled automatically. Use PUT /api/ai/transactions/:transactionId/transaction-type for manual corrections.',
    deprecated: true,
    replacement: 'Transaction categorization is automatic via TransactionCategorizationService. Manual corrections: PUT /api/ai/transactions/:transactionId/transaction-type'
  });
});

/**
 * PUT /api/ai/transactions/:transactionId/transaction-type
 * Update transaction type manually (user correction)
 */
router.put('/transactions/:transactionId/transaction-type', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const transactionId = asString(req.params.transactionId);
    const { transaction_type, reason } = req.body;

    // Validate transaction_type
    const normalizedTransactionType = String(transaction_type || '').toLowerCase();
    if (!isCanonicalTransactionType(normalizedTransactionType)) {
      return res.status(400).json({ 
        error: 'Invalid transaction_type. Must be one of: ' + CANONICAL_TRANSACTION_TYPES.join(', ')
      });
    }

    // Verify transaction belongs to user
    const transaction = await prisma.transaction.findFirst({
      where: {
        id: transactionId,
        account: { userId }
      }
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Update transaction with manual correction
    // Store transaction_type in aiCategory field (repurposed)
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        aiCategory: normalizedTransactionType,
        aiCategoryReason: reason || 'Manually corrected by user',
        cashFlowAmount: canonicalCashFlowAmount(
          transaction.cashFlowAmount ?? transaction.sourceAmount ?? transaction.amount,
          normalizedTransactionType
        ),
        categoryComparedAt: new Date()
      },
      include: {
        account: {
          select: {
            name: true,
            institution: true,
          },
        },
      },
    });

    const { FinancialRevisionService } = await import('../services/financial-revision-service');
    FinancialRevisionService.schedule(userId, {
      categorize: false,
      history: { kind: 'none' },
    }, 'Manual transaction-type correction');

    res.json({
      id: updatedTransaction.id,
      name: updatedTransaction.name,
      merchantName: updatedTransaction.merchantName,
      amount: updatedTransaction.amount,
      date: updatedTransaction.date,
      account: (updatedTransaction as { account?: { name: string; institution: string | null } }).account,
      originalCategory: updatedTransaction.category,
      transaction_type: updatedTransaction.aiCategory, // aiCategory now stores transaction_type
      aiCategoryReason: updatedTransaction.aiCategoryReason,
      categoryComparedAt: updatedTransaction.categoryComparedAt,
      isManualCorrection: true
    });
  } catch (error) {
    console.error('Error updating transaction type:', error);
    res.status(500).json({ error: 'Failed to update transaction type' });
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
    const whereClause: any = {
      account: { userId },
    };
    
    // Check if filter is a valid transaction type
    const normalizedFilter = String(filter).toLowerCase().trim();
    if (isCanonicalTransactionType(normalizedFilter)) {
      // Filter by transaction type
      whereClause.aiCategory = normalizedFilter;
    } else if (filter === 'matched') {
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
    // If filter is 'all', no additional filtering is needed
    
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
      orderBy: [
        { date: 'desc' },
        { id: 'desc' } // Secondary sort by ID for consistent ordering
      ],
      take: Number(limit),
    });
    
    const results = transactions.map((transaction: any) => {
      // Filter out invalid values stored in aiCategory (old category names, payment channels, etc.)
      let transactionType = null;
      if (transaction.aiCategory) {
        const normalized = String(transaction.aiCategory).toLowerCase().trim();
        if (isCanonicalTransactionType(normalized)) {
          transactionType = normalized;
        }
        // If aiCategory contains an invalid value (like "special", "place", "groceries", etc.),
        // treat it as null so it shows as "Not categorized"
      }
      
      return {
        id: transaction.id,
        name: transaction.name,
        merchantName: transaction.merchantName,
        amount: transaction.amount,
        date: transaction.date,
        account: transaction.account,
        originalCategory: transaction.category,
        // aiCategory now stores transaction_type (repurposed field)
        // Only return valid transaction types, filter out old category names
        transaction_type: transactionType,
        aiCategory: transactionType, // Only return valid transaction types
        aiCategoryReason: transaction.aiCategoryReason,
        categoryComparedAt: transaction.categoryComparedAt,
        // Only mark as manual correction if the reason explicitly indicates manual correction
        isManualCorrection: transaction.aiCategoryReason?.toLowerCase().includes('manually corrected') ||
                           transaction.aiCategoryReason?.toLowerCase().includes('corrected by user') ||
                           false,
        match: transaction.category === transactionType,
        enrichedData: transaction.enriched_data,
        pending: transaction.pending || false,
      };
    });
    
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
