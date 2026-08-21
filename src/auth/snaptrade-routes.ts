import express from 'express';
import { snapTradeService } from '../snaptrade';
import { requireAuth } from './middleware';
import { getPrismaClient } from '../prisma-client';

const router = express.Router();

// GET /snaptrade/status - Get SnapTrade service status
router.get('/status', async (req, res) => {
  try {
    const isHealthy = await snapTradeService.healthCheck();
    res.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'snaptrade',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('SnapTrade status check failed:', error);
    res.status(500).json({
      error: 'Failed to check SnapTrade status',
      status: 'error'
    });
  }
});

// GET /snaptrade/config - Get SnapTrade configuration (for debugging)
router.get('/config', async (req, res) => {
  try {
    const snapTradeMode = process.env.SNAPTRADE_MODE || 'sandbox';
    const clientId = process.env.SNAPTRADE_CLIENT_ID;
    const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
    const clientIdProd = process.env.SNAPTRADE_CLIENT_ID_PROD;
    const consumerKeyProd = process.env.SNAPTRADE_CONSUMER_KEY_PROD;
    
    // Determine which credentials will be used
    const getSnapTradeCredentials = () => {
      if (snapTradeMode === 'production') {
        return {
          clientId: clientIdProd || clientId,
          consumerKey: consumerKeyProd || consumerKey,
          env: process.env.SNAPTRADE_ENV_PROD || 'production'
        };
      } else {
        return {
          clientId: clientId,
          consumerKey: consumerKey,
          env: 'sandbox'
        };
      }
    };
    
    const credentials = getSnapTradeCredentials();
    
    res.json({
      mode: snapTradeMode,
      environment: credentials.env,
      hasClientId: !!credentials.clientId,
      hasConsumerKey: !!credentials.consumerKey,
      credentialsConfigured: !!(credentials.clientId && credentials.consumerKey),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('SnapTrade config check failed:', error);
    res.status(500).json({
      error: 'Failed to check SnapTrade configuration',
      status: 'error'
    });
  }
});

// GET /snaptrade/status/user - Get user's SnapTrade status
router.get('/status/user', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const result = await snapTradeService.getUserStatus(userId);
    
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(404).json({
        error: result.error,
        status: 'not_initialized'
      });
    }
  } catch (error) {
    console.error('SnapTrade user status check failed:', error);
    res.status(500).json({
      error: 'Failed to get user SnapTrade status',
      status: 'error'
    });
  }
});

// POST /snaptrade/init - Initialize SnapTrade for user
router.post('/init', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    console.log('🔍 Initializing SnapTrade for user:', userId);
    
    const result = await snapTradeService.registerUser(userId);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'SnapTrade initialized successfully',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('SnapTrade initialization failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize SnapTrade'
    });
  }
});

