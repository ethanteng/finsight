import {
  closureFor,
  resolveAccountClosures,
  snapshotHasProviderGap,
  type PersistedAccountRecord,
  type ResolveAccountClosuresInput,
} from '../../services/account-closure-service';

const SNAPSHOT_AT = new Date('2026-08-15T12:00:00.000Z');
const BEFORE_SNAPSHOT = new Date('2026-01-01T00:00:00.000Z');
const AFTER_SNAPSHOT = new Date('2026-08-15T18:00:00.000Z');

const ACTIVE_CONNECTIONS = { ids: ['token-1'], institutions: ['Bank of Somewhere'] };

const record = (overrides: Partial<PersistedAccountRecord> & { plaidAccountId: string }): PersistedAccountRecord => ({
  createdAt: BEFORE_SNAPSHOT,
  lastSeenAt: BEFORE_SNAPSHOT,
  accessTokenId: 'token-1',
  ...overrides,
});

const resolve = (input: Omit<ResolveAccountClosuresInput, 'activeConnections'> &
  Partial<Pick<ResolveAccountClosuresInput, 'activeConnections'>>) =>
  resolveAccountClosures({ activeConnections: ACTIVE_CONNECTIONS, ...input });

describe('resolveAccountClosures', () => {
  it('flags a persisted account the latest snapshot no longer contains', () => {
    const closures = resolve({
      accounts: [{ account_id: 'open-1' }, { account_id: 'closed-1' }],
      snapshotAccounts: [{ account_id: 'open-1' }],
      snapshotComputedAt: SNAPSHOT_AT,
      persistedRecords: [
        record({ plaidAccountId: 'open-1' }),
        record({ plaidAccountId: 'closed-1', lastSeenAt: new Date('2026-03-04T00:00:00.000Z') }),
      ],
    });

    expect(closureFor(closures, { account_id: 'open-1' }).isClosed).toBe(false);
    expect(closureFor(closures, { account_id: 'closed-1' })).toEqual({
      isClosed: true,
      lastSeenAt: '2026-03-04T00:00:00.000Z',
    });
  });

  it('matches snapshot accounts on any provider identifier', () => {
    const closures = resolve({
      accounts: [{ account_id: 'relinked-new', persistentAccountId: 'stable-1' }],
      snapshotAccounts: [{ account_id: 'relinked-old', persistentAccountId: 'stable-1' }],
      snapshotComputedAt: SNAPSHOT_AT,
      persistedRecords: [record({ plaidAccountId: 'relinked-new', persistentAccountId: 'stable-1' })],
    });

    expect(closureFor(closures, { account_id: 'relinked-new' }).isClosed).toBe(false);
  });

  it('never flags an account linked after the snapshot was computed', () => {
    const closures = resolve({
      accounts: [{ account_id: 'brand-new' }],
      snapshotAccounts: [{ account_id: 'other' }],
      snapshotComputedAt: SNAPSHOT_AT,
      persistedRecords: [record({ plaidAccountId: 'brand-new', createdAt: AFTER_SNAPSHOT })],
    });

    expect(closureFor(closures, { account_id: 'brand-new' }).isClosed).toBe(false);
  });

  it('never flags an account a provider refreshed after the snapshot was computed', () => {
    // A balance refresh updates the row without rebuilding the snapshot.
    const closures = resolve({
      accounts: [{ account_id: 'refreshed-1' }],
      snapshotAccounts: [{ account_id: 'other' }],
      snapshotComputedAt: SNAPSHOT_AT,
      persistedRecords: [record({ plaidAccountId: 'refreshed-1', lastSeenAt: AFTER_SNAPSHOT })],
    });

    expect(closureFor(closures, { account_id: 'refreshed-1' }).isClosed).toBe(false);
  });

  it('never flags an account with no persisted row, such as a manual account', () => {
    const closures = resolve({
      accounts: [{ account_id: 'manual-123' }],
      snapshotAccounts: [{ account_id: 'other' }],
      snapshotComputedAt: SNAPSHOT_AT,
      persistedRecords: [],
    });

    expect(closureFor(closures, { account_id: 'manual-123' }).isClosed).toBe(false);
  });

  it('flags nothing when there is no snapshot to compare against', () => {
    const closures = resolve({
      accounts: [{ account_id: 'anything' }],
      snapshotAccounts: null,
      snapshotComputedAt: null,
      persistedRecords: [record({ plaidAccountId: 'anything' })],
    });

    expect(closureFor(closures, { account_id: 'anything' }).isClosed).toBe(false);
  });

  it('flags persisted accounts when the snapshot is empty because every account was closed', () => {
    const closures = resolve({
      accounts: [{ account_id: 'closed-only' }],
      snapshotAccounts: [],
      snapshotComputedAt: SNAPSHOT_AT,
      persistedRecords: [record({ plaidAccountId: 'closed-only' })],
    });

    expect(closureFor(closures, { account_id: 'closed-only' }).isClosed).toBe(true);
  });

  it('reports a closed account with no refresh timestamp as closed without a date', () => {
    const closures = resolve({
      accounts: [{ account_id: 'closed-2' }],
      snapshotAccounts: [{ account_id: 'open-1' }],
      snapshotComputedAt: SNAPSHOT_AT,
      persistedRecords: [record({ plaidAccountId: 'closed-2', lastSeenAt: null })],
    });

    expect(closureFor(closures, { account_id: 'closed-2' })).toEqual({
      isClosed: true,
      lastSeenAt: null,
    });
  });

  it('flags nothing when the snapshot was built with a failing provider fetch', () => {
    const closures = resolve({
      accounts: [{ account_id: 'unreachable-1' }],
      snapshotAccounts: [{ account_id: 'open-1' }],
      snapshotComputedAt: SNAPSHOT_AT,
      persistedRecords: [record({ plaidAccountId: 'unreachable-1' })],
      snapshotHasProviderGap: true,
    });

    expect(closureFor(closures, { account_id: 'unreachable-1' }).isClosed).toBe(false);
  });

  describe('connection availability', () => {
    // An expired connection is skipped by the snapshot rebuild without recording
    // an error, so its accounts go missing for reasons unrelated to closure.
    it('never flags an account whose connection is no longer active', () => {
      const closures = resolve({
        accounts: [{ account_id: 'needs-reauth' }],
        snapshotAccounts: [{ account_id: 'other-source' }],
        snapshotComputedAt: SNAPSHOT_AT,
        persistedRecords: [record({ plaidAccountId: 'needs-reauth', accessTokenId: 'expired-token' })],
      });

      expect(closureFor(closures, { account_id: 'needs-reauth' }).isClosed).toBe(false);
    });

    it('never flags anything when every connection has gone inactive', () => {
      const closures = resolve({
        accounts: [{ account_id: 'needs-reauth' }],
        snapshotAccounts: [],
        snapshotComputedAt: SNAPSHOT_AT,
        persistedRecords: [record({ plaidAccountId: 'needs-reauth' })],
        activeConnections: { ids: [], institutions: [] },
      });

      expect(closureFor(closures, { account_id: 'needs-reauth' }).isClosed).toBe(false);
    });

    it('places a legacy row with no connection id by institution name', () => {
      const closures = resolve({
        accounts: [{ account_id: 'legacy-closed' }, { account_id: 'legacy-unknown' }],
        snapshotAccounts: [{ account_id: 'other' }],
        snapshotComputedAt: SNAPSHOT_AT,
        persistedRecords: [
          record({ plaidAccountId: 'legacy-closed', accessTokenId: null, institution: 'bank of somewhere' }),
          record({ plaidAccountId: 'legacy-unknown', accessTokenId: null, institution: 'Some Other Bank' }),
        ],
      });

      expect(closureFor(closures, { account_id: 'legacy-closed' }).isClosed).toBe(true);
      expect(closureFor(closures, { account_id: 'legacy-unknown' }).isClosed).toBe(false);
    });

    it('never flags a legacy row that carries neither a connection id nor an institution', () => {
      const closures = resolve({
        accounts: [{ account_id: 'legacy-orphan' }],
        snapshotAccounts: [{ account_id: 'other' }],
        snapshotComputedAt: SNAPSHOT_AT,
        persistedRecords: [record({ plaidAccountId: 'legacy-orphan', accessTokenId: null, institution: null })],
      });

      expect(closureFor(closures, { account_id: 'legacy-orphan' }).isClosed).toBe(false);
    });
  });

  it('treats an account it has never seen as open', () => {
    const closures = resolve({
      accounts: [],
      snapshotAccounts: [{ account_id: 'open-1' }],
      snapshotComputedAt: SNAPSHOT_AT,
      persistedRecords: [],
    });

    expect(closureFor(closures, { account_id: 'unknown' })).toEqual({
      isClosed: false,
      lastSeenAt: null,
    });
  });
});

describe('snapshotHasProviderGap', () => {
  it('detects a Plaid provider error observation', () => {
    expect(snapshotHasProviderGap([
      { id: 'account:abc', status: 'available' },
      { id: 'plaid:error:token-1', status: 'unavailable' },
    ])).toBe(true);
  });

  it('detects a partial-data observation', () => {
    expect(snapshotHasProviderGap([{ id: 'financial-data:partial' }])).toBe(true);
  });

  it('ignores observations that only report age or classification problems', () => {
    expect(snapshotHasProviderGap([
      { id: 'account:abc', status: 'available' },
      { id: 'account:abc:classification', status: 'unavailable' },
      { id: 'home-value', status: 'unavailable' },
    ])).toBe(false);
  });

  it('treats a missing observation list as no gap', () => {
    expect(snapshotHasProviderGap(undefined)).toBe(false);
    expect(snapshotHasProviderGap(null)).toBe(false);
  });
});
