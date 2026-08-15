import { runAskLincEvalSet, summarizeAskLincEval } from '../../evals/ask-linc-eval';

describe('Ask Linc evaluation set', () => {
  it('meets every deterministic correctness target through real pipeline scenarios', async () => {
    const summary = await summarizeAskLincEval(runAskLincEvalSet());
    expect(summary.total).toBe(7);
    expect(summary.score).toBe(1);
    expect(summary.results.filter(result => !result.passed)).toEqual([]);
  });
});
