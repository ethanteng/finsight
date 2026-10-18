import { runAskLincEvalSet, summarizeAskLincEval } from '../../evals/ask-linc-eval';

describe('Ask Linc evaluation set', () => {
  it('meets every deterministic correctness target through real pipeline scenarios', async () => {
    const summary = await summarizeAskLincEval(runAskLincEvalSet());
    expect(summary.total).toBe(20);
    expect(summary.score).toBe(1);
    expect(summary.results.filter(result => !result.passed)).toEqual([]);
  // Every case runs the real pipeline, and the calculator cases the real
  // historical engine -- several full simulations each -- so the set takes
  // longer than Jest's default allows. Alone it takes about 100 seconds; in
  // CI's full parallel run with coverage it has taken 189-242, which had
  // outgrown a 240-second limit. Double that leaves room for the engine to
  // grow before this is a coin flip again.
  }, 480_000);
});
