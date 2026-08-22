import { fireEvent, render, screen } from '@testing-library/react';
import AnswerQualityPanel from '@/components/admin/AnswerQualityPanel';

const REPORT = {
  window: { from: null, to: null, conversations: 6, withEvidence: 6 },
  delivery: {
    total: 6, clean: 4, recovered: 1, failed: 1, cleanRate: 0.667,
    headline: '4 of 6 answers were delivered cleanly; 1 failed and needs review.',
  },
  evidence: { verified: 4, salvaged: 1, replaced: 1, verifiedRate: 0.667, trimmedSentences: 2, trimmedKeyNumbers: 1 },
  planning: {
    semanticPlans: 6,
    fallbackPlans: 2,
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
    failedQueries: 1,
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
    details: {
      groundingIssues: ['User-facing usd value 384000 is not present in the canonical fact pack.'],
      secondaryIssues: [{ phase: 'retry', issues: ['The conclusion does not follow from the cited figures.'] }],
      removedSentences: [{
        field: 'summary',
        text: 'A 20% drop would cost you $384,000.',
        reason: 'unsupported_value',
        unsupportedValues: ['$384,000'],
      }, {
        field: 'insight',
        index: 0,
        text: 'That is a big hit this close to retirement.',
        reason: 'dependent_on_removed',
      }],
      removedKeyNumbers: [{
        key: 'drawdown_loss',
        value: 384000,
        unit: 'usd',
        provenance: 'no_such_fact',
        issues: ['drawdown_loss does not cite a canonical fact.'],
      }],
      replacedSummary: 'You can retire next year on $384,000 of savings.',
      plannedSearchQueries: [
        { query: 'current Federal Reserve interest rate', purpose: 'rate', freshness: 'pm' },
        { query: '2026 IRA contribution limit', purpose: 'rule', freshness: null },
      ],
      searchQueryOutcomes: [{
        query: 'current Federal Reserve interest rate',
        purpose: 'rate',
        freshness: 'pm',
        source: 'provider',
        status: 'succeeded',
        resultCount: 1,
        results: [{
          title: 'Fed holds rates steady',
          url: 'https://example.com/fed',
          source: 'example.com',
          snippet: 'The target range is unchanged at 4.25-4.50%.',
        }],
      }, {
        query: '2026 IRA contribution limit',
        purpose: 'rule',
        freshness: null,
        source: 'cache',
        status: 'failed',
        resultCount: 0,
        error: 'Brave Search quota is exhausted for another 4 seconds',
        results: [],
      }],
    },
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
    expect(screen.getByText(/1 expanded before answering/)).toBeInTheDocument();
    expect(screen.getByText(/2 planner fallback\(s\)/)).toBeInTheDocument();
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
    expect(screen.getByText(/2 completed · 0 unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/0 completed · 1 unavailable/)).toBeInTheDocument();
  });

  it('shows search retrieval and cache usage separately from planning', async () => {
    render(<AnswerQualityPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);
    expect(await screen.findByText('Public search evidence')).toBeInTheDocument();
    expect(screen.getByText('Brave provider calls')).toBeInTheDocument();
    expect(screen.getByText('queries served from cache')).toBeInTheDocument();
    expect(screen.getByText(/search loaded 5 results/)).toBeInTheDocument();
  });

  it('expands a recent answer into what was removed and why', async () => {
    render(<AnswerQualityPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Show details' }));

    expect(screen.getByText('A 20% drop would cost you $384,000.')).toBeInTheDocument();
    expect(screen.getByText('That is a big hit this close to retirement.')).toBeInTheDocument();
    expect(screen.getByText(/referred back to a sentence that was removed/)).toBeInTheDocument();
    expect(screen.getByText('drawdown_loss')).toBeInTheDocument();
    expect(screen.getByText('drawdown_loss does not cite a canonical fact.')).toBeInTheDocument();
    expect(screen.getByText('You can retire next year on $384,000 of savings.')).toBeInTheDocument();
    expect(screen.getByText('The conclusion does not follow from the cited figures.')).toBeInTheDocument();
  });

  it('shows each Brave query, its routing, and the results it returned', async () => {
    render(<AnswerQualityPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Show details' }));

    expect(screen.getByText('“current Federal Reserve interest rate”')).toBeInTheDocument();
    expect(screen.getByText('Brave provider call')).toBeInTheDocument();
    expect(screen.getByText('served from cache')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fed holds rates steady' })).toHaveAttribute('href', 'https://example.com/fed');
    expect(screen.getByText('The target range is unchanged at 4.25-4.50%.')).toBeInTheDocument();
    expect(screen.getByText('Brave Search quota is exhausted for another 4 seconds')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide details' }));
    expect(screen.queryByText('The target range is unchanged at 4.25-4.50%.')).not.toBeInTheDocument();
  });

  it('rolls removals and query failures into the summary cards', async () => {
    render(<AnswerQualityPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);
    expect(await screen.findByText(/2 sentence\(s\) and 1 key number\(s\) removed/)).toBeInTheDocument();
    expect(screen.getByText(/1 query failure\(s\)/)).toBeInTheDocument();
  });

  it('still shows removal totals when only key numbers were dropped', async () => {
    const keyOnlyReport = {
      ...REPORT,
      evidence: { ...REPORT.evidence, trimmedSentences: 0, trimmedKeyNumbers: 3 },
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => keyOnlyReport,
    });
    render(<AnswerQualityPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);
    expect(await screen.findByText(/0 sentence\(s\) and 3 key number\(s\) removed/)).toBeInTheDocument();
  });

  it('explains recent answer status in plain language', async () => {
    render(<AnswerQualityPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);
    expect(await screen.findByText('Can I retire next year?')).toBeInTheDocument();
    expect(screen.getByText(/could not be verified/)).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });
});
