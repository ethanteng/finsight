import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../prisma-client';
import { isAdminOperatorEmail } from '../auth/admin-emails';
import {
  addRunningTrials,
  CHARGE_EVENT_TYPES,
  firstChargesFromEvents,
  trialStartsFromEvents,
  type LoggedStripeEvent,
} from './stripe-events';
import { buildActivationReport, buildEngagementReport, windowStart } from './engine';
import { resolveFirstLink, type FirstLinkEvidence } from './first-link';
import type {
  ActivationReport,
  CohortExclusions,
  CohortMember,
  CohortSegment,
  CohortWindow,
  EngagementReport,
  EngagementRule,
  FirstLink,
} from './types';

/** Stripe statuses that mean the account is paying now. */
const PAYING_STATUSES = ['active', 'past_due'];
const PLAID_REMOVAL_REASONS = ['plaid-connection-disconnected'];
const SNAPTRADE_REMOVAL_REASONS = ['snaptrade-connection-disconnected', 'snaptrade-account-deleted'];
const PUBLIC_HISTORY_REASONS = ['public-direct-connected', 'public-direct-disconnected'];
/** Keeps every `IN (...)` well under PostgreSQL's bind-parameter limit. */
const ID_CHUNK = 1000;

const QUESTION_NOTE = 'A question is one typed into Ask Linc. Calculator results saved into a new account are not counted.';
const OPERATOR_NOTE = 'Accounts in ADMIN_EMAILS are left out. Deleted accounts are gone from every cohort, along with their questions.';
const SEGMENT_NOTES: Record<CohortSegment, string> = {
  signup: 'Signup cohorts are every new account, from its signup.',
  trial: 'Trial cohorts are accounts that started a Stripe trial (automatic on no-card signup, Convert to trial in User Management, or a checkout card trial), from the day the trial started. A signup whose trial grant failed is only in signup cohorts until converted by hand.',
  paid: 'Paid cohorts start at the first successful charge above $0 logged from Stripe, so a converted account also appears in its signup and trial cohorts.',
};
const LINK_NOTE = 'Linking means a Plaid bank, a SnapTrade brokerage, or a Public key that has verified. Disconnecting deletes those records, so someone who linked and later removed every connection counts only when the removal was recorded in history. SnapTrade links are dated from registration, the first step of connecting.';

const USER_SELECT = {
  id: true,
  email: true,
  createdAt: true,
  subscriptionStatus: true,
  tier: true,
  lastLoginAt: true,
} as const;

interface UserRow {
  id: string;
  email: string;
  createdAt: Date;
  subscriptionStatus: string;
  tier: string;
  lastLoginAt: Date | null;
}

interface StripeMilestones {
  trialStarts: Map<string, Date>;
  firstCharges: Map<string, Date>;
}

function chunks<T>(items: T[]): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += ID_CHUNK) result.push(items.slice(index, index + ID_CHUNK));
  return result;
}

/**
 * When each account's first trial began and when it was first charged.
 *
 * Both are built in SQL so only the fields they need cross the wire: every
 * logged webhook carries a full invoice or subscription, one per renewal and
 * per subscription change. Numbers are type-checked before they are cast, so a
 * malformed payload is skipped rather than failing the query.
 */
async function loadStripeMilestones(): Promise<StripeMilestones> {
  const prisma = getPrismaClient();
  const [chargeEvents, trialEvents, customers, subscriptions] = await Promise.all([
    prisma.$queryRaw<LoggedStripeEvent[]>`
      SELECT
        se."processedAt",
        s."userId" AS "subscriptionUserId",
        jsonb_build_object('object', jsonb_build_object(
          'amount_paid', se."eventData"->'object'->'amount_paid',
          'customer', se."eventData"->'object'->'customer',
          'subscription', se."eventData"->'object'->'subscription',
          'parent', se."eventData"->'object'->'parent',
          'status_transitions', se."eventData"->'object'->'status_transitions',
          'created', se."eventData"->'object'->'created'
        )) AS "eventData"
      FROM "subscription_events" se
      LEFT JOIN "subscriptions" s ON s."id" = se."subscriptionId"
      WHERE se."eventType" IN (${Prisma.join([...CHARGE_EVENT_TYPES])})
        AND CASE
          WHEN jsonb_typeof(se."eventData"->'object'->'amount_paid') = 'number'
            THEN (se."eventData"->'object'->>'amount_paid')::numeric > 0
          ELSE false
        END
    `,
    prisma.$queryRaw<LoggedStripeEvent[]>`
      SELECT
        se."processedAt",
        s."userId" AS "subscriptionUserId",
        jsonb_build_object('object', jsonb_build_object(
          'id', se."eventData"->'object'->'id',
          'customer', se."eventData"->'object'->'customer',
          'trial_start', se."eventData"->'object'->'trial_start'
        )) AS "eventData"
      FROM "subscription_events" se
      LEFT JOIN "subscriptions" s ON s."id" = se."subscriptionId"
      WHERE se."eventType" LIKE 'customer.subscription.%'
        AND jsonb_typeof(se."eventData"->'object'->'trial_start') = 'number'
    `,
    prisma.user.findMany({
      where: { stripeCustomerId: { not: null } },
      select: { id: true, stripeCustomerId: true },
    }),
    prisma.subscription.findMany({
      select: {
        userId: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        status: true,
        createdAt: true,
        currentPeriodStart: true,
      },
    }),
  ]);
  const userByCustomer = new Map<string, string>();
  const userBySubscription = new Map<string, string>();
  for (const subscription of subscriptions) {
    userByCustomer.set(subscription.stripeCustomerId, subscription.userId);
    userBySubscription.set(subscription.stripeSubscriptionId, subscription.userId);
  }
  // The user's own customer id is the current one, so it wins over a stale subscription row.
  for (const user of customers) {
    if (user.stripeCustomerId) userByCustomer.set(user.stripeCustomerId, user.id);
  }
  return {
    trialStarts: addRunningTrials(trialStartsFromEvents(trialEvents, userByCustomer, userBySubscription), subscriptions),
    firstCharges: firstChargesFromEvents(chargeEvents, userByCustomer, userBySubscription),
  };
}

