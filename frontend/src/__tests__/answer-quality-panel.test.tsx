import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AnswerQualityPanel from '@/components/admin/AnswerQualityPanel';

const emptyRoutingTier = {
  withheld: { samples: 0, missRate: null, ratedSamples: 0, averageRating: null },
  supplied: { samples: 0, missRate: null, ratedSamples: 0, averageRating: null },
  excessMissWhenWithheld: null,
  ratingPenaltyWhenWithheld: null,
};

function report(overrides: Record<string, unknown> = {}) {
  return {
    scorecard: {
      score: 62,
      status: 'yellow',
      headline: '3 of the last 6 answers were solid, but 2 came out shaky and 1 went wrong.',
      answers: 6,
      counts: { green: 3, yellow: 2, red: 1 },
      trend: { recentScore: 62, previousScore: 80, delta: -18, comparedAnswers: 3 },
      reasons: [
        {
          id: 'replaced',
          label: 'Answers we could not back up, so the user got a fallback instead',
          severity: 'red',
          answers: 1,
          share: 0.167,
          detail: null,
          example: { id: 'c1', question: 'How much can I spend in retirement?' },
        },
        {
          id: 'escalated',
          label: 'Answers that needed a second attempt to find the right data',
          severity: 'yellow',
          answers: 2,
          share: 0.333,
          detail: 'usually went back for investment holdings',
          example: { id: 'c2', question: 'Am I on track?' },
        },
      ],
      ...(overrides.scorecard as object ?? {}),
    },
    window: { from: null, to: null, conversations: 6, withManifest: 6, rated: 4 },
    quality: {
      groundedRate: 0.83,
      escalationRate: 0.33,
      averageRating: 3.5,
      byOutcome: {
        passed: { samples: 5, ratedSamples: 3, averageRating: 4.3 },
        salvaged: { samples: 0, ratedSamples: 0, averageRating: null },
        replaced: { samples: 1, ratedSamples: 1, averageRating: 1 },
      },
      byEscalation: {
        escalated: { samples: 2, ratedSamples: 1, averageRating: 4 },
        notEscalated: { samples: 4, ratedSamples: 3, averageRating: 3.3 },
      },
    },
    routing: { accountsIncluded: emptyRoutingTier, investmentDetailsIncluded: emptyRoutingTier },
    recent: [
      {
        id: 'c1',
        createdAt: '2026-08-15T18:54:08.000Z',
        question: 'How much can I spend in retirement?',
        rating: 1,
        outcome: 'replaced',
        grounded: false,
        escalated: false,
        withheld: ['investmentDetailsIncluded'],
        unsupportedValues: 2,
        grade: 'red',
        gradeReason: 'We could not back up the answer, so it was replaced',
      },
    ],
    ...overrides,
  };
}

function mockReport(body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
}

describe('AnswerQualityPanel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('leads with the score, the light, and what is costing points', async () => {
    mockReport(report());
    render(<AnswerQualityPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);

    expect(await screen.findByText('62')).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText(/3 of the last 6 answers were solid/)).toBeInTheDocument();
    // Both batch scores are named, because the headline score averages the whole
    // window and a bare delta beside it would read as the headline moving.
    expect(screen.getByText('▼ 18 pts — last 3 scored 62, previous 3 scored 80')).toBeInTheDocument();
    expect(screen.getByText('Good: 3')).toBeInTheDocument();
    expect(screen.getByText('Answers that needed a second attempt to find the right data')).toBeInTheDocument();
    expect(screen.getByText('usually went back for investment holdings')).toBeInTheDocument();
  });

  it('keeps the routing correlations out of the way until they are asked for', async () => {
    mockReport(report());
    render(<AnswerQualityPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);

    await screen.findByText('62');
    expect(screen.queryByText('Miss excess')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Show technical detail'));
    await waitFor(() => expect(screen.getByText('Miss excess')).toBeInTheDocument());
    expect(screen.getByText('Rating penalty')).toBeInTheDocument();
  });

  it('explains each recent answer in a sentence rather than jargon', async () => {
    mockReport(report());
    render(<AnswerQualityPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);

    await screen.findByText('62');
    expect(screen.getByText('We could not back up the answer, so it was replaced')).toBeInTheDocument();
    expect(screen.getByText('1/5')).toBeInTheDocument();
  });

  it('does not credit a user verdict nobody gave when nothing has been rated', async () => {
    mockReport(report({
      scorecard: {
        score: 100,
        status: 'green',
        headline: '4 of the last 4 answers were solid and none went wrong.',
        answers: 4,
        counts: { green: 4, yellow: 0, red: 0 },
        trend: null,
        reasons: [],
      },
      window: { from: null, to: null, conversations: 4, withManifest: 4, rated: 0 },
      recent: [],
    }));
    render(<AnswerQualityPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);

    expect(await screen.findByText(/none have been rated by a user yet/)).toBeInTheDocument();
    expect(screen.queryByText(/well rated/)).not.toBeInTheDocument();
  });

  it('says so plainly when there is nothing to score yet', async () => {
    mockReport(report({
      scorecard: {
        score: null,
        status: 'unknown',
        headline: 'No answers with evidence yet — the score appears once questions come in.',
        answers: 0,
        counts: { green: 0, yellow: 0, red: 0 },
        trend: null,
        reasons: [],
      },
      recent: [],
    }));
    render(<AnswerQualityPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);

    expect(await screen.findByText('No data yet')).toBeInTheDocument();
    expect(screen.getByText(/the score appears once questions come in/)).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
