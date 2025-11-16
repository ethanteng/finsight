import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;
const getPrisma = () => {
  if (!prisma) prisma = new PrismaClient();
  return prisma!;
};

/**
 * Fetch the full cached snapshot for GPT prompts.
 * Returns null if no snapshot exists.
 */
export async function getUserSnapshotForGPT(userId: string) {
  const snap = await getPrisma().financialSummarySnapshot.findUnique({
    where: { userId },
  });
  return snap;
}

export default { getUserSnapshotForGPT };

