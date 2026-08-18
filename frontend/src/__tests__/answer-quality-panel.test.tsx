import { render, screen } from '@testing-library/react';
import AnswerQualityPanel from '@/components/admin/AnswerQualityPanel';

const REPORT = {
  window: { from: null, to: null, conversations: 6, withEvidence: 6 },
  delivery: {
    total: 6, clean: 4, recovered: 1, failed: 1, cleanRate: 0.667,
    headline: '4 of 6 answers were delivered cleanly; 1 failed and needs review.',
  },
  evidence: { verified: 4, salvaged: 1, replaced: 1, verifiedRate: 0.667 },
  planning: {
    semanticPlans: 6,
    fallbackPlans: 0,
    plannerAccepted: 4,
    primaryToolExpanded: 1,
    primaryToolFailed: 0,
    lateExpanded: 1,
    plannerAcceptedRate: 0.667,
    averagePlannerMs: 125,
    byPack: {
      account_details: { selectedInitially: 4, addedByPrimaryTool: 1, presentFinally: 5 },
      transaction_details: { selectedInitially: 2, addedByPrimaryTool: 0, presentFinally: 3 },
    },
  },
  scenarios: {
    requested: 3,
    completed: 2,
    unavailable: 1,
    notRun: 0,
    averageMs: 42,
    completedCalculations: 2,
    unavailableCalculations: 1,
    byCalculator: {
      retirement: { completed: 2, unavailable: 0 },
      home_affordability: { completed: 0, unavailable: 1 },
    },
  },
  search: {
    requested: 3,
    retrieved: 2,
    unavailable: 1,
    retrievalRate: 0.667,
    plannedQueries: 4,
    providerCalls: 2,
    cacheHits: 2,
    cacheReuseRate: 0.5,
    resultCount: 9,
  },
  users: { rated: 3, positive: 2, neutral: 0, negative: 1, averageRating: 3.67 },
  recent: [{
    id: 'c1',
    createdAt: '2026-08-17T12:00:00.000Z',
    question: 'Can I retire next year?',
    rating: 1,
    deliveryStatus: 'failed',
    statusReason: 'The generated answer could not be verified, so the user received a fallback.',
    outcome: 'replaced',
    plannerSource: 'context_planner',
    selectedPacks: ['retirement_analysis'],
    finalPacks: ['retirement_analysis'],
    toolAddedPacks: [],
    primaryToolOutcome: 'accepted',
    lateExpansion: false,
    scenarioRequested: true,
    scenarioStatus: 'completed',
    scenarioStatuses: { retirement: 'completed', home_affordability: 'unavailable' },
    searchRequested: true,
    searchQueryCount: 2,
    searchRetrieved: true,
    searchProviderCalls: 1,
    searchCacheHits: 1,
    searchResultCount: 5,
  }],
};

describe('AnswerQualityPanel', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => REPORT });
  });

  it('leads with a direct delivery verdict instead of a synthetic score', async () => {
    render(<AnswerQualityPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);
    expect(await screen.findByText('Some answers failed')).toBeInTheDocument();
    expect(screen.getByText('4 of 6 answers were delivered cleanly; 1 failed and needs review.')).toBeInTheDocument();
    expect(screen.getAllByText('67%').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('/ 100')).not.toBeInTheDocument();
  });

  it('shows the four understandable quality stages', async () => {
    render(<AnswerQualityPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);
    await screen.findByText('Delivered cleanly');
    expect(screen.getByText('Evidence verified')).toBeInTheDocument();
    expect(screen.getByText('Planner sufficient')).toBeInTheDocument();
    expect(screen.getByText('User rating')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText(/1 expanded before answering/)).toBeInTheDocument();
  });

  it('does not expose the context-planning operations card', async () => {
    render(<AnswerQualityPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);
    await screen.findByText('Delivered cleanly');
    expect(screen.queryByText('How context planning is doing')).not.toBeInTheDocument();
    expect(screen.queryByText('Show per-pack detail')).not.toBeInTheDocument();
    expect(screen.queryByText('Context planner')).not.toBeInTheDocument();
  });

  it('shows scenario completion and calculation timing', async () => {
    render(<AnswerQualityPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);
    expect(await screen.findByText('Scenario runner')).toBeInTheDocument();
    expect(screen.getByText('scenario requests')).toBeInTheDocument();
    expect(screen.getByText('42 ms')).toBeInTheDocument();
    expect(screen.getByText(/retirement scenario completed/i)).toBeInTheDocument();
    expect(screen.getByText(/home affordability missing inputs/i)).toBeInTheDocument();
    expect(screen.getByText(/2 completed calculation\(s\)/i)).toBeInTheDocument();
  });

  it('shows search retrieval and cache usage separately from planning', async () => {
    render(<AnswerQualityPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);
    expect(await screen.findByText('Public search evidence')).toBeInTheDocument();
    expect(screen.getByText('Brave provider calls')).toBeInTheDocument();
    expect(screen.getByText('queries served from cache')).toBeInTheDocument();
    expect(screen.getByText(/search loaded 5 results/)).toBeInTheDocument();
  });

  it('explains recent answer status in plain language', async () => {
    render(<AnswerQualityPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);
    expect(await screen.findByText('Can I retire next year?')).toBeInTheDocument();
    expect(screen.getByText(/could not be verified/)).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });
});
