import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../prisma-client';
import { isAdminOperatorEmail } from '../auth/admin-emails';
import { CHARGE_EVENT_TYPES, firstChargesFromEvents, type LoggedChargeEvent } from './charges';
import { buildActivationReport, buildEngagementReport, windowStart } from './engine';
import { resolveFirstLink, type FirstLinkEvidence } from './first-link';
import type {
  ActivationReport,
  CohortExclusions,
  CohortMember,
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
const TRIAL_NOTE = 'Trial cohorts are every new account, from its signup: no-card signups, checkout card trials and admin trials.';
const PAID_NOTE = 'Paid cohorts start at the first successful charge above $0 logged from Stripe, so a converted account also appears in the trial cohort for its signup.';
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

function chunks<T>(items: T[]): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += ID_CHUNK) result.push(items.slice(index, index + ID_CHUNK));
  return result;
}

async function loadFirstCharges(): Promise<Map<string, Date>> {
  const prisma = getPrismaClient();
  const [events, customers, subscriptions] = await Promise.all([
    // Built in SQL so only the fields a first charge needs cross the wire: one
    // event per invoice, renewals included, and each payload is a full invoice.
    // The amount is checked as a number before it is cast, so a malformed
    // payload is skipped rather than failing the query.
    prisma.$queryRaw<LoggedChargeEvent[]>`
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
    prisma.user.findMany({
      where: { stripeCustomerId: { not: null } },
      select: { id: true, stripeCustomerId: true },
    }),
    prisma.subscription.findMany({
      select: { userId: true, stripeCustomerId: true, stripeSubscriptionId: true },
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
  return firstChargesFromEvents(events, userByCustomer, userBySubscription);
}

function toMember(user: UserRow, startedAt: Date, firstChargeAt: Date | null): CohortMember {
  return {
    userId: user.id,
    email: user.email,
    startedAt,
    signedUpAt: user.createdAt,
    firstChargeAt,
    subscriptionStatus: user.subscriptionStatus,
    tier: user.tier,
    lastLoginAt: user.lastLoginAt,
  };
}

async function loadMembers(window: CohortWindow, now: Date): Promise<{ members: CohortMember[]; excluded: CohortExclusions }> {
  const prisma = getPrismaClient();
  const start = windowStart(window, now);
  const firstCharges = await loadFirstCharges();

  if (window.segment === 'trial') {
    const users = await prisma.user.findMany({
      where: { createdAt: { gte: start, lte: now } },
      select: USER_SELECT,
    });
    const operators = users.filter(user => isAdminOperatorEmail(user.email));
    const members = users
      .filter(user => !isAdminOperatorEmail(user.email))
      .map(user => toMember(user, user.createdAt, firstCharges.get(user.id) ?? null));
    return { members, excluded: { operatorAccounts: operators.length } };
  }

  const paidIds = [...firstCharges.entries()]
    .filter(([, paidAt]) => paidAt.getTime() >= start.getTime() && paidAt.getTime() <= now.getTime())
    .map(([userId]) => userId);
  const users: UserRow[] = [];
  for (const ids of chunks(paidIds)) {
    users.push(...await prisma.user.findMany({ where: { id: { in: ids } }, select: USER_SELECT }));
  }
  const paying = await prisma.user.findMany({
    where: {
      OR: [
        { subscriptionStatus: { in: PAYING_STATUSES } },
        { subscriptions: { some: { status: { in: PAYING_STATUSES } } } },
      ],
    },
    select: { id: true, email: true },
  });
  const operators = users.filter(user => isAdminOperatorEmail(user.email));
  const members = users
    .filter(user => !isAdminOperatorEmail(user.email))
    .map(user => {
      const paidAt = firstCharges.get(user.id) as Date;
      return toMember(user, paidAt, paidAt);
    });
  return {
    members,
    excluded: {
      operatorAccounts: operators.length,
      payingWithoutRecordedCharge: paying.filter(user => !firstCharges.has(user.id) && !isAdminOperatorEmail(user.email)).length,
    },
  };
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
    const [tokens, history, snapTradeUsers, renamedAccounts, publicCredentials] = await Promise.all([
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
    for (const account of renamedAccounts) {
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
    notes: [window.segment === 'trial' ? TRIAL_NOTE : PAID_NOTE, QUESTION_NOTE, OPERATOR_NOTE],
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
    notes: [window.segment === 'trial' ? TRIAL_NOTE : PAID_NOTE, LINK_NOTE, OPERATOR_NOTE],
  });
}