function toMember(user: UserRow, startedAt: Date, milestones: StripeMilestones): CohortMember {
  return {
    userId: user.id,
    email: user.email,
    startedAt,
    signedUpAt: user.createdAt,
    trialStartedAt: milestones.trialStarts.get(user.id) ?? null,
    firstChargeAt: milestones.firstCharges.get(user.id) ?? null,
    subscriptionStatus: user.subscriptionStatus,
    tier: user.tier,
    lastLoginAt: user.lastLoginAt,
  };
}

async function usersByIds(ids: string[]): Promise<UserRow[]> {
  const prisma = getPrismaClient();
  const users: UserRow[] = [];
  for (const chunk of chunks(ids)) {
    users.push(...await prisma.user.findMany({ where: { id: { in: chunk } }, select: USER_SELECT }));
  }
  return users;
}

async function loadMembers(window: CohortWindow, now: Date): Promise<{ members: CohortMember[]; excluded: CohortExclusions }> {
  const prisma = getPrismaClient();
  const start = windowStart(window, now);
  const milestones = await loadStripeMilestones();

  // Signups start at account creation; trials and paid accounts at their Stripe milestone.
  const starts = window.segment === 'trial' ? milestones.trialStarts
    : window.segment === 'paid' ? milestones.firstCharges
      : null;
  const users = starts
    ? await usersByIds([...starts.entries()]
      .filter(([, at]) => at.getTime() >= start.getTime() && at.getTime() <= now.getTime())
      .map(([userId]) => userId))
    : await prisma.user.findMany({
      where: { createdAt: { gte: start, lte: now } },
      select: USER_SELECT,
    });

  const members = users
    .filter(user => !isAdminOperatorEmail(user.email))
    .map(user => toMember(user, starts?.get(user.id) ?? user.createdAt, milestones));
  const excluded: CohortExclusions = { operatorAccounts: users.length - members.length };

  if (window.segment === 'paid') {
    const paying = await prisma.user.findMany({
      where: {
        OR: [
          { subscriptionStatus: { in: PAYING_STATUSES } },
          { subscriptions: { some: { status: { in: PAYING_STATUSES } } } },
        ],
      },
      select: { id: true, email: true },
    });
    excluded.payingWithoutRecordedCharge = paying
      .filter(user => !milestones.firstCharges.has(user.id) && !isAdminOperatorEmail(user.email))
      .length;
  }
  return { members, excluded };
}

async function loadQuestionTimes(members: CohortMember[], window: CohortWindow, now: Date): Promise<Map<string, number[]>> {
  const prisma = getPrismaClient();
  const start = windowStart(window, now);
  const times = new Map<string, number[]>();
  for (const ids of chunks(members.map(member => member.userId))) {
    const rows = await prisma.conversation.findMany({
      where: { userId: { in: ids }, origin: 'user', createdAt: { gte: start, lte: now } },
      select: { userId: true, createdAt: true },
    });
    for (const row of rows) {
      if (!row.userId) continue;
      const list = times.get(row.userId);
      if (list) list.push(row.createdAt.getTime());
      else times.set(row.userId, [row.createdAt.getTime()]);
    }
  }
  return times;
}

function hasSnapTradeAccount(accounts: unknown): boolean {
  return Array.isArray(accounts) && accounts.some(account => {
    if (!account || typeof account !== 'object' || Array.isArray(account)) return false;
    return String((account as Record<string, unknown>).source || '').toLowerCase() === 'snaptrade';
  });
}

function earlier(current: Date | null, candidate: Date | null): Date | null {
  if (!candidate) return current;
  return !current || candidate.getTime() < current.getTime() ? candidate : current;
}

