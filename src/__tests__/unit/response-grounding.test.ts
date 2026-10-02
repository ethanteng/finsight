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
  describe('monthly income and expenses', () => {
    // Two figures are canonical for a month: what happened and what to expect.
    const withExpected = {
      ...snapshot,
      averageMonthlyIncome: 11_778,
      expectedMonthly: {
        income: 11_662,
        spending: 5_951.27,
        incomeSource: 'transactions',
        spendingSource: 'transactions',
        typicalBasisDays: 90,
        dataThrough: '2026-10-01',
      },
    } as unknown as FinancialContextSnapshot;

    it('accepts the expected month as well as the observed average', () => {
      expect(validateResponseGrounding({
        summary: 'Your expected monthly expenses are $5,951.27, against average monthly expenses of $4,200.',
        key_numbers: { monthly_expenses: 5951.27, expected_monthly_income: 11662, average_monthly_income: 11778 },
      }, withExpected, 'How much do I spend each month?')).toMatchObject({ valid: true, issues: [] });
    });

    it('holds a named figure to the one it names', () => {
      const result = validateResponseGrounding({
        summary: 'Your average monthly expenses are $5,951.27.',
        key_numbers: { expected_monthly_income: 11778 },
      }, withExpected);

      expect(result.valid).toBe(false);
      expect(result.invalidKeyNumbers).toEqual(['expected_monthly_income']);
      expect(result.issues.join(' ')).toContain('canonical average monthly expenses value 4200.');
    });

    it('still rejects a monthly figure that is neither', () => {
      const result = validateResponseGrounding({
        summary: 'Your monthly expenses are $6,500.',
        key_numbers: { monthly_expenses: 6500 },
      }, withExpected, 'How much do I spend each month?');

      expect(result.valid).toBe(false);
      expect(result.invalidKeyNumbers).toEqual(['monthly_expenses']);
      expect(result.issues.join(' ')).toContain('4200 or 5951.27');
    });

    it('checks a direct answer against both figures', () => {
      expect(validateResponseGrounding(
        { summary: 'You can expect about $11,662 a month.' },
        withExpected,
        'What is my monthly income going forward?'
      ).valid).toBe(true);
      expect(validateResponseGrounding(
        { summary: 'You can expect about $12,500 a month.' },
        withExpected,
        'What is my monthly income going forward?'
      ).valid).toBe(false);
    });
  });

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
    expect(result.invalidSummary).toBe(true);
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

  it('flags canonical mismatches anywhere in user-facing fields for broad questions', () => {
    const response = {
      summary: 'Here is your overall financial picture. Your net worth is $999.',
      key_numbers: { net_worth: 999 },
      insights: ['Your total investments are $1,000.'],
      suggested_actions: ['Plan around a $999 net worth.'],
    };
    const result = validateResponseGrounding(response, snapshot, 'How am I doing financially?');

    expect(result.valid).toBe(false);
    expect(result.invalidSummary).toBe(true);
    expect(sanitizeUngroundedResponse(response, result).insights).toEqual([]);
  });

  it('understands magnitude words in canonical user-facing amounts', () => {
    expect(validateResponseGrounding(
      { summary: 'Your net worth is 250 thousand dollars.' },
      snapshot,
      'What is my net worth?'
    ).valid).toBe(true);

    const result = validateResponseGrounding(
      { summary: 'Your net worth is 240 thousand dollars.' },
      snapshot,
      'What is my net worth?'
    );
    expect(result.valid).toBe(false);
    expect(result.invalidSummary).toBe(true);
  });

  it('can identify and remove invalid key-number fields', () => {
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
