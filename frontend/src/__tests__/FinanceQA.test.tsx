import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FinanceQA from '@/components/FinanceQA';

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
});