async function loadFirstLinks(userIds: string[]): Promise<Map<string, FirstLink>> {
  const prisma = getPrismaClient();
  const evidence = new Map<string, FirstLinkEvidence>();
  const evidenceFor = (userId: string): FirstLinkEvidence => {
    let entry = evidence.get(userId);
    if (!entry) {
      entry = {
        plaidTokenCreatedAt: null,
        plaidDisconnectedAt: null,
        snapTradeRegisteredAt: null,
        snapTradeConnectedNow: false,
        snapTradeEvidenceAt: null,
        publicVerifiedCredentialAt: null,
        publicEvidenceAt: null,
      };
      evidence.set(userId, entry);
    }
    return entry;
  };

  for (const ids of chunks(userIds)) {
    const [tokens, history, snapTradeUsers, storedAccounts, publicCredentials] = await Promise.all([
      prisma.accessToken.groupBy({
        by: ['userId'],
        where: { userId: { in: ids } },
        _min: { createdAt: true },
      }),
      prisma.financialSummaryHistory.groupBy({
        by: ['userId', 'observationReason'],
        where: {
          userId: { in: ids },
          observationReason: { in: [...PLAID_REMOVAL_REASONS, ...SNAPTRADE_REMOVAL_REASONS, ...PUBLIC_HISTORY_REASONS] },
        },
        _min: { computedAt: true },
      }),
      prisma.snapTradeUser.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, createdAt: true, _count: { select: { activities: true } } },
      }),
      // SnapTrade/Public Account rows are written on sync (and kept for renames);
      // createdAt is a dated trace that a brokerage or Public key was reached.
      prisma.account.findMany({
        where: {
          userId: { in: ids },
          OR: [{ plaidAccountId: { startsWith: 'snaptrade-' } }, { plaidAccountId: { startsWith: 'public-' } }],
        },
        select: { userId: true, plaidAccountId: true, createdAt: true },
      }),
      prisma.publicApiCredential.findMany({
        where: { userId: { in: ids }, lastVerifiedAt: { not: null } },
        select: { userId: true, createdAt: true },
      }),
    ]);

    for (const token of tokens) {
      if (token.userId) evidenceFor(token.userId).plaidTokenCreatedAt = token._min.createdAt ?? null;
    }
    for (const row of history) {
      const at = row._min.computedAt ?? null;
      const entry = evidenceFor(row.userId);
      const reason = row.observationReason ?? '';
      if (PLAID_REMOVAL_REASONS.includes(reason)) entry.plaidDisconnectedAt = earlier(entry.plaidDisconnectedAt, at);
      if (SNAPTRADE_REMOVAL_REASONS.includes(reason)) entry.snapTradeEvidenceAt = earlier(entry.snapTradeEvidenceAt, at);
      if (PUBLIC_HISTORY_REASONS.includes(reason)) entry.publicEvidenceAt = earlier(entry.publicEvidenceAt, at);
    }
    for (const account of storedAccounts) {
      if (!account.userId) continue;
      const entry = evidenceFor(account.userId);
      if (account.plaidAccountId.startsWith('snaptrade-')) entry.snapTradeEvidenceAt = earlier(entry.snapTradeEvidenceAt, account.createdAt);
      else entry.publicEvidenceAt = earlier(entry.publicEvidenceAt, account.createdAt);
    }
    for (const credential of publicCredentials) {
      evidenceFor(credential.userId).publicVerifiedCredentialAt = credential.createdAt;
    }

    const registered = new Map(snapTradeUsers.map(user => [user.userId, user]));
    const snapshots = registered.size === 0 ? [] : await prisma.financialSummarySnapshot.findMany({
      where: { userId: { in: [...registered.keys()] } },
      select: { userId: true, accounts: true },
    });
    const visibleInSnapshot = new Set(snapshots.filter(row => hasSnapTradeAccount(row.accounts)).map(row => row.userId));
    for (const user of snapTradeUsers) {
      const entry = evidenceFor(user.userId);
      entry.snapTradeRegisteredAt = user.createdAt;
      entry.snapTradeConnectedNow = user._count.activities > 0 || visibleInSnapshot.has(user.userId);
    }
  }

  const links = new Map<string, FirstLink>();
  for (const [userId, entry] of evidence) {
    const link = resolveFirstLink(entry);
    if (link) links.set(userId, link);
  }
  return links;
}

export async function getEngagementReport(window: CohortWindow, rule: EngagementRule, now = new Date()): Promise<EngagementReport> {
  const { members, excluded } = await loadMembers(window, now);
  const questionTimes = await loadQuestionTimes(members, window, now);
  return buildEngagementReport({
    members,
    questionTimes,
    window,
    rule,
    now,
    excluded,
    notes: [SEGMENT_NOTES[window.segment], QUESTION_NOTE, OPERATOR_NOTE],
  });
}

export async function getActivationReport(window: CohortWindow, now = new Date()): Promise<ActivationReport> {
  const { members, excluded } = await loadMembers(window, now);
  const firstLinks = await loadFirstLinks(members.map(member => member.userId));
  return buildActivationReport({
    members,
    firstLinks,
    window,
    now,
    excluded,
    notes: [SEGMENT_NOTES[window.segment], LINK_NOTE, OPERATOR_NOTE],
  });
}