// POST /snaptrade/login - Get login redirect URI
router.post('/login', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    console.log('🔍 Getting login redirect for user:', userId);
    
    // Get user from database to get userSecret
    const db = getPrismaClient();
    const user = await db.snapTradeUser.findUnique({
      where: { userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'SnapTrade user not found. Please initialize first.'
      });
    }

    // Reconnecting repairs the named authorization instead of adding a second
    // connection to the same brokerage. Read from the body so the reconnect
    // affordance can pass the authorization it is offering to fix; absent, this
    // stays the ordinary "connect an account" flow.
    const reconnectAuthorizationId = typeof req.body?.reconnect === 'string' && req.body.reconnect.trim()
      ? req.body.reconnect.trim()
      : undefined;

    // Confirm the authorization is actually this user's before handing it to
    // SnapTrade. The userId/userSecret pair almost certainly makes a foreign id
    // fail upstream, but "almost certainly" is not a control: this turns a
    // caller-supplied id into a checked one and returns a clear 400 instead of
    // a provider error. Only the reconnect path pays for the extra lookup.
    //
    // Fail open when the accounts lookup itself fails: a transient SnapTrade
    // outage must not block reconnect with a false "unknown connection", which
    // is exactly when the user needs the portal. Provider scoping still applies.
    if (reconnectAuthorizationId) {
      const accountsResult = await snapTradeService.getUserAccounts(userId, user.userSecret);
      if (accountsResult.success && Array.isArray(accountsResult.data?.accounts)) {
        const owned = accountsResult.data.accounts.some(
          (account: any) => account?.brokerageAuthorizationId === reconnectAuthorizationId
        );
        if (!owned) {
          console.warn(
            `SnapTrade login: refusing reconnect for an authorization not belonging to user ${userId}`
          );
          return res.status(400).json({
            success: false,
            error: 'Unknown brokerage connection for this user.'
          });
        }
      } else {
        console.warn(
          `SnapTrade login: could not verify reconnect ownership for user ${userId}` +
          `${accountsResult.error ? ` (${accountsResult.error})` : ''}; proceeding with provider-scoped credentials`
        );
      }
    }

    const result = await snapTradeService.getLoginRedirect(
      userId,
      user.userSecret,
      reconnectAuthorizationId
    );
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Login redirect URI obtained',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('SnapTrade login redirect failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get login redirect'
    });
  }
});

// GET /snaptrade/accounts - Get user accounts
router.get('/accounts', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    console.log('🔍 Getting accounts for user:', userId);
    
    // Get user from database to get userSecret
    const db = getPrismaClient();
    const user = await db.snapTradeUser.findUnique({
      where: { userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'SnapTrade user not found. Please initialize first.'
      });
    }

    const result = await snapTradeService.getUserAccounts(userId, user.userSecret);
    
    if (result.success) {
      // ✅ Merge with database accounts to get custom names
      // Fetch accounts from database to get any custom names
      const dbAccounts = await db.account.findMany({
        where: {
          userId
        },
        select: {
          plaidAccountId: true,
          name: true
        }
      });
      
      // Filter to only SnapTrade accounts
      const snapTradeDbAccounts = dbAccounts.filter(acc => 
        acc.plaidAccountId && acc.plaidAccountId.startsWith('snaptrade-')
      );
      
      // Create a map of plaidAccountId -> custom name
      const customNamesMap = new Map<string, string>();
      snapTradeDbAccounts.forEach(acc => {
        customNamesMap.set(acc.plaidAccountId, acc.name);
      });
      
      // Update account names with custom names from database
      if (result.data?.accounts) {
        result.data.accounts = result.data.accounts.map((account: any) => {
          const accountId = account.id.startsWith('snaptrade-') ? account.id : `snaptrade-${account.id}`;
          const customName = customNamesMap.get(accountId);
          if (customName) {
            return {
              ...account,
              id: accountId,
              name: customName // Use custom name from database
            };
          }
          return {
            ...account,
            id: accountId
          };
        });
      }
      
      res.json({
        success: true,
        message: 'Accounts retrieved successfully',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('SnapTrade get accounts failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get accounts'
    });
  }
});

// GET /snaptrade/activities - Get user activities (transactions)
router.get('/activities', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    console.log('🔍 Getting activities for user:', userId);
    
    // Get user from database to get userSecret
    const db = getPrismaClient();
    const user = await db.snapTradeUser.findUnique({
      where: { userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'SnapTrade user not found. Please initialize first.'
      });
    }

    const result = await snapTradeService.getUserActivities(userId, user.userSecret);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Activities retrieved successfully',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('SnapTrade get activities failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get activities'
    });
  }
});

// GET /snaptrade/holdings - Get user holdings
router.get('/holdings', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    console.log('🔍 Getting holdings for user:', userId);
    
    // Get user from database to get userSecret
    const db = getPrismaClient();
    const user = await db.snapTradeUser.findUnique({
      where: { userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'SnapTrade user not found. Please initialize first.'
      });
    }

    const result = await snapTradeService.getUserHoldings(userId, user.userSecret);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Holdings retrieved successfully',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('SnapTrade get holdings failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get holdings'
    });
  }
});

