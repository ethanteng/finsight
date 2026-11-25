/**
 * The admin Production tab's reads.
 *
 * `Conversation.showTheMathData` holds what an answer was built from, and rows
 * written before September 2026 also carry a full copy of the user's data in
 * it — megabytes per row, and on the order of 150 MB of JSON across the table.
 * Loading that column for every conversation ran the 2 GiB backend out of
 * memory each time the admin page opened. None of these reads needs it, except
 * answer quality, which needs only its `evidenceManifest`, so every query here
 * names the columns it returns and never loads the whole column.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import type { AnswerQualityConversation } from './answer-quality';

export interface ProductionUserStats {
  userId: string;
  email: string;
  tier: string;
  conversationCount: number;
  firstQuestion: string;
  lastActivity: Date;
  createdAt: Date;
  lastLoginAt: Date | null;
}

/** One row per user: how much they have asked, what first, and when last. */
export async function loadProductionSessions(prisma: PrismaClient): Promise<ProductionUserStats[]> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      tier: true,
      createdAt: true,
      lastLoginAt: true,
      conversations: {
        select: { question: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return users.map((user) => {
    const first = user.conversations[0];
    const last = user.conversations[user.conversations.length - 1];
    return {
      userId: user.id,
      email: user.email,
      tier: user.tier,
      conversationCount: user.conversations.length,
      firstQuestion: first?.question || 'No questions yet',
      lastActivity: last?.createdAt || user.createdAt,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  });
}

/**
 * Every signed-in user's conversation, newest first, with only what the admin
 * page shows. The user is named by id, email and tier alone: the whole row
 * would send every password hash to the browser.
 */
export async function loadProductionConversations(prisma: PrismaClient) {
  return prisma.conversation.findMany({
    where: { userId: { not: null } },
    select: {
      id: true,
      question: true,
      answer: true,
      createdAt: true,
      userId: true,
      user: { select: { id: true, email: true, tier: true } },
      feedback: { select: { id: true, score: true, createdAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * The latest `limit` signed-in conversations for the answer-quality report,
 * each carrying only the evidence manifest from `showTheMathData`. Postgres
 * extracts it, so the rest of the column never leaves the database; it is put
 * back under the same key so the report reads it as it always has.
 */
export async function loadAnswerQualityConversations(
  prisma: PrismaClient,
  limit: number,
): Promise<AnswerQualityConversation[]> {
  const conversations = await prisma.conversation.findMany({
    where: { userId: { not: null } },
    select: {
      id: true,
      question: true,
      createdAt: true,
      feedback: { select: { score: true, createdAt: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  if (conversations.length === 0) return [];

  const manifests = await prisma.$queryRaw<Array<{ id: string; evidenceManifest: unknown }>>`
    SELECT "id", "showTheMathData" -> 'evidenceManifest' AS "evidenceManifest"
    FROM "Conversation"
    WHERE "id" IN (${Prisma.join(conversations.map((conversation) => conversation.id))})
      AND "showTheMathData" -> 'evidenceManifest' IS NOT NULL
  `;
  const manifestById = new Map(manifests.map((row) => [row.id, row.evidenceManifest]));

  return conversations.map((conversation) => {
    const evidenceManifest = manifestById.get(conversation.id);
    return evidenceManifest === undefined
      ? conversation
      : { ...conversation, showTheMathData: { evidenceManifest } };
  });
}
