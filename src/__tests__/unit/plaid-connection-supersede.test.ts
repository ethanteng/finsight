import {
  matchAccountsAcrossConnections,
  normalizeAccountName,
  supersedeDuplicateInstitutionConnections,
  SUPERSEDED_ERROR_CODE,
  toConnectionAccount
} from '../../services/plaid-connection-supersede';

const account = (overrides: Partial<any> & { id: string }) => ({
  plaidAccountId: `plaid-${overrides.id}`,
  persistentAccountId: null,
  name: 'Account',
  type: 'investment',
  subtype: 'brokerage',
  mask: null,
  currentBalance: null,
  ...overrides
});

describe('normalizeAccountName', () => {
  it('decodes HTML entities so escaped and unescaped names compare equal', () => {
    expect(normalizeAccountName('Travel &amp; Healthcare Bridge Fund'))
      .toBe(normalizeAccountName('Travel & Healthcare Bridge Fund'));
  });

  it('collapses whitespace and case', () => {
    expect(normalizeAccountName('  Retirement  -  Roth   IRA ')).toBe('retirement - roth ira');
  });
});

describe('matchAccountsAcrossConnections', () => {
  it('matches on persistent account id before any weaker signal', () => {
    const previous = [account({ id: 'p1', persistentAccountId: 'stable-1', name: 'Old Name', currentBalance: 100 })];
    const current = [
      account({ id: 'c1', persistentAccountId: 'stable-1', name: 'New Name', currentBalance: 250 }),
      account({ id: 'c2', name: 'Old Name', currentBalance: 100 })
    ];

    const result = matchAccountsAcrossConnections(previous, current);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].current.id).toBe('c1');
    expect(result.matches[0].strategy).toBe('persistent-id');
  });

  it('matches on mask within account type when both Items report one', () => {
    const previous = [account({ id: 'p1', mask: '4870', name: 'Goal A', currentBalance: 10 })];
    const current = [account({ id: 'c1', mask: '4870', name: 'Goal A renamed', currentBalance: 11 })];

    const result = matchAccountsAcrossConnections(previous, current);

    expect(result.matches[0].strategy).toBe('mask');
    expect(result.fullyCovered).toBe(true);
  });

  it('resolves the real Betterment relink: names via name pass, renamed goals via balance', () => {
    // Production timestamps: both tokens sync in the same sweep, ~0.6s apart, so the balance pass
    // stays available to the offline cleanup script.
    const oldSync = '2026-08-15T06:06:38.376Z';
    const newSync = '2026-08-15T06:06:37.976Z';
    // Old Item: masks present, names carry a registration suffix, ampersand HTML-escaped.
    const previous = [
      account({ id: 'p1', name: 'Retirement - Roth IRA', subtype: 'roth', mask: '0337', currentBalance: 56039.33, balanceObservedAt: oldSync }),
      account({ id: 'p2', name: 'Retirement - Traditional IRA', subtype: 'ira', mask: '9284', currentBalance: 669403.81, balanceObservedAt: oldSync }),
      account({ id: 'p3', name: 'Retirement - Taxable', mask: '9314', currentBalance: 0, balanceObservedAt: oldSync }),
      account({ id: 'p4', name: 'Mortgage Payoff Fund ($325K by 2035) - Joint Taxable', mask: '4870', currentBalance: 6520.84, balanceObservedAt: oldSync }),
      account({ id: 'p5', name: 'Retirement Bridge Fund ($325K by 2043) - Taxable', mask: '6285', currentBalance: 24752.85, balanceObservedAt: oldSync }),
      account({ id: 'p6', name: 'Travel &amp; Healthcare Bridge Fund ($80K by 2031) - Joint Taxable', mask: '5597', currentBalance: 55436.81, balanceObservedAt: oldSync })
    ];
    // New Item: no masks, cleaner names, identical balances.
    const current = [
      account({ id: 'c1', name: 'Retirement - Roth IRA', subtype: 'roth', currentBalance: 56039.33, balanceObservedAt: newSync }),
      account({ id: 'c2', name: 'Retirement - Traditional IRA', subtype: 'ira', currentBalance: 669403.81, balanceObservedAt: newSync }),
      account({ id: 'c3', name: 'Retirement - Taxable', currentBalance: 0, balanceObservedAt: newSync }),
      account({ id: 'c4', name: 'Mortgage Payoff Fund ($325K by 2035)', currentBalance: 6520.84, balanceObservedAt: newSync }),
      account({ id: 'c5', name: 'Retirement Bridge Fund ($325K by 2043)', currentBalance: 24752.85, balanceObservedAt: newSync }),
      account({ id: 'c6', name: 'Travel & Healthcare Bridge Fund ($80K by 2031)', currentBalance: 55436.81, balanceObservedAt: newSync })
    ];

    const result = matchAccountsAcrossConnections(previous, current);

    expect(result.fullyCovered).toBe(true);
    expect(result.matches).toHaveLength(6);
    const pairs = Object.fromEntries(result.matches.map(m => [m.previous.id, m.current.id]));
    expect(pairs).toEqual({ p1: 'c1', p2: 'c2', p3: 'c3', p4: 'c4', p5: 'c5', p6: 'c6' });
  });

  it('does not match when a key is ambiguous on either side', () => {
    // Two zero-balance brokerage accounts with no distinguishing name, mask, or persistent id.
    const previous = [
      account({ id: 'p1', name: '', currentBalance: 0 }),
      account({ id: 'p2', name: '', currentBalance: 0 })
    ];
    const current = [
      account({ id: 'c1', name: '', currentBalance: 0 }),
      account({ id: 'c2', name: '', currentBalance: 0 })
    ];

    const result = matchAccountsAcrossConnections(previous, current);

    expect(result.matches).toHaveLength(0);
    expect(result.fullyCovered).toBe(false);
  });

  it('reports partial coverage for a genuinely separate login at the same institution', () => {
    // Business checking at the same bank - nothing in the new personal Item covers it.
    const previous = [
      account({ id: 'p1', type: 'depository', subtype: 'checking', name: 'Business Checking', mask: '1111', currentBalance: 5000 })
    ];
    const current = [
      account({ id: 'c1', type: 'depository', subtype: 'checking', name: 'Personal Checking', mask: '2222', currentBalance: 900 })
    ];

    const result = matchAccountsAcrossConnections(previous, current);

    expect(result.fullyCovered).toBe(false);
    expect(result.unmatchedPrevious.map(a => a.id)).toEqual(['p1']);
  });

  it('treats an empty previous connection as not covered', () => {
    expect(matchAccountsAcrossConnections([], [account({ id: 'c1' })]).fullyCovered).toBe(false);
  });

  it('refuses to match on name when the two accounts report different masks', () => {
    // Two logins at one bank both expose an account literally named "Checking". Matching on name
    // would report full coverage and destroy the other login's account.
    const previous = [
      account({ id: 'p1', type: 'depository', subtype: 'checking', name: 'Checking', mask: '1111', currentBalance: 5000 })
    ];
    const current = [
      account({ id: 'c1', type: 'depository', subtype: 'checking', name: 'Checking', mask: '2222', currentBalance: 900 })
    ];

    const result = matchAccountsAcrossConnections(previous, current);

    expect(result.matches).toHaveLength(0);
    expect(result.fullyCovered).toBe(false);
  });

  it('refuses to match on balance when the two accounts report different masks', () => {
    const previous = [account({ id: 'p1', name: 'Goal A', mask: '1111', currentBalance: 250 })];
    const current = [account({ id: 'c1', name: 'Goal B', mask: '2222', currentBalance: 250 })];

    expect(matchAccountsAcrossConnections(previous, current).fullyCovered).toBe(false);
  });

  it('refuses to match when both sides carry different persistent account ids', () => {
    const previous = [account({ id: 'p1', persistentAccountId: 'stable-1', name: 'Checking', currentBalance: 10 })];
    const current = [account({ id: 'c1', persistentAccountId: 'stable-2', name: 'Checking', currentBalance: 10 })];

    expect(matchAccountsAcrossConnections(previous, current).fullyCovered).toBe(false);
  });

  it('refuses to match on balance when the two observations are far apart', () => {
    // Offline cleanup reads persisted balances. Two accounts last synced weeks apart that happen to
    // show the same number have drifted into agreement; that is coincidence, not identity.
    const previous = [account({ id: 'p1', name: 'Goal A', currentBalance: 250, balanceObservedAt: '2026-07-01T00:00:00Z' })];
    const current = [account({ id: 'c1', name: 'Goal B', currentBalance: 250, balanceObservedAt: '2026-08-15T00:00:00Z' })];

    expect(matchAccountsAcrossConnections(previous, current).fullyCovered).toBe(false);
  });

  it('matches on balance when both sides were observed in the same sweep', () => {
    const previous = [account({ id: 'p1', name: 'Goal A', currentBalance: 250, balanceObservedAt: '2026-08-15T06:06:38Z' })];
    const current = [account({ id: 'c1', name: 'Goal B', currentBalance: 250, balanceObservedAt: '2026-08-15T06:06:37Z' })];

    const result = matchAccountsAcrossConnections(previous, current);

    expect(result.fullyCovered).toBe(true);
    expect(result.matches[0].strategy).toBe('balance');
  });

  it('trusts the balance pass when no observation time is supplied', () => {
    // The exchange path fetches both Items moments apart and omits the timestamp.
    const previous = [account({ id: 'p1', name: 'Goal A', currentBalance: 250 })];
    const current = [account({ id: 'c1', name: 'Goal B', currentBalance: 250 })];

    expect(matchAccountsAcrossConnections(previous, current).fullyCovered).toBe(true);
  });

  it('omits persisted observation times during exchange-time reconciliation', () => {
    const previous = [{ ...account({ id: 'p1', name: 'Goal A', currentBalance: 250 }), balanceObservedAt: '2026-07-01T00:00:00Z' }];
    const current = [{ ...account({ id: 'c1', name: 'Goal B', currentBalance: 250 }), balanceObservedAt: '2026-08-15T00:00:00Z' }];

    const asPersisted = (row: (typeof previous)[0]) =>
      toConnectionAccount(
        { ...row, balanceLastFetched: row.balanceObservedAt, lastSynced: row.balanceObservedAt },
        { omitBalanceObservationTime: true }
      );

    const result = matchAccountsAcrossConnections(
      previous.map(asPersisted),
      current.map(asPersisted)
    );

    expect(result.fullyCovered).toBe(true);
    expect(result.matches[0].strategy).toBe('balance');
  });

  it('still matches when only one side reports a mask', () => {
    // The real Betterment relink: old Item has masks, new Item reports none.
    const previous = [account({ id: 'p1', name: 'Retirement - Roth IRA', subtype: 'roth', mask: '0337', currentBalance: 100 })];
    const current = [account({ id: 'c1', name: 'Retirement - Roth IRA', subtype: 'roth', mask: null, currentBalance: 100 })];

    expect(matchAccountsAcrossConnections(previous, current).fullyCovered).toBe(true);
  });
});