// POST /snaptrade/connections/:authorizationId/refresh - Ask SnapTrade to re-sync a
// brokerage connection now, instead of waiting for its own cache schedule.
//
// Cooldown is process-local, so a multi-instance deployment can let a second
// request through. That is deliberate: the authoritative limit is SnapTrade's
// own (425/429), which the service surfaces as its own message. This map exists
// to stop an impatient user from spending their refresh allowance on repeat
// clicks, not to be the limit.
const refreshCooldownMs = 5 * 60 * 1000;
const lastRefreshRequest = new Map<string, number>();

// Remember account ids after the provider confirms a remove, so a failed local
// cleanup can be retried even though SnapTrade no longer lists those accounts.
// Process-local like the refresh cooldown: an immediate retry on this instance
// recovers; a multi-instance hop or process restart still cannot, and the user
// would need Disconnect-all (or a durable pending row) to finish cleanup.
type PendingDisconnect = {
  accountIds: string[];
  institution: string;
  createdAt: number;
};
const pendingDisconnectTtlMs = 24 * 60 * 60 * 1000;
const pendingDisconnects = new Map<string, PendingDisconnect>();

function pendingDisconnectKey(userId: string, authorizationId: string): string {
  return `${userId}:${authorizationId}`;
}

function prunePendingDisconnects(now = Date.now()): void {
  for (const [key, pending] of pendingDisconnects) {
    if (pending.createdAt < now - pendingDisconnectTtlMs) pendingDisconnects.delete(key);
  }
}

/**
 * Account ids the persisted snapshot recorded against this authorization.
 *
 * The durable half of the split-state recovery above. The pending map is exact
 * but process-local, and the database outage it exists to survive is also the
 * kind of incident that restarts a process -- so on its own it would strand the
 * rows it was meant to save. The snapshot carries `brokerageAuthorizationId` per
 * account and outlives both restarts and instance hops, which is enough to
 * finish a cleanup once the provider has stopped reporting the accounts.
 *
 * Snapshot rows and local Account rows are written by the same revision, so an
 * account with rows to clean up has a snapshot entry to find it by.
 */
async function snapshotAccountsForAuthorization(
  db: any,
  userId: string,
  authorizationId: string,
): Promise<{ accountIds: string[]; institution: string | null }> {
  try {
    const snapshot = await db.financialSummarySnapshot.findUnique({
      where: { userId },
      select: { accounts: true },
    });
    const accounts = Array.isArray(snapshot?.accounts) ? snapshot.accounts as any[] : [];
    const owned = accounts.filter(
      account => account?.source === 'snaptrade' && account?.brokerageAuthorizationId === authorizationId
    );
    return {
      accountIds: owned
        .map(account => String(account.account_id || account.id || ''))
        .filter(id => id.startsWith('snaptrade-')),
      institution: owned.find(account => account?.institution)?.institution || null,
    };
  } catch (error) {
    // Recovery is best-effort: failing to read the snapshot must not turn a
    // disconnect into an error, it just leaves the caller with the other paths.
    console.warn('SnapTrade disconnect: snapshot lookup for stranded accounts failed:', error);
    return { accountIds: [], institution: null };
  }
}

