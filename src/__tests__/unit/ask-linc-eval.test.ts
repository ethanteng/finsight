import { runAskLincEvalSet, summarizeAskLincEval } from '../../evals/ask-linc-eval';

describe('Ask Linc evaluation set', () => {
  it('meets every deterministic correctness target', () => {
    const summary = summarizeAskLincEval(runAskLincEvalSet());
    expect(summary.total).toBe(5);
    expect(summary.score).toBe(1);
    expect(summary.results.filter(result => !result.passed)).toEqual([]);
  });
});
