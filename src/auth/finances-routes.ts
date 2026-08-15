import express from 'express';
import { requireAuth, type AuthenticatedRequest } from './middleware';
import { getPrismaClient } from '../prisma-client';
import { ProfileManager } from '../profile/manager';
import { getLatestFinancialSnapshot } from '../services/financial-snapshot-persistence';
import {
  buildFinancesAccountDetails,
  buildFinancesOverview,
  type FinancesHomeData,
} from '../services/finances-overview-service';

const router = express.Router();

async function getCurrentHome(userId: string): Promise<FinancesHomeData | null> {
  const profileManager = new ProfileManager();
  const profileText = await profileManager.getOriginalProfile(userId);
  const home = profileManager.extractHomeData(profileText);
  if (!home.address || home.value === null || home.value <= 0) return null;
  return {
    address: home.address,
    value: home.value,
    valueLow: home.valueLow,
    valueHigh: home.valueHigh,
    lastUpdated: home.lastUpdated?.toISOString() || '',
    isManualOverride: home.isManualOverride,
    isSnapshotAligned: false,
  };
}

// One lightweight, revisioned contract for the Finances page. Heavy holdings
// and transaction arrays are intentionally omitted and loaded per account.
router.get('/overview', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const prisma = getPrismaClient();
    const [snapshot, manualAccounts, user] = await Promise.all([
      getLatestFinancialSnapshot(userId, 'finances'),
      prisma.manualAccount.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { monthlyIncomeOverride: true, monthlyExpenseOverride: true, timeZone: true },
      }),
    ]);

    if (!snapshot) return res.status(204).send();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const meta = snapshot.meta && typeof snapshot.meta === 'object' ? snapshot.meta as any : {};
    const currentHome = meta.home
      ? null
      : await getCurrentHome(userId).catch(() => null);

    return res.json(buildFinancesOverview({
      snapshot: snapshot as any,
      manualAccounts,
      overrides: {
        monthlyIncome: user.monthlyIncomeOverride,
        monthlyExpense: user.monthlyExpenseOverride,
      },
      currentHome,
      userTimeZone: user.timeZone,
    }));
  } catch (error) {
    console.error('Failed to build finances overview:', error);
    return res.status(500).json({ error: 'Failed to load finances overview' });
  }
});

router.get('/accounts/:id/details', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) return res.status(400).json({ error: 'Account id is required' });
    const snapshot = await getLatestFinancialSnapshot(req.user!.id, 'full');
    if (!snapshot) return res.status(404).json({ error: 'Financial snapshot not found' });
    const details = buildFinancesAccountDetails(snapshot as any, decodeURIComponent(id));
    if (!details) return res.status(404).json({ error: 'Account not found in current snapshot' });
    return res.json(details);
  } catch (error) {
    console.error('Failed to load finances account details:', error);
    return res.status(500).json({ error: 'Failed to load account details' });
  }
});

export default router;
