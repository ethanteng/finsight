import express from 'express';
import { requireAuth, AuthenticatedRequest } from './middleware';
import { getPrismaClient } from '../prisma-client';
import {
  applyStatedFigureUpdate,
  parseStatedFigures,
  type StatedFigureSource,
} from '../services/stated-figures';
import { getFinancialSnapshotForAnalysis } from '../services/financial-snapshot-persistence';
import {
  balanceBasis,
  incomeLinked,
  linkedDataFromSnapshot,
  spendingLinked,
} from '../openai/linked-data';

const router = express.Router();

/**
 * What the user's accounts already say, so Your numbers can tell them which
 * figures it needs and which their accounts cover. Null where the snapshot
 * cannot say (one that predates the record), and the page then asks nothing
 * it cannot justify.
 */
async function coverageFor(userId: string) {
  const snapshot = await getFinancialSnapshotForAnalysis(userId, { includeAccounts: true });
  const linked = linkedDataFromSnapshot(snapshot);
  if (!linked) return null;
  return {
    investments: balanceBasis(linked, 'investments'),
    cash: balanceBasis(linked, 'cash'),
    debt: balanceBasis(linked, 'debt'),
    incomeFromTransactions: incomeLinked(linked),
    spendingFromTransactions: spendingLinked(linked),
  };
}

// GET /api/stated-figures - the saved plan, and what linked or entered accounts already cover
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const [row, coverage] = await Promise.all([
      getPrismaClient().statedFigures.findUnique({ where: { userId }, select: { figures: true } }),
      coverageFor(userId).catch((error) => {
        console.warn('Your numbers: coverage unavailable:', error);
        return null;
      }),
    ]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ figures: parseStatedFigures(row?.figures), coverage });
  } catch (error) {
    console.error('Failed to load stated figures:', error);
    res.status(500).json({ error: 'Failed to load your numbers' });
  }
});

// PUT /api/stated-figures - set figures (a value) or clear them (null)
router.put('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const changes = req.body?.figures;
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).length === 0) {
      return res.status(400).json({ error: 'figures must name at least one figure to set or clear' });
    }
    const source: StatedFigureSource = req.body?.source === 'answer' ? 'answer' : 'page';

    const prisma = getPrismaClient();
    // Read, apply and write in one transaction, so two saves at once (the page
    // and an answer) cannot each drop the other's figure.
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.statedFigures.findUnique({ where: { userId }, select: { figures: true } });
      const update = applyStatedFigureUpdate(parseStatedFigures(row?.figures), changes, source);
      if (Object.keys(update.rejected).length > 0) return update;
      await tx.statedFigures.upsert({
        where: { userId },
        create: { userId, figures: update.figures as object },
        update: { figures: update.figures as object },
      });
      return update;
    });

    if (Object.keys(result.rejected).length > 0) {
      return res.status(400).json({ error: 'Some figures could not be saved', rejected: result.rejected });
    }
    res.json({ figures: result.figures });
  } catch (error) {
    console.error('Failed to save stated figures:', error);
    res.status(500).json({ error: 'Failed to save your numbers' });
  }
});

export default router;
