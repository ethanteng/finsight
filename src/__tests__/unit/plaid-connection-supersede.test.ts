import {
  matchAccountsAcrossConnections,
  normalizeAccountName,
  supersedeDuplicateInstitutionConnections,
  SUPERSEDED_ERROR_CODE
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
    // Old Item: masks present, names carry a registration suffix, ampersand HTML-escaped.
    const previous = [
      account({ id: 'p1', name: 'Retirement - Roth IRA', subtype: 'roth', mask: '0337', currentBalance: 56039.33 }),
      account({ id: 'p2', name: 'Retirement - Traditional IRA', subtype: 'ira', mask: '9284', currentBalance: 669403.81 }),
      account({ id: 'p3', name: 'Retirement - Taxable', mask: '9314', currentBalance: 0 }),
      account({ id: 'p4', name: 'Mortgage Payoff Fund ($325K by 2035) - Joint Taxable', mask: '4870', currentBalance: 6520.84 }),
      account({ id: 'p5', name: 'Retirement Bridge Fund ($325K by 2043) - Taxable', mask: '6285', currentBalance: 24752.85 }),
      account({ id: 'p6', name: 'Travel &amp; Healthcare Bridge Fund ($80K by 2031) - Joint Taxable', mask: '5597', currentBalance: 55436.81 })
    ];
    // New Item: no masks, cleaner names, identical balances.
    const current = [
      account({ id: 'c1', name: 'Retirement - Roth IRA', subtype: 'roth', currentBalance: 56039.33 }),
      account({ id: 'c2', name: 'Retirement - Traditional IRA', subtype: 'ira', currentBalance: 669403.81 }),
      account({ id: 'c3', name: 'Retirement - Taxable', currentBalance: 0 }),
      account({ id: 'c4', name: 'Mortgage Payoff Fund ($325K by 2035)', currentBalance: 6520.84 }),
      account({ id: 'c5', name: 'Retirement Bridge Fund ($325K by 2043)', currentBalance: 24752.85 }),
      account({ id: 'c6', name: 'Travel & Healthcare Bridge Fund ($80K by 2031)', currentBalance: 55436.81 })
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
});

describe('supersedeDuplicateInstitutionConnections', () => {
  const buildPrisma = (options: {
    currentAccounts: any[];
    otherTokens: any[];
  }) => {
    const deleted: string[] = [];
    const migrations: Array<{ from: string; to: string }> = [];
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
        updateMany: jest.fn(async ({ where, data }: any) => {
          migrations.push({ from: where.accountId, to: data.accountId });
          return { count: 3 };
        })
      }
    };

    return { prisma, deleted, migrations, tokenUpdates };
  };

  const currentAccounts = [
    { id: 'c1', plaidAccountId: 'new-1', persistentAccountId: null, name: 'Roth IRA', type: 'investment', subtype: 'roth', mask: null, currentBalance: 100 }
  ];

  it('migrates transactions, removes duplicates, and deactivates the superseded token', async () => {
    const { prisma, deleted, migrations, tokenUpdates } = buildPrisma({
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

    expect(migrations).toEqual([{ from: 'p1', to: 'c1' }]);
    expect(deleted).toEqual(['p1']);
    expect(tokenUpdates).toEqual([{ id: 'stale-token', data: { isActive: false, lastError: SUPERSEDED_ERROR_CODE } }]);
    expect(report.superseded).toHaveLength(1);
    expect(report.superseded[0].transactionsMigrated).toBe(3);
    expect(report.skipped).toHaveLength(0);
  });

  it('leaves a partially covered connection active and untouched', async () => {
    const { prisma, deleted, migrations, tokenUpdates } = buildPrisma({
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

    expect(migrations).toEqual([]);
    expect(deleted).toEqual([]);
    expect(tokenUpdates).toEqual([]);
    expect(report.superseded).toHaveLength(0);
    expect(report.skipped[0]).toMatchObject({ tokenId: 'other-login', reason: 'partial-coverage' });
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
    const { prisma, deleted, migrations, tokenUpdates } = buildPrisma({
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

    expect(migrations).toEqual([]);
    expect(deleted).toEqual([]);
    expect(tokenUpdates).toEqual([]);
    expect(report.superseded).toHaveLength(1);
    expect(report.superseded[0].accountsRemoved).toBe(1);
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
