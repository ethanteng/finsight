import { runAskLincAnalysis } from '../../openai/analysis-pipeline';
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

  it('returns a safe response when Gemini also rejects the Claude retry', async () => {
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

    expect(result.structuredResponse).toEqual({
      summary: 'I could not verify the generated answer against your current financial snapshot. Please try the question again.',
      key_numbers: undefined,
      insights: [],
      suggested_actions: [],
    });
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
});
