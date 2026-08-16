import { groupTurnsIntoDecisions } from '@/lib/decision-threads';

/**
 * The sidebar grouping is a promise about what a follow-up can see, so it has
 * to match how the server scopes history. If the two disagree, the list tells
 * the user something false about which numbers are in play.
 */
describe('groupTurnsIntoDecisions', () => {
  const turn = (id: string, threadId: string | null, timestamp: number, question = `Q ${id}`) => ({
    id,
    question,
    answer: `A ${id}`,
    threadId,
    timestamp,
  });

  it('gathers a thread and reads it oldest turn first', () => {
    // History arrives newest first; a decision is read in the order it happened.
    const [decision] = groupTurnsIntoDecisions([
      turn('c3', 'thread-a', 300),
      turn('c2', 'thread-a', 200),
      turn('c1', 'thread-a', 100),
    ]);

    expect(decision.threadId).toBe('thread-a');
    expect(decision.turns.map(t => t.id)).toEqual(['c1', 'c2', 'c3']);
    expect(decision.latestTimestamp).toBe(300);
  });

  it('keeps separate decisions apart and orders them by their newest turn', () => {
    const decisions = groupTurnsIntoDecisions([
      turn('b1', 'thread-b', 500),
      turn('a2', 'thread-a', 400),
      turn('a1', 'thread-a', 100),
    ]);

    expect(decisions.map(d => d.threadId)).toEqual(['thread-b', 'thread-a']);
    expect(decisions[1].turns.map(t => t.id)).toEqual(['a1', 'a2']);
  });

  it('stands a turn with no thread alone rather than pooling them together', () => {
    // Turns from before threads existed must not collapse into one decision
    // just because they share a missing value.
    const decisions = groupTurnsIntoDecisions([
      turn('legacy2', null, 200),
      turn('legacy1', null, 100),
    ]);

    expect(decisions).toHaveLength(2);
    expect(decisions.map(d => d.threadId)).toEqual(['legacy2', 'legacy1']);
    expect(decisions.every(d => d.turns.length === 1)).toBe(true);
  });

  it('handles threaded and unthreaded turns side by side', () => {
    const decisions = groupTurnsIntoDecisions([
      turn('legacy', null, 250),
      turn('a2', 'thread-a', 200),
      turn('a1', 'thread-a', 100),
    ]);

    expect(decisions.map(d => ({ id: d.threadId, turns: d.turns.length }))).toEqual([
      { id: 'legacy', turns: 1 },
      { id: 'thread-a', turns: 2 },
    ]);
  });

  it('returns nothing for no history', () => {
    expect(groupTurnsIntoDecisions([])).toEqual([]);
  });
});