router.post('/connections/:authorizationId/refresh', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const authorizationId = String(req.params.authorizationId || '').trim();
    if (!authorizationId) {
      return res.status(400).json({ success: false, error: 'A brokerage connection id is required.' });
    }

    const db = getPrismaClient();
    const user = await db.snapTradeUser.findUnique({ where: { userId } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'SnapTrade user not found. Please initialize first.'
      });
    }

    // Confirm the authorization is this user's before spending a refresh on it.
    // Unlike the reconnect flow this fails closed: reconnect fails open because a
    // user locked out of the portal has no other repair path, while a refresh
    // that cannot be attributed is simply not worth a metered provider write.
    const accountsResult = await snapTradeService.getUserAccounts(userId, user.userSecret);
    if (!accountsResult.success || !Array.isArray(accountsResult.data?.accounts)) {
      console.warn(
        `SnapTrade refresh: could not verify ownership for user ${userId}` +
        `${accountsResult.error ? ` (${accountsResult.error})` : ''}`
      );
      // Expired credentials are not a transient outage. Surfacing them as 503
      // would send the user to "try again" when the real fix is reconnect.
      const credentialsInvalid = /credential|expired|unauthorized|reconnect/i.test(
        accountsResult.error || ''
      );
      if (credentialsInvalid) {
        return res.status(401).json({
          success: false,
          error: 'SnapTrade credentials invalid or expired. Please reconnect your SnapTrade account.',
        });
      }
      return res.status(503).json({
        success: false,
        error: 'Could not reach SnapTrade to verify this connection. Please try again.'
      });
    }
    const owned = accountsResult.data.accounts.some(
      (account: any) => account?.brokerageAuthorizationId === authorizationId
    );
    if (!owned) {
      console.warn(`SnapTrade refresh: refusing an authorization not belonging to user ${userId}`);
      return res.status(400).json({ success: false, error: 'Unknown brokerage connection for this user.' });
    }

    // Entries older than the cooldown can never reject anything, so dropping them
    // keeps the map bounded by concurrent use rather than by lifetime users.
    const expiredBefore = Date.now() - refreshCooldownMs;
    for (const [key, requestedAt] of lastRefreshRequest) {
      if (requestedAt < expiredBefore) lastRefreshRequest.delete(key);
    }

    const cooldownKey = `${userId}:${authorizationId}`;
    const lastRequestedAt = lastRefreshRequest.get(cooldownKey);
    if (lastRequestedAt !== undefined && Date.now() - lastRequestedAt < refreshCooldownMs) {
      const retryAfterSeconds = Math.ceil((refreshCooldownMs - (Date.now() - lastRequestedAt)) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        error: 'This connection was refreshed a moment ago. Please try again later.',
        retryAfterSeconds,
      });
    }

    const result = await snapTradeService.refreshConnection(userId, user.userSecret, authorizationId);
    if (!result.success) {
      const rateLimited = result.status === 425 || result.status === 429;
      // A rate limit is the provider saying "too soon", so start the cooldown on
      // it too: without that, repeat clicks keep reaching SnapTrade's metered
      // limit to be told the same thing, and the local guard only ever helps the
      // user who did not need it. It strands nobody -- the provider is already
      // refusing. Every other failure consumed nothing, so it must not lock the
      // user out of retrying once the cause clears.
      if (rateLimited) lastRefreshRequest.set(cooldownKey, Date.now());
      const status = rateLimited
        ? 429
        : result.status === 401
          ? 401
          : 502;
      return res.status(status).json({
        success: false,
        error: result.error,
      });
    }
    lastRefreshRequest.set(cooldownKey, Date.now());

    // No snapshot rebuild here. SnapTrade schedules the syncs and returns before
    // they finish, so rebuilding now would re-read the same cached holdings and
    // write a revision identical to the one the user is already looking at. The
    // next scheduled rebuild picks the new data up.
    return res.json({
      success: true,
      message: 'Refresh requested. Updated balances usually arrive within a few minutes.',
      data: result.data,
    });
  } catch (error) {
    console.error('SnapTrade connection refresh failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to request a refresh' });
  }
});

