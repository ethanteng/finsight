import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AppPageClient from '@/app/app/AppPageClient';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/components/FinanceQA', () => ({
  __esModule: true,
  // Answering is what triggers a history reload, so the stub needs to be able
  // to fire it.
  default: ({ onNewAnswer }: { onNewAnswer?: (q: string, a: string) => void }) => (
    <button type="button" onClick={() => onNewAnswer?.('q', 'a')}>simulate answer</button>
  ),
}));
jest.mock('@/components/FinancialOverview', () => ({
  __esModule: true,
  default: () => <div data-testid="financial-overview" />,
}));
jest.mock('@/components/MarketNewsModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/PlaidLinkButton', () => ({ resetPlaidLinkInitialization: jest.fn() }));
jest.mock('@/lib/heycatch', () => ({ identifyUser: jest.fn(), resetUserIdentity: jest.fn() }));
jest.mock('@/lib/browser-time-zone', () => ({ syncStoredUserTimeZoneFromAuthUser: jest.fn() }));

const turn = (id: string, threadId: string | null, question: string, timestamp: number) => ({
  id,
  question,
  answer: `Answer for ${id}`,
  threadId,
  timestamp,
});

describe('AppPageClient decision list', () => {
  let releaseHistory: (() => void) | null = null;

  function mockApi(
    conversations: ReturnType<typeof turn>[],
    {
      holdHistory = false,
      holdHistoryAfterAnswer = false,
      laterConversations,
    }: {
      holdHistory?: boolean;
      holdHistoryAfterAnswer?: boolean;
      laterConversations?: ReturnType<typeof turn>[];
    } = {}
  ) {
    let historyCalls = 0;
    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/verify')) {
        return Promise.resolve({ ok: true, json: async () => ({ user: { email: 'user@example.com' } }) });
      }
      if (url.includes('/api/stripe/subscription-status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'active', tier: 'premium', accessLevel: 'full' }),
        });
      }
      if (url.includes('/conversations')) {
        historyCalls += 1;
        const body = historyCalls > 1 && laterConversations ? laterConversations : conversations;
        const payload = { ok: true, status: 200, json: async () => ({ conversations: body }) };
        const shouldHold =
          (holdHistory && historyCalls === 1) ||
          (holdHistoryAfterAnswer && historyCalls > 1);
        if (!shouldHold) return Promise.resolve(payload);
        return new Promise(resolve => {
          releaseHistory = () => resolve(payload);
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });
  }

  beforeEach(() => {
    localStorage.setItem('auth_token', 'token');
    releaseHistory = null;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('groups turns into decisions and marks the one a follow-up would continue', async () => {
    mockApi([
      turn('c3', 'thread-a', 'Confirm $125K as my target', 300),
      turn('c2', 'thread-a', 'Re-run my retirement analysis', 200),
      turn('c1', 'thread-a', 'What about retiring at 58?', 100),
      turn('other', 'thread-b', 'How is my cash position?', 50),
    ]);

    render(<AppPageClient />);

    // The newest turn is selected on load, so its decision is the active one.
    const activeDecision = await screen.findByRole('group', {
      name: 'Decision: What about retiring at 58?',
    });
    expect(activeDecision).toHaveTextContent('Resuming');
    expect(activeDecision).toHaveTextContent('3 turns');
    expect(activeDecision).toHaveTextContent('A follow-up sees these turns.');

    // The turn a follow-up continues from leads; the decision is still named by
    // the question that opened it, which is the label that survives follow-ups.
    const turnsListed = within(activeDecision)
      .getAllByRole('button')
      .map(button => button.textContent);
    expect(turnsListed[0]).toContain('Confirm $125K as my target');
    expect(turnsListed[2]).toContain('What about retiring at 58?');

    // A different decision is present but not presented as active.
    const otherDecision = screen.getByRole('group', { name: 'Decision: How is my cash position?' });
    expect(otherDecision).not.toHaveTextContent('Resuming');
    expect(otherDecision).not.toHaveTextContent('A follow-up sees these turns.');
  });

  it('keeps a new decision clear when a history reload lands after it', async () => {
    // Answering triggers the reload. Clicking "New decision" while it is in
    // flight must not re-select the turn that was just answered, or the thread
    // comes back and the composer refills.
    mockApi([turn('c1', 'thread-a', 'What about retiring at 58?', 100)], { holdHistory: true });

    render(<AppPageClient />);
    await waitFor(() => expect(releaseHistory).not.toBeNull());

    fireEvent.click(screen.getAllByRole('button', { name: /new decision/i })[0]);
    await act(async () => {
      releaseHistory!();
    });

    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'Decision: What about retiring at 58?' })).toBeInTheDocument()
    );
    // The turn is listed, but nothing is being resumed.
    expect(screen.queryByText('Resuming')).not.toBeInTheDocument();
  });

  it('marks the decision active after a first answer with nothing previously selected', () => {
    // A fresh decision leaves nothing selected until its first answer lands.
    // Declining to select whenever the selection is null would leave the
    // sidebar showing no active thread while the composer holds one — the
    // common flow, and exactly what the highlight is for.
    mockApi([], {
      laterConversations: [
        turn('c2', 'thread-a', 'And at 60?', 200),
        turn('c1', 'thread-a', 'What about retiring at 58?', 100),
      ],
    });

    return (async () => {
      render(<AppPageClient />);
      const answerButton = await screen.findByRole('button', { name: 'simulate answer' });

      await act(async () => {
        fireEvent.click(answerButton);
      });

      const decision = await screen.findByRole('group', {
        name: 'Decision: What about retiring at 58?',
      });
      expect(decision).toHaveTextContent('Resuming');
      expect(decision).toHaveTextContent('A follow-up sees these turns.');
    })();
  });

  it('keeps a sidebar choice in another decision when a reload lands after it', async () => {
    mockApi(
      [
        turn('c2', 'thread-a', 'Re-run my retirement analysis', 200),
        turn('c1', 'thread-a', 'What about retiring at 58?', 100),
        turn('other', 'thread-b', 'How is my cash position?', 50),
      ],
      {
        holdHistoryAfterAnswer: true,
        laterConversations: [
          turn('c3', 'thread-a', 'Confirm $125K as my target', 300),
          turn('c2', 'thread-a', 'Re-run my retirement analysis', 200),
          turn('c1', 'thread-a', 'What about retiring at 58?', 100),
          turn('other', 'thread-b', 'How is my cash position?', 50),
        ],
      }
    );

    render(<AppPageClient />);
    await screen.findByRole('group', { name: 'Decision: What about retiring at 58?' });

    fireEvent.click(screen.getByRole('button', { name: 'simulate answer' }));
    await waitFor(() => expect(releaseHistory).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /How is my cash position/i }));
    await act(async () => {
      releaseHistory!();
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /How is my cash position/i })).toHaveAttribute(
        'aria-current',
        'true'
      )
    );
  });
});
