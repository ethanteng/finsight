import { runAskLincEvalSet, summarizeAskLincEval } from '../../evals/ask-linc-eval';

describe('Ask Linc evaluation set', () => {
  it('meets every deterministic correctness target through real pipeline scenarios', async () => {
    const summary = await summarizeAskLincEval(runAskLincEvalSet());
    expect(summary.total).toBe(13);
    expect(summary.score).toBe(1);
    expect(summary.results.filter(result => !result.passed)).toEqual([]);
  // Every case runs the real pipeline, and the calculator cases the real
  // historical engine -- several full simulations each -- so the set takes
  // longer than Jest's default allows.
  }, 120_000);
});
