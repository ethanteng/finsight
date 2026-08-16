import { runAskLincAnalysis, selectValidationFeedback } from '../../openai/analysis-pipeline';
import { UNVERIFIED_PROSE_NOTICE } from '../../openai/response-facts';
import { SECONDARY_REVIEW_CAVEAT } from '../../openai/response-grounding';
import { gatherContextSnapshot } from '../../openai/context-service';
import { askClaude } from '../../openai/claude-client';
import { validateWithGemini } from '../../openai/response-validator';
import { askOpenAIWithPreparedPrompt } from '../../openai/openai-fallback-client';

jest.mock('../../openai/context-service', () => ({
  gatherContextSnapshot: jest.fn(),
}));
jest.mock('../../openai/claude-client', () => ({
  askClaude: jest.fn(),
  askClaudeStream: jest.fn(),
}));
jest.mock('../../openai/prompt-config', () => ({
  getActiveResponseTone: jest.fn(() => 'Be concise.'),
  loadResponseToneConfig: jest.fn(async () => undefined),
}));
jest.mock('../../openai/response-validator', () => ({
  validateWithGemini: jest.fn(async () => ({ valid: true, issues: [] })),
}));
jest.mock('../../openai/openai-fallback-client', () => ({
  askOpenAIWithPreparedPrompt: jest.fn(),
}));

const mockedGatherContext = gatherContextSnapshot as jest.MockedFunction<typeof gatherContextSnapshot>;
const mockedAskClaude = askClaude as jest.MockedFunction<typeof askClaude>;
const mockedValidateWithGemini = validateWithGemini as jest.MockedFunction<typeof validateWithGemini>;
const mockedAskOpenAI = askOpenAIWithPreparedPrompt as jest.MockedFunction<typeof askOpenAIWithPreparedPrompt>;

function snapshot() {
  return {
    accounts: [],
    bankingTransactions: [],
    metadata: {
      lastUpdated: new Date('2026-08-14T00:00:00.000Z'),
      dataSources: {},
      errors: [],
    },
    tierContext: {
      tierInfo: { currentTier: 'starter', availableSources: [] },
      upgradeHints: [],
      marketContext: {},
    },
    contextSelection: {
      accountsIncluded: false,
      transactionDetailsIncluded: false,
      investmentDetailsIncluded: false,
      marketContextRequested: false,
      searchContextRequested: false,
    },
    financialSummary: {
      financialOverview: {
        netWorth: 100,
        totalCash: 80,
        totalInvestments: 20,
        totalDebt: 0,
        homeValue: null,
      },
    },
  } as any;
}

