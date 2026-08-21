import { accountObservedAt, latestObservedAt } from '../../services/account-observation-time';

const earlier = new Date('2026-08-19T10:00:00.000Z');
const later = new Date('2026-08-21T03:05:00.000Z');
const syncOnly = new Date('2026-08-21T05:00:00.000Z');

describe('account observation time', () => {
  it('prefers the balance fetch over the transaction sync', () => {
    expect(accountObservedAt({ balanceLastFetched: later, lastSynced: earlier })).toEqual(later);
  });

  // Investment accounts can go a long time without a transaction, so a record
  // with no balance fetch still has the sync as evidence we heard from it.
  it('falls back to the transaction sync when no balance was fetched', () => {
    expect(accountObservedAt({ balanceLastFetched: null, lastSynced: earlier })).toEqual(earlier);
  });

  it('reports nothing for an account never observed', () => {
    expect(accountObservedAt({ balanceLastFetched: null, lastSynced: null })).toBeNull();
    expect(latestObservedAt([{ balanceLastFetched: null, lastSynced: null }])).toBeNull();
    expect(latestObservedAt([])).toBeNull();
  });

  // The connection-level timestamp answers "when did we last hear from this
  // bank", so the newest account wins; a laggard is a per-account concern.
  it('takes the newest observation across a connection', () => {
    expect(latestObservedAt([
      { balanceLastFetched: earlier },
      { balanceLastFetched: later },
      { balanceLastFetched: null, lastSynced: null },
    ])).toEqual(later);
  });

  it('ignores accounts that were never observed rather than treating them as oldest', () => {
    expect(latestObservedAt([{ balanceLastFetched: null }, { lastSynced: earlier }])).toEqual(earlier);
  });

  // Live transaction sync writes AccessToken.lastTransactionSync and leaves
  // existing Account.lastSynced untouched, so the token timestamp must count.
  it('folds in connection-level sync timestamps', () => {
    expect(latestObservedAt(
      [{ balanceLastFetched: null, lastSynced: null }],
      syncOnly,
    )).toEqual(syncOnly);
    expect(latestObservedAt(
      [{ balanceLastFetched: later }],
      syncOnly,
    )).toEqual(syncOnly);
    expect(latestObservedAt(
      [{ balanceLastFetched: syncOnly }],
      later,
    )).toEqual(syncOnly);
  });
});
