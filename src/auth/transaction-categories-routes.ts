import express from 'express';
import { requireAuth, AuthenticatedRequest } from './middleware';
import { getPrismaClient } from '../prisma-client';
import {
  categoryRulePayee,
  findCategoryRule,
  findMatchingSnapshotTransactions,
  findSnapshotTransaction,
  getCategoryRules,
  moneyDirection,
  providerMoneyDirection,
  patchSnapshotTransactionCategories,
  patchSnapshotTransactionCategory,
  providerCategoryFromTransaction,
  resolveProviderTransactionId,
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

// GET /api/transaction-categories/:transactionId/matches - How many other transactions an edit can also apply to
router.get('/:transactionId/matches', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const transactionId = transactionIdParam(req);
    const found = transactionId ? await findMatchingSnapshotTransactions(req.user!.id, transactionId) : null;
    if (!found) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }
    // The direction lets the page say which way the matches go, which the
    // amount's sign can't: card purchases are stored positive. It is the
    // provider's direction (same as the rule), so a row the user already
    // recategorized across a cash-flow boundary still names the money that way.
    // A payee that can take a rule can be matched even with no others yet.
    const rule = await findCategoryRule(req.user!.id, found.target);
    res.json({
      success: true,
      data: {
        count: found.matches.length,
        direction: found.subject?.direction ?? moneyDirection(found.target),
        canApplyToMatching: found.subject !== null,
        rule: rule && { id: rule.id, category: rule.category },
      },
    });
  } catch (error) {
    console.error('Failed to find matching transactions:', error);
    res.status(500).json({ success: false, error: 'Failed to find matching transactions' });
  }
});

/**
 * Sets one category on a transaction and every transaction that matches it, and
 * saves it as the payee's rule, so new transactions from the payee get it too.
 * Each gets its own override, so each keeps its own restore point and is restored
 * on its own; one already set by the user keeps the provider category it had then.
 */
async function applyToMatching(
  userId: string,
  transactionId: string,
  category: string[],
  res: express.Response
) {
  const found = await findMatchingSnapshotTransactions(userId, transactionId);
  if (!found) {
    return res.status(404).json({ success: false, error: 'Transaction not found' });
  }
  const rows = [found.target, ...found.matches];
  const prisma = getPrismaClient();
  // Matches and the rule share the provider's direction (from findMatching…),
  // so a target the user already recategorized across a cash-flow boundary
  // updates the rule that did it and applies to the same-way siblings.
  const subject = found.subject;
  const label = String(found.target?.merchant_name || found.target?.name || '').trim().slice(0, RULE_LABEL_MAX_LENGTH);
  // Every override is written before the snapshot is patched, for the same reason
  // as a single edit: no user category in the JSON blob without a row behind it.
  await prisma.$transaction([
    ...rows.map(row => {
      const id = resolveProviderTransactionId(row)!;
      return prisma.transactionCategoryOverride.upsert({
        where: { userId_transactionId: { userId, transactionId: id } },
        create: { userId, transactionId: id, category, originalCategory: providerCategoryFromTransaction(row) },
        update: { category },
      });
    }),
    ...(subject ? [prisma.transactionCategoryRule.upsert({
      where: {
        userId_counterpartyKey_direction_investment: {
          userId, counterpartyKey: subject.counterpartyKey, direction: subject.direction, investment: subject.investment,
        },
      },
      create: { userId, counterpartyKey: subject.counterpartyKey, direction: subject.direction, investment: subject.investment, label, category },
      update: { category, label },
    })] : []),
  ]);
  const ids = rows.map(row => resolveProviderTransactionId(row)!);
  // A revision that lands in between wins the snapshot; the one scheduled below
  // re-applies every override, so the edit still reaches it.
  await patchSnapshotTransactionCategories(userId, new Set(ids), category, 'user');
  scheduleCashFlowCatchUp(userId, 'transaction-category-updated');

  return res.json({
    success: true,
    data: {
      transactionId,
      category,
      canonicalTransactionType: canonicalTypeForCategory(category),
      appliedTo: ids,
      appliesToNew: subject !== null,
    },
  });
}

/** Longest payee name a rule is stored under; descriptions can run long. */
const RULE_LABEL_MAX_LENGTH = 120;

// PUT /api/transaction-categories/:transactionId - Set the category for one transaction,
// or with `applyToMatching`, for it and every transaction that matches it
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
    if (req.body?.applyToMatching === true) {
      return await applyToMatching(userId, transactionId, category, res);
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
      select: { originalCategory: true, category: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'No category override to remove' });
    }

    // Restore the snapshot before dropping the row, so a failed patch cannot strand a
    // user category on screen with the provider value already thrown away. A transaction
    // that has since left the snapshot window has nothing to restore and must not be
    // held hostage to that patch — otherwise its override could never be removed.
    const snapshotTransaction = await findSnapshotTransaction(userId, transactionId);
    const stillInSnapshot = Boolean(snapshotTransaction);
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

    // A rule that gave the payee this category would give the next one it again,
    // so restoring one of them stops the rule; the others keep their categories.
    // Rules match the provider's direction, which the restored category gives back;
    // when it says none, every same-category rule for the payee goes, since any of
    // them would undo the restore.
    const payee = snapshotTransaction && categoryRulePayee(snapshotTransaction);
    const direction = snapshotTransaction ? providerMoneyDirection(snapshotTransaction, existing.originalCategory) : null;
    const sameCategory = (rule: { category: string[] }) => rule.category.join('|') === existing.category.join('|');
    const rules = payee
      ? (await getCategoryRules(userId)).filter(rule => sameCategory(rule) && rule.investment === payee.investment
        && (direction === null || rule.direction === direction)
        && (rule.counterpartyKey === payee.counterpartyKey || rule.counterpartyKey === payee.legacyCounterpartyKey))
      : [];
    if (rules.length > 0) {
      await getPrismaClient().transactionCategoryRule.deleteMany({ where: { userId, id: { in: rules.map(rule => rule.id) } } });
    }

    scheduleCashFlowCatchUp(userId, 'transaction-category-restored');

    res.json({
      success: true,
      data: {
        transactionId,
        category: existing.originalCategory,
        canonicalTransactionType: canonicalTypeForCategory(existing.originalCategory),
        ruleRemoved: rules.length > 0,
      },
    });
  } catch (error) {
    console.error('Failed to clear transaction category:', error);
    res.status(500).json({ success: false, error: 'Failed to clear transaction category' });
  }
});

// DELETE /api/transaction-categories/rules/:ruleId - Stop giving a payee's new transactions
// its category. The transactions the rule already reached keep theirs.
router.delete('/rules/:ruleId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const raw = req.params.ruleId;
    const ruleId = (Array.isArray(raw) ? raw[0] : raw ?? '').trim();
    const deleted = ruleId
      ? await getPrismaClient().transactionCategoryRule.deleteMany({ where: { id: ruleId, userId: req.user!.id } })
      : { count: 0 };
    if (deleted.count === 0) {
      // The code says the rule is gone, which a page can tell from a route that is missing.
      return res.status(404).json({ success: false, error: 'No such rule', code: 'RULE_NOT_FOUND' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to remove transaction category rule:', error);
    res.status(500).json({ success: false, error: 'Failed to remove the rule' });
  }
});

export default router;
