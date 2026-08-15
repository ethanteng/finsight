import express from 'express';
import { requireAuth, AuthenticatedRequest } from './middleware';
import { getPrismaClient } from '../prisma-client';
import { FinancialRevisionService } from '../services/financial-revision-service';

const router = express.Router();
const prisma = getPrismaClient();

// POST /api/manual-accounts - Create manual account
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { name, amount, type } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (typeof amount !== 'number' || isNaN(amount)) {
      return res.status(400).json({ error: 'Amount must be a valid number' });
    }

    if (!['cash', 'investment', 'debt', 'mortgage'].includes(type)) {
      return res.status(400).json({ error: 'Type must be cash, investment, debt, or mortgage' });
    }

    const manualAccount = await prisma.manualAccount.create({
      data: {
        userId,
        name: name.trim(),
        amount,
        type,
      },
    });

    // The snapshot rebuild re-reads every connected provider and takes tens of seconds.
    // Holding the response for it made the UI look hung, so run it in the background;
    // the manual account itself is already durable and reads straight from the database.
    FinancialRevisionService.schedule(
      userId,
      { history: { kind: 'material', reason: 'manual-account-created' } },
      'manual-account-created'
    );

    res.status(201).json({
      success: true,
      data: manualAccount,
    });
  } catch (error) {
    console.error('Failed to create manual account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create manual account',
    });
  }
});

// GET /api/manual-accounts - Get all manual accounts for user
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const manualAccounts = await prisma.manualAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: manualAccounts,
    });
  } catch (error) {
    console.error('Failed to get manual accounts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get manual accounts',
    });
  }
});

// PUT /api/manual-accounts/:id - Update manual account
router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
    const { name, amount, type } = req.body;

    // Check if account exists and belongs to user
    const existingAccount = await prisma.manualAccount.findFirst({
      where: { id, userId },
    });

    if (!existingAccount) {
      return res.status(404).json({
        success: false,
        error: 'Manual account not found',
      });
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name must be a non-empty string' });
      }
      updateData.name = name.trim();
    }
    if (amount !== undefined) {
      if (typeof amount !== 'number' || isNaN(amount)) {
        return res.status(400).json({ error: 'Amount must be a valid number' });
      }
      updateData.amount = amount;
    }
    if (type !== undefined) {
      if (!['cash', 'investment', 'debt', 'mortgage'].includes(type)) {
        return res.status(400).json({ error: 'Type must be cash, investment, debt, or mortgage' });
      }
      updateData.type = type;
    }

    const updatedAccount = await prisma.manualAccount.update({
      where: { id },
      data: updateData,
    });

    FinancialRevisionService.schedule(
      userId,
      { history: { kind: 'material', reason: 'manual-account-updated' } },
      'manual-account-updated'
    );

    res.json({
      success: true,
      data: updatedAccount,
    });
  } catch (error) {
    console.error('Failed to update manual account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update manual account',
    });
  }
});

// DELETE /api/manual-accounts/:id - Delete manual account
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';

    // Check if account exists and belongs to user
    const existingAccount = await prisma.manualAccount.findFirst({
      where: { id, userId },
    });

    if (!existingAccount) {
      return res.status(404).json({
        success: false,
        error: 'Manual account not found',
      });
    }

    // Find the corresponding Account entry in the Account table
    // Manual accounts have plaidAccountId = "manual-{manualAccountId}"
    const plaidAccountId = `manual-${id}`;
    const accountEntry = await prisma.account.findFirst({
      where: {
        plaidAccountId,
        userId,
      },
    });

    // If there's a corresponding Account entry, delete it and its transactions
    if (accountEntry) {
      // Security: Double-check that accountEntry belongs to the user before deletion
      // This prevents any potential race conditions or authorization bypass
      if (accountEntry.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized: Account does not belong to user',
        });
      }

      // First, delete any transactions associated with this account
      await prisma.transaction.deleteMany({
        where: { accountId: accountEntry.id },
      });

      // Then delete the Account entry using deleteMany with userId check for extra security
      await prisma.account.deleteMany({
        where: {
          id: accountEntry.id,
          userId, // Extra security check
        },
      });
    }

    // Delete the ManualAccount entry
    await prisma.manualAccount.delete({
      where: { id },
    });

    FinancialRevisionService.schedule(
      userId,
      { history: { kind: 'material', reason: 'manual-account-deleted' } },
      'manual-account-deleted'
    );

    res.json({
      success: true,
      message: 'Manual account deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete manual account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete manual account',
    });
  }
});

export default router;
