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
  default: () => null,
  ShowTheMathContent: () => <div>Calculation detail</div>,
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
    render(<FinanceQA selectedPrompt={{ id: 'conversation-1', question: 'Can I retire?', answer: 'You are on track with the current assumptions.', timestamp: Date.now() }} />);
    const answer = screen.getByText('You are on track with the current assumptions.');
    expect(answer).toBeInTheDocument();
    expect(answer.closest('.decision-answer')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'answer' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'sources' }));
    expect(screen.getByRole('tab', { name: 'sources' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Supporting evidence')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/No supporting source bundle|Loading sources/)).toBeInTheDocument());
  });
});
