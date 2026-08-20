import express from 'express';
import { requireAuth, type AuthenticatedRequest } from './middleware';
import { getPrismaClient } from '../prisma-client';
import { ProfileManager } from '../profile/manager';
import { getLatestFinancialSnapshot } from '../services/financial-snapshot-persistence';
import { FinancialRevisionService } from '../services/financial-revision-service';
import {
  buildFinancesAccountDetails,
  buildFinancesOverview,
  type FinancesHomeData,
} from '../services/finances-overview-service';
import { isUserActionRequiredPlaidError } from '../services/plaid-error-classification';

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
    const [snapshot, manualAccounts, connectedAccounts, user, accessTokens] = await Promise.all([
      getLatestFinancialSnapshot(userId, 'finances'),
      prisma.manualAccount.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      // Renaming an account writes here and only reaches the snapshot on the next rebuild,
      // which re-reads every provider. Read the names live so a rename shows up at once.
      prisma.account.findMany({ where: { userId }, select: { plaidAccountId: true, name: true } }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { monthlyIncomeOverride: true, monthlyExpenseOverride: true, timeZone: true },
      }),
      // Connection health is not in the snapshot: the snapshot records what the
      // providers returned, not whether the link to them still works. A superseded
      // row is excluded -- it was already replaced by a re-link, so nagging about
      // it would point at a connection the user has fixed.
      prisma.accessToken.findMany({
        where: { userId, supersededAt: null },
        select: { id: true, lastError: true, institutionName: true },
      }),
    ]);

    if (!snapshot) return res.status(204).send();
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Connected accounts are keyed by plaidAccountId (SnapTrade rows use `snaptrade-{id}`);
    // manual accounts have no Account row and appear in the snapshot as `manual-{id}`.
    const accountNames = new Map<string, string>();
    for (const account of connectedAccounts) {
      if (account.plaidAccountId) accountNames.set(account.plaidAccountId, account.name);
    }
    for (const account of manualAccounts) {
      accountNames.set(`manual-${account.id}`, account.name);
    }

    const meta = snapshot.meta && typeof snapshot.meta === 'object' ? snapshot.meta as any : {};
    const currentHome = meta.home
      ? null
      : await getCurrentHome(userId).catch(() => null);

    // Matched on the stored Plaid error code, which both the token-status endpoint
    // and the nightly refresh write. Only codes with a real repair path count, so
    // this never points a user at a screen that cannot help them.
    const reauthRequiredConnections = accessTokens
      .filter(token => isUserActionRequiredPlaidError(token.lastError))
      .map(token => ({
        id: token.id,
        institutionName: token.institutionName,
        provider: 'plaid' as const,
      }));

    // SnapTrade connection health does come from the snapshot, unlike Plaid's:
    // it is recorded per account when the brokerage authorizations are read, so
    // reading it here costs no extra provider call and describes the same
    // revision the page is about to render.
    //
    // Only `disabled` counts. `connectionStatusUnavailable` means health could
    // not be determined -- often a transient lookup failure -- and there is
    // nothing for the user to do about it, so prompting would be noise. Same
    // rule the Plaid filter above follows.
    //
    // Deduplicated by authorization because one brokerage connection backs
    // several accounts, and the notice counts connections, not accounts.
    const snapshotAccounts: any[] = Array.isArray((snapshot as any).accounts)
      ? (snapshot as any).accounts
      : [];
    const disabledSnapTradeConnections = new Map<string, { id: string; institutionName: string | null; provider: 'snaptrade' }>();
    for (const account of snapshotAccounts) {
      if (account?.source !== 'snaptrade' || account?.connectionDisabled !== true) continue;
      const connectionId = account.brokerageAuthorizationId || account.account_id;
      if (!connectionId || disabledSnapTradeConnections.has(connectionId)) continue;
      disabledSnapTradeConnections.set(connectionId, {
        id: connectionId,
        institutionName: account.institution || null,
        provider: 'snaptrade',
      });
    }
    reauthRequiredConnections.push(...(disabledSnapTradeConnections.values() as any));

    return res.json(buildFinancesOverview({
      snapshot: snapshot as any,
      manualAccounts,
      overrides: {
        monthlyIncome: user.monthlyIncomeOverride,
        monthlyExpense: user.monthlyExpenseOverride,
      },
      currentHome,
      userTimeZone: user.timeZone,
      rebuildPending: FinancialRevisionService.isPending(userId),
      accountNames,
      reauthRequiredConnections,
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
