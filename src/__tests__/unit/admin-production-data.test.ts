import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../prisma-client';
import {
  loadAnswerQualityConversations,
  loadProductionConversations,
  loadProductionSessions,
} from '../../services/admin-production-data';
import { buildAnswerQualityReport } from '../../services/answer-quality';

/**
 * The admin Production tab once loaded every conversation's whole
 * `showTheMathData` — about 150 MB of JSON in production — and ran the backend
 * out of memory each time the page opened. These run against the worker's own
 * database schema, so the queries are checked as Postgres runs them.
 */
describe('admin production data', () => {
  const prisma = getPrismaClient();

  const at = (minute: number) => new Date(Date.UTC(2026, 10, 25, 12, minute));

  /** What a row written before September 2026 carries beside its manifest. */
  const userDataCopy = { accounts: Array.from({ length: 50 }, (_, i) => ({ id: `acct-${i}`, balance: i })) };

  const manifest = (minute: number, outcome: 'passed' | 'replaced') => ({
    version: 1,
    generatedAt: at(minute).toISOString(),
    snapshot: {},
    facts: [],
    contextPlanning: {
      source: 'context_planner',
      model: 'gpt-test',
      durationMs: 20,
      requestedPacks: ['account_details'],
      selectedPacks: ['account_details'],
      finalPacks: ['account_details'],
      needsSecondaryValidation: false,
      summary: 'Test plan.',
    },
    validation: { deterministic: { valid: outcome === 'passed', outcome } },
  });

  async function createUser(email: string, createdAt: Date) {
    return prisma.user.create({
      data: { email, passwordHash: `hash-for-${email}`, tier: 'premium', createdAt },
    });
  }

  async function createConversation(data: {
    userId: string | null;
    minute: number;
    question?: string;
    showTheMathData?: object;
  }) {
    return prisma.conversation.create({
      data: {
        userId: data.userId,
        question: data.question ?? `Question at ${data.minute}`,
        answer: `Answer at ${data.minute}`,
        createdAt: at(data.minute),
        ...(data.showTheMathData && { showTheMathData: data.showTheMathData }),
      },
    });
  }

  beforeEach(async () => {
    await prisma.feedback.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.feedback.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('loadProductionSessions', () => {
    it('summarizes each user from their first and last question, newest user first', async () => {
      const asker = await createUser('asker@example.com', at(0));
      await createUser('quiet@example.com', at(1));
      await createConversation({ userId: asker.id, minute: 20, question: 'Second question' });
      await createConversation({ userId: asker.id, minute: 10, question: 'First question' });

      const sessions = await loadProductionSessions(prisma);

      expect(sessions.map((session) => session.email)).toEqual(['quiet@example.com', 'asker@example.com']);
      expect(sessions[1]).toEqual({
        userId: asker.id,
        email: 'asker@example.com',
        tier: 'premium',
        conversationCount: 2,
        firstQuestion: 'First question',
        lastActivity: at(20),
        createdAt: at(0),
        lastLoginAt: null,
      });
      expect(sessions[0]).toMatchObject({
        conversationCount: 0,
        firstQuestion: 'No questions yet',
        lastActivity: at(1),
      });
    });
  });

  describe('loadProductionConversations', () => {
    it('returns only what the page shows, without the user row or showTheMathData', async () => {
      const user = await createUser('reader@example.com', at(0));
      const older = await createConversation({
        userId: user.id,
        minute: 5,
        showTheMathData: { evidenceManifest: manifest(5, 'passed'), databaseData: userDataCopy },
      });
      const newer = await createConversation({ userId: user.id, minute: 6 });
      await createConversation({ userId: null, minute: 7 });
      const feedback = await prisma.feedback.create({
        data: { conversationId: older.id, score: 4, createdAt: at(8) },
      });

      const conversations = await loadProductionConversations(prisma);

      expect(conversations.map((conversation) => conversation.id)).toEqual([newer.id, older.id]);
      expect(Object.keys(conversations[1]).sort()).toEqual(
        ['answer', 'createdAt', 'feedback', 'id', 'question', 'user', 'userId'],
      );
      expect(conversations[1].user).toEqual({ id: user.id, email: 'reader@example.com', tier: 'premium' });
      expect(conversations[1].feedback).toEqual([{ id: feedback.id, score: 4, createdAt: at(8) }]);
      expect(JSON.stringify(conversations)).not.toContain('hash-for-');
    });
  });

  describe('loadAnswerQualityConversations', () => {
    it('carries only the evidence manifest, and builds the same report as the whole rows', async () => {
      const user = await createUser('quality@example.com', at(0));
      const withManifest = await createConversation({
        userId: user.id,
        minute: 10,
        showTheMathData: { evidenceManifest: manifest(10, 'passed'), databaseData: userDataCopy },
      });
      await prisma.feedback.create({ data: { conversationId: withManifest.id, score: 2, createdAt: at(11) } });
      await createConversation({
        userId: user.id,
        minute: 12,
        showTheMathData: { evidenceManifest: manifest(12, 'replaced') },
      });
      const withoutManifest = await createConversation({
        userId: user.id,
        minute: 14,
        showTheMathData: { databaseData: userDataCopy },
      });
      const withNoData = await createConversation({ userId: user.id, minute: 16 });
      await createConversation({ userId: null, minute: 18, showTheMathData: { evidenceManifest: manifest(18, 'passed') } });

      const loaded = await loadAnswerQualityConversations(prisma, 500);

      expect(loaded).toHaveLength(4);
      const byId = new Map(loaded.map((conversation) => [conversation.id, conversation]));
      expect(byId.get(withManifest.id)?.showTheMathData).toEqual({ evidenceManifest: manifest(10, 'passed') });
      expect(byId.get(withManifest.id)?.feedback).toEqual([{ score: 2, createdAt: at(11) }]);
      expect(byId.get(withoutManifest.id)).not.toHaveProperty('showTheMathData');
      expect(byId.get(withNoData.id)).not.toHaveProperty('showTheMathData');
      expect(JSON.stringify(loaded)).not.toContain('databaseData');

      const wholeRows = await prisma.conversation.findMany({
        where: { userId: { not: null } },
        select: {
          id: true,
          question: true,
          createdAt: true,
          showTheMathData: true,
          feedback: { select: { score: true, createdAt: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(buildAnswerQualityReport(loaded)).toEqual(buildAnswerQualityReport(wholeRows));
    });

    it('takes the latest conversations up to the limit', async () => {
      const user = await createUser('limit@example.com', at(0));
      for (const minute of [1, 2, 3]) {
        await createConversation({ userId: user.id, minute, showTheMathData: { evidenceManifest: manifest(minute, 'passed') } });
      }

      const loaded = await loadAnswerQualityConversations(prisma, 2);

      expect(loaded.map((conversation) => conversation.createdAt)).toEqual([at(3), at(2)]);
      expect(loaded.every((conversation) => conversation.showTheMathData)).toBe(true);
    });

    it('returns nothing when there are no conversations', async () => {
      await expect(loadAnswerQualityConversations(prisma, 500)).resolves.toEqual([]);
    });
  });

  it('never asks Prisma for the whole showTheMathData column', async () => {
    const user = await createUser('guard@example.com', at(0));
    await createConversation({ userId: user.id, minute: 1, showTheMathData: { evidenceManifest: manifest(1, 'passed') } });

    const requests: unknown[] = [];
    const recorded = <T extends object>(delegate: T): T =>
      new Proxy(delegate, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);
          if (property !== 'findMany' || typeof value !== 'function') return value;
          return (args: unknown) => {
            requests.push(args);
            return value.call(target, args);
          };
        },
      });
    const recordingPrisma = {
      user: recorded(prisma.user),
      conversation: recorded(prisma.conversation),
      $queryRaw: prisma.$queryRaw.bind(prisma),
    } as unknown as PrismaClient;

    await loadProductionSessions(recordingPrisma);
    await loadProductionConversations(recordingPrisma);
    await loadAnswerQualityConversations(recordingPrisma, 500);

    expect(requests).toHaveLength(3);
    for (const request of requests) {
      expect(request).not.toHaveProperty('include');
      expect(JSON.stringify(request)).not.toContain('showTheMathData');
    }
  });
});
