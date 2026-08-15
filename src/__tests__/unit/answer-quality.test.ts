import { buildAnswerQualityReport, type AnswerQualityConversation } from '../../services/answer-quality';

interface ConversationOptions {
  id: string;
  question: string;
  minute: number;
  rating?: number | null;
  valid?: boolean;
  outcome?: 'passed' | 'salvaged' | 'replaced';
  escalated?: boolean;
  routed?: Partial<Record<string, boolean>>;
  issues?: string[];
  manifest?: boolean;
}

function conversation(options: ConversationOptions): AnswerQualityConversation {
  const createdAt = new Date(Date.UTC(2026, 7, 15, 12, options.minute));
  const selection = {
    accountsIncluded: true,
    transactionDetailsIncluded: true,
    investmentDetailsIncluded: true,
    marketContextRequested: false,
    searchContextRequested: false,
    ...options.routed,
  };
  return {
    id: options.id,
    question: options.question,
    createdAt,
    feedback: options.rating == null ? [] : [{ score: options.rating, createdAt }],
    showTheMathData: options.manifest === false ? null : {
      evidenceManifest: {
        version: 1,
        generatedAt: createdAt.toISOString(),
        snapshot: {},
        facts: [],
        // An escalated request ends with everything loaded; the routed
        // selection is what the report must score.
        contextSelection: options.escalated
          ? { ...selection, accountsIncluded: true, transactionDetailsIncluded: true, investmentDetailsIncluded: true }
          : selection,
        ...(options.escalated && { contextEscalated: true, routedContextSelection: selection }),
        modelCalls: [],
        timings: { contextGatherMs: 1, promptBuildMs: 1, totalMs: 2 },
        validation: {
          deterministic: {
            valid: options.valid ?? true,
            issues: options.issues ?? [],
            ...(options.outcome && { outcome: options.outcome }),
          },
        },
        evidenceRefs: { tickers: [], retirementAnalysis: false, marketContext: false },
      },
    },
  };
}

