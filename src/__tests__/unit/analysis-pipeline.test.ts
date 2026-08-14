import { runAskLincAnalysis } from '../../openai/analysis-pipeline';
import { gatherContextSnapshot } from '../../openai/context-service';
import { askClaude } from '../../openai/claude-client';
import { validateWithGemini } from '../../openai/response-validator';

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
jest.mock('../../openai/show-the-math-db-service', () => ({
  fetchShowTheMathDBData: jest.fn(async () => ({})),
}));
jest.mock('../../openai/response-validator', () => ({
  validateWithGemini: jest.fn(async () => ({ valid: true, issues: [] })),
}));

const mockedGatherContext = gatherContextSnapshot as jest.MockedFunction<typeof gatherContextSnapshot>;
const mockedAskClaude = askClaude as jest.MockedFunction<typeof askClaude>;
const mockedValidateWithGemini = validateWithGemini as jest.MockedFunction<typeof validateWithGemini>;

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
    expect(result.structuredResponse.key_numbers).toEqual({ net_worth: 100 });
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
});
