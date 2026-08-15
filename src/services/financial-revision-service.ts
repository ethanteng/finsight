import { cacheService } from '../data/cache';
import { getLatestFinancialSnapshot } from './financial-snapshot-persistence';
import { SummaryCacheService, type SummaryComputeOptions } from './summary-cache-service';

export interface FinancialRevisionOptions extends SummaryComputeOptions {
  /** Defaults to true so mutations cannot reuse a pre-mutation source cache. */
  invalidateSourceCache?: boolean;
}

/** Single orchestration boundary for producing a new canonical financial revision. */
export class FinancialRevisionService {
  static async recompute(userId: string, options: FinancialRevisionOptions = {}) {
    if (options.invalidateSourceCache !== false) {
      await cacheService.invalidate(`financial-data:${userId}`);
    }
    const { invalidateSourceCache: _invalidateSourceCache, ...computeOptions } = options;
    return SummaryCacheService.computeForUser(userId, computeOptions);
  }

  static schedule(
    userId: string,
    options: FinancialRevisionOptions,
    label: string
  ): void {
    setImmediate(() => {
      this.recompute(userId, options).catch(error => {
        console.warn(`${label}: financial revision refresh failed`, error);
      });
    });
  }

  static async recomputeIfStale(
    userId: string,
    maxAgeMs: number,
    options: FinancialRevisionOptions = {}
  ) {
    const snapshot = await getLatestFinancialSnapshot(userId, 'summary');
    const computedAt = snapshot?.computedAt ? new Date(snapshot.computedAt) : null;
    const expired = !computedAt || Date.now() - computedAt.getTime() > maxAgeMs;
    if (snapshot && snapshot.status === 'current' && !expired) return snapshot;
    return this.recompute(userId, options);
  }
}

export default FinancialRevisionService;
