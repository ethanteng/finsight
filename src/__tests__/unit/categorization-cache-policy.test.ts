import {
  categorizationCachePolicy,
  isCachedCategorizationFresh,
} from '../../services/categorization-cache-policy';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-10-01T12:00:00.000Z');
const policy = { ttlMs: DAY, settledAfterMs: 30 * DAY };

const cached = (overrides: Partial<{ aiCategory: string | null; aiCategoryReason: string | null; categoryComparedAt: Date | null }> = {}) => ({
  aiCategory: 'transfer_out',
  aiCategoryReason: 'GPT categorization',
  categoryComparedAt: new Date(now - 3 * DAY),
  ...overrides,
});

describe('isCachedCategorizationFresh', () => {
  it('reuses a settled transaction categorization however old it is', () => {
    expect(isCachedCategorizationFresh(cached(), { date: '2026-06-01' }, now, policy)).toBe(true);
  });

  it('re-categorizes a recent transaction once the TTL has passed', () => {
    expect(isCachedCategorizationFresh(cached(), { date: '2026-09-25' }, now, policy)).toBe(false);
  });

  it('reuses a recent transaction categorization within the TTL', () => {
    const recent = cached({ categoryComparedAt: new Date(now - 2 * 60 * 60 * 1000) });
    expect(isCachedCategorizationFresh(recent, { date: '2026-09-25' }, now, policy)).toBe(true);
  });

  it('never treats a pending transaction as settled', () => {
    expect(isCachedCategorizationFresh(cached(), { date: '2026-06-01', pending: true }, now, policy)).toBe(false);
  });

  it('always keeps a manual correction', () => {
    const manual = cached({ aiCategoryReason: 'Manually corrected by user', categoryComparedAt: null });
    expect(isCachedCategorizationFresh(manual, { date: '2026-09-30' }, now, policy)).toBe(true);
  });

  it('has nothing to reuse without a stored category', () => {
    expect(isCachedCategorizationFresh(cached({ aiCategory: null }), { date: '2026-01-01' }, now, policy)).toBe(false);
  });

  it('ignores an unreadable date rather than treating the row as settled', () => {
    expect(isCachedCategorizationFresh(cached(), { date: 'not-a-date' }, now, policy)).toBe(false);
  });
});

describe('categorizationCachePolicy', () => {
  it('defaults to a 24 hour TTL and a 30 day settlement age', () => {
    expect(categorizationCachePolicy({})).toEqual({ ttlMs: DAY, settledAfterMs: 30 * DAY });
  });

  it('disables settlement when configured to zero', () => {
    expect(categorizationCachePolicy({ CATEGORIZATION_SETTLED_AFTER_DAYS: '0' }).settledAfterMs).toBe(Infinity);
  });
});