// Accounts grouped by the brokerage authorization that backs them. One
// authorization covers every account at one institution, and it is the unit the
// user connects, reconnects, refreshes, and now disconnects -- so it is the unit
// the UI lists, rather than making someone infer the grouping from account names.
//
// Authorizations are seeded first so a pending or empty connection (no accounts
// returned yet) still appears and can be disconnected, instead of being omitted
// because nothing account-derived pointed at it.
function groupAccountsByConnection(accounts: any[], authorizations: any[] = []) {
  const connections = new Map<string, any>();
  for (const authorization of authorizations) {
    const id = authorization?.id;
    if (!id) continue;
    connections.set(id, {
      id,
      institution: authorization.institution || 'Unknown',
      disabled: Boolean(authorization.disabled),
      disabledAt: authorization.disabledAt || null,
      statusUnavailable: false,
      lastHoldingsSync: null as string | null,
      accounts: [] as Array<{ id: string; name: string; lastHoldingsSync: string | null }>,
    });
  }
  for (const account of accounts) {
    // An account SnapTrade returns without an authorization cannot be
    // disconnected on its own, so it is left out rather than listed under a
    // button that could not work.
    const id = account?.brokerageAuthorizationId;
    if (!id) continue;
    let connection = connections.get(id);
    if (!connection) {
      connection = {
        id,
        institution: account.institution || 'Unknown',
        disabled: Boolean(account.connectionDisabled),
        disabledAt: account.connectionDisabledAt || null,
        statusUnavailable: Boolean(account.connectionStatusUnavailable),
        lastHoldingsSync: null as string | null,
        accounts: [] as Array<{ id: string; name: string; lastHoldingsSync: string | null }>,
      };
      connections.set(id, connection);
    } else {
      // Health is per authorization; OR flags so a later disabled account cannot
      // be masked by an earlier healthy sibling under the same connection.
      if (account.connectionDisabled) connection.disabled = true;
      if (account.connectionStatusUnavailable) connection.statusUnavailable = true;
      if (account.connectionDisabledAt && (!connection.disabledAt || account.connectionDisabledAt < connection.disabledAt)) {
        connection.disabledAt = account.connectionDisabledAt;
      }
      if (!connection.institution || connection.institution === 'Unknown') {
        connection.institution = account.institution || connection.institution;
      }
    }
    const accountId = String(account.id || '').startsWith('snaptrade-')
      ? String(account.id)
      : `snaptrade-${account.id}`;
    const lastHoldingsSync = account.lastSuccessfulHoldingsSync || null;
    connection.accounts.push({ id: accountId, name: account.name, lastHoldingsSync });
    // The newest sync across the connection's accounts. Shown so a user deciding
    // whether to disconnect can see how long this link has actually been useful,
    // which is the question that brings anyone to this screen.
    if (lastHoldingsSync && (!connection.lastHoldingsSync || lastHoldingsSync > connection.lastHoldingsSync)) {
      connection.lastHoldingsSync = lastHoldingsSync;
    }
  }
  return [...connections.values()];
}

// GET /snaptrade/connections - List brokerage connections, one row per institution
router.get('/connections', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const db = getPrismaClient();
    const user = await db.snapTradeUser.findUnique({ where: { userId } });
    // Not an error: a user who never connected a brokerage has no connections,
    // and the list should render empty rather than as a failure.
    if (!user) return res.json({ success: true, data: { connections: [] } });

    const accountsResult = await snapTradeService.getUserAccounts(userId, user.userSecret);
    if (!accountsResult.success || !Array.isArray(accountsResult.data?.accounts)) {
      return res.status(502).json({
        success: false,
        error: accountsResult.error || 'Failed to load SnapTrade connections',
      });
    }

    // Custom names, so the list matches what the user renamed accounts to
    // everywhere else rather than showing the brokerage's raw labels.
    const dbAccounts = await db.account.findMany({
      where: { userId },
      select: { plaidAccountId: true, name: true },
    });
    const customNames = new Map(
      dbAccounts
        .filter(account => account.plaidAccountId?.startsWith('snaptrade-'))
        .map(account => [account.plaidAccountId, account.name] as const)
    );

    const authorizations = Array.isArray(accountsResult.data.authorizations)
      ? accountsResult.data.authorizations
      : [];
    const connections = groupAccountsByConnection(accountsResult.data.accounts, authorizations).map(connection => ({
      ...connection,
      accounts: connection.accounts.map((account: any) => ({
        ...account,
        name: customNames.get(account.id) || account.name,
      })),
    }));

    return res.json({ success: true, data: { connections } });
  } catch (error) {
    console.error('SnapTrade list connections failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to load SnapTrade connections' });
  }
});