describe('runAskLincAnalysis validation routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGatherContext.mockResolvedValue(snapshot());
    mockedAskOpenAI.mockResolvedValue(JSON.stringify({ summary: 'Fallback answer.' }));
  });

  it('skips the secondary model for a grounded balance lookup', async () => {
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Your net worth is $100.',
      key_numbers: { net_worth: 100 },
      insights: [],
      suggested_actions: [],
    }));

    await runAskLincAnalysis({
      question: 'What is my net worth?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(mockedAskClaude).toHaveBeenCalledTimes(1);
    expect(mockedValidateWithGemini).not.toHaveBeenCalled();
  });

  it('uses the secondary model for complex retirement analysis', async () => {
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Here is the retirement scenario.',
      insights: [],
      suggested_actions: [],
    }));

    await runAskLincAnalysis({
      question: 'Am I on track for retirement?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(mockedValidateWithGemini).toHaveBeenCalledTimes(1);
  });

  it('retries a canonical-number mismatch before invoking another model', async () => {
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $999.',
        key_numbers: { net_worth: 999 },
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $100.',
        key_numbers: { net_worth: 100 },
        insights: [],
        suggested_actions: [],
      }));

    const result = await runAskLincAnalysis({
      question: 'What is my net worth?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(mockedAskClaude).toHaveBeenCalledTimes(2);
    expect(mockedValidateWithGemini).not.toHaveBeenCalled();
    expect(result.structuredResponse.key_numbers).toEqual({
      net_worth: { value: 100, unit: 'usd', provenance: 'net_worth' },
    });
  });

  it('does not return an ungrounded summary when the retry is still wrong', async () => {
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Your net worth is $999.',
      insights: ['This is also based on $999.'],
      suggested_actions: ['Act on the incorrect result.'],
    }));

    const result = await runAskLincAnalysis({
      question: 'What is my net worth?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(mockedAskClaude).toHaveBeenCalledTimes(2);
    expect(result.structuredResponse).toEqual({
      summary: 'I could not verify the generated answer against your current financial snapshot. Please try the question again.',
      key_numbers: undefined,
      insights: [],
      suggested_actions: [],
    });
  });

  it('keeps the verified part of an answer when the retry is only partly wrong', async () => {
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Your net worth is $100. You should also expect $999 next year.',
      insights: ['Cash is $80.'],
      suggested_actions: ['Move $999 into savings.'],
    }));

    const result = await runAskLincAnalysis({
      question: 'What is my net worth?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(result.structuredResponse.summary).toBe(`Your net worth is $100.\n\n${UNVERIFIED_PROSE_NOTICE}`);
    expect(result.structuredResponse.insights).toEqual(['Cash is $80.']);
    expect(result.structuredResponse.suggested_actions).toEqual([]);
    expect(result.showTheMathData?.evidenceManifest.validation.deterministic.outcome).toBe('salvaged');
  });

  it('still runs secondary validation on a salvaged retry', async () => {
    // Salvaged prose reaches the user, so the reasoning checks Gemini performs
    // must not be skipped just because the deterministic pass failed.
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Your retirement plan is on track. A $999,999 windfall would help.',
      insights: [],
      suggested_actions: [],
    }));
    mockedValidateWithGemini
      .mockResolvedValueOnce({ valid: false, issues: ['Unsupported conclusion.'] })
      .mockResolvedValueOnce({ valid: false, issues: ['Still an unsupported conclusion.'] });

    const result = await runAskLincAnalysis({
      question: 'Am I on track for retirement?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(mockedValidateWithGemini).toHaveBeenCalledTimes(2);
    // Salvaged and then objected to: the verified sentence survives carrying
    // both notices, rather than the user getting nothing after two model calls.
    expect(result.structuredResponse.summary).toBe(
      `Your retirement plan is on track.\n\n${UNVERIFIED_PROSE_NOTICE}\n\n${SECONDARY_REVIEW_CAVEAT}`
    );
    expect(result.showTheMathData?.evidenceManifest.validation.deterministic.outcome).toBe('salvaged');
    expect(result.showTheMathData?.evidenceManifest.secondaryCaveat).toBe(true);
  });

  it('asks for the input that blocked the retirement projection', async () => {
    // The missing input was only ever described to the model, buried in the
    // context pack. The user is the one who can supply it.
    mockedGatherContext.mockResolvedValue({
      ...snapshot(),
      retirementAnalysisNeedsInfo: {
        missingParams: ['annualWithdrawalAmount'],
        detectedParams: {},
      },
    } as any);
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Your net worth is $100.',
      insights: [],
      suggested_actions: [],
    }));

    const result = await runAskLincAnalysis({ question: 'Am I on track for retirement?', userId: 'user-1' });

    expect(result.structuredResponse.summary).toContain('Your net worth is $100.');
    expect(result.structuredResponse.summary).toContain('how much you expect to spend per year once retired');
    expect(result.structuredResponse.summary).toContain('Reply with that');
    expect(result.displayText).toContain('Reply with that');
  });

  it('widens the context when the first answer reached for a number it was not given', async () => {
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your largest holding is worth $250,000.',
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $100.',
        insights: [],
        suggested_actions: [],
      }));

    const result = await runAskLincAnalysis({ question: 'What is my net worth?', userId: 'user-1' });

    // Routing selected none of the detail tiers; the retry asked for all of them.
    expect(mockedGatherContext).toHaveBeenCalledTimes(2);
    expect(mockedGatherContext.mock.calls[0][0].questionNeeds).toMatchObject({
      needsAccountDetails: false,
      needsInvestments: false,
    });
    expect(mockedGatherContext.mock.calls[1][0].questionNeeds).toMatchObject({
      needsAccountDetails: true,
      needsTransactionDetails: true,
      needsInvestments: true,
      needsRetirement: true,
    });
    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBe(true);
  });

  it('reaches for outside context when the missing number was a rate', async () => {
    // A percentage nobody supplied is the signature of a figure no connected
    // account holds. The personal tiers cannot answer it, so the widening has
    // to go outside or the retry is handed the same fact pack twice.
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Inflation is running at 3.1%, so your costs will climb.',
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $100.',
        insights: [],
        suggested_actions: [],
      }));

    const result = await runAskLincAnalysis({ question: 'What is my net worth?', userId: 'user-1' });

    expect(mockedGatherContext).toHaveBeenCalledTimes(2);
    expect(mockedGatherContext.mock.calls[1][0].questionNeeds).toMatchObject({
      needsMarketContext: true,
      needsSearchContext: true,
    });
    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBe(true);
  });

  it('leaves outside context alone when the missing number was an amount', async () => {
    // A missing dollar figure is personal — a balance, a transaction, a total.
    // Widening to search for one would spend a third-party call on nearly every
    // escalation, and would charge those tiers with a miss they had no part in.
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your largest holding is worth $250,000.',
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $100.',
        insights: [],
        suggested_actions: [],
      }));

    const result = await runAskLincAnalysis({ question: 'What is my net worth?', userId: 'user-1' });

    expect(mockedGatherContext).toHaveBeenCalledTimes(2);
    expect(mockedGatherContext.mock.calls[1][0].questionNeeds).toMatchObject({
      needsAccountDetails: true,
      needsMarketContext: false,
      needsSearchContext: false,
    });
    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBe(true);
  });

  it('keeps the first answer when widening the context grounds it', async () => {
    // $80 is total_cash, which the fact pack only gained on the widened read.
    // Re-judging against it means no second model call, and no feedback telling
    // the model to drop a number that is now supported.
    mockedGatherContext
      .mockResolvedValueOnce({ ...snapshot(), financialSummary: { financialOverview: { netWorth: 100, totalCash: null, totalInvestments: 20, totalDebt: 0, homeValue: null } } } as any)
      .mockResolvedValueOnce(snapshot());
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'You are holding $80 in cash.',
      insights: [],
      suggested_actions: [],
    }));

    const result = await runAskLincAnalysis({ question: 'What is my net worth?', userId: 'user-1' });

    expect(mockedAskClaude).toHaveBeenCalledTimes(1);
    expect(result.structuredResponse.summary).toBe('You are holding $80 in cash.');
    expect(result.showTheMathData?.evidenceManifest.validation.deterministic.valid).toBe(true);
    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBe(true);
    // Routing metrics must still see what routing originally chose.
    expect(result.showTheMathData?.evidenceManifest.routedContextSelection).toMatchObject({
      accountsIncluded: false,
    });
  });

  it('does not widen the context when every tier is already loaded', async () => {
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Your portfolio could reach $250,000.',
      insights: [],
      suggested_actions: [],
    }));

    // This question routes to accounts, transactions, investments, and retirement.
    const result = await runAskLincAnalysis({
      question: 'Evaluate my spending and my portfolio as I plan on retiring soon.',
      userId: 'user-1',
    });

    expect(mockedGatherContext).toHaveBeenCalledTimes(1);
    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBeUndefined();
  });

  it('keeps the retry when widening the context fails', async () => {
    mockedGatherContext
      .mockResolvedValueOnce(snapshot())
      .mockRejectedValueOnce(new Error('snapshot read failed'));
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({ summary: 'Your holding is worth $250,000.' }))
      .mockResolvedValueOnce(JSON.stringify({ summary: 'Your net worth is $100.' }));

    const result = await runAskLincAnalysis({ question: 'What is my net worth?', userId: 'user-1' });

    expect(mockedAskClaude).toHaveBeenCalledTimes(2);
    expect(result.structuredResponse.summary).toBe('Your net worth is $100.');
    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBeUndefined();
  });

  it('sends one example of every failure kind back to the retry', async () => {
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Your net worth is $999. Growth was 47%. You could add 250,000 to savings.',
      insights: [],
      suggested_actions: [],
    }));

    await runAskLincAnalysis({ question: 'What is my net worth?', userId: 'user-1' });

    const retryMessage = mockedAskClaude.mock.calls[1][1];
    expect(retryMessage).toContain('usd value 999');
    expect(retryMessage).toContain('percent value 47');
    expect(retryMessage).toContain('numeric value 250000');
  });

  it('re-runs secondary validation after a retry for complex questions', async () => {
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'You can withdraw $250,000 per year in retirement.',
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Based on your portfolio, a sustainable withdrawal may be lower.',
        insights: [],
        suggested_actions: [],
      }));
    mockedValidateWithGemini
      .mockResolvedValueOnce({ valid: false, issues: ['Withdrawal amount is unsupported by the portfolio.'] })
      .mockResolvedValueOnce({ valid: true, issues: [] });

    await runAskLincAnalysis({
      question: 'Am I on track for retirement?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(mockedAskClaude).toHaveBeenCalledTimes(2);
    expect(mockedValidateWithGemini).toHaveBeenCalledTimes(2);
  });

  it('ships a grounded answer with a caveat when Gemini objects to the retry', async () => {
    // Every figure has been checked; the objection is about reasoning. Spending
    // 80 seconds and returning nothing was the worse outcome.
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({ summary: 'Initial retirement answer.' }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $100.',
        insights: ['Cash is $80.'],
        suggested_actions: ['Review your allocation.'],
      }));
    mockedValidateWithGemini
      .mockResolvedValueOnce({ valid: false, issues: ['Initial answer is unsupported.'] })
      .mockResolvedValueOnce({ valid: false, issues: ['The recommendation ignores the cash position.'] });

    const result = await runAskLincAnalysis({
      question: 'Am I on track for retirement?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(result.structuredResponse.summary).toBe(`Your net worth is $100.\n\n${SECONDARY_REVIEW_CAVEAT}`);
    expect(result.structuredResponse.insights).toEqual(['Cash is $80.']);
    expect(result.structuredResponse.suggested_actions).toEqual(['Review your allocation.']);
    expect(result.showTheMathData?.evidenceManifest.secondaryCaveat).toBe(true);
    // The objection itself stays in the evidence, not in the user's answer.
    expect(result.structuredResponse.summary).not.toContain('ignores the cash position');
    expect(result.showTheMathData?.evidenceManifest.validation.secondary).toEqual([
      { phase: 'initial', valid: false, issues: ['Initial answer is unsupported.'] },
      { phase: 'retry', valid: false, issues: ['The recommendation ignores the cash position.'] },
    ]);
  });

  it('still replaces an answer that could not be grounded at all', async () => {
    // The caveat is for verified figures with contested reasoning. Nothing
    // verified survives here, so the placeholder is still correct.
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Your net worth is $999.',
      insights: ['This is also based on $999.'],
      suggested_actions: ['Act on the incorrect result.'],
    }));

    const result = await runAskLincAnalysis({
      question: 'What is my net worth?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(result.structuredResponse.summary).toBe(
      'I could not verify the generated answer against your current financial snapshot. Please try the question again.'
    );
    expect(result.showTheMathData?.evidenceManifest.validation.deterministic.outcome).toBe('replaced');
  });

  it('keeps the secondary validator prompt and raw output out of the evidence', async () => {
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Initial retirement answer.',
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Retry retirement answer.',
        insights: ['Still unsupported.'],
        suggested_actions: ['Act on it.'],
      }));
    mockedValidateWithGemini
      .mockResolvedValueOnce({
        valid: false,
        issues: ['Initial answer is unsupported.'],
        promptSent: 'initial validation prompt',
        rawResponse: 'initial invalid result',
      })
      .mockResolvedValueOnce({
        valid: false,
        issues: ['Retry is still unsupported.'],
        promptSent: 'retry validation prompt',
        rawResponse: 'retry invalid result',
      });

    const result = await runAskLincAnalysis({
      question: 'Am I on track for retirement?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(result.structuredResponse.summary).toContain(SECONDARY_REVIEW_CAVEAT);
    expect(result.showTheMathData?.evidenceManifest.validation.secondary).toEqual([
      { phase: 'initial', valid: false, issues: ['Initial answer is unsupported.'] },
      { phase: 'retry', valid: false, issues: ['Retry is still unsupported.'] },
    ]);
    expect(JSON.stringify(result.showTheMathData)).not.toContain('validation prompt');
    expect(JSON.stringify(result.showTheMathData)).not.toContain('invalid result');
  });

  it('reuses the prepared prompt and gathered snapshot when Claude fails', async () => {
    mockedAskClaude.mockRejectedValueOnce(new Error('Claude unavailable'));
    mockedAskOpenAI.mockResolvedValueOnce(JSON.stringify({
      summary: 'Your net worth is $100.',
      key_numbers: { net_worth: 100 },
    }));

    const result = await runAskLincAnalysis({
      question: 'What is my net worth?',
      userId: 'user-1',
    });

    expect(mockedGatherContext).toHaveBeenCalledTimes(1);
    expect(mockedAskOpenAI).toHaveBeenCalledTimes(1);
    expect(mockedAskOpenAI.mock.calls[0]).toEqual(mockedAskClaude.mock.calls[0]);
    expect(result.showTheMathData?.evidenceManifest.modelCalls.map(({ provider, outcome }) => ({ provider, outcome }))).toEqual([
      { provider: 'claude', outcome: 'failed' },
      { provider: 'openai', outcome: 'success' },
    ]);
  });

  it('puts the newest three conversations in chronological order in the prompt', async () => {
    mockedAskClaude.mockResolvedValue(JSON.stringify({ summary: 'Current answer.' }));
    const history = [5, 4, 3, 2, 1].map((day) => ({
      id: String(day),
      question: `Question ${day}`,
      answer: `Answer ${day}`,
      createdAt: new Date(`2026-08-${String(day).padStart(2, '0')}T00:00:00.000Z`),
    }));

    await runAskLincAnalysis({ question: 'What is my net worth?', userId: 'user-1', conversationHistory: history });

    const userMessage = mockedAskClaude.mock.calls[0][1];
    expect(userMessage).not.toContain('Question 1');
    expect(userMessage).not.toContain('Question 2');
    expect(userMessage.indexOf('Question 3')).toBeLessThan(userMessage.indexOf('Question 4'));
    expect(userMessage.indexOf('Question 4')).toBeLessThan(userMessage.indexOf('Question 5'));
  });

  it('hands the earlier turns to context gathering, newest first', async () => {
    // Analysis inputs arrive a turn or two before the question that needs them
    // ("drop our spending to $125K" … "re-run my retirement analysis"). Context
    // gathering only ever saw the last message, so it asked for numbers the
    // user had already given.
    mockedAskClaude.mockResolvedValue(JSON.stringify({ summary: 'Current answer.' }));
    const history = [1, 2, 3].map((day) => ({
      id: String(day),
      question: `Question ${day}`,
      answer: `Answer ${day}`,
      createdAt: new Date(`2026-08-0${day}T00:00:00.000Z`),
    }));

    await runAskLincAnalysis({ question: 'Re-run it.', userId: 'user-1', conversationHistory: history });

    // The answers travel with the questions: a reply like "62" only has a
    // meaning next to the question it answered.
    expect(mockedGatherContext.mock.calls[0][0].recentTurns).toEqual([
      { question: 'Question 3', answer: 'Answer 3' },
      { question: 'Question 2', answer: 'Answer 2' },
      { question: 'Question 1', answer: 'Answer 1' },
    ]);
  });
});

describe('selectValidationFeedback', () => {
  const issues = [
    ...Array.from({ length: 20 }, (_, i) => `User-facing usd value ${i} is not present in the canonical fact pack.`),
    'User-facing percent value 68 is not present in the canonical fact pack.',
    'User-facing numeric value 250000 is not present in the canonical fact pack.',
    'net_worth does not cite a canonical fact.',
  ];

  it('covers every kind of failure before repeating one', () => {
    const selected = selectValidationFeedback(issues, 6);
    expect(selected.slice(0, 4)).toEqual([
      'User-facing usd value 0 is not present in the canonical fact pack.',
      'User-facing percent value 68 is not present in the canonical fact pack.',
      'User-facing numeric value 250000 is not present in the canonical fact pack.',
      'net_worth does not cite a canonical fact.',
    ]);
    expect(selected[selected.length - 1]).toContain('17 further issue(s)');
  });

  it('returns every issue unchanged when they all fit', () => {
    expect(selectValidationFeedback(issues.slice(20), 12)).toEqual(issues.slice(20));
  });
});
