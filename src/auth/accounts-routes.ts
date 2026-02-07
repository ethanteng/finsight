import express from 'express';
import { requireAuth, AuthenticatedRequest } from './middleware';
import { getPrismaClient } from '../prisma-client';

const router = express.Router();
const prisma = getPrismaClient();

// PUT /api/accounts/:id - Update account name
// The :id parameter is the plaidAccountId (or snaptrade-{id} for SnapTrade accounts)
router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params; // This is the plaidAccountId
    const { name } = req.body;

    // Validation
    if (name === undefined) {
      return res.status(400).json({ 
        success: false,
        error: 'Name is required' 
      });
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Name must be a non-empty string' 
      });
    }

    // Decode the ID in case it was URL encoded
    const decodedId = decodeURIComponent(id);
    
    console.log(`🔍 Updating account name: userId=${userId}, plaidAccountId=${decodedId}, newName=${name}`);
    
    // Find account by plaidAccountId and ensure it belongs to the user
    const account = await prisma.account.findFirst({
      where: {
        plaidAccountId: decodedId,
        userId: userId,
      },
    });

    if (!account) {
      // Try to find any account with this ID for debugging
      const anyAccount = await prisma.account.findFirst({
        where: { plaidAccountId: decodedId },
      });
      
      console.error(`❌ Account not found: plaidAccountId=${decodedId}, userId=${userId}`);
      if (anyAccount) {
        console.error(`   Account exists but belongs to userId=${anyAccount.userId}`);
      } else {
        console.error(`   No account found with plaidAccountId=${decodedId}`);
      }
      
      return res.status(404).json({
        success: false,
        error: 'Account not found',
      });
    }

    // Update the account name
    const updatedAccount = await prisma.account.update({
      where: { id: account.id },
      data: { name: name.trim() },
    });

    // Invalidate financial data cache for this user
    const { cacheService } = await import('../data/cache');
    await cacheService.invalidate(`financial-data:${userId}`);
    
    // Trigger snapshot refresh
    const { SummaryCacheService } = await import('../services/summary-cache-service');
    await SummaryCacheService.computeForUser(userId).catch(err => {
      console.error('Failed to refresh snapshot after updating account name:', err);
    });

    // Refresh financial summary (updates FinancialSummary table)
    const { FinancialSummaryService } = await import('../services/financial-summary-service');
    await new FinancialSummaryService().refreshUserSummary(userId).catch(err => {
      console.error('Failed to refresh financial summary after updating account name:', err);
    });

    res.json({
      success: true,
      data: updatedAccount,
    });
  } catch (error) {
    console.error('Failed to update account name:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update account name',
    });
  }
});

export default router;
