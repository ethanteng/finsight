import {
  isSuccessfulAnswer, isReturnWithinSevenDays, recordSignupAcquisition,
  recordVisibleAnswer, recordFirstAccountLinked, pendingAdMilestones,
} from '../../services/product-milestones';
import { acquisitionFilter } from '../../cohort-analytics/service';
import { getPrismaClient } from '../../prisma-client';

jest.mock('../../prisma-client', () => ({ getPrismaClient: jest.fn() }));
const date = (s: string) => new Date(s);
const signup = date('2026-10-06T12:00:00Z');
const now = date('2026-10-06T12:05:00Z');
const valid = { evidenceManifest: { validation: { deterministic: { valid: true } } } };
let db: any;
let rows: Map<string, any>;

beforeEach(() => {
  rows = new Map();
  db = {
    user: { findUnique: jest.fn().mockResolvedValue({
      id: 'u1', email: 'person@example.com', createdAt: signup,
      acquisition: { capturedAt: signup, utmSource: 'google', utmMedium: 'cpc' },
    }) },
    conversation: { findFirst: jest.fn().mockResolvedValue({
      id: 'c1', origin: 'user', answer: 'A supported answer', showTheMathData: valid, createdAt: now,
    }) },
    userAcquisition: { upsert: jest.fn().mockResolvedValue({}) },
    coastFireLead: { findUnique: jest.fn().mockResolvedValue({
      utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'coast_fire', gclid: 'original-click',
    }) },
    retirementLead: { findUnique: jest.fn() },
    productMilestone: {
      createMany: jest.fn(async ({ data }: any) => {
        for (const item of data) if (!rows.has(item.kind)) rows.set(item.kind, item);
      }),
      findUnique: jest.fn(async ({ where }: any) => rows.get(where.userId_kind_definitionVersion.kind) ?? null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  (getPrismaClient as jest.Mock).mockReturnValue(db);
});

it('uses the resolved lead, preserves original acquisition, and drops unapproved payload fields', async () => {
  await recordSignupAcquisition({
    userId: 'u1', email: 'person@example.com',
    lead: { kind: 'coast-fire', lead: { token: 'lead1' } } as any,
    signupOrigin: 'retirement_calculator', attribution: { utmCampaign: 'overwrite', email: 'private' },
  });
  expect(db.userAcquisition.upsert).toHaveBeenCalledWith({
    where: { userId: 'u1' }, update: {},
    create: { userId: 'u1', source: 'coast_fire_calculator',
      utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'coast_fire', gclid: 'original-click' },
  });
});

it('never fails signup when attribution storage is unavailable', async () => {
  db.userAcquisition.upsert.mockRejectedValue(new Error('unavailable'));
  await expect(recordSignupAcquisition({ userId: 'u1', email: 'person@example.com', lead: null })).resolves.toBeUndefined();
});

it('records calculator views separately and makes re-renders/concurrent tabs idempotent', async () => {
  db.conversation.findFirst.mockResolvedValue({ id: 'c1', origin: 'calculator_coast_fire', answer: 'Result', createdAt: now });
  await Promise.all([recordVisibleAnswer('u1', 'c1', now), recordVisibleAnswer('u1', 'c1', now)]);
  expect([...rows.keys()]).toEqual(['first_result_viewed']);
  expect(db.productMilestone.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  expect(db.conversation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1', userId: 'u1' } }));
});

it('does not count inaccessible conversations, old users, or validation failures as engagement', async () => {
  db.conversation.findFirst.mockResolvedValueOnce(null);
  expect(await recordVisibleAnswer('u1', 'foreign-id', now)).toBe(false);
  db.conversation.findFirst.mockResolvedValueOnce({ origin: 'user', answer: 'Failure', createdAt: now, showTheMathData: {} });
  expect(await recordVisibleAnswer('u1', 'c1', now)).toBe(false);
  db.user.findUnique.mockResolvedValueOnce({ email: 'person@example.com', acquisition: null });
  expect(await recordVisibleAnswer('u1', 'c1', now)).toBe(false);
  expect(rows.size).toBe(0);
});

it('counts one successful user answer and a genuinely new answer on a later day within seven days', async () => {
  await recordVisibleAnswer('u1', 'c1', now);
  const later = date('2026-10-07T13:00:00Z');
  // Viewing yesterday's answer is not a new question.
  await recordVisibleAnswer('u1', 'c1', later);
  expect(rows.has('returned_engaged_7d')).toBe(false);
  db.conversation.findFirst.mockResolvedValue({ origin: 'user', answer: 'New answer', createdAt: later, showTheMathData: valid });
  await recordVisibleAnswer('u1', 'c2', later);
  expect([...rows.keys()]).toEqual(['first_meaningful_answer', 'returned_engaged_7d']);
  expect(rows.get('first_meaningful_answer').occurredAt).toEqual(now);
});

it('excludes unsafe or caveated answers and uses signup-relative days at the seven-day boundary', () => {
  expect(isSuccessfulAnswer(valid)).toBe(true);
  expect(isSuccessfulAnswer({ evidenceManifest: { secondaryCaveat: true, validation: { deterministic: { valid: true } } } })).toBe(false);
  expect(isSuccessfulAnswer({ evidenceManifest: { validation: { deterministic: { valid: false } } } })).toBe(false);
  expect(isSuccessfulAnswer({})).toBe(false);
  expect(isSuccessfulAnswer({ evidenceManifest: { validation: { deterministic: { valid: true, outcome: 'replaced' } } } })).toBe(false);
  const boundary = date('2026-10-13T12:00:00Z');
  expect(isReturnWithinSevenDays(signup, now, boundary, boundary)).toBe(false);
  const sameDay = date('2026-10-07T11:59:00Z');
  expect(isReturnWithinSevenDays(signup, now, sameDay, sameDay)).toBe(false);
});

it('records a provider-confirmed connection once and keeps the original time/provider after reconnect', async () => {
  await recordFirstAccountLinked('u1', 'plaid');
  await recordFirstAccountLinked('u1', 'snaptrade');
  expect(rows.get('first_account_linked').source).toBe('plaid');
  expect(rows.size).toBe(1);
});

it('keeps operator traffic and unmeasured users out of ad dispatch', async () => {
  const before = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = 'person@example.com';
  try {
    await recordFirstAccountLinked('u1', 'plaid');
    expect(await pendingAdMilestones('u1', now)).toEqual([]);
    expect(rows.size).toBe(0);
  } finally { if (before === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = before; }
});

it('limits pending tags to recent, unattempted milestones and returns no acquisition or financial data', async () => {
  await pendingAdMilestones('u1', now);
  const request = db.productMilestone.findMany.mock.calls[0][0];
  expect(request.where).toMatchObject({ userId: 'u1', adDispatchAttemptedAt: null, definitionVersion: 1 });
  expect(request.select).toEqual({ id: true, kind: true, occurredAt: true, definitionVersion: true });
  expect(request.where.occurredAt.gte).toEqual(new Date(now.getTime() - 86_400_000));
});

it('combines exact campaign and source filters with Google acquisition evidence', () => {
  expect(acquisitionFilter({
    segment: 'signup', cohortGrain: 'week', periodGrain: 'week', cohortCount: 4, periodCount: 2,
    source: 'coast_fire_calculator', channel: 'google_ads', campaign: 'coast_fire',
  })).toMatchObject({
    acquisition: { is: { source: 'coast_fire_calculator', utmCampaign: 'coast_fire', OR: expect.any(Array) } },
  });
});


it('includes Google display traffic without click IDs in the Google Ads cohort', () => {
  const filter = acquisitionFilter({
    segment: 'signup', cohortGrain: 'week', periodGrain: 'week', cohortCount: 4, periodCount: 4,
    channel: 'google_ads',
  });
  expect(filter).toEqual({ acquisition: { is: { OR: expect.arrayContaining([
    { utmSource: { equals: 'google', mode: 'insensitive' },
      utmMedium: { in: ['cpc', 'ppc', 'paid', 'display'], mode: 'insensitive' } },
  ]) } } });
});
