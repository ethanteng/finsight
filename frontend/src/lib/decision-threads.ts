/**
 * Grouping turns into the decisions they belong to.
 *
 * This is what tells the user which prior turns a follow-up can actually see,
 * so it has to match what the server scopes history to: the declared thread,
 * with a turn that carries none standing alone under its own id.
 */

export interface DecisionTurn {
  id: string;
  question: string;
  answer: string;
  threadId?: string | null;
  timestamp: number;
}

export interface DecisionThread<T extends DecisionTurn = DecisionTurn> {
  threadId: string;
  turns: T[];
  latestTimestamp: number;
}

/**
 * @param turns the user's turns, newest first, as the history endpoint returns them
 * @returns decisions newest first, each reading newest turn to oldest
 */
export function groupTurnsIntoDecisions<T extends DecisionTurn>(turns: readonly T[]): DecisionThread<T>[] {
  const byThread = new Map<string, T[]>();
  for (const turn of turns) {
    // A turn with no thread is its own decision. Keying it by its own id keeps
    // every such turn separate, rather than collapsing them into one bucket.
    const key = turn.threadId || turn.id;
    const existing = byThread.get(key);
    if (existing) existing.push(turn);
    else byThread.set(key, [turn]);
  }

  return Array.from(byThread, ([threadId, threadTurns]) => ({
    threadId,
    // Newest turn first, matching how the decisions themselves are ordered: the
    // turn a follow-up continues from is the one the user is looking for, and
    // burying it at the bottom of a long thread makes them hunt for it. Sorting
    // rather than trusting the caller's order keeps this true whatever the
    // history endpoint hands back; ties keep the order they arrived in.
    turns: [...threadTurns].sort((left, right) => right.timestamp - left.timestamp),
    latestTimestamp: Math.max(...threadTurns.map(turn => turn.timestamp)),
  })).sort((left, right) => right.latestTimestamp - left.latestTimestamp);
}
