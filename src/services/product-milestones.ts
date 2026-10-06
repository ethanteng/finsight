import { getPrismaClient } from '../prisma-client';
import { isAdminOperatorEmail } from '../auth/admin-emails';
import { parseCalculatorLeadAttribution, hasPaidLeadAttribution } from './calculator-lead-attribution';
import type { CalculatorLead } from './calculator-first-decision';

export const PRODUCT_MILESTONES = [
  'first_result_viewed',
  'first_meaningful_answer',
  'first_account_linked',
  'returned_engaged_7d',
] as const;
export type ProductMilestoneKind = typeof PRODUCT_MILESTONES[number];
const DAY_MS = 86_400_000;
const attributionSelect = {
  landingPage: true, referrer: true, utmSource: true, utmMedium: true,
  utmCampaign: true, utmTerm: true, utmContent: true,
  gclid: true, gbraid: true, wbraid: true, gaClientId: true, gaSessionId: true,
} as const;

/** The resolved lead wins over browser parameters. Later visits never overwrite acquisition. */
export async function recordSignupAcquisition(args: {
  userId: string; email: string; lead: CalculatorLead | null; signupOrigin?: string; attribution?: unknown;
}): Promise<void> {
  if (isAdminOperatorEmail(args.email)) return;
  try {
    const db = getPrismaClient();
    const lead = args.lead
      ? await (args.lead.kind === 'coast-fire'
        ? db.coastFireLead.findUnique({ where: { token: args.lead.lead.token }, select: attributionSelect })
        : db.retirementLead.findUnique({ where: { token: args.lead.lead.token }, select: attributionSelect }))
      : null;
    const source = args.lead
      ? (args.lead.kind === 'coast-fire' ? 'coast_fire_calculator' : 'retirement_calculator')
      : ['coast_fire_calculator', 'retirement_calculator'].includes(args.signupOrigin ?? '')
        ? args.signupOrigin! : 'direct_or_unknown';
    // Never substitute signup/email-return metadata for a resolved lead's original attribution.
    const attribution = parseCalculatorLeadAttribution(args.lead ? lead : args.attribution);
    await db.userAcquisition.upsert({
      where: { userId: args.userId }, update: {},
      create: { userId: args.userId, source, ...attribution },
    });
  } catch {
    // No identifying data in telemetry errors, and no analytics outage can fail signup.
    console.warn('Signup acquisition was not recorded');
  }
}

async function measuredUser(userId: string) {
  const user = await getPrismaClient().user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, createdAt: true, acquisition: true },
  });
  // Prospective only. Old users have no instrumented signup; never invent their first action.
  return user?.acquisition && !isAdminOperatorEmail(user.email) ? user : null;
}

async function insertMilestone(userId: string, kind: ProductMilestoneKind, now: Date, detail: {
  source?: string; conversationId?: string;
} = {}) {
  // createMany/ON CONFLICT makes concurrent tabs, retries and reconnects idempotent.
  await getPrismaClient().productMilestone.createMany({
    data: [{ userId, kind, definitionVersion: 1, occurredAt: now, ...detail }],
    skipDuplicates: true,
  });
}

/** Requires the server's successful validation record, never a browser-supplied success flag. */
export function isSuccessfulAnswer(stored: unknown): boolean {
  if (!stored || typeof stored !== 'object') return false;
  const manifest = (stored as { evidenceManifest?: {
    secondaryCaveat?: boolean; validation?: { deterministic?: { valid?: boolean; outcome?: string; shippedDraft?: unknown } };
  } }).evidenceManifest;
  return manifest?.validation?.deterministic?.valid === true
    && manifest.validation.deterministic.outcome !== 'replaced'
    && !manifest.validation.deterministic.shippedDraft
    && !manifest.secondaryCaveat;
}

export function isReturnWithinSevenDays(signedUpAt: Date, firstAnswerAt: Date, answerCreatedAt: Date, now: Date): boolean {
  const day = (date: Date) => Math.floor((date.getTime() - signedUpAt.getTime()) / DAY_MS);
  const currentDay = day(now);
  // A new successful question in a later 24-hour signup-relative day, not reopening old history.
  return currentDay >= 1 && currentDay < 7
    && day(firstAnswerAt) < currentDay && day(answerCreatedAt) === currentDay;
}

/** Called only after a rendered answer enters the visible viewport. Ownership is checked here. */
export async function recordVisibleAnswer(userId: string, conversationId: string, now = new Date()): Promise<boolean> {
  const user = await measuredUser(userId);
  if (!user) return false;
  const db = getPrismaClient();
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true, origin: true, createdAt: true, answer: true, showTheMathData: true },
  });
  if (!conversation || !conversation.answer.trim() || conversation.createdAt < user.acquisition!.capturedAt) return false;
  if (['calculator_coast_fire', 'calculator_retirement'].includes(conversation.origin)) {
    await insertMilestone(userId, 'first_result_viewed', now, {
      conversationId, source: conversation.origin,
    });
    return true;
  }
  if (conversation.origin !== 'user' || !isSuccessfulAnswer(conversation.showTheMathData)) return false;
  await insertMilestone(userId, 'first_meaningful_answer', now, { conversationId });
  const first = await db.productMilestone.findUnique({
    where: { userId_kind_definitionVersion: { userId, kind: 'first_meaningful_answer', definitionVersion: 1 } },
  });
  if (first && isReturnWithinSevenDays(user.createdAt, first.occurredAt, conversation.createdAt, now)) {
    await insertMilestone(userId, 'returned_engaged_7d', now, { conversationId });
  }
  return true;
}

/** Called only with provider-confirmed account evidence. Registration or opening Link is insufficient. */
export async function recordFirstAccountLinked(userId: string, provider: 'plaid' | 'snaptrade' | 'public'): Promise<void> {
  try {
    if (await measuredUser(userId)) {
      await insertMilestone(userId, 'first_account_linked', new Date(), { source: provider });
    }
  } catch {
    console.warn('Account-link milestone was not recorded');
  }
}

export async function pendingAdMilestones(userId: string, now = new Date()) {
  const user = await measuredUser(userId);
  if (!user || !hasPaidLeadAttribution(user.acquisition!)) return [];
  // Browser tags report at dispatch time. Don't replay weeks-old milestones with false timestamps.
  return getPrismaClient().productMilestone.findMany({
    where: {
      userId, definitionVersion: 1, kind: { in: [...PRODUCT_MILESTONES] },
      adDispatchAttemptedAt: null, occurredAt: { gte: new Date(now.getTime() - DAY_MS), lte: now },
    },
    select: { id: true, kind: true, occurredAt: true, definitionVersion: true },
    orderBy: { occurredAt: 'asc' }, take: 4,
  });
}
