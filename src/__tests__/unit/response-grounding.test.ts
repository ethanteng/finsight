import {
  omitInvalidKeyNumbers,
  sanitizeUngroundedResponse,
  validateResponseGrounding,
} from '../../openai/response-grounding';
import type { FinancialContextSnapshot } from '../../openai/types';

const snapshot = {
  financialSummary: {
    financialOverview: {
      netWorth: 250000,
      totalCash: 20000,
      totalInvestments: 300000,
      totalDebt: 70000,
      homeValue: null,
    },
  },
  averageMonthlyExpense: 4200,
  retirementAnalysis: {
    metrics: { withdrawalRate: 1.5, equityAllocation: 70, yearsOfExpenses: 12 },
    stressTest: { survivalRate: 0.8 },
  },
} as unknown as FinancialContextSnapshot;

describe('deterministic response grounding', () => {
  it('accepts canonical values and whole-number percentages', () => {
    expect(validateResponseGrounding({
      summary: 'Grounded response',
      key_numbers: { net_worth: 250000, withdrawal_rate: 150, survival_rate: 80 },
    }, snapshot)).toMatchObject({ valid: true, issues: [] });
  });

  it('flags canonical mismatches and impossible allocation percentages', () => {
    const result = validateResponseGrounding({
      summary: 'Bad response',
      key_numbers: { net_worth: 240000, target_allocation: 2000 },
    }, snapshot);

    expect(result.valid).toBe(false);
    expect(result.invalidKeyNumbers).toEqual(['net_worth', 'target_allocation']);
    expect(result.issues.join(' ')).toContain('canonical value 250000');
  });

  it('flags an incorrect direct-answer amount when key_numbers are omitted', () => {
    const result = validateResponseGrounding(
      { summary: 'Your current net worth is $999.' },
      snapshot,
      'What is my net worth?'
    );

    expect(result.valid).toBe(false);
    expect(result.invalidSummary).toBe(true);
  });

  it('removes only invalid key-number fields after a failed retry', () => {
    expect(omitInvalidKeyNumbers({
      summary: 'Response',
      key_numbers: { net_worth: 240000, years_of_expenses: 12 },
    }, ['net_worth']).key_numbers).toEqual({ years_of_expenses: 12 });
  });

  it('replaces a still-ungrounded summary with a safe response', () => {
    const response = { summary: 'Your current net worth is $999.', key_numbers: { net_worth: 999 } };
    const result = validateResponseGrounding(response, snapshot, 'What is my net worth?');

    expect(sanitizeUngroundedResponse(response, result)).toEqual({
      summary: 'I could not verify the generated answer against your current financial snapshot. Please try the question again.',
      key_numbers: undefined,
      insights: [],
      suggested_actions: [],
    });
  });
});