// DELETE /snaptrade/connections/:authorizationId - Disconnect one institution
router.delete('/connections/:authorizationId', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const authorizationId = String(req.params.authorizationId || '').trim();
    if (!authorizationId) {
      return res.status(400).json({ success: false, error: 'A brokerage connection id is required.' });
    }

    const db = getPrismaClient();
    const user = await db.snapTradeUser.findUnique({ where: { userId } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'SnapTrade user not found. Please initialize first.'
      });
    }

    prunePendingDisconnects();
    const pendingKey = pendingDisconnectKey(userId, authorizationId);
    const pending = pendingDisconnects.get(pendingKey);

    // The account list has to be read BEFORE the removal: afterwards SnapTrade no
    // longer reports these accounts, and there would be nothing left to identify
    // the rows this institution owns. Everything the cleanup needs is captured now.
    // A prior attempt that already removed the provider auth may leave a pending
    // entry so this retry can finish local cleanup without that list.
    const accountsResult = await snapTradeService.getUserAccounts(userId, user.userSecret);
    if (!accountsResult.success || !Array.isArray(accountsResult.data?.accounts)) {
      // Pending recovery does not need a fresh account list — the ids were
      // captured before the provider remove on the earlier attempt.
      if (!pending) {
        console.warn(
          `SnapTrade disconnect: could not read accounts for user ${userId}` +
          `${accountsResult.error ? ` (${accountsResult.error})` : ''}`
        );
        // Fails closed. Removing the authorization while blind to its accounts
        // would strand their rows in the snapshot with no connection left to
        // identify or repair them.
        return res.status(503).json({
          success: false,
          error: 'Could not reach SnapTrade to confirm which accounts belong to this institution. Please try again.'
        });
      }
    }

    const liveAccounts = Array.isArray(accountsResult.data?.accounts) ? accountsResult.data.accounts : [];
    const authorizations = Array.isArray(accountsResult.data?.authorizations)
      ? accountsResult.data.authorizations
      : [];
    const ownedAccounts = liveAccounts.filter(
      (account: any) => account?.brokerageAuthorizationId === authorizationId
    );
    const authorization = authorizations.find((entry: any) => entry?.id === authorizationId);

    // Only consulted when the provider reports neither accounts nor the
    // authorization itself -- that is, when it has already forgotten this
    // connection. An id that was never this user's has nothing here either, so
    // the ownership check stays closed.
    const needsStrandedLookup = ownedAccounts.length === 0 && !pending && !authorization;
    const stranded = needsStrandedLookup
      ? await snapshotAccountsForAuthorization(db, userId, authorizationId)
      : { accountIds: [] as string[], institution: null };

    let institution: string;
    let accountIds: string[];
    if (ownedAccounts.length > 0) {
      institution = ownedAccounts[0]?.institution || authorization?.institution || 'this institution';
      accountIds = ownedAccounts.map((account: any) =>
        String(account.id).startsWith('snaptrade-') ? String(account.id) : `snaptrade-${account.id}`
      );
    } else if (pending) {
      // Provider already dropped this authorization on a prior attempt; finish
      // the local delete with the ids captured then.
      institution = pending.institution;
      accountIds = pending.accountIds;
    } else if (stranded.accountIds.length > 0) {
      // Same split state as `pending`, but after the process that recorded it
      // restarted or the retry landed on another instance. The snapshot outlives
      // both, so the cleanup still completes instead of stranding the rows.
      institution = stranded.institution || 'this institution';
      accountIds = stranded.accountIds;
    } else if (authorization) {
      // Linked brokerage with no accounts yet (pending/incomplete). Still
      // removable — there is nothing local to clear beyond the provider auth.
      institution = authorization.institution || 'this institution';
      accountIds = [];
    } else {
      console.warn(`SnapTrade disconnect: refusing an authorization not belonging to user ${userId}`);
      return res.status(404).json({ success: false, error: 'Unknown brokerage connection for this user.' });
    }

    const removal = await snapTradeService.removeConnection(userId, user.userSecret, authorizationId);
    if (!removal.success) {
      return res.status(removal.status === 401 ? 401 : 502).json({
        success: false,
        error: removal.error,
      });
    }

    // Record cleanup targets only after the provider confirms the auth is gone,
    // so a failed removal never leaves a pending entry that could delete live data.
    pendingDisconnects.set(pendingKey, {
      accountIds,
      institution,
      createdAt: Date.now(),
    });

    // Local cleanup runs only after the provider confirms the connection is gone,
    // so a failed removal never leaves the user with deleted history and a live
    // connection that would re-import it on the next sync.
    const removedRows = await db.$transaction(async tx => {
      const accounts = await tx.account.findMany({
        where: { userId, plaidAccountId: { in: accountIds } },
        select: { id: true },
      });
      const accountRowIds = accounts.map(account => account.id);
      const transactions = await tx.transaction.deleteMany({
        where: { accountId: { in: accountRowIds } },
      });
      const activities = await tx.snapTradeActivity.deleteMany({
        where: { snapTradeUser: { userId }, accountId: { in: accountIds } },
      });
      const deletedAccounts = await tx.account.deleteMany({
        where: { userId, plaidAccountId: { in: accountIds } },
      });
      return {
        accounts: deletedAccounts.count,
        transactions: transactions.count,
        activities: activities.count,
      };
    });

    pendingDisconnects.delete(pendingKey);

    console.log(
      `🔌 SnapTrade: disconnected ${institution} for user ${userId} ` +
      `(${removedRows.accounts} accounts, ${removedRows.transactions} transactions, ${removedRows.activities} activities removed)`
    );

    // The snapshot still holds this institution's accounts and balances, and
    // Ask Linc answers from it. Rebuilding is what actually removes the
    // institution from the user's totals and from anything the model can see.
    try {
      const { FinancialRevisionService } = await import('../services/financial-revision-service');
      FinancialRevisionService.schedule(userId, {
        categorize: false,
        history: { kind: 'material', reason: 'snaptrade-connection-disconnected' },
      }, 'SnapTrade disconnect');
    } catch {
      // Non-fatal: the rows are already gone, and the next scheduled rebuild
      // reconciles the snapshot even if this one could not be queued.
    }

    return res.json({
      success: true,
      message: `${institution} disconnected. Its accounts and history have been removed.`,
      data: { institution, removed: removedRows, alreadyRemovedAtProvider: Boolean(removal.alreadyRemoved) },
    });
  } catch (error) {
    console.error('SnapTrade disconnect connection failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to disconnect this institution' });
  }
});

// DELETE /snaptrade/delete - Delete SnapTrade user
router.delete('/delete', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    console.log('🔍 Deleting SnapTrade user:', userId);
    
    const result = await snapTradeService.deleteUser(userId);
    
    if (result.success) {
      // Ask Linc reads FinancialSummarySnapshot; refresh so removed SnapTrade accounts drop out of GPT context
      try {
        const { FinancialRevisionService } = await import('../services/financial-revision-service');
        FinancialRevisionService.schedule(userId, {
          categorize: false,
          history: { kind: 'material', reason: 'snaptrade-account-deleted' },
        }, 'SnapTrade delete');
      } catch {
        // non-fatal
      }
      res.json({
        success: true,
        message: 'SnapTrade user deleted successfully',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('SnapTrade delete user failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete SnapTrade user'
    });
  }
});

export default router;

// Setup function to register SnapTrade routes
export const setupSnapTradeRoutes = (app: any) => {
  console.log('🔧 Setting up SnapTrade routes...');
  app.use('/snaptrade', router);
  console.log('✅ SnapTrade routes setup completed');
};