describe('supersedeDuplicateInstitutionConnections', () => {
  const buildPrisma = (options: {
    currentAccounts: any[];
    otherTokens: any[];
  }) => {
    const deleted: string[] = [];
    const droppedTransactionsFor: string[] = [];
    const tokenUpdates: Array<{ id: string; data: any }> = [];

    const prisma = {
      account: {
        findMany: jest.fn().mockResolvedValue(options.currentAccounts),
        delete: jest.fn(async ({ where }: any) => {
          deleted.push(where.id);
          return {};
        })
      },
      accessToken: {
        findMany: jest.fn().mockResolvedValue(options.otherTokens),
        update: jest.fn(async ({ where, data }: any) => {
          tokenUpdates.push({ id: where.id, data });
          return {};
        })
      },
      transaction: {
        deleteMany: jest.fn(async ({ where }: any) => {
          droppedTransactionsFor.push(where.accountId);
          return { count: 3 };
        })
      }
    };

    return { prisma, deleted, droppedTransactionsFor, tokenUpdates };
  };

  const currentAccounts = [
    { id: 'c1', plaidAccountId: 'new-1', persistentAccountId: null, name: 'Roth IRA', type: 'investment', subtype: 'roth', mask: null, currentBalance: 100 }
  ];

  it('drops stale transactions, removes duplicates, and deactivates the superseded token', async () => {
    const { prisma, deleted, droppedTransactionsFor, tokenUpdates } = buildPrisma({
      currentAccounts,
      otherTokens: [{
        id: 'stale-token',
        itemId: 'item-old',
        institutionName: 'Betterment',
        accounts: [{ id: 'p1', plaidAccountId: 'old-1', persistentAccountId: null, institution: 'Betterment', name: 'Roth IRA', type: 'investment', subtype: 'roth', mask: null, currentBalance: 100 }]
      }]
    });

    const report = await supersedeDuplicateInstitutionConnections({
      prisma: prisma as any,
      userId: 'user-1',
      keepTokenId: 'keep-token',
      institutionName: 'Betterment'
    });

    // Dropped, never re-pointed: the replacement Item re-imports this history under new ids, and
    // persistence dedupes only on plaidTransactionId, so carrying it over would double-count.
    expect(droppedTransactionsFor).toEqual(['p1']);
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { accountId: 'p1' } });
    expect(deleted).toEqual(['p1']);
    expect(tokenUpdates).toEqual([{ id: 'stale-token', data: { isActive: false, lastError: SUPERSEDED_ERROR_CODE } }]);
    expect(report.superseded).toHaveLength(1);
    expect(report.superseded[0].transactionsDropped).toBe(3);
    expect(report.skipped).toHaveLength(0);
  });

  it('leaves a partially covered connection active and untouched', async () => {
    const { prisma, deleted, droppedTransactionsFor, tokenUpdates } = buildPrisma({
      currentAccounts,
      otherTokens: [{
        id: 'other-login',
        itemId: 'item-business',
        institutionName: 'Betterment',
        accounts: [{ id: 'p9', plaidAccountId: 'old-9', persistentAccountId: null, institution: 'Betterment', name: 'Trust Account', type: 'investment', subtype: 'trust', mask: '4444', currentBalance: 88 }]
      }]
    });

    const report = await supersedeDuplicateInstitutionConnections({
      prisma: prisma as any,
      userId: 'user-1',
      keepTokenId: 'keep-token',
      institutionName: 'Betterment'
    });

    expect(droppedTransactionsFor).toEqual([]);
    expect(deleted).toEqual([]);
    expect(tokenUpdates).toEqual([]);
    expect(report.superseded).toHaveLength(0);
    expect(report.skipped[0]).toMatchObject({ tokenId: 'other-login', reason: 'partial-coverage' });
  });

  it('will not deactivate a token whose untagged accounts were never covered', async () => {
    // Legacy token: one Betterment-tagged account the new Item covers, plus an account with a null
    // institution that nothing covers. Deactivating would strand it from live AND persisted reads.
    const { prisma, deleted, tokenUpdates } = buildPrisma({
      currentAccounts,
      otherTokens: [{
        id: 'legacy-token',
        itemId: 'item-legacy',
        institutionName: 'Betterment',
        accounts: [
          { id: 'p1', plaidAccountId: 'old-1', persistentAccountId: null, institution: 'Betterment', name: 'Roth IRA', type: 'investment', subtype: 'roth', mask: null, currentBalance: 100 },
          { id: 'p2', plaidAccountId: 'old-2', persistentAccountId: null, institution: null, name: 'Untagged Legacy Account', type: 'depository', subtype: 'checking', mask: null, currentBalance: 42 }
        ]
      }]
    });

    const report = await supersedeDuplicateInstitutionConnections({
      prisma: prisma as any,
      userId: 'user-1',
      keepTokenId: 'keep-token',
      institutionName: 'Betterment'
    });

    expect(deleted).toEqual([]);
    expect(tokenUpdates).toEqual([]);
    expect(report.superseded).toHaveLength(0);
    expect(report.skipped[0].unmatchedPreviousNames).toEqual(['Untagged Legacy Account']);
  });

  it('ignores active connections to other institutions', async () => {
    const { prisma, tokenUpdates } = buildPrisma({
      currentAccounts,
      otherTokens: [{
        id: 'chase-token',
        itemId: 'item-chase',
        institutionName: 'Chase',
        accounts: [{ id: 'x1', plaidAccountId: 'chase-1', persistentAccountId: null, institution: 'Chase', name: 'Roth IRA', type: 'investment', subtype: 'roth', mask: null, currentBalance: 100 }]
      }]
    });

    const report = await supersedeDuplicateInstitutionConnections({
      prisma: prisma as any,
      userId: 'user-1',
      keepTokenId: 'keep-token',
      institutionName: 'Betterment'
    });

    expect(tokenUpdates).toEqual([]);
    expect(report.superseded).toHaveLength(0);
    expect(report.skipped).toHaveLength(0);
  });

  it('writes nothing in dry-run mode but still reports what would change', async () => {
    const { prisma, deleted, droppedTransactionsFor, tokenUpdates } = buildPrisma({
      currentAccounts,
      otherTokens: [{
        id: 'stale-token',
        itemId: 'item-old',
        institutionName: 'Betterment',
        accounts: [{ id: 'p1', plaidAccountId: 'old-1', persistentAccountId: null, institution: 'Betterment', name: 'Roth IRA', type: 'investment', subtype: 'roth', mask: null, currentBalance: 100 }]
      }]
    });

    const report = await supersedeDuplicateInstitutionConnections({
      prisma: prisma as any,
      userId: 'user-1',
      keepTokenId: 'keep-token',
      institutionName: 'Betterment',
      dryRun: true
    });

    expect(droppedTransactionsFor).toEqual([]);
    expect(deleted).toEqual([]);
    expect(tokenUpdates).toEqual([]);
    expect(report.superseded).toHaveLength(1);
    expect(report.superseded[0].accountsRemoved).toBe(1);
  });

  it('does not treat an untagged token as belonging to the institution', async () => {
    // Neither AccessToken.institutionName nor any Account.institution is set, so the connection
    // cannot be attributed. Grouping it on guesswork could supersede an unrelated institution -
    // scripts/backfill-institution-names.js is the intended remedy.
    const { prisma, deleted, tokenUpdates } = buildPrisma({
      currentAccounts,
      otherTokens: [{
        id: 'untagged-token',
        itemId: 'item-untagged',
        institutionName: null,
        accounts: [{ id: 'p1', plaidAccountId: 'old-1', persistentAccountId: null, institution: null, name: 'Roth IRA', type: 'investment', subtype: 'roth', mask: null, currentBalance: 100 }]
      }]
    });

    const report = await supersedeDuplicateInstitutionConnections({
      prisma: prisma as any,
      userId: 'user-1',
      keepTokenId: 'keep-token',
      institutionName: 'Betterment'
    });

    expect(deleted).toEqual([]);
    expect(tokenUpdates).toEqual([]);
    expect(report.superseded).toHaveLength(0);
    expect(report.skipped).toHaveLength(0);
  });

  it('does nothing when the surviving connection has no persisted accounts yet', async () => {
    const { prisma, tokenUpdates } = buildPrisma({ currentAccounts: [], otherTokens: [] });

    const report = await supersedeDuplicateInstitutionConnections({
      prisma: prisma as any,
      userId: 'user-1',
      keepTokenId: 'keep-token',
      institutionName: 'Betterment'
    });

    expect(prisma.accessToken.findMany).not.toHaveBeenCalled();
    expect(tokenUpdates).toEqual([]);
    expect(report.superseded).toHaveLength(0);
  });
});
