import { cacheService } from '../data/cache';
import { getLatestFinancialSnapshot } from './financial-snapshot-persistence';
import { SummaryCacheService, type SummaryComputeOptions } from './summary-cache-service';
import type { HistoryWriteIntent } from './financial-history-service';

export interface FinancialRevisionOptions extends SummaryComputeOptions {
  /** Defaults to true so mutations cannot reuse a pre-mutation source cache. */
  invalidateSourceCache?: boolean;
}

interface QueuedRevision {
  options: FinancialRevisionOptions;
  label: string;
}

// A material observation records a balance-sheet change with an explicit reason; a daily
// one is routine; none writes no observation. Collapsing two requests must not downgrade
// the history a caller asked for, so the strongest pending intent wins.
const HISTORY_INTENT_RANK: Record<HistoryWriteIntent['kind'], number> = {
  none: 0,
  daily: 1,
  material: 2,
};

function strongestHistoryIntent(
  previous: HistoryWriteIntent | undefined,
  next: HistoryWriteIntent | undefined
): HistoryWriteIntent | undefined {
  if (!previous) return next;
  if (!next) return previous;
  return HISTORY_INTENT_RANK[next.kind] >= HISTORY_INTENT_RANK[previous.kind] ? next : previous;
}

/** Single orchestration boundary for producing a new canonical financial revision. */
export class FinancialRevisionService {
  // A full revision re-reads every connected provider, so it is measured in tens of
  // seconds. Overlapping runs for one user would multiply that provider load and let
  // an earlier run finish last, overwriting the newer snapshot. Keep one run per user
  // in flight and collapse everything requested during it into a single follow-up run.
  private static readonly inFlight = new Map<string, Promise<void>>();
  private static readonly queued = new Map<string, QueuedRevision>();
  // Marked synchronously by schedule() and cleared only when nothing is left to run, so a
  // request arriving between schedule() and the setImmediate callback still sees the work.
  private static readonly pending = new Set<string>();

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
    this.pending.add(userId);
    if (this.inFlight.has(userId)) {
      this.enqueue(userId, options, label);
      return;
    }
    setImmediate(() => {
      // A run may have started between scheduling and this callback.
      if (this.inFlight.has(userId)) {
        this.enqueue(userId, options, label);
        return;
      }
      this.run(userId, options, label);
    });
  }

  /**
   * Whether a revision for this user is scheduled, running, or queued. Process-local: with
   * more than one instance, a request served elsewhere reports false, so treat false as
   * "nothing known to be pending here" rather than proof the snapshot is final.
   */
  static isPending(userId: string): boolean {
    return this.pending.has(userId);
  }

  /** Resolves once no revision is running or queued for the user. Test/shutdown helper. */
  static async whenIdle(userId: string): Promise<void> {
    let running = this.inFlight.get(userId);
    while (running) {
      await running;
      running = this.inFlight.get(userId);
    }
  }

  private static enqueue(userId: string, options: FinancialRevisionOptions, label: string): void {
    const existing = this.queued.get(userId);
    const history = strongestHistoryIntent(existing?.options.history, options.history);
    this.queued.set(userId, {
      // Provider inputs are re-read either way, so the newest options win — except history,
      // which is a record of what changed and must not be downgraded by a later plain run.
      options: history ? { ...options, history } : options,
      label: existing && history && history === existing.options.history ? existing.label : label,
    });
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
          return;
        }
        this.pending.delete(userId);
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
