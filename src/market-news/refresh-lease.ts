import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../prisma-client';

const PROCESS_IDENTITY = process.env.RENDER_INSTANCE_ID || String(process.pid);

export interface ScheduledRefreshLeaseOptions {
  name: string;
  /** Do not repeat a successful scheduled run inside this window. */
  minimumIntervalMs: number;
  /** Recover automatically if the process dies while holding the lease. */
  leaseDurationMs: number;
  /** Ignore the success window, but never overlap an active run. */
  force?: boolean;
}

export interface ScheduledRefreshLease {
  acquired: boolean;
  ownerId: string;
  reason?: 'active_lease' | 'already_fresh';
}

export async function acquireScheduledRefreshLease(
  options: ScheduledRefreshLeaseOptions
): Promise<ScheduledRefreshLease> {
  const prisma = getPrismaClient();
  // A fencing token belongs to one acquisition, not one process. If a stale
  // run outlives its lease, its completion must not release a successor lease
  // acquired by the same application instance.
  const ownerId = `${PROCESS_IDENTITY}:${randomUUID()}`;
  const now = new Date();
  const dueBefore = new Date(now.getTime() - options.minimumIntervalMs);
  const leaseUntil = new Date(now.getTime() + options.leaseDurationMs);
  const freshnessWhere = options.force
    ? {}
    : {
        OR: [
          { lastCompletedAt: null },
          { lastCompletedAt: { lte: dueBefore } },
        ],
      };

  const updated = await prisma.scheduledJobLease.updateMany({
    where: {
      name: options.name,
      leaseUntil: { lte: now },
      ...freshnessWhere,
    },
    data: {
      ownerId,
      leaseUntil,
      lastStartedAt: now,
      lastError: null,
    },
  });
  if (updated.count === 1) return { acquired: true, ownerId };

  try {
    await prisma.scheduledJobLease.create({
      data: {
        name: options.name,
        ownerId,
        leaseUntil,
        lastStartedAt: now,
      },
    });
    return { acquired: true, ownerId };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
  }

  const existing = await prisma.scheduledJobLease.findUnique({ where: { name: options.name } });
  return {
    acquired: false,
    ownerId,
    reason: existing && existing.leaseUntil > now ? 'active_lease' : 'already_fresh',
  };
}

export async function completeScheduledRefreshLease(name: string, ownerId: string): Promise<void> {
  const now = new Date();
  await getPrismaClient().scheduledJobLease.updateMany({
    where: { name, ownerId },
    data: {
      leaseUntil: now,
      lastCompletedAt: now,
      lastError: null,
    },
  });
}

export async function failScheduledRefreshLease(
  name: string,
  ownerId: string,
  error: unknown
): Promise<void> {
  const now = new Date();
  const message = error instanceof Error ? error.message : String(error);
  await getPrismaClient().scheduledJobLease.updateMany({
    where: { name, ownerId },
    data: {
      leaseUntil: now,
      lastError: message.slice(0, 2000),
    },
  });
}
