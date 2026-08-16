import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';
import FinanceQA from '@/components/FinanceQA';

// jsdom ships neither, and the SSE parser needs TextDecoder to read the stream.
// Their absence is why the streaming path — the one production actually uses —
// had no coverage until now.
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = NodeTextEncoder as unknown as typeof globalThis.TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = NodeTextDecoder as unknown as typeof globalThis.TextDecoder;
}

jest.mock('@/components/MarkdownRenderer', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));
jest.mock('@/components/Feedback', () => ({
  __esModule: true,
  default: () => <div>Feedback controls</div>,
}));
jest.mock('@/components/ShowTheMathModal', () => ({
  __esModule: true,
  ShowTheMathContent: () => <div>Calculation detail</div>,
  DatabaseSourceSection: ({ sourceKey }: { sourceKey: string }) => <div>Source detail for {sourceKey}</div>,
  downloadShowTheMathAsText: jest.fn(),
}));

describe('FinanceQA decision workspace', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, headers: new Headers(), json: async () => ({}) });
  });

  it('shows an honest empty state for a new decision', () => {
    render(<FinanceQA />);
    expect(screen.getByText('Start with the decision in front of you')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analyze decision/i })).toBeInTheDocument();
  });

  it('leads with a saved answer and exposes progressive detail views', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/test/current-tier')) {
        return Promise.resolve({ ok: true, json: async () => ({ backendTier: 'premium' }) });
      }
      if (url.includes('/show-the-math')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            databaseData: {
              financial_summaries: { net_worth: 1000000 },
            },
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, headers: new Headers(), json: async () => ({}) });
    });

    render(<FinanceQA selectedPrompt={{ id: 'conversation-1', question: 'Can I retire?', answer: 'You are on track with the current assumptions.', timestamp: Date.now() }} />);
    const answer = screen.getByText('You are on track with the current assumptions.');
    expect(answer).toBeInTheDocument();
    expect(answer.closest('.decision-answer')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'answer' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'sources' }));
    expect(screen.getByRole('tab', { name: 'sources' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Supporting evidence')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /financial summaries/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /financial summaries/i }));
    expect(screen.getByText('Source detail for financial_summaries')).toBeInTheDocument();
  });

  it('empties the composer when a new decision starts', () => {
    // Opening a past turn pre-fills the composer with that question. "New
    // decision" clears the selection, and the previous question used to stay
    // sitting in the box waiting to be re-submitted.
    const prompt = {
      id: 'conversation-1',
      question: 'Can I retire at 62?',
      answer: 'You are on track with the current assumptions.',
      timestamp: Date.now(),
    };
    const { rerender } = render(<FinanceQA selectedPrompt={prompt} />);
    expect(screen.getByRole('textbox')).toHaveValue('Can I retire at 62?');

    rerender(<FinanceQA selectedPrompt={null} />);

    const composer = screen.getByRole('textbox');
    expect(composer).toHaveValue('');
    // The rotating examples still show; they are the placeholder, not a value.
    expect(composer).toHaveAttribute('placeholder', expect.stringMatching(/\S/));
    expect(screen.getByRole('button', { name: /Analyze decision/i })).toBeInTheDocument();
  });

  it('empties the composer on a repeated new decision, with nothing selected', () => {
    // Clearing the selection is not enough on its own: with selectedPrompt
    // already null the prop never changes, so a reset keyed only on that
    // transition never runs and the previous decision's text and thread survive.
    const { rerender } = render(<FinanceQA selectedPrompt={null} newDecisionNonce={1} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Half-typed question' } });
    expect(screen.getByRole('textbox')).toHaveValue('Half-typed question');

    rerender(<FinanceQA selectedPrompt={null} newDecisionNonce={2} />);

    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('renders an answer that nothing interrupted', async () => {
    // The counterpart to the staleness test below. A guard that drops responses
    // needs to be pinned on the ordinary path too, or it can start dropping
    // every answer and only the negative test would still pass.
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/test/current-tier')) {
        return Promise.resolve({ ok: true, json: async () => ({ backendTier: 'premium' }) });
      }
      if (url.includes('/ask/display-real')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            answer: 'You are on track at $125K a year.',
            threadId: 'thread-a',
            conversationId: 'conversation-1',
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, headers: new Headers(), json: async () => ({}) });
    });

    const onNewAnswer = jest.fn();
    render(<FinanceQA onNewAnswer={onNewAnswer} newDecisionNonce={1} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Can I retire at 62?' } });
    fireEvent.submit(document.getElementById('finance-qa-form')!);

    expect(await screen.findByText('You are on track at $125K a year.')).toBeInTheDocument();
    expect(onNewAnswer).toHaveBeenCalledWith('Can I retire at 62?', 'You are on track at $125K a year.');
    expect(screen.getByRole('button', { name: /Ask follow-up/i })).toBeInTheDocument();
  });

  it('delivers a streamed answer, which is the path production takes', async () => {
    // The client always sends Accept: text/event-stream, so SSE is the real
    // path and the JSON branch is the fallback. The staleness guard sits inside
    // the stream parser, where a mid-stream reload could trip it — worth
    // pinning here rather than only on the branch production does not use.
    const chunks = [
      'event: progress\ndata: {"message":"Building your retirement snapshot"}\n\n',
      'event: answerDelta\ndata: {"delta":"You are on track"}\n\n',
      'event: result\ndata: {"answer":"You are on track at $125K a year.","threadId":"thread-a","conversationId":"conversation-1"}\n\n',
    ];
    let chunkIndex = 0;
    const encoder = new TextEncoder();

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/test/current-tier')) {
        return Promise.resolve({ ok: true, json: async () => ({ backendTier: 'premium' }) });
      }
      if (url.includes('/ask/display-real')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'text/event-stream' }),
          body: {
            getReader: () => ({
              read: async () =>
                chunkIndex < chunks.length
                  ? { done: false, value: encoder.encode(chunks[chunkIndex++]) }
                  : { done: true, value: undefined },
            }),
          },
        });
      }
      return Promise.resolve({ ok: false, status: 404, headers: new Headers(), json: async () => ({}) });
    });

    const onNewAnswer = jest.fn();
    render(<FinanceQA onNewAnswer={onNewAnswer} newDecisionNonce={1} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Can I retire at 62?' } });
    fireEvent.submit(document.getElementById('finance-qa-form')!);

    expect(await screen.findByText('You are on track at $125K a year.')).toBeInTheDocument();
    expect(onNewAnswer).toHaveBeenCalledWith('Can I retire at 62?', 'You are on track at $125K a year.');
  });

  it('drops a streamed result once the user opens a different turn', async () => {
    // The staleness checks in the stream parser and the JSON branch are separate
    // call sites of the same guard. The JSON one is pinned below; this pins the
    // one that actually runs, mid-stream, which is where every race on this
    // component has surfaced.
    const encoder = new TextEncoder();
    let releaseResult: (() => void) | null = null;
    let step = 0;

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/test/current-tier')) {
        return Promise.resolve({ ok: true, json: async () => ({ backendTier: 'premium' }) });
      }
      if (url.includes('/ask/display-real')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'text/event-stream' }),
          body: {
            getReader: () => ({
              read: async () => {
                if (step === 0) {
                  step += 1;
                  return { done: false, value: encoder.encode('event: progress\ndata: {"message":"Working"}\n\n') };
                }
                if (step === 1) {
                  step += 1;
                  // Hold the stream open so the turn can be switched mid-answer.
                  await new Promise<void>(resolve => { releaseResult = resolve; });
                  return {
                    done: false,
                    value: encoder.encode(
                      'event: result\ndata: {"answer":"Stale streamed answer.","threadId":"thread-a","conversationId":"c9"}\n\n'
                    ),
                  };
                }
                return { done: true, value: undefined };
              },
            }),
          },
        });
      }
      return Promise.resolve({ ok: false, status: 404, headers: new Headers(), json: async () => ({}) });
    });

    const turnA = { id: 'turn-a', question: 'Can I retire at 62?', answer: 'Answer A', threadId: 'thread-a', timestamp: 1 };
    const turnB = { id: 'turn-b', question: 'How is my cash?', answer: 'Answer B', threadId: 'thread-b', timestamp: 2 };

    const onNewAnswer = jest.fn();
    const { rerender } = render(<FinanceQA onNewAnswer={onNewAnswer} selectedPrompt={turnA} />);

    fireEvent.submit(document.getElementById('finance-qa-form')!);
    await waitFor(() => expect(releaseResult).not.toBeNull());

    rerender(<FinanceQA onNewAnswer={onNewAnswer} selectedPrompt={turnB} />);
    await act(async () => {
      releaseResult!();
    });

    expect(screen.queryByText('Stale streamed answer.')).not.toBeInTheDocument();
    expect(onNewAnswer).not.toHaveBeenCalled();
    // The turn the user actually chose is what stays on screen.
    expect(screen.getByText('Answer B')).toBeInTheDocument();
  });

  it('ignores a late answer after new decision during analysis', async () => {
    let resolveAsk: (value: Response) => void;
    const askPromise = new Promise<Response>(resolve => {
      resolveAsk = resolve;
    });

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/test/current-tier')) {
        return Promise.resolve({ ok: true, json: async () => ({ backendTier: 'premium' }) });
      }
      if (url.includes('/ask/display-real')) {
        return askPromise;
      }
      return Promise.resolve({ ok: false, status: 404, headers: new Headers(), json: async () => ({}) });
    });

    const onNewAnswer = jest.fn();
    const { rerender } = render(<FinanceQA onNewAnswer={onNewAnswer} newDecisionNonce={1} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Can I retire at 62?' } });
    fireEvent.submit(document.getElementById('finance-qa-form')!);

    expect(await screen.findByRole('button', { name: /Analyzing/i })).toBeInTheDocument();

    rerender(<FinanceQA onNewAnswer={onNewAnswer} newDecisionNonce={2} />);

    resolveAsk!({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        answer: 'Stale answer from the abandoned decision.',
        threadId: 'thread-a',
        conversationId: 'conversation-1',
      }),
    } as Response);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText('Stale answer from the abandoned decision.')).not.toBeInTheDocument();
    expect(onNewAnswer).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Analyze decision/i })).toBeInTheDocument();
  });

  it('ignores a late answer after opening a different turn during analysis', async () => {
    let resolveAsk: (value: Response) => void;
    const askPromise = new Promise<Response>(resolve => {
      resolveAsk = resolve;
    });

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/test/current-tier')) {
        return Promise.resolve({ ok: true, json: async () => ({ backendTier: 'premium' }) });
      }
      if (url.includes('/ask/display-real')) {
        return askPromise;
      }
      return Promise.resolve({ ok: false, status: 404, headers: new Headers(), json: async () => ({}) });
    });

    const turnA = {
      id: 'conversation-a',
      threadId: 'thread-a',
      question: 'What about retiring at 58?',
      answer: 'You could retire at 58 with adjustments.',
      timestamp: Date.now(),
    };
    const turnB = {
      id: 'conversation-b',
      threadId: 'thread-b',
      question: 'How is my cash position?',
      answer: 'Cash covers roughly six months of spending.',
      timestamp: Date.now() - 1000,
    };

    const onNewAnswer = jest.fn();
    const { rerender } = render(
      <FinanceQA onNewAnswer={onNewAnswer} selectedPrompt={turnA} />
    );

    fireEvent.submit(document.getElementById('finance-qa-form')!);
    expect(await screen.findByRole('button', { name: /Analyzing/i })).toBeInTheDocument();

    rerender(<FinanceQA onNewAnswer={onNewAnswer} selectedPrompt={turnB} />);
    expect(screen.getByText('Cash covers roughly six months of spending.')).toBeInTheDocument();

    resolveAsk!({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        answer: 'Stale follow-up for the abandoned turn.',
        threadId: 'thread-a',
        conversationId: 'conversation-a2',
      }),
    } as Response);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText('Stale follow-up for the abandoned turn.')).not.toBeInTheDocument();
    expect(onNewAnswer).not.toHaveBeenCalled();
    expect(screen.getByText('Cash covers roughly six months of spending.')).toBeInTheDocument();
  });
});
