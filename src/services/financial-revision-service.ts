import { cacheService } from '../data/cache';
import { getLatestFinancialSnapshot } from './financial-snapshot-persistence';
import { SummaryCacheService, type SummaryComputeOptions } from './summary-cache-service';

export interface FinancialRevisionOptions extends SummaryComputeOptions {
  /** Defaults to true so mutations cannot reuse a pre-mutation source cache. */
  invalidateSourceCache?: boolean;
}

interface QueuedRevision {
  options: FinancialRevisionOptions;
  label: string;
}

/** Single orchestration boundary for producing a new canonical financial revision. */
export class FinancialRevisionService {
  // A full revision re-reads every connected provider, so it is measured in tens of
  // seconds. Overlapping runs for one user would multiply that provider load and let
  // an earlier run finish last, overwriting the newer snapshot. Keep one run per user
  // in flight and collapse everything requested during it into a single follow-up run.
  private static readonly inFlight = new Map<string, Promise<void>>();
  private static readonly queued = new Map<string, QueuedRevision>();

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
    if (this.inFlight.has(userId)) {
      this.queued.set(userId, { options, label });
      return;
    }
    setImmediate(() => {
      // A run may have started between scheduling and this callback.
      if (this.inFlight.has(userId)) {
        this.queued.set(userId, { options, label });
        return;
      }
      this.run(userId, options, label);
    });
  }

  /** Resolves once no revision is running or queued for the user. Test/shutdown helper. */
  static async whenIdle(userId: string): Promise<void> {
    let pending = this.inFlight.get(userId);
    while (pending) {
      await pending;
      pending = this.inFlight.get(userId);
    }
  }

  private static run(userId: string, options: FinancialRevisionOptions, label: string): void {
    const run = this.recompute(userId, options)
      .then(() => undefined)
      .catch(error => {
        console.warn(`${label}: financial revision refresh failed`, error);
      })
      .finally(() => {
        this.inFlight.delete(userId);
        const next = this.queued.get(userId);
        if (next) {
          this.queued.delete(userId);
          this.run(userId, next.options, next.label);
        }
      });
    this.inFlight.set(userId, run);
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
