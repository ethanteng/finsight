import { formatAccountAsOf } from '@/lib/account-as-of';

const now = new Date('2026-08-21T12:00:00.000Z');

describe('per-account as-of line', () => {
  it('dates an account from its own observation', () => {
    const asOf = formatAccountAsOf({ dataAsOf: '2026-08-20T20:49:05.342Z' }, now);

    expect(asOf?.label).toBe('Updated Aug 20');
    expect(asOf?.isStale).toBe(false);
  });

  // An account frozen since last November read as "Updated Nov 23" beside one
  // synced this morning -- the same shape, nine months apart. The year is the
  // only thing that separates them at a glance.
  it('spells out the year once the observation is from another year', () => {
    const asOf = formatAccountAsOf(
      { dataAsOf: '2025-11-23T23:58:28.598Z', isDataStale: true },
      now
    );

    expect(asOf?.label).toBe('Updated Nov 23, 2025');
    expect(asOf?.isStale).toBe(true);
  });

  it('says nothing for an account the snapshot never observed', () => {
    expect(formatAccountAsOf({ dataAsOf: null }, now)).toBeNull();
    expect(formatAccountAsOf({}, now)).toBeNull();
  });

  // A server that predates the field sends no timestamp at all. Rendering
  // "Invalid Date" would be worse than rendering nothing.
  it('says nothing for a timestamp it cannot parse', () => {
    expect(formatAccountAsOf({ dataAsOf: 'not-a-date' }, now)).toBeNull();
  });
});