describe('answer quality report', () => {
  it('correlates a withheld tier with both grounding misses and user ratings', () => {
    // The shape that would justify building smarter routing: questions denied
    // the transaction rows both fail grounding more and get rated worse.
    const report = buildAnswerQualityReport([
      conversation({ id: 'a', question: 'Evaluate my spending', minute: 1, rating: 2, valid: false, outcome: 'salvaged', routed: { transactionDetailsIncluded: false } }),
      conversation({ id: 'b', question: 'Where does it go', minute: 2, rating: 1, valid: false, outcome: 'replaced', routed: { transactionDetailsIncluded: false } }),
      conversation({ id: 'c', question: 'Budget check', minute: 3, rating: 3, routed: { transactionDetailsIncluded: false } }),
      conversation({ id: 'd', question: 'Largest merchants', minute: 4, rating: 5 }),
      conversation({ id: 'e', question: 'Recent purchases', minute: 5, rating: 5 }),
    ]);

    const tier = report.routing.transactionDetailsIncluded;
    expect(tier.withheld).toMatchObject({ samples: 3, missRate: 0.667, averageRating: 2 });
    expect(tier.supplied).toMatchObject({ samples: 2, missRate: 0, averageRating: 5 });
    expect(tier.excessMissWhenWithheld).toBeCloseTo(2 / 3);
    expect(tier.ratingPenaltyWhenWithheld).toBe(3);
  });

  it('counts a successful escalation as a miss only against the tiers it widened', () => {
    // The widened retry produced a grounded, well-rated answer. That is a good
    // outcome and still evidence that routing withheld the investments it needed
    // — but escalation never reaches for market or search context, which were
    // withheld here for entirely ordinary reasons.
    const report = buildAnswerQualityReport([
      conversation({ id: 'a', question: 'Am I on track', minute: 1, rating: 5, escalated: true, routed: { investmentDetailsIncluded: false } }),
    ]);

    expect(report.quality.groundedRate).toBe(1);
    expect(report.quality.escalationRate).toBe(1);
    expect(report.routing.investmentDetailsIncluded.withheld).toMatchObject({ samples: 1, missRate: 1 });
    expect(report.routing.marketContextRequested.withheld).toMatchObject({ samples: 1, missRate: 0 });
    expect(report.routing.searchContextRequested.withheld).toMatchObject({ samples: 1, missRate: 0 });
    expect(report.recent[0]).toMatchObject({
      escalated: true,
      widened: ['investmentDetailsIncluded'],
      withheld: expect.arrayContaining(['investmentDetailsIncluded']),
    });
    // The widened read is not what gets scored.
    expect(report.recent[0].routedSelection.investmentDetailsIncluded).toBe(false);
  });

  it('reports ratings by grounding outcome', () => {
    const report = buildAnswerQualityReport([
      conversation({ id: 'a', question: 'q1', minute: 1, rating: 5, outcome: 'passed' }),
      conversation({ id: 'b', question: 'q2', minute: 2, rating: 3, valid: false, outcome: 'salvaged' }),
      conversation({ id: 'c', question: 'q3', minute: 3, rating: 1, valid: false, outcome: 'replaced' }),
      conversation({ id: 'd', question: 'q4', minute: 4, rating: null, outcome: 'passed' }),
    ]);

    expect(report.quality.byOutcome.passed).toEqual({ samples: 2, ratedSamples: 1, averageRating: 5 });
    expect(report.quality.byOutcome.salvaged).toEqual({ samples: 1, ratedSamples: 1, averageRating: 3 });
    expect(report.quality.byOutcome.replaced).toEqual({ samples: 1, ratedSamples: 1, averageRating: 1 });
    expect(report.window).toMatchObject({ conversations: 4, withManifest: 4, rated: 3 });
  });

  it('uses the most recent score when an answer was re-rated', () => {
    const createdAt = new Date(Date.UTC(2026, 7, 15, 12, 0));
    const base = conversation({ id: 'a', question: 'q', minute: 0, rating: null });
    const report = buildAnswerQualityReport([{
      ...base,
      feedback: [
        { score: 1, createdAt },
        { score: 4, createdAt: new Date(createdAt.getTime() + 60_000) },
      ],
    }]);

    expect(report.recent[0].rating).toBe(4);
  });

  it('ignores conversations with no evidence manifest', () => {
    const report = buildAnswerQualityReport([
      conversation({ id: 'a', question: 'q1', minute: 1, rating: 5 }),
      conversation({ id: 'b', question: 'legacy row', minute: 2, rating: 1, manifest: false }),
    ]);

    expect(report.window).toMatchObject({ conversations: 2, withManifest: 1 });
    expect(report.recent).toHaveLength(1);
    expect(report.quality.averageRating).toBe(5);
  });

  it('returns nulls rather than zeros when there is nothing to compare', () => {
    const report = buildAnswerQualityReport([]);
    expect(report.quality.groundedRate).toBeNull();
    expect(report.quality.averageRating).toBeNull();
    expect(report.routing.accountsIncluded.excessMissWhenWithheld).toBeNull();
    expect(report.routing.accountsIncluded.ratingPenaltyWhenWithheld).toBeNull();
    expect(report.window).toEqual({ from: null, to: null, conversations: 0, withManifest: 0, rated: 0 });
  });

  it('surfaces the questions behind a signal, newest first', () => {
    const report = buildAnswerQualityReport([
      conversation({ id: 'old', question: 'older question', minute: 1, rating: 4 }),
      conversation({
        id: 'new', question: 'newer question', minute: 9, rating: 2, valid: false, outcome: 'salvaged',
        issues: ['User-facing usd value 250000 is not present in the canonical fact pack.'],
      }),
    ], 1);

    expect(report.recent).toHaveLength(1);
    expect(report.recent[0]).toMatchObject({
      question: 'newer question',
      rating: 2,
      outcome: 'salvaged',
      unsupportedValues: 1,
    });
  });
});
