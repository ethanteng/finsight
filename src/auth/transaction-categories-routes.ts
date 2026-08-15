import express from 'express';
import { requireAuth, AuthenticatedRequest } from './middleware';
import { getPrismaClient } from '../prisma-client';
import {
  findSnapshotTransaction,
  patchSnapshotTransactionCategory,
  providerCategoryFromTransaction,
} from '../services/transaction-category-override-service';
import {
  listTransactionCategoryOptions,
  resolveCategorySelection,
  canonicalTypeForCategory,
} from '../services/transaction-category-taxonomy';
import { FinancialRevisionService } from '../services/financial-revision-service';

const router = express.Router();

function transactionIdParam(req: AuthenticatedRequest): string {
  const raw = req.params.transactionId;
  return (Array.isArray(raw) ? raw[0] : raw ?? '').trim();
}

/**
 * The in-place snapshot patch fixes what the list shows, but `transactionsSummary` is
 * only produced at revision time — so until one runs, a transaction recategorized across
 * a cash-flow boundary is displayed one way and counted another. A category edit moves
 * no money, so it records no balance-sheet observation.
 */
function scheduleCashFlowCatchUp(userId: string, label: string): void {
  FinancialRevisionService.schedule(userId, { history: { kind: 'none' } }, label);
}

// GET /api/transaction-categories/options - Category menu for the edit modal
router.get('/options', requireAuth, async (_req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: listTransactionCategoryOptions() });
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
    const snapshotTransaction = await findSnapshotTransaction(userId, transactionId);
    if (!existing && !snapshotTransaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }
    const originalCategory = existing
      ? undefined
      : providerCategoryFromTransaction(snapshotTransaction);

    // Persist the override before patching the snapshot so a failed upsert cannot
    // leave a user category in the JSON blob with no row to restore from.
    const override = await getPrismaClient().transactionCategoryOverride.upsert({
      where: { userId_transactionId: { userId, transactionId } },
      create: { userId, transactionId, category, originalCategory: originalCategory ?? [] },
      update: { category },
      select: { transactionId: true, category: true, originalCategory: true, updatedAt: true },
    });

    const applied = await patchSnapshotTransactionCategory(userId, transactionId, category, 'user');
    if (!applied && !existing) {
      await getPrismaClient().transactionCategoryOverride.delete({
        where: { userId_transactionId: { userId, transactionId } },
      });
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    scheduleCashFlowCatchUp(userId, 'transaction-category-updated');

    res.json({
      success: true,
      data: {
        ...override,
        canonicalTransactionType: canonicalTypeForCategory(category),
      },
    });
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

    // Restore the snapshot before dropping the row, so a failed patch cannot strand a
    // user category on screen with the provider value already thrown away. A transaction
    // that has since left the snapshot window has nothing to restore and must not be
    // held hostage to that patch — otherwise its override could never be removed.
    const stillInSnapshot = Boolean(await findSnapshotTransaction(userId, transactionId));
    if (stillInSnapshot) {
      const restored = await patchSnapshotTransactionCategory(
        userId,
        transactionId,
        existing.originalCategory,
        'provider'
      );
      if (!restored) {
        return res.status(500).json({ success: false, error: 'Failed to restore category in snapshot' });
      }
    }

    await getPrismaClient().transactionCategoryOverride.delete({
      where: { userId_transactionId: { userId, transactionId } },
    });

    scheduleCashFlowCatchUp(userId, 'transaction-category-restored');

    res.json({
      success: true,
      data: {
        transactionId,
        category: existing.originalCategory,
        canonicalTransactionType: canonicalTypeForCategory(existing.originalCategory),
      },
    });
  } catch (error) {
    console.error('Failed to clear transaction category:', error);
    res.status(500).json({ success: false, error: 'Failed to clear transaction category' });
  }
});

export default router;
