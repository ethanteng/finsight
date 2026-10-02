export interface CachedCategorization {
  aiCategory: string | null;
  aiCategoryReason: string | null;
  categoryComparedAt: Date | null;
}

export interface CategorizationCachePolicy {
  /** How long an ordinary cached categorization is trusted; 0 disables reuse. */
  ttlMs: number;
  /** Age after which a posted transaction's categorization never needs redoing. */
  settledAfterMs: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function categorizationCachePolicy(env: typeof process.env = process.env): CategorizationCachePolicy {
  const ttlHours = Number.parseInt(env.CATEGORIZATION_CACHE_TTL_HOURS || '24', 10);
  const settledDays = Number.parseInt(env.CATEGORIZATION_SETTLED_AFTER_DAYS || '30', 10);
  return {
    ttlMs: Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours * HOUR_MS : 0,
    settledAfterMs: Number.isFinite(settledDays) && settledDays > 0 ? settledDays * DAY_MS : Infinity,
  };
}

export function isManualCategorization(cached: CachedCategorization): boolean {
  const reason = cached.aiCategoryReason?.toLowerCase() || '';
  return reason.includes('manually corrected') || reason.includes('corrected by user');
}

/**
 * Whether a stored categorization can be reused instead of categorizing again.
 *
 * A posted transaction stops changing at the provider within days, so once it is
 * settled its stored categorization stays valid however old it is. Expiring it
 * would send every row the deterministic mapping cannot place back to the model
 * on each nightly pass, making the model bill grow with the history window.
 */
export function isCachedCategorizationFresh(
  cached: CachedCategorization,
  transaction: { pending?: unknown; date?: unknown; authorized_date?: unknown },
  now: number,
  policy: CategorizationCachePolicy
): boolean {
  if (!cached.aiCategory) return false;
  if (isManualCategorization(cached)) return true;

  if (transaction.pending !== true) {
    const posted = new Date(String(transaction.date || transaction.authorized_date || ''));
    if (!Number.isNaN(posted.getTime()) && now - posted.getTime() > policy.settledAfterMs) {
      return true;
    }
  }

  return cached.categoryComparedAt instanceof Date &&
    policy.ttlMs > 0 &&
    now - cached.categoryComparedAt.getTime() <= policy.ttlMs;
}
