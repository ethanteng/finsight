import express from 'express';
import { requireAuth, AuthenticatedRequest } from './middleware';
import { getPrismaClient } from '../prisma-client';
import {
  listTransactionCategoryOptions,
  resolveCategorySelection,
} from '../services/transaction-category-taxonomy';
import {
  findSnapshotTransactionCategory,
  patchSnapshotTransactionCategory,
} from '../services/transaction-category-override-service';

const router = express.Router();

function transactionIdParam(req: AuthenticatedRequest): string {
  const raw = req.params.transactionId;
  return (Array.isArray(raw) ? raw[0] : raw ?? '').trim();
}

// GET /api/transaction-categories/options - Category menu for the edit modal
router.get('/options', requireAuth, async (_req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: listTransactionCategoryOptions() });
});

// GET /api/transaction-categories/overrides - Every category the user has changed
router.get('/overrides', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const overrides = await getPrismaClient().transactionCategoryOverride.findMany({
      where: { userId: req.user!.id },
      select: { transactionId: true, category: true, updatedAt: true },
    });
    res.json({ success: true, data: overrides });
  } catch (error) {
    console.error('Failed to load transaction category overrides:', error);
    res.status(500).json({ success: false, error: 'Failed to load category overrides' });
  }
});

// PUT /api/transaction-categories/:transactionId - Set the category for one transaction
router.put('/:transactionId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const transactionId = transactionIdParam(req);
    if (!transactionId) {
      return res.status(400).json({ success: false, error: 'Transaction id is required' });
    }

    const category = resolveCategorySelection({
      primary: req.body?.primary,
      detailed: req.body?.detailed,
    });
    if (!category) {
      return res.status(400).json({ success: false, error: 'Unknown category selection' });
    }

    // Only the first save records the provider category; re-editing must not turn an
    // earlier user choice into the "original" one the reset button restores.
    const existing = await getPrismaClient().transactionCategoryOverride.findUnique({
      where: { userId_transactionId: { userId, transactionId } },
      select: { id: true },
    });
    const originalCategory = existing
      ? undefined
      : (await findSnapshotTransactionCategory(userId, transactionId)) ?? [];

    const applied = await patchSnapshotTransactionCategory(userId, transactionId, category, 'user');
    if (!applied && !existing) {
      // Nothing in the current snapshot matches this id, so it is not the user's
      // transaction (or the snapshot has moved on). Do not store an override for it.
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    const override = await getPrismaClient().transactionCategoryOverride.upsert({
      where: { userId_transactionId: { userId, transactionId } },
      create: { userId, transactionId, category, originalCategory: originalCategory ?? [] },
      update: { category },
      select: { transactionId: true, category: true, originalCategory: true, updatedAt: true },
    });

    res.json({ success: true, data: override });
  } catch (error) {
    console.error('Failed to save transaction category:', error);
    res.status(500).json({ success: false, error: 'Failed to save transaction category' });
  }
});

// DELETE /api/transaction-categories/:transactionId - Restore the provider category
router.delete('/:transactionId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const transactionId = transactionIdParam(req);
    if (!transactionId) {
      return res.status(400).json({ success: false, error: 'Transaction id is required' });
    }

    const existing = await getPrismaClient().transactionCategoryOverride.findUnique({
      where: { userId_transactionId: { userId, transactionId } },
      select: { originalCategory: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'No category override to remove' });
    }

    await getPrismaClient().transactionCategoryOverride.delete({
      where: { userId_transactionId: { userId, transactionId } },
    });
    await patchSnapshotTransactionCategory(
      userId,
      transactionId,
      existing.originalCategory,
      'provider'
    );

    res.json({ success: true, data: { transactionId, category: existing.originalCategory } });
  } catch (error) {
    console.error('Failed to clear transaction category:', error);
    res.status(500).json({ success: false, error: 'Failed to clear transaction category' });
  }
});

export default router;
